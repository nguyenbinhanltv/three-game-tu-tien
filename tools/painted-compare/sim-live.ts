// Mô phỏng CPU công thức `live` của lá (vòng mid) với cùng hash pcg3d, bản đồ `paint` của nguồn và camera của ref.json: bao nhiêu phần ô lá
// được vẽ trong vùng nhìn thấy? Nếu CPU nói ~100% mà shader chỉ vẽ ~0,1% thì lỗi ở shader TSL, không ở dữ liệu.
//   pnpm --filter @dtl/perf exec tsx tools/painted-compare/sim-live.ts <ref.json>
import fs from 'node:fs';
import { paint } from '../../apps/client/src/render/painted/lab/ref/world';

const dump = JSON.parse(fs.readFileSync(process.argv[2]!, 'utf8'));
const cam = dump.camera.position as number[];
const imul = Math.imul;
function pcg3d(x: number, y: number, z: number): [number, number, number] {
  x = (imul(x, 1664525) + 1013904223) >>> 0;
  y = (imul(y, 1664525) + 1013904223) >>> 0;
  z = (imul(z, 1664525) + 1013904223) >>> 0;
  x = (x + imul(y, z)) >>> 0;
  y = (y + imul(z, x)) >>> 0;
  z = (z + imul(x, y)) >>> 0;
  x = (x ^ (x >>> 16)) >>> 0;
  y = (y ^ (y >>> 16)) >>> 0;
  z = (z ^ (z >>> 16)) >>> 0;
  x = (x + imul(y, z)) >>> 0;
  y = (y + imul(z, x)) >>> 0;
  z = (z + imul(x, y)) >>> 0;
  return [x, y, z];
}
function cellRand(cx: number, cz: number, salt: number): number[] {
  const a = pcg3d(cx + 65536, cz + 65536, salt);
  const b = pcg3d((a[0] + 7) >>> 0, (a[1] + 7) >>> 0, (a[2] + 7) >>> 0);
  return [a[0] >>> 8, a[1] >>> 8, a[2] >>> 8, b[0] >>> 8].map((v) => v / 16777216);
}
const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

const ring = { name: 'mid', cell: 0.09, fade: [2.8, 6, 13, 21.6], salt: 1 * 101 + 3 };
const [tx, , tz] = dump.target as number[];
let n = 0;
let alive = 0;
const byDist: Record<string, [number, number]> = {};
const c0 = Math.floor((tx! - 12) / ring.cell);
const c1 = Math.floor((tx! + 12) / ring.cell);
const d0 = Math.floor((tz! - 12) / ring.cell);
const d1 = Math.floor((tz! + 12) / ring.cell);
for (let i = c0; i < c1; i += 1) {
  for (let j = d0; j < d1; j += 1) {
    const r = cellRand(i, j, ring.salt);
    const q = cellRand(i, j, ring.salt + 31);
    const x = (i + r[0]!) * ring.cell;
    const z = (j + r[1]!) * ring.cell;
    const dist = Math.hypot(x - cam[0]!, z - cam[2]!);
    const keep = smooth(ring.fade[0]!, ring.fade[1]!, dist) * (1 - smooth(ring.fade[2]!, ring.fade[3]!, dist));
    let live = smooth(0, 0.18, keep - q[0]! * 0.82);
    const growth = paint(x, z).growth;
    live *= smooth(0, 0.22, growth - q[1]! * 0.78);
    n++;
    if (live > 0) alive++;
    const b = String(Math.floor(dist / 3) * 3);
    byDist[b] ??= [0, 0];
    byDist[b]![0]++;
    if (live > 0) byDist[b]![1]++;
  }
}
console.log(`ô ${n}, sống ${alive} (${((100 * alive) / n).toFixed(1)}%)`);
for (const k of Object.keys(byDist).sort((a, b) => Number(a) - Number(b)))
  console.log(`dist ${k}-${Number(k) + 3} m: ${((100 * byDist[k]![1]) / byDist[k]![0]).toFixed(1)}% sống (${byDist[k]![0]} ô)`);
const sample = cellRand(1555, 777, 104);
console.log('mẫu hash', sample.map((v) => v.toFixed(4)).join(' '));
