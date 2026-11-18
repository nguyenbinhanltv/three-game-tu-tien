// Chạy tools/blender/sculpt_rig.py cho một asset có khối `sculpt` trong meta.json: bản điêu khắc dày lưới không xương
// (DTL_ASSET_SOURCE/<sculpt.source>) → GLB lưới thấp có xương (DTL_ASSET_SOURCE/<sculpt.out>). Sau đó `pnpm assets:build
// --only <id>` nhập GLB đó qua `import.kind: "external"` (cùng bước chuẩn hóa import_tripo.py).
//   node tools/blender/run-sculpt.mjs <id> [--stage mesh|rig|all]
// `mesh` (giảm lưới + nướng, vài phút) giữ kết quả ở assets/build/sculpt/<id>_low.blend; `rig` chỉ dựng xương + trọng số
// từ file đó, nên chỉnh khớp trong meta.json rồi chạy lại `--stage rig` là đủ.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findAssetSource, findBlender, runBlender } from './find-blender.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const argv = process.argv.slice(2);
const id = argv.find((a) => !a.startsWith('--') && argv[argv.indexOf(a) - 1] !== '--stage');
const stage = argv.includes('--stage') ? argv[argv.indexOf('--stage') + 1] : 'all';
if (!id || !['mesh', 'rig', 'all'].includes(stage)) {
  console.error('Cách dùng: node tools/blender/run-sculpt.mjs <id> [--stage mesh|rig|all]');
  process.exit(1);
}
const sourceDir = path.join(root, 'assets/source');
const metaFile = fs
  .readdirSync(sourceDir)
  .map((type) => path.join(sourceDir, type, id, 'meta.json'))
  .find((f) => fs.existsSync(f));
if (!metaFile) {
  console.error(`[sculpt] không thấy assets/source/<loại>/${id}/meta.json`);
  process.exit(1);
}
const meta = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
if (!meta.sculpt?.source || !meta.sculpt?.out) {
  console.error(`[sculpt] ${id}: meta.json thiếu sculpt.source / sculpt.out`);
  process.exit(1);
}
const src = findAssetSource(root);
const blender = findBlender();
if (!src || !blender) {
  console.error(`[sculpt] thiếu ${!src ? 'thư mục nguồn asset (DTL_ASSET_SOURCE)' : 'Blender'}`);
  process.exit(1);
}
const input = path.join(src, meta.sculpt.source);
if (!fs.existsSync(input)) {
  console.error(`[sculpt] ${id}: thiếu file nguồn ${input}`);
  process.exit(1);
}
const out = path.join(src, meta.sculpt.out);
const work = path.join(root, 'assets/build/sculpt');
fs.mkdirSync(work, { recursive: true });
const status = runBlender(blender, path.join(root, 'tools/blender/sculpt_rig.py'), [
  input,
  out,
  '--meta',
  metaFile,
  '--work',
  work,
  '--stage',
  stage,
]);
process.exit(status);
