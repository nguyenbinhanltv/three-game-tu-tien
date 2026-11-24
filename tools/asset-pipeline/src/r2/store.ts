// Kho asset chung theo hash nội dung (tùy chọn, mặc định TẮT): các worktree/máy dev dùng chung một thư mục để KHÔNG tải lại cùng một file từ CDN.
//   DTL_ASSET_STORE=D:/dtl-asset-store   (biến môi trường hoặc .env.local; không đặt = tắt, CI không đặt)
// Bố cục: <kho>/<2 ký tự đầu sha256>/<sha256 đầy đủ>. File vào `apps/client/public` bằng hardlink (cùng ổ đĩa) hoặc chép (khác ổ đĩa, vd worktree ở C:, kho ở D:).
// File trong kho để CHỈ ĐỌC (hardlink dùng chung một inode: ghi đè tại chỗ sẽ làm hỏng kho). Công cụ ghi file phải xóa rồi tạo mới, không ghi tại chỗ.
// `assets:pull` luôn tải qua URL công khai (CDN, `VITE_ASSET_BASE`), không bao giờ qua S3 API.

import fs from 'node:fs';
import path from 'node:path';
import { envVar } from './env.js';

/** Thư mục kho từ DTL_ASSET_STORE, hoặc null nếu tắt. */
export function storeDir(): string | null {
  const v = envVar('DTL_ASSET_STORE');
  return v ? path.resolve(v) : null;
}

export function storeFile(store: string, sha256: string): string {
  return path.join(store, sha256.slice(0, 2), sha256);
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
