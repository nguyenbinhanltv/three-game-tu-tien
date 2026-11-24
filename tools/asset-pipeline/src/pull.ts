// Tải file thiếu về apps/client/public/ (gitignore, git chỉ giữ sổ khóa) theo sổ khóa, có kiểm sha256. Không cần khóa R2:
// đọc qua URL công khai VITE_ASSET_BASE (CDN). File đã có đủ (cùng kích thước) ở public/ hoặc .asset-cache/ thì bỏ qua.
//   pnpm assets:pull [--base <url>] [--verify] [--only <tiền tố>]

import fs from 'node:fs';
import path from 'node:path';
import { assetBase } from './r2/env.js';
import { CACHE_DIR, PUBLIC_DIR, pool, readLock, sha256File } from './r2/lock.js';

export interface PullOptions {
  base?: string;
  /** Tính lại sha256 cả file đã có (mặc định chỉ so kích thước). */
  verify?: boolean;
  only?: string;
}

export interface PullReport {
  total: number;
  have: number;
  downloaded: number;
  downloadedBytes: number;
  failed: { key: string; error: string }[];
}

export function urlOf(base: string, key: string): string {
  return `${base}/${key.split('/').map(encodeURIComponent).join('/')}`;
}

export async function pull(opts: PullOptions = {}): Promise<PullReport> {
  const base = assetBase(opts.base);
  if (!base) throw new Error('Thiếu VITE_ASSET_BASE (hoặc --base <url>) để biết tải asset từ đâu');
  const lock = readLock();
  const keys = Object.keys(lock.files).filter((k) => !opts.only || k.startsWith(opts.only));
  const report: PullReport = { total: keys.length, have: 0, downloaded: 0, downloadedBytes: 0, failed: [] };
  const todo: string[] = [];
  await pool(keys, 8, async (key) => {
    const e = lock.files[key];
    for (const dir of [PUBLIC_DIR, CACHE_DIR]) {
      const f = path.join(dir, key);
      if (fs.existsSync(f) && fs.statSync(f).size === e.bytes && (!opts.verify || (await sha256File(f)) === e.sha256)) {
        report.have++;
        return;
      }
    }
    todo.push(key);
  });

  let done = 0;
  await pool(todo, 6, async (key) => {
    const e = lock.files[key];
    const dest = path.join(PUBLIC_DIR, key);
    const tmp = `${dest}.part`;
    try {
      const res = await fetch(urlOf(base, key));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      const { createHash } = await import('node:crypto');
      const sha = createHash('sha256').update(buf).digest('hex');
      if (buf.length !== e.bytes || sha !== e.sha256) throw new Error('sai hash/kích thước so với sổ khóa');
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(tmp, buf);
      fs.renameSync(tmp, dest);
      report.downloaded++;
      report.downloadedBytes += buf.length;
    } catch (err) {
      fs.rmSync(tmp, { force: true });
      report.failed.push({ key, error: err instanceof Error ? err.message : String(err) });
    }
    done++;
    if (done % 25 === 0 || done === todo.length) console.log(`[pull] ${done}/${todo.length}`);
  });
  return report;
}
