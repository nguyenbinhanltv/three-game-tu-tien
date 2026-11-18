#!/usr/bin/env node
// Đóng gói ảnh lớn (chân dung, màn tải, chất liệu UI) thành WebP có hash để client nạp lười.
// Dùng: node tools/codex-assets/pack.mjs [nhóm…]   →  apps/client/public/assets/art/<nhóm>/<id>.<hash>.webp + art.json
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const sharp = createRequire(path.join(root, 'tools/asset-pipeline/package.json'))('sharp');
const git = spawnSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd: root, encoding: 'utf8' });
const source = process.env.DTL_ASSET_SOURCE ?? path.resolve(path.dirname(git.stdout.trim()), '../dtl-asset-source');
const out = path.join(root, 'apps/client/public/assets/art');

// Kích thước đích (px) và chất lượng WebP theo nhóm / ảnh.
const spec = {
  portraits: { w: 480, h: 640, q: 84 },
  loading: { w: 1600, h: 900, q: 78 },
  // Lớp parallax của màn tiêu đề (U2-4): cành tùng nhân (multiply) và sương (screen), nền trắng/đen thuần.
  layers: { w: 1600, h: 900, q: 78 },
  ui: {
    paper_tile: { w: 512, h: 512, q: 86 },
    corner_ornament: { w: 320, h: 320, q: 86 },
    seal_red: { w: 192, h: 192, q: 88 },
    map_bg: { w: 1600, h: 900, q: 80 },
  },
};
const manifestPath = path.join(out, 'art.json');
const only = process.argv.slice(2);
// Nhóm không đóng gói lại thì giữ nguyên trong manifest.
const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : { version: 1, files: {} };
for (const group of Object.keys(spec)) {
  if (only.length && !only.includes(group)) continue;
  const dir = path.join(source, '2d', group);
  if (!fs.existsSync(dir)) {
    // Thiếu nguồn: giữ nguyên nhóm trong manifest (không làm ảnh biến mất); báo lỗi nếu được yêu cầu rõ.
    if (only.includes(group)) throw new Error(`Không có nguồn ${dir}`);
    continue;
  }
  delete manifest.files[group];
  fs.mkdirSync(path.join(out, group), { recursive: true });
  const keep = new Set();
  for (const f of fs
    .readdirSync(dir)
    .filter((x) => x.endsWith('.png'))
    .sort()) {
    const id = f.slice(0, -4);
    const s = spec[group].w ? spec[group] : spec[group][id];
    if (!s) continue;
    const input = fs.readFileSync(path.join(dir, f));
    const webp = await sharp(input).resize(s.w, s.h, { fit: 'cover', position: 'attention' }).webp({ quality: s.q, effort: 6 }).toBuffer();
    const hash = createHash('sha256').update(webp).digest('hex').slice(0, 10);
    const name = `${id}.${hash}.webp`;
    fs.writeFileSync(path.join(out, group, name), webp);
    keep.add(name);
    (manifest.files[group] ??= {})[id] = {
      file: `${group}/${name}`,
      w: s.w,
      h: s.h,
      bytes: webp.length,
      sourceSha256: createHash('sha256').update(input).digest('hex'),
    };
  }
  for (const old of fs.readdirSync(path.join(out, group))) if (!keep.has(old)) fs.unlinkSync(path.join(out, group, old));
}
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
let total = 0,
  n = 0;
for (const g of Object.values(manifest.files))
  for (const e of Object.values(g)) {
    total += e.bytes;
    n++;
  }
console.log(`${n} ảnh → ${path.relative(root, out)}: ${(total / 1024 / 1024).toFixed(2)} MB`);
