// Kiểm sổ khóa khớp đĩa và khớp R2. Giảm số yêu cầu tới R2/CDN:
//   - có khóa R2 (máy dev): MỘT lượt ListObjectsV2 (1 thao tác mỗi 1000 file) rồi so kích thước, không HEAD từng file;
//   - không có khóa (CI): HEAD qua URL công khai cho file mới/đổi so với sổ khóa của nhánh gốc (main) CỘNG một lát lấy mẫu xoay vòng theo ngày (1/ROTATE_BUCKETS số khóa, hết một vòng sau ROTATE_BUCKETS ngày) để vẫn phát hiện R2 trôi khỏi sổ khóa (CI không chạy trên main); không đọc được sổ gốc, hoặc không có khóa đổi (vd chạy tay trên main) thì HEAD tất cả.

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { ROOT } from '../config.js';
import { urlOf } from '../pull.js';
import { listBucket } from '../push.js';
import { makeClient } from './client.js';
import { loadR2Env } from './env.js';
import { type Lock, pool, readGrace, readLock, scanLock, unhashedBinaries } from './lock.js';

export interface VerifyReport {
  checked: number;
  errors: string[];
  warnings: string[];
}

/** Sổ khóa phải khớp file đang có trên đĩa (thiếu/thừa/lệch) — chạy `pnpm assets:lock` để cập nhật. */
export async function verifyLock(): Promise<string[]> {
  const lock = readLock();
  const disk = await scanLock(lock);
  const errs: string[] = [];
  for (const [k, e] of Object.entries(disk.files)) {
    const l = lock.files[k];
    if (!l) errs.push(`${k}: có trên đĩa nhưng chưa vào sổ khóa`);
    else if (l.sha256 !== e.sha256 || l.bytes !== e.bytes) errs.push(`${k}: nội dung đổi nhưng sổ khóa chưa cập nhật`);
  }
  for (const k of unhashedBinaries(lock, readGrace()))
    errs.push(
      `${k}: nhị phân mới KHÔNG có hash trong tên (cần \`<tên>.<hash10>.<đuôi>\`, hash10 = sha256sum <file> | cut -c1-10); R2 bất biến, không ghi đè khóa đã có`,
    );
  return errs;
}

/** Khóa có trong `lock` mà mới hoặc khác (sha256/kích thước) so với `base` (sổ khóa nhánh gốc). */
export function changedKeys(lock: Lock, base: Lock): string[] {
  return Object.keys(lock.files)
    .filter((k) => {
      const b = base.files[k];
      const e = lock.files[k]!;
      return !b || b.sha256 !== e.sha256 || b.bytes !== e.bytes;
    })
    .sort();
}

export const ROTATE_BUCKETS = 14;

/** Lát lấy mẫu xoay vòng: khóa có bucket(sha256 của khóa) === day mod ROTATE_BUCKETS. Cùng ngày → cùng lát, qua ROTATE_BUCKETS ngày phủ hết. */
export function rotatingSample(lock: Lock, day: number, buckets = ROTATE_BUCKETS): string[] {
  const want = ((day % buckets) + buckets) % buckets;
  return Object.keys(lock.files)
    .filter((k) => parseInt(createHash('sha256').update(k).digest('hex').slice(0, 8), 16) % buckets === want)
    .sort();
}

/** Sổ khóa ở nhánh gốc (mặc định `origin/main`, đổi bằng ASSET_LOCK_BASE_REF); null nếu không đọc được (checkout nông, chưa fetch). */
export function readBaseLock(ref = process.env.ASSET_LOCK_BASE_REF || 'origin/main'): Lock | null {
  try {
    const text = execFileSync('git', ['show', `${ref}:assets/asset-lock.json`], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      maxBuffer: 64 * 1024 * 1024,
    });
    return JSON.parse(text) as Lock;
  } catch {
    return null;
  }
}

/** So sổ khóa với kết quả ListObjectsV2 (hàm thuần): thiếu khóa hoặc lệch kích thước là lỗi. `keys` giới hạn phạm vi so. */
export function compareListing(lock: Lock, listing: Map<string, { size: number }>, keys: string[] = Object.keys(lock.files)): string[] {
  const errs: string[] = [];
  for (const key of keys) {
    const r = listing.get(key);
    const e = lock.files[key]!;
    if (!r) errs.push(`${key}: chưa có trên R2 (chạy pnpm assets:push)`);
    else if (r.size !== e.bytes) errs.push(`${key}: kích thước R2 ${r.size} ≠ sổ khóa ${e.bytes}`);
  }
  return errs;
}

/** Có đủ khóa R2 để dùng S3 API (ListObjectsV2) không? */
export function hasR2Credentials(): boolean {
  try {
    loadR2Env();
    return true;
  } catch {
    return false;
  }
}

/** Kiểm R2 bằng MỘT lượt ListObjectsV2 (1 thao tác mỗi 1000 file) thay vì HEAD từng file. Cần khóa R2 (xem env.ts, không in ra). */
export async function verifyRemoteList(lock: Lock = readLock()): Promise<VerifyReport> {
  const env = loadR2Env();
  const listing = await listBucket(makeClient(env), env.bucket);
  const keys = Object.keys(lock.files);
  return { checked: keys.length, errors: compareListing(lock, listing, keys), warnings: [] };
}

export async function verifyRemote(base: string, lock: Lock = readLock(), only?: string[]): Promise<VerifyReport> {
  const keys = only ?? Object.keys(lock.files);
  const rep: VerifyReport = { checked: keys.length, errors: [], warnings: [] };
  if (only)
    rep.warnings.push(
      `chỉ kiểm ${keys.length}/${Object.keys(lock.files).length} khóa (mới/đổi so với sổ khóa nhánh gốc + lát lấy mẫu theo ngày)`,
    );
  let network = 0;
  await pool(keys, 16, async (key) => {
    try {
      const res = await fetch(urlOf(base, key), { method: 'HEAD' });
      if (res.status === 404) rep.errors.push(`${key}: chưa có trên R2 (chạy pnpm assets:push)`);
      else if (!res.ok) rep.errors.push(`${key}: HTTP ${res.status}`);
      else {
        const len = Number(res.headers.get('content-length'));
        // CDN có thể nén/bỏ content-length: chỉ báo lỗi khi có số và lệch.
        if (Number.isFinite(len) && len > 0 && len !== lock.files[key].bytes)
          rep.errors.push(`${key}: kích thước R2 ${len} ≠ sổ khóa ${lock.files[key].bytes}`);
      }
    } catch {
      network++;
    }
  });
  if (network > 0) rep.warnings.push(`${network}/${keys.length} yêu cầu HEAD lỗi mạng — không kiểm được R2`);
  return rep;
}
