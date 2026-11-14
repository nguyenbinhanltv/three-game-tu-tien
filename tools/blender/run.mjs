// Bước 1 của pipeline asset: chạy các script Blender (không mở giao diện) sinh GLB thô
// vào assets/build/raw/<asset_id>.glb. Bước tối ưu nằm ở tools/asset-pipeline (optimize.ts).
// Lệnh tổng: pnpm assets:build (gọi file này rồi optimize). Chạy riêng: node tools/blender/run.mjs [--only <id>] [--force]
// Bỏ qua job khi GLB thô mới hơn script và file nguồn (cache theo mtime).
// Job có `source` đọc file trong DTL_ASSET_SOURCE (mặc định dtl-asset-source cạnh repo gốc, dò qua git common dir
// để chạy được trong worktree); thiếu file nguồn thì bỏ qua job kèm cảnh báo (GLB build đã commit vẫn dùng được).

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findBlender, runBlender } from './find-blender.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const rawDir = path.join(root, 'assets/build/raw');

/**
 * id: asset id (tên file trong assets/build/raw/).
 * legacy: bản chép thêm của GLB thô. Client đã nạp arch_sect qua manifest (M2-8); bản này chỉ còn làm đầu vào
 *         cho test pipeline (tools/asset-pipeline/test), bỏ khi test có fixture riêng.
 * source: đường dẫn tương đối trong DTL_ASSET_SOURCE, truyền cho script qua `--src`.
 */
const jobs = [
  { id: 'arch_sect', script: 'tools/blender/build_sect.py', legacy: 'apps/client/public/assets/sect.glb' },
  // Lưới Tripo v02 (task 70d2072c), tô màu theo vùng bằng script vì texture Tripo mất màu (M0-3).
  { id: 'prop_phi_kiem', script: 'tools/blender/recolor_phi_kiem.py', source: 'prop/prop_phi_kiem/tripo/raw_v02.glb' },
];

function sourceRoot() {
  if (process.env.DTL_ASSET_SOURCE) return path.resolve(process.env.DTL_ASSET_SOURCE);
  const r = spawnSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd: root, encoding: 'utf8' });
  const common = r.status === 0 ? r.stdout.trim() : path.join(root, '.git');
  return path.resolve(path.dirname(common), '..', 'dtl-asset-source');
}
const srcFile = (j) => (j.source ? path.join(sourceRoot(), j.source) : null);

const argv = process.argv.slice(2);
const only = argv.includes('--only') ? argv[argv.indexOf('--only') + 1] : null;
const force = argv.includes('--force');

const selected = jobs.filter((j) => {
  if (only && j.id !== only) return false;
  const src = srcFile(j);
  if (src && !fs.existsSync(src)) {
    console.warn(`[blender] CẢNH BÁO: bỏ qua ${j.id}, không có file nguồn ${src} (đặt DTL_ASSET_SOURCE nếu thư mục nguồn ở chỗ khác).`);
    return false;
  }
  return true;
});
const pending = selected.filter((j) => {
  const out = path.join(rawDir, `${j.id}.glb`);
  if (force || !fs.existsSync(out)) return true;
  const outTime = fs.statSync(out).mtimeMs;
  const src = srcFile(j);
  return outTime < fs.statSync(path.join(root, j.script)).mtimeMs || (src !== null && outTime < fs.statSync(src).mtimeMs);
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
  const src = srcFile(job);
  const status = runBlender(blender, path.join(root, job.script), src ? [out, '--src', src] : [out]);
  if (status !== 0) {
    console.error(`[blender] lỗi khi chạy ${job.script}`);
    process.exit(status);
  }
  if (job.legacy) {
    fs.copyFileSync(out, path.join(root, job.legacy));
    console.log(`[blender] chép thêm → ${job.legacy} (đầu vào test pipeline)`);
  }
}
console.log('[blender] xong.');
