// Chạy các script Blender sinh asset (không mở giao diện).
// Dùng: pnpm assets:build
// Tìm blender trong PATH, biến môi trường BLENDER, hoặc thư mục cài đặt mặc định trên Windows.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function findBlender() {
  if (process.env.BLENDER && fs.existsSync(process.env.BLENDER)) return process.env.BLENDER;
  const probe = spawnSync('blender', ['--version'], { encoding: 'utf8', shell: process.platform === 'win32' });
  if (probe.status === 0) return 'blender';
  const base = 'C:\\Program Files\\Blender Foundation';
  if (fs.existsSync(base)) {
    const versions = fs.readdirSync(base).filter((d) => fs.existsSync(path.join(base, d, 'blender.exe'))).sort().reverse();
    if (versions.length) return path.join(base, versions[0], 'blender.exe');
  }
  return null;
}

const blender = findBlender();
if (!blender) {
  console.error('Không tìm thấy Blender. Cài Blender 4.x trở lên, thêm vào PATH hoặc đặt biến BLENDER=đường_dẫn_tới_blender.');
  process.exit(1);
}

const jobs = [{ script: 'tools/blender/build_sect.py', out: 'apps/client/public/assets/sect.glb' }];

fs.mkdirSync(path.join(root, 'apps/client/public/assets'), { recursive: true });
for (const job of jobs) {
  console.log(`> ${job.script} → ${job.out}`);
  const r = spawnSync(blender, ['--background', '--python', path.join(root, job.script), '--', path.join(root, job.out)], { stdio: 'inherit' });
  if (r.status !== 0) {
    console.error(`Lỗi khi chạy ${job.script}`);
    process.exit(r.status ?? 1);
  }
}
console.log('Xong.');
