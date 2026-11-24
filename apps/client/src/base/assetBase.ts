/**
 * Gốc URL của asset tĩnh (GLB, texture, âm thanh, manifest…). Nơi duy nhất đọc `VITE_ASSET_BASE`.
 *
 * - Có `VITE_ASSET_BASE` (ví dụ https://assets.vantienlo.alandev.io.vn): asset đi thẳng từ CDN/R2.
 *   Cần CORS ở bucket; ảnh vẽ vào canvas/texture phải đặt `crossOrigin = 'anonymous'` (xem `ASSET_CROSS_ORIGIN`).
 * - Không có: cùng origin theo `base` của Vite. Ở dev, middleware (`vite.config.ts`) phục vụ `.asset-cache/`
 *   (do `pnpm assets:pull`) trước rồi tới `public/`.
 * Mọi nơi dựng URL asset phải đi qua đây, không viết `import.meta.env.BASE_URL` (có test chặn).
 */

const raw = (import.meta.env?.VITE_ASSET_BASE as string | undefined)?.trim();

/** Luôn kết thúc bằng `/`. */
export const ASSET_BASE: string = raw ? `${raw.replace(/\/+$/, '')}/` : ((import.meta.env?.BASE_URL as string | undefined) ?? '/');

/** Asset nằm khác origin (CDN/R2). */
export const ASSET_REMOTE: boolean = /^https?:\/\//i.test(ASSET_BASE);

/** Giá trị cho `HTMLImageElement.crossOrigin` khi ảnh được vẽ vào canvas/GPU. */
export const ASSET_CROSS_ORIGIN: 'anonymous' | undefined = ASSET_REMOTE ? 'anonymous' : undefined;

/** URL đầy đủ của một đường dẫn tương đối so với `public/` (ví dụ `assets/arch_sect.<hash>.glb`). */
export function assetUrl(rel: string): string {
  return ASSET_BASE + rel.replace(/^\/+/, '');
}
