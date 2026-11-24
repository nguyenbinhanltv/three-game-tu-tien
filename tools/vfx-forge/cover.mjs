#!/usr/bin/env node
// Họa Pháp Lô 2: ƯỚC LƯỢNG phủ màn hình tất định của timeline từ dữ liệu (có trọng số, KHÔNG phải cận trên), không phụ thuộc ảnh chụp (ảnh lab bị lệch nền theo giờ/rung màn hình nên `pixelCover` nhiễu).
// Chỉ tính sự kiện `mesh` kiểu `sprite`/`flip` (tấm quay mặt về camera): diện tích tấm = (cỡ)² mét vuông trên mặt phẳng nhìn, NHÂN tỉ lệ phủ thật của sprite (từ alpha của atlas), alpha của sự kiện và (với sprite) phần còn lại sau khi tan; bỏ ribbon/helix/decal/hạt và không xét `from: "start"`
// (timeline Hồn tu không dùng). Khung camera chéo (cách 20 m, FOV dọc 32°, 16:9) rộng 20,4 × 11,5 m.
// Phủ = Σ (diện tích × tỉ lệ phủ thật × alpha × phần còn lại) các tấm đang sống ở thời điểm t / diện tích khung; không trừ phần chồng nhau. In giá trị ở +30 ms và lớn nhất trong [-0,3; +0,8] s.
// Vì chỉ là ước lượng, số duyệt phải kèm `pixelCover` của `pnpm shots vfxlab` ở khung 0 và +150 ms (không dính rung hitstop) ở các lượt có nền sạch.
// Dùng: node tools/vfx-forge/cover.mjs [id chiêu ...]  (mặc định 11 chiêu Hồn tu)
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const sharp = createRequire(path.join(here, 'package.json'))('sharp');
// Tỉ lệ phủ THẬT của từng sprite = phần ô có alpha > 16%: đo từ atlas (`apps/client/public/hoa-truc/vfx_sprites.webp`, kéo bằng `pnpm assets:pull`), thứ tự ô = `FX_SPRITES`.
// Nhờ đó sprite dạng dải mảnh (zigzag, giáo) không bị tính như ô vuông đặc.
const NAMES = [
  ...fs
    .readFileSync('packages/shared/src/fxtimeline.ts', 'utf8')
    .match(/export const FX_SPRITES = \[([\s\S]*?)\] as const/)[1]
    .matchAll(/'([a-z0-9_]+)'/g),
].map((m) => m[1]);
const FILL = {};
{
  const atlas = 'apps/client/public/hoa-truc/vfx_sprites.webp';
  if (fs.existsSync(atlas)) {
    const { data, info } = await sharp(atlas).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const cell = info.width / 4;
    NAMES.forEach((n, i) => {
      const cx = (i % 4) * cell;
      const cy = Math.floor(i / 4) * cell;
      let c = 0;
      let tot = 0;
      for (let y = 0; y < cell; y += 2)
        for (let x = 0; x < cell; x += 2) {
          tot++;
          if (data[((cy + y) * info.width + cx + x) * 4 + 3] > 40) c++;
        }
      FILL[n] = c / tot;
    });
  } else console.error('thiếu atlas (chạy `pnpm assets:pull`): coi mọi sprite phủ đặc ô vuông');
}

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
      return a + (s * s * (e.shape === 'sprite' ? (FILL[e.sprite] ?? 1) : 1) * (e.alpha ?? 1) * rem) / AREA;
    }, 0);
  let peak = 0;
  for (let t = -0.3; t <= 0.8; t += 0.01) peak = Math.max(peak, at(t));
  out.push({ id, at30: at(0.03), peak, sprites: evs.filter((e) => e.shape === 'sprite').length });
}
for (const o of out) console.log(`${o.id.padEnd(26)} +30ms ${o.at30.toFixed(3)}  đỉnh ${o.peak.toFixed(3)}  sprite ${o.sprites}`);
