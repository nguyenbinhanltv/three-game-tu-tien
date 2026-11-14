// Dò đường dẫn Blender: biến BLENDER, PATH, rồi thư mục cài mặc định trên Windows.
// Dùng chung cho run.mjs và test của tools/asset-pipeline.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

/** @returns {string | null} */
export function findBlender() {
  if (process.env.BLENDER && fs.existsSync(process.env.BLENDER)) return process.env.BLENDER;
  const probe = spawnSync('blender', ['--version'], { encoding: 'utf8' });
  if (probe.status === 0) return 'blender';
  const base = 'C:/Program Files/Blender Foundation';
  if (fs.existsSync(base)) {
    const versions = fs.readdirSync(base).filter((d) => fs.existsSync(path.join(base, d, 'blender.exe'))).sort().reverse();
    if (versions.length) return path.join(base, versions[0], 'blender.exe');
  }
  return null;
}

/**
 * Chạy một script bpy ở chế độ nền. Trả về mã thoát.
 * @param {string} blender
 * @param {string} script
 * @param {string[]} args
 * @param {{ quiet?: boolean }} [opts]
 */
export function runBlender(blender, script, args, opts = {}) {
  const r = spawnSync(blender, ['--background', '--factory-startup', '--python', script, '--', ...args], {
    stdio: opts.quiet ? 'pipe' : 'inherit',
    encoding: 'utf8',
  });
  if (r.status !== 0 && opts.quiet) process.stderr.write(`${r.stdout ?? ''}\n${r.stderr ?? ''}`);
  return r.status ?? 1;
}
