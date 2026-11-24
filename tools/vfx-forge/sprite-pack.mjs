#!/usr/bin/env node
// Họa Pháp Lô 2: tách nền xanh chroma của bảng sprite Codex (`forge sprites`) và xếp thành atlas WebP trong suốt cho `FX_SPRITES` (packages/shared/src/fxtimeline.ts).
// Dùng: node tools/vfx-forge/sprite-pack.mjs <bảng.png> | --sheet <bảng.png>:<cột>:<hàng> ... [--cols 4] [--cell 512] [--out apps/client/public/hoa-truc/vfx_sprites.webp] [--preview <png>]
// Mỗi ô lưới đều (cols × rows) của bảng: tìm khung bao của phần không phải nền, cắt, thu vừa ô (chừa lề), xếp vào atlas. alpha = 1 − (g − max(r,b))/255; khử viền xanh bằng cách trừ phần nền.
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
if (!input) throw new Error('dùng: sprite-pack.mjs <bảng.png> [--cols 4] [--rows 2] [--cell 512] [--out <webp>]');
const cols = Number(flag('--cols', 4));
const rows = Number(flag('--rows', 2));
const cell = Number(flag('--cell', 512));
const out = flag('--out', path.join(here, '../../apps/client/public/hoa-truc/vfx_sprites.webp'));
const MARGIN = 0.06;

const sheets = argv
  .filter((a, i) => argv[i - 1] === '--sheet')
  .map((v) => {
    const parts = v.split(':');
    const r = Number(parts.pop());
    const c = Number(parts.pop());
    return { file: parts.join(':'), cols: c, rows: r };
  });
if (!sheets.length) sheets.push({ file: input, cols, rows });
const comps = [];
const report = [];
let cellNo = 0;
for (const sh of sheets) await packSheet(sh);
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
    // đường cong alpha: cắt nhiễu nền (< 0,14) và làm đặc phần thân (> 0,8)
    const aa = Math.min(1, Math.max(0, (a - 0.14) / 0.66));
    rgba[i * 4 + 3] = Math.round(aa * aa * (3 - 2 * aa) * 255);
  }
  const cw = Math.floor(W / sh.cols);
  const ch = Math.floor(H / sh.rows);
  for (let r = 0; r < sh.rows; r++)
    for (let c = 0; c < sh.cols; c++) {
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
      const idx = cellNo++;
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
fs.mkdirSync(path.dirname(out), { recursive: true });
await atlas.clone().webp({ quality: 90, alphaQuality: 100 }).toFile(out);
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
