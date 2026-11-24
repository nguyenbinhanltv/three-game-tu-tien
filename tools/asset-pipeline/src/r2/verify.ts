// Kiểm sổ khóa khớp đĩa và khớp R2 (HEAD qua URL công khai, không cần khóa).

import { urlOf } from '../pull.js';
import { type Lock, pool, readLock, scanLock } from './lock.js';

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
  return errs;
}

export async function verifyRemote(base: string, lock: Lock = readLock()): Promise<VerifyReport> {
  const keys = Object.keys(lock.files);
  const rep: VerifyReport = { checked: keys.length, errors: [], warnings: [] };
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
