// Kho asset chung theo hash nội dung (tùy chọn, mặc định TẮT): các worktree/máy dev dùng chung một thư mục để KHÔNG tải lại cùng một file từ CDN.
//   Mặc định BẬT ở ~/.dtl-asset-store khi không chạy CI; đổi chỗ bằng DTL_ASSET_STORE=<thư mục> (biến môi trường hoặc .env.local); tắt bằng DTL_ASSET_STORE=off; CI (biến CI) luôn tắt trừ khi đặt tường minh.
// Bố cục: <kho>/<2 ký tự đầu sha256>/<sha256 đầy đủ>. File vào `apps/client/public` bằng hardlink (cùng ổ đĩa) hoặc chép (khác ổ đĩa, vd worktree ở C:, kho ở D:).
// File trong kho để CHỈ ĐỌC (hardlink dùng chung một inode: ghi đè tại chỗ sẽ làm hỏng kho). Công cụ ghi file phải xóa rồi tạo mới, không ghi tại chỗ.
// `assets:pull` luôn tải qua URL công khai (CDN, `VITE_ASSET_BASE`), không bao giờ qua S3 API.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { envVar } from './env.js';
import { sha256File } from './lock.js';

/** Mặc định: `~/.dtl-asset-store` (cùng ổ với repo trên máy dev thường → hardlink được). */
export const DEFAULT_STORE = path.join(os.homedir(), '.dtl-asset-store');

/**
 * Thư mục kho. Thứ tự: DTL_ASSET_STORE (`off`/`0`/`false`/`none` = tắt) → đang chạy CI (`CI` có giá trị) thì tắt → mặc định BẬT ở `~/.dtl-asset-store`.
 */
export function storeDir(): string | null {
  const v = envVar('DTL_ASSET_STORE');
  if (v) return /^(off|0|false|none)$/i.test(v) ? null : path.resolve(v);
  if (process.env.CI) return null;
  return DEFAULT_STORE;
}

/** Kho có file này VÀ nội dung đúng sha256 (băm lại)? Nếu hỏng thì xóa khỏi kho để tải lại. */
export async function verifyInStore(store: string, sha256: string, bytes: number): Promise<boolean> {
  if (!hasInStore(store, sha256, bytes)) return false;
  const f = storeFile(store, sha256);
  if ((await sha256File(f)) === sha256) return true;
  fs.rmSync(f, { force: true });
  return false;
}

export function storeFile(store: string, sha256: string): string {
  // Chặn path traversal: sha256 đến từ sổ khóa, chỉ nhận đúng 64 ký tự hex thường trước khi đụng tới hệ thống file (kể cả xóa).
  if (!/^[0-9a-f]{64}$/.test(sha256)) throw new Error('sha256 không hợp lệ trong sổ khóa');
  const root = path.resolve(store);
  const f = path.resolve(root, sha256.slice(0, 2), sha256);
  if (!f.startsWith(root + path.sep)) throw new Error('đường dẫn kho nằm ngoài thư mục kho');
  return f;
}

/** Kho có file này (đúng kích thước)? */
export function hasInStore(store: string, sha256: string, bytes: number): boolean {
  const f = storeFile(store, sha256);
  return fs.existsSync(f) && fs.statSync(f).size === bytes;
}

/** Ghi nội dung vào kho (tạm + đổi tên, để chỉ đọc). Không ghi lại nếu đã có. */
export function putInStore(store: string, sha256: string, data: Buffer): void {
  const f = storeFile(store, sha256);
  if (fs.existsSync(f) && fs.statSync(f).size === data.length) return;
  fs.mkdirSync(path.dirname(f), { recursive: true });
  const tmp = `${f}.${process.pid}.part`;
  fs.writeFileSync(tmp, data);
  fs.chmodSync(tmp, 0o444);
  fs.renameSync(tmp, f);
}

/**
 * Đặt file từ kho vào `dest`: hardlink nếu cùng ổ đĩa, không được thì chép. Xóa `dest` cũ trước (không ghi đè tại chỗ để khỏi làm hỏng inode dùng chung).
 * Trả `link` hoặc `copy`.
 */
export function placeFromStore(store: string, sha256: string, dest: string): 'link' | 'copy' {
  const src = storeFile(store, sha256);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.rmSync(dest, { force: true });
  try {
    fs.linkSync(src, dest);
    return 'link';
  } catch {
    fs.copyFileSync(src, dest);
    return 'copy';
  }
}
