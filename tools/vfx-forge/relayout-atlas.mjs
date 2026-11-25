#!/usr/bin/env node
// Sắp lại atlas sprite VFX sang số cột khác (không đụng nội dung từng ô, chỉ đổi cách xếp lưới): WebGPU mặc định chỉ cho cạnh ≤ 8192 px, nên atlas 4 cột × 18 hàng (9216 px) làm mất thiết bị GPU.
// Dùng: node tools/vfx-forge/relayout-atlas.mjs <atlas.webp> --from-cols 4 --to-cols 8 [--cell 512] [--out <đường dẫn>]; mặc định ghi `vfx_sprites.<hash10>.webp` cạnh file gốc (tên theo hash, R2 bất biến).
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const sharp = createRequire(path.join(here, 'package.json'))('sharp');
const args = process.argv.slice(2);
const flag = (n, d) => (args.includes(n) ? args[args.indexOf(n) + 1] : d);
const input = args.find((a) => !a.startsWith('--') && args[args.indexOf(a) - 1]?.startsWith('--') === false) ?? args[0];
const fromCols = Number(flag('--from-cols', 4));
const toCols = Number(flag('--to-cols', 8));
const cell = Number(flag('--cell', 512));
if (!input || !fs.existsSync(input)) throw new Error('dùng: relayout-atlas.mjs <atlas.webp> --from-cols 4 --to-cols 8');

const meta = await sharp(input).metadata();
if (meta.width !== fromCols * cell || meta.height % cell !== 0)
  throw new Error(`atlas ${meta.width}×${meta.height} không khớp ${fromCols} cột × ô ${cell}`);
const n = (meta.height / cell) * fromCols;
const src = await sharp(input).ensureAlpha().raw().toBuffer();
const rowsOut = Math.ceil(n / toCols);
const comps = [];
for (let i = 0; i < n; i++) {
  const sx = (i % fromCols) * cell;
  const sy = Math.floor(i / fromCols) * cell;
  const buf = await sharp(src, { raw: { width: meta.width, height: meta.height, channels: 4 } })
    .extract({ left: sx, top: sy, width: cell, height: cell })
    .png()
    .toBuffer();
  comps.push({ input: buf, left: (i % toCols) * cell, top: Math.floor(i / toCols) * cell });
}
const out = await sharp({
  create: { width: toCols * cell, height: rowsOut * cell, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
})
  .composite(comps)
  .webp({ quality: 90, alphaQuality: 100 })
  .toBuffer();
const hash10 = createHash('sha256').update(out).digest('hex').slice(0, 10);
const dest = flag('--out', path.join(path.dirname(input), `vfx_sprites.${hash10}.webp`));
fs.writeFileSync(dest, out);
console.log(`đã ghi ${dest} (${toCols * cell}×${rowsOut * cell}, ${n} ô, ${out.length} byte)`);
