// Bước 1 của pipeline asset: chạy các script Blender (không mở giao diện) sinh GLB thô
// vào assets/build/raw/<asset_id>.glb. Bước tối ưu nằm ở tools/asset-pipeline (optimize.ts).
// Lệnh tổng: pnpm assets:build (gọi file này rồi optimize). Chạy riêng: node tools/blender/run.mjs [--only <id>] [--force]
// Bỏ qua job khi GLB thô mới hơn script (cache theo mtime).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findBlender, runBlender } from './find-blender.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const rawDir = path.join(root, 'assets/build/raw');

/**
 * id: asset id (tên file trong assets/build/raw/).
 * legacy: bản chép thêm cho client hiện tại (engine.ts nạp assets/sect.glb) cho tới khi client đọc manifest (M2-8/M2-9).
 */
const jobs = [{ id: 'arch_sect', script: 'tools/blender/build_sect.py', legacy: 'apps/client/public/assets/sect.glb' }];

const argv = process.argv.slice(2);
const only = argv.includes('--only') ? argv[argv.indexOf('--only') + 1] : null;
const force = argv.includes('--force');

const selected = jobs.filter((j) => !only || j.id === only);
const pending = selected.filter((j) => {
  const out = path.join(rawDir, `${j.id}.glb`);
  if (force || !fs.existsSync(out)) return true;
  return fs.statSync(out).mtimeMs < fs.statSync(path.join(root, j.script)).mtimeMs;
});

if (pending.length === 0) {
  console.log(`[blender] ${selected.length} job, không có gì đổi (cache theo mtime).`);
  process.exit(0);
}

const blender = findBlender();
if (!blender) {
  console.warn(
    '[blender] CẢNH BÁO: không tìm thấy Blender, bỏ qua bước sinh GLB thô. Cài Blender 4.x trở lên, thêm vào PATH hoặc đặt BLENDER=đường_dẫn.',
  );
  process.exit(0);
}

fs.mkdirSync(rawDir, { recursive: true });
for (const job of pending) {
  const out = path.join(rawDir, `${job.id}.glb`);
  console.log(`[blender] ${job.script} → ${path.relative(root, out)}`);
  const status = runBlender(blender, path.join(root, job.script), [out]);
  if (status !== 0) {
    console.error(`[blender] lỗi khi chạy ${job.script}`);
    process.exit(status);
  }
  if (job.legacy) {
    fs.copyFileSync(out, path.join(root, job.legacy));
    console.log(`[blender] chép thêm → ${job.legacy} (đường nạp cũ của client)`);
  }
}
console.log('[blender] xong.');
