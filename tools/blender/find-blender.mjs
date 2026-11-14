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

/**
 * Thư mục nguồn asset lớn (GLB Tripo, concept): biến DTL_ASSET_SOURCE, rồi `<repo>/../dtl-asset-source`,
 * rồi cạnh checkout chính khi đang ở git worktree (thư mục cha của --git-common-dir). Không thấy thì null.
 * @param {string} root gốc repo (hoặc worktree)
 * @returns {string | null}
 */
export function findAssetSource(root) {
  const candidates = [];
  if (process.env.DTL_ASSET_SOURCE) candidates.push(path.resolve(root, process.env.DTL_ASSET_SOURCE));
  candidates.push(path.resolve(root, '..', 'dtl-asset-source'));
  const git = spawnSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd: root, encoding: 'utf8' });
  if (git.status === 0 && git.stdout.trim()) candidates.push(path.resolve(git.stdout.trim(), '..', '..', 'dtl-asset-source'));
  return candidates.find((d) => fs.existsSync(d) && fs.statSync(d).isDirectory()) ?? null;
}
