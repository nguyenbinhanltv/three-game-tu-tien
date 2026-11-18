// K-5: bảng số đo ba giọng từ chính dữ liệu pose (khung khóa, không nội suy). `node tools/poses/report-k5.mjs` in bảng markdown.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../packages/content/data/poses');
const P = (id) => JSON.parse(fs.readFileSync(path.join(DIR, id + '.json'), 'utf8'));
const guard = P('kiem_thu').keys[0];
const f = (n, d = 2) => n.toFixed(d).replace('.', ',');
const tip = (k) => {
  const l = Math.hypot(...k.sword);
  return k.handR.map((x, i) => x + (k.sword[i] / l) * 0.9);
};
const rows = [];
for (const [skill, ids] of [
  ['Đòn thường 1', ['phi_kiem', 'phi_kiem_hp', 'phi_kiem_ds']],
  ['Đòn thường 2', ['phi_kiem_2', 'phi_kiem_2_hp', 'phi_kiem_2_ds']],
  ['Đòn thường 3', ['phi_kiem_3', 'phi_kiem_3_hp', 'phi_kiem_3_ds']],
  ['Kiếm Khí Trảm', ['kiem_khi_tram', 'kiem_khi_tram_hp', 'kiem_khi_tram_ds']],
]) {
  ids.forEach((id, i) => {
    const p = P(id);
    const [, , k3, k4, k5, k6] = p.keys;
    const t = Math.hypot(...tip(k5).map((x, j) => x - tip(k4)[j]));
    rows.push(
      `| ${skill} | ${['kiếm tu', 'hộ pháp', 'đan sư'][i]} (\`${id}\`) | ${f(guard.hips.pos[1] - k3.hips.pos[1], 3)} | ${f(Math.abs(k3.hips.rot[1] - k5.hips.rot[1]), 0)}° | ${f(k5.handR[2])} | ${f(k4.t - k3.t)} s | ${f((Math.abs(k6.hips.rot[1] - k5.hips.rot[1]) / Math.abs(k5.hips.rot[1] - k4.hips.rot[1])) * 100, 0)}% | ${f(t)} m / ${f(k5.t - k4.t)} s |`,
    );
  });
}
console.log(
  '| Chiêu | Giọng | Hạ hông (m) | Xoay hông | Tay phải z (m) | Giữ | Quá đà | Mũi kiếm đi |\n|---|---|---|---|---|---|---|---|\n' +
    rows.join('\n'),
);
