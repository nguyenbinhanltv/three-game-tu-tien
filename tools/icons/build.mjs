#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const sharp = createRequire(path.join(root, 'tools/asset-pipeline/package.json'))('sharp');
const read = (file) => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const methods = read('packages/content/data/methods.json');
const defs = [
  ...read('packages/content/data/skills.json'),
  ...methods.skills,
  ...read('packages/content/data/items.json'),
  ...methods.items,
  ...read('packages/content/data/artifacts.json').items,
  ...read('packages/content/data/alchemy.json').items,
  ...read('packages/content/data/equipment/templates.json'),
  ...read('packages/content/data/equipment/setItems.json'),
];
const out = path.join(root, 'apps/client/public/assets/ui');
const manifestPath = path.join(out, 'icons.json');
const hash = (data) => createHash('sha256').update(data).digest('hex');
// Icon phụ (biến thức, công pháp, linh căn, vai trò, buff, tiền, nút HUD, dấu nhiệm vụ): không có trong content, khai ở codex-assets/icons.json.
const defIcons = new Set(defs.map((d) => d.icon));
const extras = Object.keys(read('tools/codex-assets/icons.json')).filter((id) => !defIcons.has(id));
const size = 128,
  columns = 8;
// Hai bảng (T7): `hud` nạp ngay khi vào game (thanh chiêu, nút HUD, buff, dấu nhiệm vụ, pháp bảo trên thanh);
// `items` (vật phẩm, trang bị, linh ngọc) nạp lười khi có ô vật phẩm đầu tiên cần vẽ (mở Túi...).
const artifactIcons = new Set(read('packages/content/data/artifacts.json').items.map((d) => d.icon));
const skillIcons = new Set([...read('packages/content/data/skills.json'), ...methods.skills].map((d) => d.icon));
const sheetOf = (icon) => (skillIcons.has(icon) || artifactIcons.has(icon) || !/^(itm_|gem_)/.test(icon) ? 'hud' : 'items');
const sheetNames = ['hud', 'items'];
if (process.argv.includes('--check')) {
  const m = read('apps/client/public/assets/ui/icons.json');
  const licenses = fs.readFileSync(path.join(root, 'assets/LICENSES.md'), 'utf8');
  const cellsOf = {};
  for (const name of sheetNames) {
    const sh = m.sheets[name];
    const bytes = fs.readFileSync(path.join(out, sh.file));
    if (hash(bytes) !== sh.sha256 || bytes.length !== sh.bytes) throw new Error(`Atlas ${name} hash/size mismatch`);
    const image = await sharp(bytes).metadata();
    if (image.width !== size * sh.columns || image.height !== size * sh.rows) throw new Error(`Atlas ${name} dimensions mismatch`);
    cellsOf[name] = new Set();
  }
  let fallbackOnly = 0;
  const checkCell = (id, cell) => {
    const sh = m.sheets[cell.s];
    if (!sh || cell.s !== sheetOf(id)) throw new Error(`Wrong sheet: ${id}`);
    if (!Number.isInteger(cell.x) || !Number.isInteger(cell.y) || cell.x < 0 || cell.x >= sh.columns || cell.y < 0 || cell.y >= sh.rows)
      throw new Error(`Invalid cell: ${id}`);
    const key = `${cell.x},${cell.y}`;
    if (cellsOf[cell.s].has(key)) throw new Error(`Duplicate cell: ${id}`);
    cellsOf[cell.s].add(key);
  };
  for (const def of defs) {
    const cell = m.icons[def.icon];
    // Vật phẩm mới chưa có tranh thì dùng emoji `iconFallback` (client tự lùi), vẫn báo số lượng.
    if (!cell && def.iconFallback) {
      fallbackOnly++;
      continue;
    }
    if (!cell || !def.iconFallback || !licenses.includes(def.icon)) throw new Error(`Missing icon/fallback/license: ${def.id}`);
    // Chiêu tư thế (VS-2e, có `stanceOf`) mượn tranh của chiêu nền mà nó thay ô: ô atlas đó đã được chiêu nền kiểm.
    if (def.stanceOf) continue;
    checkCell(def.icon, cell);
  }
  for (const id of extras) {
    const cell = m.icons[id];
    if (!cell) {
      fallbackOnly++;
      continue;
    }
    if (!licenses.includes(id)) throw new Error(`Missing license: ${id}`);
    checkCell(id, cell);
  }
  console.log(
    `Icons OK: ${defs.length - fallbackOnly}/${defs.length} có tranh (${fallbackOnly} dùng emoji dự phòng), hud ${m.sheets.hud.bytes} B + items ${m.sheets.items.bytes} B`,
  );
  process.exit(0);
}
const git = spawnSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd: root, encoding: 'utf8' });
if (git.status !== 0 && !process.env.DTL_ASSET_SOURCE) throw new Error(git.stderr);
const source = process.env.DTL_ASSET_SOURCE ?? path.resolve(path.dirname(git.stdout.trim()), '../dtl-asset-source');
const icons = {};
const layers = { hud: [], items: [] };
const count = { hud: 0, items: 0 };
// `icon` là khóa ảnh ổn định, có thể khác `id` (chiêu K-2 đổi id nhưng giữ icon cũ).
const seen = new Set();
for (const def of [...defs, ...extras.map((id) => ({ id, icon: id }))]) {
  if (seen.has(def.icon)) continue;
  seen.add(def.icon);
  // Thứ tự ưu tiên: bộ icon U2-I (2d/icon/v2/png256, đã căn giữa, không viền) > tranh Codex đợt 1 (2d/icon/v1) > bản cũ (2d/icon/legacy, kể cả render Blender).
  const v3 = path.join(source, '2d', 'icon', 'v2', 'png256', `${def.icon}.png`);
  const v2 = path.join(source, '2d', 'icon', 'v1', `${def.icon}.png`);
  const file = fs.existsSync(v3) ? v3 : fs.existsSync(v2) ? v2 : path.join(source, '2d', 'icon', 'legacy', `${def.icon}.png`);
  // Chưa có tranh gốc: không chiếm ô, client dùng emoji `iconFallback`.
  if (!fs.existsSync(file)) {
    console.log(`Bỏ qua (chưa có PNG): ${def.icon}`);
    continue;
  }
  const input = fs.readFileSync(file);
  const sheet = sheetOf(def.icon);
  const cellIndex = count[sheet]++;
  const x = cellIndex % columns,
    y = Math.floor(cellIndex / columns);
  icons[def.icon] = { s: sheet, x, y, sourceSha256: hash(input), sourceBytes: input.length };
  layers[sheet].push({ input: await sharp(input).resize(size, size, { fit: 'cover' }).png().toBuffer(), left: x * size, top: y * size });
}
fs.mkdirSync(out, { recursive: true });
const sheets = {};
const keep = new Set();
let webp;
for (const name of sheetNames) {
  const rows = Math.max(2, Math.ceil(count[name] / columns));
  const png = await sharp({ create: { width: columns * size, height: rows * size, channels: 4, background: '#123B45' } })
    .composite(layers[name])
    .png()
    .toBuffer();
  const data = await sharp(png).webp({ quality: 90, effort: 6 }).toBuffer();
  const sha256 = hash(data),
    file = `icons-${name}.${sha256.slice(0, 10)}.webp`;
  fs.writeFileSync(path.join(out, file), data);
  keep.add(file);
  sheets[name] = { file, sha256, bytes: data.length, columns, rows };
  if (name === 'items') webp = data;
}
const manifest = { version: 4, tileSize: size, sheets, icons };
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
for (const old of fs.readdirSync(out)) {
  if (/^icons(-[a-z]+)?\.[a-f0-9]{10}\.(webp|ktx2)$/.test(old) && !keep.has(old)) fs.unlinkSync(path.join(out, old));
}
console.log(
  `${Object.keys(icons).length} icons → hud ${sheets.hud.file} (${sheets.hud.bytes} B), items ${sheets.items.file} (${sheets.items.bytes} B)`,
);
