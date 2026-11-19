// pnpm colliders:arch --id arch_sect --origin 2048,150,2048 --level van_lam [--cell 0.5] [--region x0,z0,x1,z1]
//   Bí cảnh dựng từ nhiều object rời (loadDungeonModel của client): thêm `--place dungeon --prefix pm [--flat pm_wall_,... --flatDy -4] [--dome r,h]`
//   → mỗi object hạ y theo `groundAt` tại chỗ (−0,15), object `flat` dời `flatDy`, object `<prefix>_ceil_*` treo theo vòm (đúng như client).
// Đọc GLB kiến trúc đã tối ưu (mức LOD0, bỏ node COL_), đặt tại `--origin` (như client: `root.position.set(SECT.x, SECT.y, SECT.z)`),
// sinh hộp va chạm bằng `buildArchBoxes` và ghi packages/content/data/colliders/<id>.boxes.json. `--check`: không ghi, thoát 1 nếu khác.
import fs from 'node:fs';
import path from 'node:path';
import '@dtl/content';
import { terrainOf } from '@dtl/shared';
import { buildArchBoxes, type Tri } from './archcollider.js';
import { createIO, ROOT } from './config.js';
import { lodLevel } from './stats.js';

const args = process.argv.slice(2).filter((a) => a !== '--');
const opt = (k: string, d = ''): string => (args.includes(k) ? (args[args.indexOf(k) + 1] ?? d) : d);
const id = opt('--id');
if (!id) throw new Error('thiếu --id <asset id>');
const [ox, oy, oz] = opt('--origin', '0,0,0').split(',').map(Number) as [number, number, number];
const level = opt('--level', 'van_lam');
const cell = Number(opt('--cell', '0.5'));
const dungeon = opt('--place') === 'dungeon';
const prefix = opt('--prefix');
const flat = opt('--flat').split(',').filter(Boolean);
const flatDy = Number(opt('--flatDy', '-4'));
const dome = opt('--dome') ? (opt('--dome').split(',').map(Number) as [number, number]) : null;
const region = opt('--region') ? (opt('--region').split(',').map(Number) as [number, number, number, number]) : null;

const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'apps/client/public/assets/manifest.json'), 'utf8')) as {
  assets: Record<string, { file: string }>;
};
const entry = manifest.assets[id];
if (!entry) throw new Error(`asset ${id} không có trong manifest`);
const doc = await (await createIO()).read(path.join(ROOT, 'apps/client/public/assets', entry.file));

/** Dời y của object (node con trực tiếp của gốc) theo cách client đặt bí cảnh; 0 nếu không phải chế độ `--place dungeon`. */
function dyOf(node: { getParentNode(): unknown; getName(): string; getTranslation(): number[] }): number {
  if (!dungeon) return 0;
  let top = node;
  for (let up = top.getParentNode() as typeof node | null; up; up = top.getParentNode() as typeof node | null) top = up;
  const name = top.getName();
  const [tx, , tz] = top.getTranslation() as [number, number, number];
  if (flat.some((f) => name.startsWith(f))) return flatDy;
  if (dome && name.startsWith(`${prefix}_ceil_`)) {
    const r = Math.hypot(tx, tz);
    return dome[1] * Math.sqrt(Math.max(0, 1 - (r / dome[0]) ** 2)) - 1.5;
  }
  return terrainOf(level).groundAt(ox + tx, oz + tz) - oy - 0.15;
}

function* triangles(): Generator<Tri> {
  const p = [0, 0, 0];
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh();
    if (!mesh || lodLevel(node) !== 0 || node.getName().startsWith('COL_')) continue;
    const m = node.getWorldMatrix();
    const dy = dyOf(node as never);
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute('POSITION');
      if (!pos || prim.getMode() !== 4) continue;
      const idx = prim.getIndices();
      const n = idx ? idx.getCount() : pos.getCount();
      const vert = (i: number): [number, number, number] => {
        pos.getElement(idx ? idx.getScalar(i) : i, p);
        return [
          m[0]! * p[0]! + m[4]! * p[1]! + m[8]! * p[2]! + m[12]! + ox,
          m[1]! * p[0]! + m[5]! * p[1]! + m[9]! * p[2]! + m[13]! + oy + dy,
          m[2]! * p[0]! + m[6]! * p[1]! + m[10]! * p[2]! + m[14]! + oz,
        ];
      };
      for (let i = 0; i + 2 < n; i += 3) {
        const a = vert(i);
        const b = vert(i + 1);
        const c = vert(i + 2);
        if (region) {
          const cx = (a[0] + b[0] + c[0]) / 3;
          const cz = (a[2] + b[2] + c[2]) / 3;
          if (cx < region[0] || cx > region[2] || cz < region[1] || cz > region[3]) continue;
        }
        yield [...a, ...b, ...c] as unknown as Tri;
      }
    }
  }
}

const t = terrainOf(level);
const boxes = buildArchBoxes(triangles(), { cell, groundAt: t.groundAt });
const text = JSON.stringify({ id, level, origin: [ox, oy, oz], cell, boxes }) + '\n';
const file = path.join(ROOT, `packages/content/data/colliders/${id}.boxes.json`);
if (args.includes('--check')) {
  const cur = fs.existsSync(file) ? fs.readFileSync(file, 'utf8').replace(/\r/g, '') : '';
  if (cur !== text) {
    console.error(`[colliders:arch] ${id}.boxes.json cũ: chạy pnpm colliders:arch ...`);
    process.exit(1);
  }
} else {
  fs.writeFileSync(file, text);
  const walk = boxes.filter((b) => b[6] === 1).length;
  console.log(
    `[colliders:arch] ${id}: ${boxes.length} hộp (${walk} walk, ${boxes.length - walk} rắn), ${(text.length / 1024).toFixed(0)} KB → ${path.relative(ROOT, file)}`,
  );
}
