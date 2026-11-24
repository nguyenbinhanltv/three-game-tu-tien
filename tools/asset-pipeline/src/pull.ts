// Tải file thiếu về apps/client/public/ (gitignore, git chỉ giữ sổ khóa) theo sổ khóa, có kiểm sha256. Không cần khóa R2:
// đọc qua URL công khai VITE_ASSET_BASE (CDN), KHÔNG BAO GIỜ qua S3 API. File đã có đủ (cùng kích thước) ở public/ hoặc .asset-cache/ thì bỏ qua.
// Kho chung tùy chọn (DTL_ASSET_STORE, xem r2/store.ts): file đã có trong kho thì hardlink/chép vào public/ mà không tải lại; file tải mới được lưu vào kho.
//   pnpm assets:pull [--base <url>] [--verify] [--only <tiền tố>]

import fs from 'node:fs';
import path from 'node:path';
import { assetBase } from './r2/env.js';
import { CACHE_DIR, type Lock, PUBLIC_DIR, pool, readLock, sha256File } from './r2/lock.js';
import { placeFromStore, putInStore, storeDir, verifyInStore } from './r2/store.js';

export interface PullOptions {
  base?: string;
  /** Tính lại sha256 cả file đã có (mặc định chỉ so kích thước). */
  verify?: boolean;
  only?: string;
  /** Kho chung theo hash (mặc định theo DTL_ASSET_STORE; null = tắt). */
  store?: string | null;
  /** Thay `fetch` (test). */
  fetchFn?: typeof fetch;
  /** Test: sổ khóa và thư mục thay thế. */
  lock?: Lock;
  publicDir?: string;
  cacheDir?: string;
}

export interface PullReport {
  total: number;
  have: number;
  downloaded: number;
  downloadedBytes: number;
  /** Lấy từ kho chung (không tải): số file và số byte; `linked` = hardlink, còn lại là chép. */
  fromStore: number;
  fromStoreBytes: number;
  linked: number;
  failed: { key: string; error: string }[];
}

export function urlOf(base: string, key: string): string {
  return `${base}/${key.split('/').map(encodeURIComponent).join('/')}`;
}

export async function pull(opts: PullOptions = {}): Promise<PullReport> {
  const base = assetBase(opts.base);
  if (!base) throw new Error('Thiếu VITE_ASSET_BASE (hoặc --base <url>) để biết tải asset từ đâu');
  const fetchFn = opts.fetchFn ?? fetch;
  const store = opts.store === undefined ? storeDir() : opts.store;
  const lock = opts.lock ?? readLock();
  const publicDir = opts.publicDir ?? PUBLIC_DIR;
  const cacheDir = opts.cacheDir ?? CACHE_DIR;
  const keys = Object.keys(lock.files).filter((k) => !opts.only || k.startsWith(opts.only));
  const report: PullReport = {
    total: keys.length,
    have: 0,
    downloaded: 0,
    downloadedBytes: 0,
    fromStore: 0,
    fromStoreBytes: 0,
    linked: 0,
    failed: [],
  };
  const todo: string[] = [];
  await pool(keys, 8, async (key) => {
    const e = lock.files[key];
    for (const dir of [publicDir, cacheDir]) {
      const f = path.join(dir, key);
      // File hardlink với kho (nlink>1) luôn băm lại: ghi đè tại chỗ sẽ làm hỏng cả bản trong kho.
      const linked = fs.existsSync(f) && fs.statSync(f).nlink > 1;
      if (fs.existsSync(f) && fs.statSync(f).size === e.bytes && (!(opts.verify || linked) || (await sha256File(f)) === e.sha256)) {
        report.have++;
        return;
      }
    }
    todo.push(key);
  });

  let done = 0;
  await pool(todo, 6, async (key) => {
    const e = lock.files[key];
    const dest = path.join(publicDir, key);
    const tmp = `${dest}.part`;
    try {
      if (store && (await verifyInStore(store, e.sha256, e.bytes))) {
        if (placeFromStore(store, e.sha256, dest) === 'link') report.linked++;
        report.fromStore++;
        report.fromStoreBytes += e.bytes;
        done++;
        if (done % 25 === 0 || done === todo.length) console.log(`[pull] ${done}/${todo.length}`);
        return;
      }
      const res = await fetchFn(urlOf(base, key));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      const { createHash } = await import('node:crypto');
      const sha = createHash('sha256').update(buf).digest('hex');
      if (buf.length !== e.bytes || sha !== e.sha256) throw new Error('sai hash/kích thước so với sổ khóa');
      if (store) {
        putInStore(store, e.sha256, buf);
        placeFromStore(store, e.sha256, dest);
      } else {
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.writeFileSync(tmp, buf);
        fs.renameSync(tmp, dest);
      }
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
