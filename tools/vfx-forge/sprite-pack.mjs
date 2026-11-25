#!/usr/bin/env node
// Họa Pháp Lô 2: tách nền xanh chroma của bảng sprite Codex (`forge sprites`) và xếp thành atlas WebP trong suốt cho `FX_SPRITES` (packages/shared/src/fxtimeline.ts).
// Dùng: node tools/vfx-forge/sprite-pack.mjs <bảng.png> | --sheet <bảng.png>:<cột>:<hàng> ... [--cols 8: số cột của atlas, khớp SPRITE_COLS] [--base <atlas.webp> nối thêm vào atlas có sẵn] [--patch <ô>=<bảng.png>:<cột>:<hàng>:<số cột>:<số hàng> thay một ô] [--cell 512] [--out <đường dẫn>; mặc định public/hoa-truc/vfx_sprites.<hash10>.webp] [--preview <png>]
// Mỗi ô lưới đều (cols × rows) của bảng: tìm khung bao của phần không phải nền, cắt, thu vừa ô (chừa lề), xếp vào atlas. alpha = 1 − (g − max(r,b))/255; khử viền xanh bằng cách trừ phần nền.
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const sharp = createRequire(path.join(here, 'package.json'))('sharp');
const argv = process.argv.slice(2);
const input = argv[0];
const flag = (n, d) => {
  const i = argv.indexOf(n);
  return i >= 0 ? argv[i + 1] : d;
};
if (!input)
  throw new Error('dùng: sprite-pack.mjs <bảng.png> [--cols <số cột atlas, mặc định SPRITE_COLS>] [--rows 2] [--cell 512] [--out <webp>]');
// Số cột của ATLAS lấy từ `SPRITE_COLS` ở `render/vfx/art.ts` (hiện 8; cạnh atlas ≤ 8192 px nên cột × 512 ≤ 8192); `--cols` ghi đè. Số cột của một BẢNG vẽ riêng là `--sheet <png>:<cột>:<hàng>` (hoặc `--sheet-cols` cho dạng tắt).
const artSrc = fs.readFileSync(path.join(here, '../../apps/client/src/render/vfx/art.ts'), 'utf8');
const cols = Number(flag('--cols', artSrc.match(/SPRITE_COLS = (\d+)/)?.[1] ?? 4));
const sheetCols = Number(flag('--sheet-cols', 4));
const rows = Number(flag('--rows', 2));
const cell = Number(flag('--cell', 512));
// Mặc định ghi ra `apps/client/public/hoa-truc/vfx_sprites.<hash10>.webp` (hash10 = 10 ký tự đầu của sha256 nội dung): R2 bất biến, không bao giờ đè tên cũ.
const outArg = flag('--out');
const MARGIN = 0.06;

const sheets = argv
  .filter((a, i) => argv[i - 1] === '--sheet')
  .map((v) => {
    const parts = v.split(':');
    const r = Number(parts.pop());
    const c = Number(parts.pop());
    return { file: parts.join(':'), cols: c, rows: r };
  });
// `--patch <ô>=<bảng.png>:<cột>:<hàng>:<số cột>:<số hàng>`: THAY một ô của atlas gốc (xóa ô cũ) bằng sprite ở (cột, hàng) của bảng mới; cần `--base`.
const patches = argv
  .filter((a, i) => argv[i - 1] === '--patch')
  .map((v) => {
    const [idx, rest] = v.split('=');
    const parts = rest.split(':');
    const rows2 = Number(parts.pop());
    const cols2 = Number(parts.pop());
    const row = Number(parts.pop());
    const col = Number(parts.pop());
    return { file: parts.join(':'), cols: cols2, rows: rows2, only: { col, row }, forcedIdx: Number(idx) };
  });
if (!sheets.length && !patches.length) sheets.push({ file: input, cols: sheetCols, rows });
const comps = [];
const report = [];
let cellNo = 0;
// `--base <atlas.webp>`: giữ nguyên atlas đã có (các ô cũ), chỉ NỐI THÊM ô của các bảng mới vào hàng tiếp theo (không cần bảng gốc của các ô cũ).
const basePath = flag('--base');
if (basePath) {
  const bm = await sharp(basePath).metadata();
  if (bm.width !== cols * cell || bm.height % cell !== 0)
    throw new Error(`atlas gốc ${bm.width}×${bm.height} không khớp lưới ${cols} cột × ô ${cell}`);
  comps.push({ input: await sharp(basePath).ensureAlpha().png().toBuffer(), left: 0, top: 0 });
  cellNo = (bm.height / cell) * cols;
  report.push(`giữ atlas gốc: ${cellNo} ô`);
}
for (const sh of sheets) await packSheet(sh);
for (const sh of patches) {
  if (!basePath) throw new Error('--patch cần --base');
  const ax = sh.forcedIdx % cols;
  const ay = Math.floor(sh.forcedIdx / cols);
  const white = await sharp({ create: { width: cell, height: cell, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } } })
    .png()
    .toBuffer();
  comps.push({ input: white, left: ax * cell, top: ay * cell, blend: 'dest-out' });
  await packSheet(sh);
}
async function packSheet(sh) {
  const { data, info } = await sharp(sh.file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width;
  const H = info.height;
  const rgba = Buffer.alloc(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];
    const a = Math.min(1, Math.max(0, 1 - (g - Math.max(r, b)) / 255));
    // trừ phần nền xanh còn lẫn trong điểm bán trong suốt
    const k = 1 - a;
    const un = (v, key) => (a > 0.02 ? Math.min(255, Math.max(0, (v - k * key) / a)) : 0);
    const rr = un(r, 0);
    const bb = un(b, 0);
    const gg = Math.min(un(g, 255), Math.min(rr, bb) * 0.92); // sprite tím/lam, không có xanh lục: ép g dưới min(r,b) để hết viền teal
    rgba[i * 4] = rr;
    rgba[i * 4 + 1] = gg;
    rgba[i * 4 + 2] = bb;
    // đường cong alpha mềm: chỉ cắt nhiễu nền (< 0,06), giữ độ trong của khói ở mép
    const aa = Math.min(1, Math.max(0, (a - 0.06) / 0.88));
    rgba[i * 4 + 3] = Math.round(aa * 255);
  }
  const cw = Math.floor(W / sh.cols);
  const ch = Math.floor(H / sh.rows);
  for (let r = 0; r < sh.rows; r++)
    for (let c = 0; c < sh.cols; c++) {
      if (sh.only && (r !== sh.only.row || c !== sh.only.col)) continue;
      let x0 = cw;
      let y0 = ch;
      let x1 = -1;
      let y1 = -1;
      for (let y = 0; y < ch; y++)
        for (let x = 0; x < cw; x++) {
          if (rgba[((r * ch + y) * W + c * cw + x) * 4 + 3] > 90) {
            if (x < x0) x0 = x;
            if (x > x1) x1 = x;
            if (y < y0) y0 = y;
            if (y > y1) y1 = y;
          }
        }
      const idx = sh.forcedIdx ?? cellNo++;
      if (x1 < 0) {
        report.push(`ô ${idx}: trống`);
        continue;
      }
      const bw = x1 - x0 + 1;
      const bh = y1 - y0 + 1;
      const buf = Buffer.alloc(bw * bh * 4);
      for (let y = 0; y < bh; y++)
        rgba.copy(buf, y * bw * 4, ((r * ch + y0 + y) * W + c * cw + x0) * 4, ((r * ch + y0 + y) * W + c * cw + x0 + bw) * 4);
      const fit = Math.round(cell * (1 - 2 * MARGIN));
      const s = Math.min(fit / bw, fit / bh);
      const tw = Math.max(1, Math.round(bw * s));
      const th = Math.max(1, Math.round(bh * s));
      const png = await sharp(buf, { raw: { width: bw, height: bh, channels: 4 } })
        .resize(tw, th, { kernel: 'lanczos3' })
        .png()
        .toBuffer();
      const ax = idx % cols;
      const ay = Math.floor(idx / cols);
      comps.push({ input: png, left: ax * cell + Math.round((cell - tw) / 2), top: ay * cell + Math.round((cell - th) / 2) });
      report.push(`ô ${idx}: ${bw}×${bh} → ${tw}×${th}`);
    }
}
const totalRows = Math.ceil(cellNo / cols);
const atlas = sharp({
  create: { width: cols * cell, height: totalRows * cell, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
}).composite(comps);
const webpBuf = await atlas.clone().webp({ quality: 90, alphaQuality: 100 }).toBuffer();
const hash10 = createHash('sha256').update(webpBuf).digest('hex').slice(0, 10);
const out = outArg ?? path.join(here, '../../apps/client/public/hoa-truc', `vfx_sprites.${hash10}.webp`);
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, webpBuf);
const pv = flag('--preview');
if (pv) {
  // xem thử trên nền xám tối + nền sáng cạnh nhau
  const png = await atlas.clone().png().toBuffer();
  const bg = (hex) => ({ create: { width: cols * cell, height: totalRows * cell, channels: 3, background: hex } });
  const light = await sharp(bg('#cfd8cc'))
    .composite([{ input: png }])
    .png()
    .toBuffer();
  const dark = await sharp(bg('#1a1d24'))
    .composite([{ input: png }])
    .png()
    .toBuffer();
  await sharp({ create: { width: cols * cell * 2, height: totalRows * cell, channels: 3, background: '#000' } })
    .composite([
      { input: light, left: 0, top: 0 },
      { input: dark, left: cols * cell, top: 0 },
    ])
    .jpeg({ quality: 85 })
    .toFile(pv);
}
console.log(report.join('\n'));
console.log(`đã ghi ${out} (${fs.statSync(out).size} byte)`);
console.log(
  `Tiếp: sửa SPRITE_ATLAS_FILE ở apps/client/src/render/vfx/art.ts thành 'hoa-truc/vfx_sprites.${hash10}.webp', rồi pnpm assets:lock và pnpm assets:push --only hoa-truc/vfx_sprites.${hash10}.webp (KHÔNG đẩy đè tên cũ).`,
);
