// Kiểm asset đã build theo manifest.json. Có lỗi thì lệnh thất bại (exit 1) và in lý do.
//
// Lỗi: tên sai quy ước, file thiếu/hash không khớp, tam giác LOD0 vượt ngân sách, thiếu LOD hoặc LOD vượt trần,
// texture vượt cạnh cho phép, quá số xương, mesh có xương bị quantize (KHR_mesh_quantization),
// LOD mất JOINTS/WEIGHTS, thiếu dòng trong assets/LICENSES.md, meta.json sai schema,
// chiều cao raw và build lệch quá 1% ở bất kỳ tư thế nào (nghỉ, đầu/giữa/cuối mỗi clip).
// Cảnh báo: dưới mức tam giác tối thiểu, texture chưa KTX2, tên node/material có dấu hay khoảng trắng,
// nhân vật chưa dùng rig_human_base, thiếu file thô để so (dùng số đo ghi trong manifest).

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { ASSET_ID, DEFAULTS, type Budgets, createIO, loadBudgets, rel, textureLimit } from './config.js';
import { type Manifest, readManifest } from './optimize.js';
import { type Dims, countTriangles, isSkinned, listTextures, lodCount, lodLevel, maxBones, measurePoses } from './stats.js';

import { at } from '@dtl/shared';
export interface Issue {
  id: string;
  message: string;
}

export interface ValidateOptions {
  rawDir?: string;
  outDir?: string;
  budgets?: Budgets;
  licensesFile?: string;
  sourceDir?: string;
  schemaFile?: string;
  only?: string | null;
  /** Sai lệch chiều cao tối đa giữa raw và build (tỉ lệ). */
  heightTolerance?: number;
}

export interface ValidateReport {
  errors: Issue[];
  warnings: Issue[];
  checked: string[];
  /** Chiều cao raw/build theo tư thế, để in và để test. */
  heights: Record<string, Record<string, { raw: number; build: number }>>;
}

const SAFE_NAME = /^[A-Za-z0-9_.\-]*$/;

export function licensedIds(file: string): Set<string> {
  const ids = new Set<string>();
  if (!fs.existsSync(file)) return ids;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = /^\|\s*`([a-z0-9_]+)`\s*\|/.exec(line);
    if (m) ids.add(at(m, 1));
  }
  return ids;
}

function sha(bytes: Uint8Array): string {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function listMetaFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...listMetaFiles(p));
    else if (e.name === 'meta.json') out.push(p);
  }
  return out;
}

export async function validate(opts: ValidateOptions = {}): Promise<ValidateReport> {
  const rawDir = opts.rawDir ?? DEFAULTS.rawDir;
  const outDir = opts.outDir ?? DEFAULTS.outDir;
  const budgets = opts.budgets ?? loadBudgets();
  const tol = opts.heightTolerance ?? 0.01;
  const report: ValidateReport = { errors: [], warnings: [], checked: [], heights: {} };
  const err = (id: string, message: string) => report.errors.push({ id, message });
  const warn = (id: string, message: string) => report.warnings.push({ id, message });

  // meta.json theo schema
  const sourceDir = opts.sourceDir ?? DEFAULTS.sourceDir;
  const ajv = new Ajv2020({ strict: false, validateFormats: false, allErrors: true });
  const check = ajv.compile(JSON.parse(fs.readFileSync(opts.schemaFile ?? DEFAULTS.schemaFile, 'utf8')));
  for (const file of listMetaFiles(sourceDir)) {
    const id = path.basename(path.dirname(file));
    if (opts.only && id !== opts.only) continue;
    let data: unknown;
    try {
      data = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (e) {
      err(id, `${rel(file)}: JSON hỏng (${(e as Error).message})`);
      continue;
    }
    if (!check(data)) for (const e of check.errors ?? []) err(id, `${rel(file)}: ${e.instancePath || '/'} ${e.message}`);
    if ((data as { id?: string }).id !== id) err(id, `${rel(file)}: id khác tên thư mục`);
  }

  const manifest: Manifest = readManifest(outDir);
  const licensed = licensedIds(opts.licensesFile ?? DEFAULTS.licensesFile);
  const io = await createIO();

  for (const [id, entry] of Object.entries(manifest.assets)) {
    if (opts.only && id !== opts.only) continue;
    report.checked.push(id);
    if (!ASSET_ID.test(id)) err(id, 'asset id sai quy ước (tiền tố chr_/mon_/elite_/boss_/prop_/arch_/fx_/anim_ + snake_case không dấu)');
    if (!licensed.has(id)) err(id, `thiếu dòng trong ${rel(opts.licensesFile ?? DEFAULTS.licensesFile)}`);
    const spec = budgets.classes[entry.class];
    if (!spec) {
      err(id, `lớp ngân sách "${entry.class}" không có trong budgets.json`);
      continue;
    }

    // File và hash
    const file = path.join(outDir, entry.file);
    if (!fs.existsSync(file)) {
      err(id, `thiếu file ${entry.file}`);
      continue;
    }
    const bytes = new Uint8Array(fs.readFileSync(file));
    const hash = /\.([0-9a-f]+)\.glb$/.exec(entry.file)?.[1] ?? '';
    if (!sha(bytes).startsWith(hash)) err(id, `${entry.file}: hash trong tên không khớp nội dung`);
    const doc = await io.readBinary(bytes);

    // Tam giác LOD0 và các LOD (node có extras.lod trong cùng file)
    const tris = countTriangles(doc, 0);
    if (tris > spec.triangles.max) err(id, `LOD0 ${tris} tam giác, vượt ngân sách ${entry.class} (tối đa ${spec.triangles.max})`);
    else if (tris < spec.triangles.min) warn(id, `LOD0 ${tris} tam giác, dưới mức ${spec.triangles.min} của ${entry.class}`);
    const levels = lodCount(doc);
    if (tris > 0 && levels !== spec.lods.length + 1) err(id, `có ${levels - 1} LOD phụ, ngân sách ${entry.class} cần ${spec.lods.length}`);
    const skinned = isSkinned(doc);
    for (let i = 1; i < levels; i++) {
      const lt = countTriangles(doc, i);
      const cap = spec.lods[i - 1]?.maxTriangles;
      if (cap !== undefined && lt > cap * 1.05) err(id, `LOD${i} ${lt} tam giác, vượt trần ${cap}`);
      if (lt >= tris && tris > 0) err(id, `LOD${i} (${lt}) không ít tam giác hơn LOD0 (${tris})`);
    }
    if (skinned) {
      for (const node of doc.getRoot().listNodes()) {
        const mesh = node.getMesh();
        if (!mesh) continue;
        const lost = mesh.listPrimitives().some((p) => !p.getAttribute('JOINTS_0') || !p.getAttribute('WEIGHTS_0'));
        if (lost || !node.getSkin()) err(id, `node ${node.getName()} (LOD${lodLevel(node)}) mất skin hoặc JOINTS_0/WEIGHTS_0`);
      }
    }

    // Quantize trên mesh có xương
    const used = doc
      .getRoot()
      .listExtensionsUsed()
      .map((e) => e.extensionName);
    if (skinned && used.includes('KHR_mesh_quantization')) {
      err(id, `mesh có xương bị quantize (KHR_mesh_quantization) — nhân vật sẽ co lại khi clip có track scale`);
    }

    // Texture
    for (const tex of listTextures(doc)) {
      const edge = Math.max(tex.width, tex.height);
      const limit = textureLimit(spec, tex.slots);
      if (limit === 0) err(id, `lớp ${entry.class} không được có texture (${tex.name})`);
      else if (edge > limit)
        err(id, `texture ${tex.name} (${tex.slots.join(', ')}) ${tex.width}×${tex.height} vượt ${limit}px của ${entry.class}`);
      if (tex.mimeType !== 'image/ktx2') warn(id, `texture ${tex.name} chưa nén KTX2 (${tex.mimeType})`);
    }

    // Xương
    const bones = maxBones(doc);
    if (bones > spec.bones) err(id, `${bones} xương, vượt ${spec.bones} của ${entry.class}`);
    if (entry.class === 'player' || entry.class === 'npc') {
      const skins = doc.getRoot().listSkins();
      if (skins.length && !skins.some((s) => s.getName() === 'rig_human_base')) {
        warn(id, 'skin chưa đặt tên rig_human_base (bộ xương chung, M2-3)');
      }
    }

    // Tên trong file
    const root = doc.getRoot();
    const bad = [...root.listNodes(), ...root.listMeshes(), ...root.listMaterials()]
      .map((p) => p.getName())
      .filter((n) => !SAFE_NAME.test(n));
    if (bad.length) warn(id, `${bad.length} tên node/mesh/material có dấu hoặc khoảng trắng: ${bad.slice(0, 5).join(', ')}`);

    // Chiều cao raw ↔ build ở mọi tư thế
    const buildPoses = measurePoses(doc);
    const rawFile = path.join(rawDir, `${id}.glb`);
    let rawPoses: Record<string, Dims>;
    if (fs.existsSync(rawFile)) {
      rawPoses = measurePoses(await io.read(rawFile));
    } else if (entry.dims.raw) {
      warn(id, `không có ${rel(rawFile)} để so, dùng số đo raw ghi trong manifest (chỉ tư thế nghỉ)`);
      rawPoses = { rest: entry.dims.raw };
    } else {
      rawPoses = {};
    }
    const heights: Record<string, { raw: number; build: number }> = {};
    for (const [pose, raw] of Object.entries(rawPoses)) {
      const build = buildPoses[pose];
      if (!build) {
        err(id, `tư thế "${pose}" có trong raw nhưng không có trong build (mất clip?)`);
        continue;
      }
      heights[pose] = { raw: raw.height, build: build.height };
      const diff = Math.abs(build.height - raw.height) / Math.max(1e-6, raw.height);
      if (diff > tol) {
        err(id, `chiều cao "${pose}" lệch ${(diff * 100).toFixed(1)}%: raw ${raw.height}m, build ${build.height}m (lỗi quantize/nén?)`);
      }
    }
    report.heights[id] = heights;
  }

  if (report.checked.length === 0 && !opts.only) warn('-', `manifest ${rel(path.join(outDir, 'manifest.json'))} chưa có asset nào`);
  return report;
}
