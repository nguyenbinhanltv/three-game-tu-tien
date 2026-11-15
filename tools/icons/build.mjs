#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const sharp = createRequire(path.join(root, 'tools/asset-pipeline/package.json'))('sharp');
const read = (file) => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const methods = read('packages/content/data/methods.json');
const defs = [...read('packages/content/data/skills.json'), ...methods.skills, ...read('packages/content/data/items.json'), ...methods.items, ...read('packages/content/data/artifacts.json').items, ...read('packages/content/data/alchemy.json').items];
const out = path.join(root, 'apps/client/public/assets/ui');
const manifestPath = path.join(out, 'icons.json');
const hash = (data) => createHash('sha256').update(data).digest('hex');
const size = 128, columns = 8, rows = 6;
if (process.argv.includes('--check')) {
  const m = read('apps/client/public/assets/ui/icons.json');
  const bytes = fs.readFileSync(path.join(out, m.file));
  if (hash(bytes) !== m.sha256 || bytes.length !== m.bytes) throw new Error('Atlas hash/size mismatch');
  const image = await sharp(bytes).metadata();
  if (image.width !== size * columns || image.height !== size * rows) throw new Error('Atlas dimensions mismatch');
  const cells = new Set();
  const licenses = fs.readFileSync(path.join(root, 'assets/LICENSES.md'), 'utf8');
  let fallbackOnly = 0;
  for (const def of defs) {
    const cell = m.icons[def.icon];
    // Atlas đã đầy (8×4): vật phẩm mới chưa có tranh thì dùng emoji `iconFallback` (client tự lùi), vẫn báo số lượng.
    if (!cell && def.iconFallback) {
      fallbackOnly++;
      continue;
    }
    if (!cell || !def.iconFallback || !licenses.includes(def.icon)) throw new Error(`Missing icon/fallback/license: ${def.id}`);
    if (!Number.isInteger(cell.x) || !Number.isInteger(cell.y) || cell.x < 0 || cell.x >= columns || cell.y < 0 || cell.y >= rows) throw new Error(`Invalid cell: ${def.id}`);
    const key = `${cell.x},${cell.y}`;
    if (cells.has(key)) throw new Error(`Duplicate cell: ${def.id}`);
    cells.add(key);
  }
  console.log(`Icons OK: ${defs.length - fallbackOnly}/${defs.length} có tranh trong atlas (${fallbackOnly} dùng emoji dự phòng), ${m.bytes} bytes, ${image.width}x${image.height}`);
  process.exit(0);
}
const git = spawnSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd: root, encoding: 'utf8' });
if (git.status !== 0 && !process.env.DTL_ASSET_SOURCE) throw new Error(git.stderr);
const source = process.env.DTL_ASSET_SOURCE ?? path.resolve(path.dirname(git.stdout.trim()), '../dtl-asset-source');
const icons = {}, layers = [];
let index = 0;
for (const def of defs) {
  if (def.icon !== def.id) throw new Error(`Expected stable image id: ${def.id}`);
  const file = path.join(source, 'icons', `${def.icon}.png`);
  // Chưa có tranh gốc: không chiếm ô, client dùng emoji `iconFallback`.
  if (!fs.existsSync(file)) { console.log(`Bỏ qua (chưa có PNG): ${def.icon}`); continue; }
  const input = fs.readFileSync(file);
  // Sức chứa chỉ tính vật phẩm có tranh gốc; còn lại dùng emoji `iconFallback`.
  if (index >= columns * rows) throw new Error('Atlas capacity exceeded');
  const x = index % columns, y = Math.floor(index / columns);
  index++;
  icons[def.icon] = { x, y, sourceSha256: hash(input), sourceBytes: input.length };
  layers.push({ input: await sharp(input).resize(size, size, { fit: 'cover' }).png().toBuffer(), left: x * size, top: y * size });
}
const png = await sharp({ create: { width: columns * size, height: rows * size, channels: 4, background: '#123B45' } }).composite(layers).png().toBuffer();
const webp = await sharp(png).webp({ quality: 90, effort: 6 }).toBuffer();
fs.mkdirSync(out, { recursive: true });
const sha256 = hash(webp), file = `icons.${sha256.slice(0, 10)}.webp`;
fs.writeFileSync(path.join(out, file), webp);
const manifest = { version: 1, file, sha256, bytes: webp.length, tileSize: size, columns, rows, icons };
const candidates = [process.env.TOKTX, 'toktx', path.join(process.env.ProgramFiles ?? 'C:/Program Files', 'KTX-Software/bin/toktx.exe')].filter(Boolean);
const toktx = candidates.find((candidate) => spawnSync(candidate, ['--version'], { encoding: 'utf8' }).status === 0);
if (toktx) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'dtl-icons-'));
  try {
    fs.writeFileSync(path.join(temp, 'atlas.png'), png);
    const target = path.join(temp, 'atlas.ktx2');
    const result = spawnSync(toktx, ['--t2', '--encode', 'uastc', '--assign_oetf', 'srgb', target, path.join(temp, 'atlas.png')], { encoding: 'utf8' });
    if (result.status !== 0) throw new Error(result.stderr || result.stdout);
    const ktx = fs.readFileSync(target);
    manifest.ktx2 = { file: `icons.${hash(ktx).slice(0, 10)}.ktx2`, bytes: ktx.length };
    fs.writeFileSync(path.join(out, manifest.ktx2.file), ktx);
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
} else console.log('toktx unavailable; WebP atlas only (DOM UI uses WebP).');
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
for (const old of fs.readdirSync(out)) {
  if (/^icons\.[a-f0-9]{10}\.(webp|ktx2)$/.test(old) && old !== file && old !== manifest.ktx2?.file) fs.unlinkSync(path.join(out, old));
}
const previewIndex = process.argv.indexOf('--preview');
if (previewIndex >= 0) {
  const names = read('packages/content/data/i18n/vi.json');
  const cards = defs.map((def) => {
    const { x, y } = icons[def.icon];
    const name = names[`item.${def.id}.name`] ?? names[`skill.${def.id}.name`] ?? def.id;
    return `<article><h2>${name}</h2><code>${def.id}</code><div class="samples">${[48,64,128].map((s) => `<figure><i style="width:${s}px;height:${s}px;background-position:${x/(columns-1)*100}% ${y/(rows-1)*100}%"></i><figcaption>${s}px</figcaption></figure>`).join('')}</div></article>`;
  }).join('');
  const html = `<!doctype html><html lang="vi"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Đạp Thiên Lộ — Icon M4-7</title><style>body{background:#123B45;color:#DCE6DF;font:16px system-ui;margin:32px}h1{color:#F2C47E}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(310px,1fr));gap:20px}article{border:1px solid #AE8B49;padding:16px;border-radius:8px}h2{font-size:18px}code{font-size:12px}.samples{display:flex;align-items:center;gap:12px}figure{margin:12px 0}figcaption{font-size:12px;text-align:center}i{display:block;background-image:url(data:image/webp;base64,${webp.toString('base64')});background-size:${columns*100}% ${rows*100}%}</style><h1>Đạp Thiên Lộ · 29 icon</h1><p>6 skill · 23 vật phẩm · ${columns*size} × ${rows*size} · ${webp.length.toLocaleString('vi-VN')} byte WebP</p><p>Codex tạo riêng cho dự án · bán tả thực · ngọc lam và nắng sớm · khung đồng vuông vát góc.</p><main>${cards}</main></html>`;
  fs.writeFileSync(path.resolve(process.argv[previewIndex + 1]), html);
}
console.log(`${defs.length} icons → ${file}: ${webp.length} bytes`);
