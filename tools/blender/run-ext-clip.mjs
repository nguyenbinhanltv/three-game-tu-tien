// Chuẩn hóa một clip ngoài (Cascadeur...) thành GLB chỉ-clip cho game: bọc tools/blender/ext_clip.py.
//   node tools/blender/run-ext-clip.mjs --in <file.fbx|glb> --name ext_<id chiêu> [--out <ra.glb>] [--trim a:b] [--keep-root-motion] [--fps 30]
// Mặc định ghi vào ../dtl-asset-source/anim/ext/<name>.glb. Hướng dẫn: docs/vfx-v1/huong-dan-clip-ngoai.md
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findAssetSource, findBlender, runBlender } from './find-blender.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
const opt = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);
const input = opt('--in');
const name = opt('--name');
if (!input || !name || !/^ext_[a-z0-9_]+$/.test(name)) {
  console.error('Dùng: node tools/blender/run-ext-clip.mjs --in <file.fbx|glb> --name ext_<id chiêu> [--out ra.glb] [--trim a:b] [--keep-root-motion]');
  process.exit(2);
}
const blender = findBlender();
if (!blender) {
  console.error('Không tìm thấy Blender (đặt BLENDER= hoặc cài Blender 4.2+).');
  process.exit(1);
}
const src = findAssetSource(root);
const out = opt('--out') ?? path.join(src ?? path.join(root, '..', 'dtl-asset-source'), 'anim', 'ext', `${name}.glb`);
fs.mkdirSync(path.dirname(out), { recursive: true });
const pass = ['--in', path.resolve(input), '--out', path.resolve(out), '--name', name];
for (const k of ['--trim', '--fps']) if (opt(k)) pass.push(k, opt(k));
if (args.includes('--keep-root-motion')) pass.push('--keep-root-motion');
process.exit(runBlender(blender, path.join(root, 'tools/blender/ext_clip.py'), pass));
