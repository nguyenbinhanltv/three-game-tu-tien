#!/usr/bin/env node
// Họa Pháp Lô 2: đo PHỦ MÀN HÌNH tất định (cận trên) của timeline từ dữ liệu, không phụ thuộc ảnh chụp (ảnh lab bị lệch nền theo giờ/rung màn hình nên `pixelCover` nhiễu).
// Mỗi sự kiện `mesh` kiểu `sprite`/`flip` là một tấm quay mặt về camera: diện tích tấm = (cỡ)² mét vuông trên mặt phẳng nhìn; khung hình ở camera chéo (cách 20 m, FOV dọc 32°, 16:9) rộng 20,4 × 11,5 m.
// Phủ = Σ diện tích các tấm đang sống ở thời điểm t / diện tích khung (không trừ phần chồng nhau và phần trong suốt của sprite → là CẬN TRÊN). In giá trị ở +30 ms và lớn nhất trong [-0,3; +0,8] s.
// Dùng: node tools/vfx-forge/cover.mjs [id chiêu ...]  (mặc định 11 chiêu Hồn tu)
import fs from 'node:fs';

const H = 2 * 20 * Math.tan((16 * Math.PI) / 180);
const AREA = H * H * (16 / 9);
const ids = process.argv.slice(2).length
  ? process.argv.slice(2)
  : 'skl_u_anh_bo,skl_phe_hon,skl_tat_dau_thanh_binh,skl_te_phien,skl_hon_trao,skl_am_phong,skl_hon_chuong,skl_suu_hon_thuat,skl_am_hon_trieu,skl_dinh_than_thuat,skl_hoang_tuyen_dan'.split(
      ',',
    );
const num = (s) => (Array.isArray(s) ? Math.max(s[0], s[2] ?? s[0]) : (s ?? 1));
const easeOut = (k) => 1 - (1 - k) * (1 - k);
const out = [];
for (const id of ids) {
  const tl = JSON.parse(fs.readFileSync(`packages/content/data/fx/${id}.json`, 'utf8'));
  const evs = tl.events.filter((e) => e.type === 'mesh' && (e.shape === 'sprite' || e.shape === 'flip'));
  const at = (t) =>
    evs.reduce((a, e) => {
      const k = (t - e.t) / e.dur;
      if (k < 0 || k > 1) return a;
      const s = num(e.scale) + (num(e.scaleTo ?? e.scale) - num(e.scale)) * easeOut(k);
      // sprite mỏng dần từ erodeFrom: phần còn lại tuyến tính; flip tính nguyên
      const rem = e.shape === 'sprite' ? Math.max(0, 1 - Math.max(0, (k - (e.erodeFrom ?? 0.5)) / (1 - (e.erodeFrom ?? 0.5)))) : 1;
      return a + (s * s * (e.alpha ?? 1) * rem) / AREA;
    }, 0);
  let peak = 0;
  for (let t = -0.3; t <= 0.8; t += 0.01) peak = Math.max(peak, at(t));
  out.push({ id, at30: at(0.03), peak, sprites: evs.filter((e) => e.shape === 'sprite').length });
}
for (const o of out) console.log(`${o.id.padEnd(26)} +30ms ${o.at30.toFixed(3)}  đỉnh ${o.peak.toFixed(3)}  sprite ${o.sprites}`);
