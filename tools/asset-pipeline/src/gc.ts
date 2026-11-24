// Dọn rác trên R2: chỉ xóa file KHÔNG được sổ khóa nào trong N ngày gần nhất tham chiếu VÀ đã cũ hơn N ngày.
// Mặc định chạy thử (dry-run); xóa thật cần --apply. Nhờ vậy checkout commit gần đây vẫn tải được asset.
//   pnpm assets:gc [--days 90] [--apply]

import { execFileSync } from 'node:child_process';
import { DeleteObjectsCommand } from '@aws-sdk/client-s3';
import { ROOT } from './config.js';
import { makeClient } from './r2/client.js';
import { loadR2Env } from './r2/env.js';
import { LOCK_FILE, type Lock, readLock } from './r2/lock.js';
import { listBucket } from './push.js';

export const MIN_DAYS = 7;

export interface GcOptions {
  days?: number;
  apply?: boolean;
}

export interface GcReport {
  total: number;
  referenced: number;
  garbage: { key: string; size: number }[];
  deleted: number;
}

/** Mọi khóa được tham chiếu bởi sổ khóa ở HEAD và ở các commit sửa sổ trong `days` ngày qua. */
export function referencedKeys(days: number): Set<string> {
  if (!Number.isInteger(days) || days < MIN_DAYS) throw new Error(`days phải là số nguyên >= ${MIN_DAYS}`);
  const keys = new Set(Object.keys(readLock().files));
  const rel = LOCK_FILE.slice(ROOT.length + 1)
    .split('\\')
    .join('/');
  let shas: string[] = [];
  try {
    shas = execFileSync('git', ['log', `--since=${days}.days`, '--format=%H', '--', rel], { cwd: ROOT, encoding: 'utf8' })
      .split('\n')
      .filter(Boolean);
  } catch {
    throw new Error('Không đọc được lịch sử git: từ chối dọn để tránh xóa nhầm');
  }
  for (const sha of shas) {
    try {
      const lock = JSON.parse(execFileSync('git', ['show', `${sha}:${rel}`], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20 })) as Lock;
      for (const k of Object.keys(lock.files)) keys.add(k);
    } catch {
      /* commit chưa có sổ khóa */
    }
  }
  return keys;
}

export async function gc(opts: GcOptions = {}): Promise<GcReport> {
  const days = opts.days ?? 90;
  // Giá trị lạ (NaN, âm, quá nhỏ) làm mọi object chưa vào sổ khóa thành "rác": từ chối ngay cả khi gọi trực tiếp.
  if (!Number.isInteger(days) || days < MIN_DAYS) throw new Error(`--days phải là số nguyên >= ${MIN_DAYS} (nhận ${String(opts.days)})`);
  const env = loadR2Env();
  const s3 = makeClient(env);
  const refs = referencedKeys(days);
  const remote = await listBucket(s3, env.bucket);
  const cutoff = Date.now() - days * 86_400_000;
  const garbage: { key: string; size: number }[] = [];
  for (const [key, o] of remote) {
    if (refs.has(key)) continue;
    if (o.modified && o.modified.getTime() > cutoff) continue;
    garbage.push({ key, size: o.size });
  }
  let deleted = 0;
  if (opts.apply) {
    for (let i = 0; i < garbage.length; i += 500) {
      const chunk = garbage.slice(i, i + 500);
      await s3.send(new DeleteObjectsCommand({ Bucket: env.bucket, Delete: { Objects: chunk.map((g) => ({ Key: g.key })) } }));
      deleted += chunk.length;
    }
  }
  return { total: remote.size, referenced: refs.size, garbage, deleted };
}
