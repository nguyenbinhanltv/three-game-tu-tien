#!/usr/bin/env node
// V-P2..P8: bảng concept-vs-game cho một đợt. Với mỗi chiêu: ảnh concept 2x2 (Codex) + ảnh phòng thử 720p/1080p (0/+30/+150/+400 ms) → `<id>-concept-vs-game.jpg`;
// cả đợt: `tong-quan.jpg` (concept | game +30 | game +150) và `nen-toi.jpg` (+30 | +150 trên nền tối).
// Dùng: node tools/vfx-forge/table.mjs <thư mục đợt> <id chiêu>...   Thư mục đợt có concepts/<id>_concept.png, final/<id>/, dark/<id>/.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const sharp = createRequire(path.join(here, 'package.json'))('sharp');
const [dir, ...skills] = process.argv.slice(2);
if (!dir || !skills.length) throw new Error('dùng: table.mjs <thư mục đợt> <id chiêu>...');
const W = 560;
const H = 315;
const times = ['0', '30', '150', '400'];
const cidx = [1, 1, 2, 3]; // khung concept: dồn lực/va chạm/+150/tan → dùng va chạm cho 0 và +30
const shot = (sk, tag, ms, sub = 'final') => path.join(dir, sub, sk, `${sk}-${tag}-+${ms}ms.jpg`);
const tile = async (f) => (fs.existsSync(f) ? sharp(f).resize(W, H).jpeg().toBuffer() : sharp({ create: { width: W, height: H, channels: 3, background: '#333' } }).jpeg().toBuffer());
const conceptTile = async (sk, c) => {
  const f = path.join(dir, 'concepts', `${sk}_concept.png`);
  if (!fs.existsSync(f)) return tile('');
  const m = await sharp(f).metadata();
  const w = Math.floor(m.width / 2);
  const h = Math.floor(m.height / 2);
  return sharp(f)
    .extract({ left: (c % 2) * w, top: Math.floor(c / 2) * h, width: w, height: h })
    .resize(W, H)
    .jpeg()
    .toBuffer();
};

const over = [];
const dark = [];
for (const [r, sk] of skills.entries()) {
  const comp = [];
  for (let i = 0; i < 4; i++) comp.push({ input: await conceptTile(sk, cidx[i]), left: i * W, top: 0 });
  for (const [k, tag] of ['720p', '1080p'].entries()) for (let i = 0; i < 4; i++) comp.push({ input: await tile(shot(sk, tag, times[i])), left: i * W, top: H * (k + 1) });
  await sharp({ create: { width: W * 4, height: H * 3, channels: 3, background: '#111' } }).composite(comp).jpeg({ quality: 88 }).toFile(path.join(dir, `${sk}-concept-vs-game.jpg`));
  over.push({ input: await conceptTile(sk, 1), left: 0, top: r * H }, { input: await tile(shot(sk, '1080p', 30)), left: W, top: r * H }, { input: await tile(shot(sk, '1080p', 150)), left: 2 * W, top: r * H });
  dark.push({ input: await tile(shot(sk, '1080p', 30, 'dark')), left: 0, top: r * H }, { input: await tile(shot(sk, '1080p', 150, 'dark')), left: W, top: r * H });
  console.log('bảng', sk);
}
await sharp({ create: { width: W * 3, height: H * skills.length, channels: 3, background: '#111' } }).composite(over).jpeg({ quality: 85 }).toFile(path.join(dir, 'tong-quan.jpg'));
await sharp({ create: { width: W * 2, height: H * skills.length, channels: 3, background: '#111' } }).composite(dark).jpeg({ quality: 85 }).toFile(path.join(dir, 'nen-toi.jpg'));
console.log('xong');
