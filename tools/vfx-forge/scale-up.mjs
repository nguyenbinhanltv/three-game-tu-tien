// V-P2..P8: phóng to chiêu nhỏ hơn concept mà không đổi chiều cao (test "sen thấp"): hình nằm đất (lotus_bloom, rune_ring2, ripple, decal) nhân k theo x,z;
// hình khác nhân k đều; offset ngang nhân k. Dùng: node tools/vfx-forge/scale-up.mjs <k> <id chiêu>...   (KHÔNG chạy lặp: mỗi lần nhân thêm)
import fs from 'node:fs';
const [k0, ...ids] = process.argv.slice(2);
const k = Number(k0);
const GROUND = new Set(['lotus_bloom', 'rune_ring2', 'ripple']);
const r3 = (x) => Math.round(x * 1000) / 1000;
const sc = (v, ground, ku) => {
  if (v === undefined) return v;
  if (Array.isArray(v)) return ground ? [r3(v[0] * k), v[1], r3(v[2] * k)] : v.map((x) => r3(x * ku));
  return ground ? [r3(v * k), v, r3(v * k)] : r3(v * ku);
};
for (const id of ids) {
  const p = `packages/content/data/fx/${id}.json`;
  const t = JSON.parse(fs.readFileSync(p, 'utf8'));
  for (const e of t.events) {
    if (e.type === 'decal') e.r = r3(e.r * k);
    if (e.type !== 'mesh') continue;
    const ground = GROUND.has(e.shape);
    const ku = Math.min(k, 1.5);
    e.scale = sc(e.scale, ground, ku);
    e.scaleTo = sc(e.scaleTo, ground, ku);
    if (e.offset) e.offset = [r3(e.offset[0] * k), e.offset[1], r3(e.offset[2] * k)];
  }
  fs.writeFileSync(p, JSON.stringify(t, null, 1) + '\n');
  console.log(id, 'x', k);
}
