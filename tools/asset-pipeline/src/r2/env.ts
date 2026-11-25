// Đọc cấu hình R2. Thứ tự: biến môi trường → .env.local ở gốc worktree → .env.local ở repo chính
// (worktree Orchestrator không có file này). KHÔNG BAO GIỜ in giá trị khóa: chỉ in tên biến thiếu.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../config.js';
import { at } from '@dtl/shared';

export interface R2Env {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
}

/** Thư mục gốc của repo chính (khác ROOT khi đang ở worktree), hoặc null. */
function mainRepoRoot(): string | null {
  try {
    const common = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd: ROOT, encoding: 'utf8' }).trim();
    return path.dirname(common);
  } catch {
    return null;
  }
}

export function parseEnvFile(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const m = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    let v = at(m, 2, 'm').trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[at(m, 1, 'm')] = v;
  }
  return out;
}

let cached: Record<string, string> | null = null;

function fileEnv(): Record<string, string> {
  if (cached) return cached;
  const dirs = [ROOT];
  const main = mainRepoRoot();
  if (main && path.resolve(main) !== path.resolve(ROOT)) dirs.push(main);
  const merged: Record<string, string> = {};
  for (const dir of dirs.reverse()) {
    const f = path.join(dir, '.env.local');
    if (fs.existsSync(f)) Object.assign(merged, parseEnvFile(fs.readFileSync(f, 'utf8')));
  }
  cached = merged;
  return merged;
}

export function envVar(name: string): string | undefined {
  const v = process.env[name] ?? fileEnv()[name];
  return v && v.length ? v : undefined;
}

export function loadR2Env(): R2Env {
  const names = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET'] as const;
  const missing = names.filter((n) => !envVar(n));
  if (missing.length) throw new Error(`Thiếu biến R2: ${missing.join(', ')} (đặt trong .env.local hoặc biến môi trường)`);
  return {
    accountId: envVar('R2_ACCOUNT_ID')!,
    accessKeyId: envVar('R2_ACCESS_KEY_ID')!,
    secretAccessKey: envVar('R2_SECRET_ACCESS_KEY')!,
    bucket: envVar('R2_BUCKET')!,
  };
}

/** URL công khai (CDN) của bucket, không có dấu `/` cuối; null nếu chưa cấu hình. */
export function assetBase(override?: string): string | null {
  const v = override ?? envVar('VITE_ASSET_BASE');
  return v ? v.replace(/\/+$/, '') : null;
}
