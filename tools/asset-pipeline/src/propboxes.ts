// COL-1: hình va chạm CỤC BỘ cho prop lớn có lối đi/mặt đứng (cổng, cầu, đình) sinh từ hình học GLB bằng `buildArchBoxes` (cùng thuật toán kiến trúc gộp).
//   pnpm colliders:prop <id>[,<id>...] [--cell 0.4] [--check]
// → packages/content/data/colliders/prop-boxes.json { <id>: LocalShape[] } (gốc ở chân prop, y từ chân, đất giả định phẳng ở y = 0). `collider.ts` (`pnpm colliders:lib`)
// ưu tiên `overrides.json` rồi tới tệp này rồi mới tới hình suy từ hộp bao. Cổng = hai trụ + xà cao (đi qua được), cầu = mặt đi được, đình = bệ + cột + mái.
import fs from 'node:fs';
import path from 'node:path';
import type { LocalShape } from '@dtl/shared';
import { buildArchBoxes, type Tri } from './archcollider.js';
import { createIO, ROOT } from './config.js';
import { lodLevel } from './stats.js';

const OUT = path.join(ROOT, 'packages/content/data/colliders/prop-boxes.json');
const r2 = (v: number): number => Math.round(v * 100) / 100;

export async function propBoxes(id: string, cell: number): Promise<LocalShape[]> {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'apps/client/public/assets/manifest.json'), 'utf8')) as {
    assets: Record<string, { file: string }>;
  };
  const entry = manifest.assets[id];
  if (!entry) throw new Error(`asset ${id} không có trong manifest`);
  const doc = await (await createIO()).read(path.join(ROOT, 'apps/client/public/assets', entry.file));
  const tris: Tri[] = [];
  const p = [0, 0, 0];
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh();
    if (!mesh || lodLevel(node) !== 0 || node.getName().startsWith('COL_')) continue;
    const m = node.getWorldMatrix();
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute('POSITION');
      if (!pos || prim.getMode() !== 4) continue;
      const idx = prim.getIndices();
      const n = idx ? idx.getCount() : pos.getCount();
      const vert = (i: number): [number, number, number] => {
        pos.getElement(idx ? idx.getScalar(i) : i, p);
        return [
          m[0]! * p[0]! + m[4]! * p[1]! + m[8]! * p[2]! + m[12]!,
          m[1]! * p[0]! + m[5]! * p[1]! + m[9]! * p[2]! + m[13]!,
          m[2]! * p[0]! + m[6]! * p[1]! + m[10]! * p[2]! + m[14]!,
        ];
      };
      for (let i = 0; i + 2 < n; i += 3) tris.push([...vert(i), ...vert(i + 1), ...vert(i + 2)] as unknown as Tri);
    }
  }
  const boxes = buildArchBoxes(tris, { cell, groundAt: () => 0 });
  return boxes.map(([x0, z0, x1, z1, y0, y1, walk]) => ({
    k: 'box' as const,
    x: r2((x0 + x1) / 2),
    z: r2((z0 + z1) / 2),
    hx: r2((x1 - x0) / 2),
    hz: r2((z1 - z0) / 2),
    y0: r2(y0),
    y1: r2(y1),
    walk: walk === 1,
  }));
}

export function readPropBoxes(): Record<string, LocalShape[]> {
  return fs.existsSync(OUT) ? (JSON.parse(fs.readFileSync(OUT, 'utf8')) as Record<string, LocalShape[]>) : {};
}

async function main(): Promise<void> {
  const args = process.argv.slice(2).filter((a) => a !== '--');
  const ids = (args.find((a) => !a.startsWith('--')) ?? '').split(',').filter(Boolean);
  const cell = Number(args.includes('--cell') ? args[args.indexOf('--cell') + 1] : '0.4');
  const cur = readPropBoxes();
  const next: Record<string, LocalShape[]> = { ...cur };
  for (const id of ids.length ? ids : Object.keys(cur)) next[id] = await propBoxes(id, cell);
  const sorted = Object.fromEntries(Object.entries(next).sort(([a], [b]) => a.localeCompare(b)));
  const text = JSON.stringify(sorted) + '\n';
  if (args.includes('--check')) {
    const now = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8').replace(/\r/g, '') : '';
    if (now !== text) {
      console.error('[colliders:prop] prop-boxes.json cũ so với GLB: chạy pnpm colliders:prop');
      process.exit(1);
    }
    return;
  }
  fs.writeFileSync(OUT, text);
  for (const id of ids) console.log(`[colliders:prop] ${id}: ${next[id]!.length} hộp`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')))
  await main();
