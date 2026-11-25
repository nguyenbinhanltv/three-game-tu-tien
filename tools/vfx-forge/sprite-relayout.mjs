#!/usr/bin/env node
// Xếp lại lưới atlas sprite (đổi số cột) mà KHÔNG đổi thứ tự ô: ô i ở cột i % cols, hàng ⌊i / cols⌋ (hàng 0 ở trên cùng), mỗi ô vuông `--cell` px.
// Dùng khi atlas quá cao: WebGPU mặc định chỉ có `maxTextureDimension2D` = 8192, nên cạnh atlas (cols × cell, rows × cell) phải ≤ 8192.
// Dùng: node tools/vfx-forge/sprite-relayout.mjs --in <atlas.webp> --from-cols 4 --to-cols 8 [--cell 512] [--out <webp>]
// Ra: `apps/client/public/hoa-truc/vfx_sprites.<hash10>.webp` (tên theo hash, không đè) rồi in lệnh tiếp theo (SPRITE_COLS/ROWS, assets:lock, assets:push).
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const sharp = createRequire(path.join(here, 'package.json'))('sharp');
const argv = process.argv.slice(2);
const flag = (n, d) => {
  const i = argv.indexOf(n);
  return i >= 0 ? argv[i + 1] : d;
};
const input = flag('--in');
const fromCols = Number(flag('--from-cols', 4));
const toCols = Number(flag('--to-cols', 8));
const cell = Number(flag('--cell', 512));
if (!input) throw new Error('dùng: sprite-relayout.mjs --in <atlas.webp> --from-cols 4 --to-cols 8 [--cell 512] [--out <webp>]');

const meta = await sharp(input).metadata();
if (meta.width !== fromCols * cell || meta.height % cell !== 0)
  throw new Error(`atlas ${meta.width}×${meta.height} không khớp ${fromCols} cột × ô ${cell}`);
const n = (meta.height / cell) * fromCols;
const rows = Math.ceil(n / toCols);
const raw = await sharp(input).ensureAlpha().raw().toBuffer();
const W = toCols * cell;
const H = rows * cell;
const out = Buffer.alloc(W * H * 4, 0);
for (let i = 0; i < n; i++) {
  const sx = (i % fromCols) * cell;
  const sy = Math.floor(i / fromCols) * cell;
  const dx = (i % toCols) * cell;
  const dy = Math.floor(i / toCols) * cell;
  for (let y = 0; y < cell; y++) {
    const s = ((sy + y) * meta.width + sx) * 4;
    raw.copy(out, ((dy + y) * W + dx) * 4, s, s + cell * 4);
  }
}
const webp = await sharp(out, { raw: { width: W, height: H, channels: 4 } })
  .webp({ quality: 90, alphaQuality: 100 })
  .toBuffer();
const hash = createHash('sha256').update(webp).digest('hex').slice(0, 10);
const dst = flag('--out') ?? path.resolve(here, `../../apps/client/public/hoa-truc/vfx_sprites.${hash}.webp`);
fs.writeFileSync(dst, webp);
const name = path.basename(dst);
console.log(`đã ghi ${dst}: ${n} ô, lưới ${toCols} cột × ${rows} hàng = ${W}×${H} px (${webp.length} byte)`);
console.log(
  `Tiếp: art.ts: SPRITE_ATLAS_FILE = 'hoa-truc/${name}', SPRITE_COLS = ${toCols}, SPRITE_ROWS = ${rows}; pnpm assets:lock; pnpm assets:push --only hoa-truc/${name}`,
);
