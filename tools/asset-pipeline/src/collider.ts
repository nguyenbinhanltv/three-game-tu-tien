// COL-1 / C-2: sinh thư viện collider cục bộ cho prop từ GLB đã tối ưu → packages/content/data/colliders/lib.json.
//   pnpm colliders:lib [--only <id>] [--check]
// Nguồn hình, theo thứ tự ưu tiên:
//   1. Node tên `COL_box_*` / `COL_cyl_*` trong GLB (Blender: hộp/trụ rỗng đặt đúng chỗ; xuất kèm asset, KHÔNG vẽ — bước optimize phải bỏ khỏi cảnh). Lấy hộp bao của mesh node làm hình.
//   2. `overrides.json` (ghi tay): thay hẳn một asset, hoặc `"none"` = đi xuyên được (đồ treo). Rồi `prop-boxes.json` (sinh bằng `pnpm colliders:prop`: cổng/cầu/đình từ hình học GLB).
//   3. Suy từ hộp bao LOD0 + đáy (đỉnh trong 18% chiều cao dưới cùng) theo luật dưới đây.
// Hình ở tọa độ cục bộ của asset (gốc ở chân, mặt trước +Z, y từ chân). Áp lên instance bằng `instantiateShapes` (shared).
// `--check`: không ghi, thoát 1 nếu lib.json khác bản sinh (CI/`content:check` dùng để bắt lib cũ khi asset đổi).
import fs from 'node:fs';
import path from 'node:path';
import type { Document, Node } from '@gltf-transform/core';
import type { LocalShape } from '@dtl/shared';
import { createIO, ROOT } from './config.js';
import { readPropBoxes } from './propboxes.js';
import { lodLevel } from './stats.js';

const ASSETS = path.join(ROOT, 'apps/client/public/assets');
const OUT_DIR = path.join(ROOT, 'packages/content/data/colliders');
const LIB = path.join(OUT_DIR, 'lib.json');
const OVERRIDES = path.join(OUT_DIR, 'overrides.json');

export interface Box3 {
  lo: [number, number, number];
  hi: [number, number, number];
}
export interface Probe {
  /** Hộp bao LOD0 toàn bộ. */
  all: Box3;
  /** Hộp bao đáy (đỉnh trong `BASE_FRAC` chiều cao dưới cùng): chỗ thân cây / chân cột thật sự chạm đất. */
  base: Box3;
}
const BASE_FRAC = 0.18;
/** Cây (thân + tán): chỉ thân chặn, tán đi xuyên. */
export const TREE_IDS = new Set(['prop_co_thu', 'prop_thong_co', 'prop_soi_nui', 'prop_anh_dao', 'prop_phong_do', 'prop_cay_goc_kho']);
/** Mảng nhỏ trang trí (cỏ, dương xỉ, lau, linh thảo, bình nhỏ): bỏ qua theo quyết định "dưới 0,6 m bỏ" và vì là cây thấp mềm. */
export const SOFT_IDS = new Set(['prop_duong_xi', 'prop_lau', 'prop_linh_thao', 'prop_ngung_dan_lo']);

const r2 = (v: number): number => Math.round(v * 100) / 100;

/** Suy hình cục bộ từ hộp bao. Trả mảng rỗng = đi xuyên được. Hàm thuần (có test). */
export function inferShapes(id: string, probe: Probe): LocalShape[] {
  const { all, base } = probe;
  const w = all.hi[0] - all.lo[0];
  const d = all.hi[2] - all.lo[2];
  const h = all.hi[1] - Math.min(0, all.lo[1]);
  const cx = (all.hi[0] + all.lo[0]) / 2;
  const cz = (all.hi[2] + all.lo[2]) / 2;
  if (SOFT_IDS.has(id) || h < 0.6 || Math.max(w, d) < 0.45) return [];
  if (TREE_IDS.has(id)) {
    const bw = base.hi[0] - base.lo[0];
    const bd = base.hi[2] - base.lo[2];
    // Đáy phình vì rễ nổi: thân thật nhỏ hơn ~40%.
    const r = Math.min(1.8, Math.max(0.35, (Math.min(bw, bd) / 2) * 0.6));
    return [{ k: 'cyl', x: r2((base.hi[0] + base.lo[0]) / 2), z: r2((base.hi[2] + base.lo[2]) / 2), r: r2(r), y0: 0, y1: r2(h * 0.6) }];
  }
  const ratio = Math.max(w, d) / Math.max(1e-6, Math.min(w, d));
  if (ratio <= 1.35 && h >= Math.max(w, d) * 0.9) {
    // Cột, bia, đèn đá, trụ: trụ tròn theo cạnh nhỏ.
    return [{ k: 'cyl', x: r2(cx), z: r2(cz), r: r2((Math.min(w, d) / 2) * 0.9), y0: 0, y1: r2(h) }];
  }
  // Khối đặc (đá, bệ, tượng, đỉnh lư, kệ): hộp theo hộp bao, thu 5% cho khỏi vướng chỗ phình; thấp ≤ 1,2 m thì đỉnh đứng được (phiến, ghế đá, bệ thấp; nhảy cao ~1,5 m nên vật cao hơn là tường).
  return [{ k: 'box', x: r2(cx), z: r2(cz), hx: r2((w / 2) * 0.95), hz: r2((d / 2) * 0.95), y0: 0, y1: r2(h), walk: h <= 1.2 }];
}

function nodeBounds(doc: Document, pick: (n: Node) => boolean): Box3 | null {
  const lo: [number, number, number] = [Infinity, Infinity, Infinity];
  const hi: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  const p: number[] = [];
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh();
    if (!mesh || !pick(node)) continue;
    const m = node.getWorldMatrix();
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute('POSITION');
      if (!pos) continue;
      for (let i = 0; i < pos.getCount(); i++) {
        pos.getElement(i, p);
        const x = m[0]! * p[0]! + m[4]! * p[1]! + m[8]! * p[2]! + m[12]!;
        const y = m[1]! * p[0]! + m[5]! * p[1]! + m[9]! * p[2]! + m[13]!;
        const z = m[2]! * p[0]! + m[6]! * p[1]! + m[10]! * p[2]! + m[14]!;
        if (x < lo[0]) lo[0] = x;
        if (y < lo[1]) lo[1] = y;
        if (z < lo[2]) lo[2] = z;
        if (x > hi[0]) hi[0] = x;
        if (y > hi[1]) hi[1] = y;
        if (z > hi[2]) hi[2] = z;
      }
    }
  }
  return Number.isFinite(lo[0]) ? { lo, hi } : null;
}

const isCol = (n: Node): boolean => n.getName().startsWith('COL_');

/** Đo hộp bao LOD0 (bỏ node COL_) và hộp bao đáy. */
export function probeOf(doc: Document): Probe | null {
  const render = (n: Node): boolean => lodLevel(n) === 0 && !isCol(n);
  const all = nodeBounds(doc, render);
  if (!all) return null;
  const h = all.hi[1] - all.lo[1];
  const yCut = all.lo[1] + h * BASE_FRAC;
  const lo: [number, number, number] = [Infinity, Infinity, Infinity];
  const hi: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  const p: number[] = [];
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh();
    if (!mesh || !render(node)) continue;
    const m = node.getWorldMatrix();
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute('POSITION');
      if (!pos) continue;
      for (let i = 0; i < pos.getCount(); i++) {
        pos.getElement(i, p);
        const x = m[0]! * p[0]! + m[4]! * p[1]! + m[8]! * p[2]! + m[12]!;
        const y = m[1]! * p[0]! + m[5]! * p[1]! + m[9]! * p[2]! + m[13]!;
        const z = m[2]! * p[0]! + m[6]! * p[1]! + m[10]! * p[2]! + m[14]!;
        if (y > yCut) continue;
        lo[0] = Math.min(lo[0], x);
        lo[1] = Math.min(lo[1], y);
        lo[2] = Math.min(lo[2], z);
        hi[0] = Math.max(hi[0], x);
        hi[1] = Math.max(hi[1], y);
        hi[2] = Math.max(hi[2], z);
      }
    }
  }
  return { all, base: Number.isFinite(lo[0]) ? { lo, hi } : all };
}

/** Hình từ node `COL_box_*` / `COL_cyl_*` / `COL_ramp_*` (nếu có). `ramp`: hộp có dốc dọc z (đỉnh thấp ở -z, cao ở +z theo hộp bao). */
export function colShapes(doc: Document): LocalShape[] {
  const out: LocalShape[] = [];
  for (const node of doc.getRoot().listNodes()) {
    const name = node.getName();
    if (!name.startsWith('COL_') || !node.getMesh()) continue;
    const b = nodeBounds(doc, (n) => n === node);
    if (!b) continue;
    const cx = (b.lo[0] + b.hi[0]) / 2;
    const cz = (b.lo[2] + b.hi[2]) / 2;
    const fly = /_pass\b/.test(name) ? ('pass' as const) : undefined;
    if (name.startsWith('COL_cyl')) {
      out.push({
        k: 'cyl',
        x: r2(cx),
        z: r2(cz),
        r: r2(Math.min(b.hi[0] - b.lo[0], b.hi[2] - b.lo[2]) / 2),
        y0: r2(b.lo[1]),
        y1: r2(b.hi[1]),
        fly,
      });
    } else if (name.startsWith('COL_ramp')) {
      // Đầu thấp ở -z, đầu cao ở +z: `y1` = cao độ đỉnh tại -z (lo), `y1b` tại +z (hi). Lật bằng hậu tố `_rev`.
      const rev = /_rev\b/.test(name);
      const lowTop = r2(b.lo[1] + 0.2);
      const highTop = r2(b.hi[1]);
      out.push({
        k: 'box',
        x: r2(cx),
        z: r2(cz),
        hx: r2((b.hi[0] - b.lo[0]) / 2),
        hz: r2((b.hi[2] - b.lo[2]) / 2),
        y0: r2(b.lo[1]),
        y1: rev ? highTop : lowTop,
        y1b: rev ? lowTop : highTop,
        walk: true,
        fly,
      });
    } else {
      out.push({
        k: 'box',
        x: r2(cx),
        z: r2(cz),
        hx: r2((b.hi[0] - b.lo[0]) / 2),
        hz: r2((b.hi[2] - b.lo[2]) / 2),
        y0: r2(b.lo[1]),
        y1: r2(b.hi[1]),
        walk: /_walk\b/.test(name) ? true : undefined,
        fly,
      });
    }
  }
  return out;
}

export type Lib = Record<string, LocalShape[]>;
type Overrides = Record<string, LocalShape[] | 'none'>;

export async function buildLib(only?: string): Promise<Lib> {
  const manifest = JSON.parse(fs.readFileSync(path.join(ASSETS, 'manifest.json'), 'utf8')) as {
    assets: Record<string, { class: string; file: string }>;
  };
  const overrides: Overrides = fs.existsSync(OVERRIDES) ? (JSON.parse(fs.readFileSync(OVERRIDES, 'utf8')) as Overrides) : {};
  const io = await createIO();
  const propBoxes = readPropBoxes();
  const lib: Lib = {};
  for (const [id, a] of Object.entries(manifest.assets).sort(([x], [y]) => x.localeCompare(y))) {
    if (!id.startsWith('prop_') || (only && id !== only)) continue; // gồm cả class 'artifact' đặt làm prop (vd. prop_ngung_dan_lo)
    const ov = overrides[id];
    if (ov === 'none') {
      lib[id] = [];
      continue;
    }
    if (ov) {
      lib[id] = ov;
      continue;
    }
    if (propBoxes[id]) {
      lib[id] = propBoxes[id]!;
      continue;
    }
    const doc = await io.read(path.join(ASSETS, a.file));
    const cols = colShapes(doc);
    if (cols.length) {
      lib[id] = cols;
      continue;
    }
    const probe = probeOf(doc);
    lib[id] = probe ? inferShapes(id, probe) : [];
  }
  return lib;
}

const stringify = (lib: Lib): string => JSON.stringify(lib, null, 1) + '\n';

async function main(): Promise<void> {
  const args = process.argv.slice(2).filter((a) => a !== '--');
  const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : undefined;
  const lib = await buildLib(only);
  if (only) {
    console.log(JSON.stringify(lib, null, 1));
    return;
  }
  const next = stringify(lib);
  if (args.includes('--check')) {
    const cur = fs.existsSync(LIB) ? fs.readFileSync(LIB, 'utf8') : '';
    if (cur.replace(/\r/g, '') !== next) {
      console.error('[colliders:lib] lib.json cũ so với GLB/overrides: chạy `pnpm colliders:lib`');
      process.exit(1);
    }
    console.log(`[colliders:lib] đạt (${Object.keys(lib).length} asset)`);
    return;
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(LIB, next);
  const n = Object.values(lib).filter((s) => s.length).length;
  console.log(
    `[colliders:lib] ${Object.keys(lib).length} asset, ${n} có hình, ${Object.keys(lib).length - n} đi xuyên → ${path.relative(ROOT, LIB)}`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')))
  await main();
