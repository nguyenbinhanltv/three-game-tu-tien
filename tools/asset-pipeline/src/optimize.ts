// Bước 2 của pipeline asset: assets/build/raw/<id>.glb → apps/client/public/assets/<id>.<hash>.glb + manifest.json
//
//   dedup → prune (giữ nút lá: xương, socket) → weld → resample
//   → hạ LOD0 về trần (meta.json budget.faceLimit, không quá ngân sách lớp; asset Tripo thường vượt face_limit)
//   → KTX2 (nếu có toktx)
//   → LOD bằng simplify (meshoptimizer, theo assets/budgets.json; giữ JOINTS/WEIGHTS)
//   → reorder → quantize (CHỈ mesh không có xương) → EXT_meshopt_compression → tên theo hash
//
// LOD nằm CÙNG file với LOD0: mỗi node có mesh sinh thêm node anh em "<tên>_lod<k>" (extras.lod = k),
// cùng transform, cùng skin, cùng material/texture (texture chỉ tải một lần). Client hiện LOD theo khoảng cách
// và ẩn các node khác (M2-8 / M3-9). LOD0 là các node không có extras.lod.
//
// Chạy: pnpm assets:build (Blender + bước này) hoặc pnpm assets:optimize (xem cli.ts)
//   --only <id>   chỉ xử lý một asset
//   --force       bỏ qua cache
//   --no-ktx      không nén texture dù có toktx
//   --raw <dir> --out <dir> --cache <file>   đổi thư mục (dùng trong test)
// Cache theo mtime + kích thước file thô + phiên bản pipeline + ngân sách + toktx: chạy lại mà không đổi gì chỉ mất vài giây.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Document, Logger, type Mesh, type Node } from '@gltf-transform/core';
import { EXTMeshoptCompression } from '@gltf-transform/extensions';
import { dedup, prune, quantize, reorder, resample, simplifyPrimitive, weld } from '@gltf-transform/functions';
import {
  ASSET_ID,
  DEFAULTS,
  PIPELINE_VERSION,
  type BudgetClass,
  type Budgets,
  classify,
  createIO,
  loadBudgets,
  lod0Cap,
  lodTargets,
  meshopt,
  rel,
} from './config.js';
import { compressTexturesKTX2, findToktx, toktxVersion } from './ktx.js';
import { type Dims, type TextureInfo, countTriangles, primitiveTriangles, isSkinned, listTextures, lodLevel, maxBones, measureCurrentPose } from './stats.js';

export interface ManifestLod {
  level: number;
  triangles: number;
  /** Đích tam giác theo ngân sách (LOD1+). */
  target?: number;
}

export interface ManifestEntry {
  id: string;
  class: string;
  /** File thô đã dùng (tương đối gốc repo). */
  source: string;
  /** GLB đã tối ưu (gồm mọi LOD), tên theo hash nội dung. */
  file: string;
  bytes: number;
  rawBytes: number;
  /** Tam giác LOD0. */
  triangles: number;
  /** Tam giác của file thô (sau weld), trước khi hạ LOD0 về trần `lod0Cap`. */
  rawTriangles: number;
  /** Trần tam giác LOD0 đã áp (meta.json budget.faceLimit, không quá ngân sách lớp). */
  lod0Cap: number;
  skinned: boolean;
  quantized: boolean;
  bones: number;
  animations: string[];
  ktx2: boolean;
  textures: TextureInfo[];
  lods: ManifestLod[];
  /** Hộp bao LOD0 ở tư thế nghỉ, đo trước và sau tối ưu (validate.ts so lại). */
  dims: { raw: Dims | null; build: Dims | null };
}

export interface Manifest {
  version: 1;
  pipeline: number;
  assets: Record<string, ManifestEntry>;
}

export interface OptimizeOptions {
  rawDir?: string;
  outDir?: string;
  cacheFile?: string;
  budgets?: Budgets;
  only?: string | null;
  force?: boolean;
  ktx?: boolean;
  log?: (msg: string) => void;
}

export interface OptimizeReport {
  manifest: Manifest;
  built: string[];
  cached: string[];
  failed: { id: string; error: string }[];
  warnings: string[];
}

const HASH_LEN = 10;

export function readManifest(outDir: string): Manifest {
  const file = path.join(outDir, 'manifest.json');
  if (!fs.existsSync(file)) return { version: 1, pipeline: PIPELINE_VERSION, assets: {} };
  return JSON.parse(fs.readFileSync(file, 'utf8')) as Manifest;
}

function sortedManifest(m: Manifest): Manifest {
  const assets: Record<string, ManifestEntry> = {};
  for (const id of Object.keys(m.assets).sort()) assets[id] = m.assets[id];
  return { version: 1, pipeline: PIPELINE_VERSION, assets };
}

export function hashName(id: string, bytes: Uint8Array): string {
  return `${id}.${crypto.createHash('sha256').update(bytes).digest('hex').slice(0, HASH_LEN)}.glb`;
}

export const HASHED_FILE = new RegExp(`^([a-z0-9_]+)\\.([0-9a-f]{${HASH_LEN}})\\.glb$`);

/** Các nấc thử khi simplify: nới dần sai số; nấc cuối cho phép gộp qua đường nối thuộc tính (cạnh cứng, đường UV). */
const ATTEMPTS: { error: number; permissive: boolean }[] = [
  { error: 0.01, permissive: false },
  { error: 0.05, permissive: false },
  { error: 0.2, permissive: false },
  { error: 1, permissive: false },
  { error: 1, permissive: true },
];

function makeSimplifier(MeshoptSimplifier: Awaited<ReturnType<typeof meshopt>>['MeshoptSimplifier'], permissive: boolean) {
  if (!permissive) return MeshoptSimplifier;
  return {
    ...MeshoptSimplifier,
    simplify: (...args: Parameters<typeof MeshoptSimplifier.simplify>) => {
      const [i, p, s, t, e, f = []] = args;
      return MeshoptSimplifier.simplify(i, p, s, t, e, [...f, 'Permissive']);
    },
  };
}

/**
 * Hạ LOD0 về `cap` tam giác ngay trong `doc` (thay primitive tại chỗ). Thử sai số nhỏ trước, nới dần, rồi giảm tỉ lệ
 * cho tới khi không vượt trần. Thuộc tính đỉnh (JOINTS_0/WEIGHTS_0, UV) đi theo đỉnh còn lại nên giữ trọng số.
 * Trả về số tam giác LOD0 sau cùng.
 */
async function capLod0(doc: Document, cap: number): Promise<number> {
  const before = countTriangles(doc, 0);
  if (before <= cap) return before;
  const { MeshoptSimplifier } = await meshopt();
  const nodes = doc
    .getRoot()
    .listNodes()
    .filter((n) => n.getMesh() && lodLevel(n) === 0);
  const meshes = [...new Set(nodes.map((n) => n.getMesh()!))];
  const uses = new Map<Mesh, number>();
  for (const n of nodes) uses.set(n.getMesh()!, (uses.get(n.getMesh()!) ?? 0) + 1);
  let ratio = cap / before;
  for (let round = 0; round < 8; round++, ratio *= 0.95) {
    for (const { error, permissive } of ATTEMPTS) {
      const simplifier = makeSimplifier(MeshoptSimplifier, permissive);
      const trial = new Map(meshes.map((m) => [m, m.listPrimitives().map((p) => simplifyPrimitive(p.clone(), { simplifier, ratio, error }))]));
      let got = 0;
      for (const [m, prims] of trial) got += (uses.get(m) ?? 1) * prims.reduce((s, p) => s + primitiveTriangles(p), 0);
      if (got <= cap) {
        for (const [m, prims] of trial) {
          for (const old of m.listPrimitives()) {
            m.removePrimitive(old);
            old.dispose();
          }
          for (const p of prims) m.addPrimitive(p);
        }
        return got;
      }
      for (const prims of trial.values()) for (const p of prims) p.dispose();
    }
  }
  return countTriangles(doc, 0);
}

/**
 * Sinh LOD mức `level` ngay trong `doc`: mỗi node LOD0 có mesh → node anh em "<tên>_lod<level>" với mesh đã giảm.
 * Primitive được clone rồi simplify; thuộc tính đỉnh (gồm JOINTS_0/WEIGHTS_0, UV, màu) đi theo đỉnh còn lại.
 */
async function addLod(doc: Document, level: number, target: number): Promise<number> {
  const { MeshoptSimplifier } = await meshopt();
  const lod0 = countTriangles(doc, 0);
  const ratio = Math.min(1, target / Math.max(1, lod0));
  const sources = doc
    .getRoot()
    .listNodes()
    .filter((n) => n.getMesh() && lodLevel(n) === 0);
  let created: { nodes: Node[]; meshes: Mesh[] } = { nodes: [], meshes: [] };
  let got = Infinity;
  for (const { error, permissive } of ATTEMPTS) {
    for (const n of created.nodes) n.dispose();
    for (const m of created.meshes) m.dispose();
    created = { nodes: [], meshes: [] };
    const simplifier = makeSimplifier(MeshoptSimplifier, permissive);
    const meshMap = new Map<Mesh, Mesh>();
    for (const node of sources) {
      const mesh = node.getMesh()!;
      let lodMesh = meshMap.get(mesh);
      if (!lodMesh) {
        lodMesh = doc.createMesh(`${mesh.getName()}_lod${level}`).setExtras({ ...mesh.getExtras(), lod: level });
        for (const prim of mesh.listPrimitives()) lodMesh.addPrimitive(simplifyPrimitive(prim.clone(), { simplifier, ratio, error }));
        meshMap.set(mesh, lodMesh);
        created.meshes.push(lodMesh);
      }
      const lodNode = doc
        .createNode(`${node.getName()}_lod${level}`)
        .setMesh(lodMesh)
        .setSkin(node.getSkin())
        .setTranslation(node.getTranslation())
        .setRotation(node.getRotation())
        .setScale(node.getScale())
        .setExtras({ ...node.getExtras(), lod: level });
      const parent = node.getParentNode();
      if (parent) parent.addChild(lodNode);
      else for (const scene of doc.getRoot().listScenes()) if (scene.listChildren().includes(node)) scene.addChild(lodNode);
      created.nodes.push(lodNode);
    }
    got = countTriangles(doc, level);
    if (got <= target * 1.1) break;
  }
  return got;
}

/** Nén cuối: reorder + (quantize nếu không có xương) + EXT_meshopt_compression. */
async function finalize(doc: Document, skinned: boolean): Promise<void> {
  const { MeshoptEncoder } = await meshopt();
  await doc.transform(prune({ keepLeaves: true, keepExtras: true }), reorder({ encoder: MeshoptEncoder, target: 'size' }));
  // Mesh có xương KHÔNG quantize: giải lượng tử bị dời lên node/IBM, clip có track scale sẽ làm nhân vật co lại.
  if (!skinned) await doc.transform(quantize());
  doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
}

interface CacheEntry {
  key: string;
  entry: ManifestEntry;
}

function readCache(file: string): Record<string, CacheEntry> {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return {};
  }
}

/** Dung sai lấy mẫu lại clip thư viện chung (K-3): clip mocap lấy mẫu 30 khung/s nhiều khóa dư; 1e-3 ≈ 0,1° quay, 1 mm vị trí. */
const ANIM_TOLERANCE = 1e-3;

export async function optimizeAsset(
  rawFile: string,
  id: string,
  cls: string,
  spec: BudgetClass,
  outDir: string,
  toktx: string | null,
  warn: (msg: string) => void,
  cap = spec.triangles.max,
): Promise<ManifestEntry> {
  const io = await createIO();
  const rawBytes = fs.statSync(rawFile).size;
  const doc = await io.read(rawFile);
  doc.setLogger(new Logger(Logger.Verbosity.WARN));
  const rawDims = measureCurrentPose(doc);
  const skinned = isSkinned(doc);

  await doc.transform(dedup(), prune({ keepLeaves: true, keepExtras: true }), weld(), resample(cls === 'anim' ? { tolerance: ANIM_TOLERANCE } : {}));

  const rawTriangles = countTriangles(doc, 0);
  const lod0 = await capLod0(doc, cap);
  if (lod0 > cap) warn(`${id}: LOD0 chỉ giảm được còn ${lod0} tam giác (trần ${cap})`);

  let ktx2 = false;
  if (toktx && doc.getRoot().listTextures().length > 0) ktx2 = compressTexturesKTX2(doc, toktx, spec).converted > 0;

  const lods: ManifestLod[] = [{ level: 0, triangles: lod0 }];
  const targets = lod0 > 0 ? lodTargets(lod0, spec) : [];
  for (let i = 0; i < targets.length; i++) {
    const got = await addLod(doc, i + 1, targets[i]);
    if (got > targets[i] * 1.1) warn(`${id}: LOD${i + 1} chỉ giảm được còn ${got} tam giác (đích ${targets[i]})`);
    lods.push({ level: i + 1, triangles: got, target: targets[i] });
  }

  await finalize(doc, skinned);
  const bytes = await io.writeBinary(doc);
  const file = hashName(id, bytes);
  fs.writeFileSync(path.join(outDir, file), bytes);
  // Đo lại từ file đã ghi để bắt lỗi của chính bước nén.
  const buildDims = measureCurrentPose(await io.readBinary(bytes));

  return {
    id,
    class: cls,
    source: rel(rawFile),
    file,
    bytes: bytes.byteLength,
    rawBytes,
    triangles: lod0,
    rawTriangles,
    lod0Cap: cap,
    skinned,
    quantized: !skinned,
    bones: maxBones(doc),
    animations: doc.getRoot().listAnimations().map((a) => a.getName()),
    ktx2,
    textures: listTextures(doc),
    lods,
    dims: { raw: rawDims, build: buildDims },
  };
}

export async function optimize(opts: OptimizeOptions = {}): Promise<OptimizeReport> {
  const rawDir = opts.rawDir ?? DEFAULTS.rawDir;
  const outDir = opts.outDir ?? DEFAULTS.outDir;
  const cacheFile = opts.cacheFile ?? DEFAULTS.cacheFile;
  const budgets = opts.budgets ?? loadBudgets();
  const log = opts.log ?? ((m: string) => console.log(m));
  const report: OptimizeReport = { manifest: readManifest(outDir), built: [], cached: [], failed: [], warnings: [] };
  const warn = (m: string) => {
    report.warnings.push(m);
    log(`[optimize] CẢNH BÁO: ${m}`);
  };

  const toktx = opts.ktx === false ? null : findToktx();
  const toktxTag = toktx ? toktxVersion(toktx) : null;
  if (opts.ktx !== false && !toktx) {
    warn('không tìm thấy toktx (KTX-Software), giữ texture PNG/JPEG. Cài KTX-Software 4.x, thêm vào PATH hoặc đặt TOKTX=đường_dẫn.');
  }

  fs.mkdirSync(outDir, { recursive: true });
  const rawFiles = fs.existsSync(rawDir) ? fs.readdirSync(rawDir).filter((f) => f.toLowerCase().endsWith('.glb')).sort() : [];
  if (rawFiles.length === 0) warn(`không có GLB thô nào trong ${rel(rawDir)}; giữ nguyên manifest hiện có.`);

  const cache = readCache(cacheFile);
  const manifest = report.manifest;

  for (const f of rawFiles) {
    const id = path.basename(f, path.extname(f));
    if (opts.only && id !== opts.only) continue;
    if (!ASSET_ID.test(id)) {
      report.failed.push({ id, error: `tên "${id}" sai quy ước (tiền tố chr_/mon_/elite_/boss_/prop_/arch_/fx_/anim_ + snake_case không dấu)` });
      continue;
    }
    const cls = classify(id, budgets);
    const spec = cls ? budgets.classes[cls] : undefined;
    if (!cls || !spec) {
      report.failed.push({ id, error: `không xác định được lớp ngân sách (thêm budgetClass vào meta.json)` });
      continue;
    }
    const rawFile = path.join(rawDir, f);
    const st = fs.statSync(rawFile);
    const cap = lod0Cap(id, spec);
    const key = JSON.stringify({ m: Math.floor(st.mtimeMs), s: st.size, p: PIPELINE_VERSION, b: spec, c: cap, k: toktxTag });
    const hit = cache[id];
    if (!opts.force && hit?.key === key && fs.existsSync(path.join(outDir, hit.entry.file))) {
      manifest.assets[id] = hit.entry;
      report.cached.push(id);
      continue;
    }
    const t0 = performance.now();
    try {
      const entry = await optimizeAsset(rawFile, id, cls, spec, outDir, toktx, warn, cap);
      manifest.assets[id] = entry;
      cache[id] = { key, entry };
      report.built.push(id);
      const capInfo = entry.rawTriangles > entry.triangles ? `LOD0 ${entry.rawTriangles}→${entry.triangles} (trần ${cap}), ` : '';
      const lodInfo = entry.lods.map((l) => `LOD${l.level} ${l.triangles}`).join(', ');
      log(
        `[optimize] ${id} (${cls}${entry.skinned ? ', có xương, không quantize' : ''}): ${(entry.rawBytes / 1024).toFixed(0)}KB → ${(entry.bytes / 1024).toFixed(0)}KB; ${capInfo}${lodInfo} tam giác; ${(performance.now() - t0).toFixed(0)}ms`,
      );
    } catch (e) {
      report.failed.push({ id, error: e instanceof Error ? e.message : String(e) });
    }
  }

  // Xóa file hash cũ của các asset có trong manifest mà không còn được tham chiếu.
  const keep = new Set(Object.values(manifest.assets).map((e) => e.file));
  for (const f of fs.readdirSync(outDir)) {
    const m = HASHED_FILE.exec(f);
    if (m && manifest.assets[m[1]] && !keep.has(f)) {
      fs.rmSync(path.join(outDir, f));
      log(`[optimize] xóa bản cũ ${f}`);
    }
  }

  report.manifest = sortedManifest(manifest);
  fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(report.manifest, null, 2) + '\n');
  fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
  fs.writeFileSync(cacheFile, JSON.stringify(cache, null, 2));
  return report;
}

export function parseArgs(argv: string[]): OptimizeOptions {
  const val = (flag: string) => (argv.includes(flag) ? argv[argv.indexOf(flag) + 1] : undefined);
  const abs = (p?: string) => (p ? path.resolve(p) : undefined);
  return {
    only: val('--only') ?? null,
    force: argv.includes('--force'),
    ktx: !argv.includes('--no-ktx'),
    rawDir: abs(val('--raw')),
    outDir: abs(val('--out')),
    cacheFile: abs(val('--cache')),
  };
}
