#!/usr/bin/env node
// Tách atlas sprite VFX gộp (một lưới, thứ tự ô = `FX_SPRITES`) thành MỘT ATLAS CHO MỖI HƯỚNG TU (nhóm theo tiền tố tên sprite: `hon_`, `loi_`, `kiem_`, `hp_`...): mỗi nhóm một file
// `vfx_sprites_<nhóm>.<hash10>.webp` lưới 4 cột × N hàng ô 512 px (cạnh ≤ 8192 px), để client chỉ nạp atlas của hướng đang hiện (xem `render/vfx/art.ts`).
// Dùng: node tools/vfx-forge/split-atlas.mjs <atlas gộp.webp> --cols 8 [--out <thư mục>]; mặc định ghi cạnh file gốc. In ra khối `SPRITE_GROUPS` để dán vào art.ts. Không đụng nội dung từng ô (chỉ xếp lại, mã hóa webp q90 một lần nữa).
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const sharp = createRequire(path.join(here, 'package.json'))('sharp');
const args = process.argv.slice(2);
const flag = (n, d) => (args.includes(n) ? args[args.indexOf(n) + 1] : d);
const input = args[0];
const fromCols = Number(flag('--cols', 8));
const cell = 512;
const GROUP_COLS = 4;
if (!input || !fs.existsSync(input)) throw new Error('dùng: split-atlas.mjs <atlas gộp.webp> --cols 8 [--out <thư mục>]');

const names = [
  ...fs
    .readFileSync(path.join(here, '../../packages/shared/src/fxtimeline.ts'), 'utf8')
    .match(/export const FX_SPRITES = \[([\s\S]*?)\] as const/)[1]
    .matchAll(/'([a-z0-9_]+)'/g),
].map((m) => m[1]);
const meta = await sharp(input).metadata();
if (meta.width !== fromCols * cell) throw new Error(`atlas ${meta.width}×${meta.height} không khớp ${fromCols} cột × ${cell}`);
const src = await sharp(input).ensureAlpha().raw().toBuffer();
const outDir = flag('--out', path.dirname(input));
const groups = new Map();
names.forEach((n, i) => {
  const g = n.split('_')[0];
  if (!groups.has(g)) groups.set(g, []);
  groups.get(g).push(i);
});
const report = {};
for (const [g, idxs] of groups) {
  const rows = Math.ceil(idxs.length / GROUP_COLS);
  const comps = [];
  for (let k = 0; k < idxs.length; k++) {
    const i = idxs[k];
    const buf = await sharp(src, { raw: { width: meta.width, height: meta.height, channels: 4 } })
      .extract({ left: (i % fromCols) * cell, top: Math.floor(i / fromCols) * cell, width: cell, height: cell })
      .png()
      .toBuffer();
    comps.push({ input: buf, left: (k % GROUP_COLS) * cell, top: Math.floor(k / GROUP_COLS) * cell });
  }
  const out = await sharp({
    create: { width: GROUP_COLS * cell, height: rows * cell, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite(comps)
    .webp({ quality: 90, alphaQuality: 100 })
    .toBuffer();
  const hash10 = createHash('sha256').update(out).digest('hex').slice(0, 10);
  const file = `vfx_sprites_${g}.${hash10}.webp`;
  fs.writeFileSync(path.join(outDir, file), out);
  report[g] = { file: `hoa-truc/${file}`, cols: GROUP_COLS, rows, cells: idxs.length, bytes: out.length };
  console.log(`${g}: ${file} (${GROUP_COLS * cell}×${rows * cell}, ${idxs.length} ô, ${out.length} byte)`);
}
console.log('\nSPRITE_GROUPS =', JSON.stringify(report, null, 2));
