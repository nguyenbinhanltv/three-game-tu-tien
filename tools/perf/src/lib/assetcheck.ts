// Kiểm "đủ asset" trước khi đo hiệu năng: nhị phân asset nằm trên R2 và chỉ có ở máy sau `pnpm assets:pull`. Worktree thiếu asset vẫn chạy
// game (thiếu kiến trúc/prop/cây) nên số đo thấp một cách IM LẶNG (baseline 25/11 ghi Vân Lam 354k tam giác/94 MB thay vì ~821k/465 MB thật).
import fs from 'node:fs';
import path from 'node:path';

/** Tiền tố thư mục trong sổ khóa mà cảnh game cần để vẽ (bỏ âm thanh, tranh UI, hoa-truc…). */
export const SCENE_ASSET_PREFIXES = ['assets/', 'terrain', 'sky', 'grass'];

export interface AssetCheck {
  total: number;
  missing: string[];
}

/** So tệp trong sổ khóa (`{ files: { <khóa>: … } }`) với thư mục `publicDir`; chỉ xét khóa thuộc `prefixes`. Hàm thuần theo `exists`. */
export function checkAssets(
  lockFiles: Record<string, unknown>,
  publicDir: string,
  exists: (file: string) => boolean = fs.existsSync,
  prefixes: readonly string[] = SCENE_ASSET_PREFIXES,
): AssetCheck {
  const keys = Object.keys(lockFiles).filter((k) => prefixes.some((p) => k.startsWith(p)));
  const missing = keys.filter((k) => !exists(path.join(publicDir, k)));
  return { total: keys.length, missing };
}

export function readLockFiles(lockPath: string): Record<string, unknown> {
  return (JSON.parse(fs.readFileSync(lockPath, 'utf8')) as { files: Record<string, unknown> }).files;
}
