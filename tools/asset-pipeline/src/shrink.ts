// Hạ texture của GLB đã build về ngân sách `assets/budgets.json` mà không cần dựng lại từ Blender (L2).
//   tsx src/shrink.ts [--dry]
// Với mỗi asset trong manifest: texture lớn hơn `textureLimit(lớp, slot)` được thu nhỏ bằng sharp (giữ PNG/JPEG),
// ghi lại GLB (meshopt như optimize.ts), đổi tên theo hash, cập nhật manifest, xóa file cũ.
// `assets:build` dựng lại từ raw cho kết quả cùng cỡ vì import_tripo.py đọc cùng ngân sách.

import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { EXTMeshoptCompression } from '@gltf-transform/extensions';
import { DEFAULTS, createIO, loadBudgets, textureLimit } from './config.js';
import { listTextures } from './stats.js';
import { hashName, type ManifestEntry } from './optimize.js';

const dry = process.argv.includes('--dry');
const outDir = DEFAULTS.outDir;
const manifestFile = path.join(outDir, 'manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8')) as { assets: Record<string, ManifestEntry> };
const budgets = loadBudgets();
const io = await createIO();
let saved = 0;
let changed = 0;

for (const entry of Object.values(manifest.assets)) {
  const spec = budgets.classes[entry.class];
  if (!spec || !entry.textures?.length) continue;
  const file = path.join(outDir, entry.file);
  const doc = await io.read(file);
  const before = listTextures(doc);
  let touched = false;
  for (const tex of doc.getRoot().listTextures()) {
    const info = before.find((t) => t.name === (tex.getName() || tex.getURI()));
    const slots = info?.slots ?? [];
    const limit = textureLimit(spec, slots);
    const img = tex.getImage();
    // KTX2 đã được toktx hạ cạnh về ngân sách lúc build (ktx.ts), và sharp không đọc được: bỏ qua.
    if (!img || limit <= 0 || tex.getMimeType() === 'image/ktx2') continue;
    const meta = await sharp(img).metadata();
    const side = Math.max(meta.width ?? 0, meta.height ?? 0);
    if (side <= limit) continue;
    const mime = tex.getMimeType();
    const resized = sharp(img).resize({ width: limit, height: limit, fit: 'inside', kernel: 'lanczos3' });
    const data =
      mime === 'image/png'
        ? await resized.png({ compressionLevel: 9 }).toBuffer()
        : await resized.jpeg({ quality: 90, mozjpeg: true }).toBuffer();
    tex.setImage(new Uint8Array(data));
    saved += (side * side - limit * limit) * 4 * 1.333;
    touched = true;
  }
  if (!touched) continue;
  changed++;
  console.log(
    `[shrink] ${entry.id}: ${entry.textures.map((t) => `${t.width}`).join('/')} → ${listTextures(doc)
      .map((t) => t.width)
      .join('/')}`,
  );
  if (dry) continue;
  if (
    !doc
      .getRoot()
      .listExtensionsUsed()
      .some((e) => e.extensionName === 'EXT_meshopt_compression')
  )
    doc
      .createExtension(EXTMeshoptCompression)
      .setRequired(true)
      .setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
  const bytes = await io.writeBinary(doc);
  const name = hashName(entry.id, bytes);
  fs.writeFileSync(path.join(outDir, name), bytes);
  if (name !== entry.file) fs.unlinkSync(file);
  entry.file = name;
  entry.bytes = bytes.byteLength;
  entry.textures = listTextures(await io.readBinary(bytes));
}
if (!dry) fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2) + '\n');
console.log(`[shrink] ${changed} asset, giảm ~${(saved / 1048576).toFixed(0)} MB texture GPU${dry ? ' (chạy thử, chưa ghi)' : ''}`);
