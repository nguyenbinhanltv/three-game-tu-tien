/**
 * Thiên Nhãn P4-1: chỉnh hình VFX cho camera chéo (`?cam=iso`, nhìn xuống 52°). Hàm thuần để test.
 *
 * Hình đứng cao (gai, cột đá, lồng, khối ấn) dựng trên người/mục tiêu sẽ che chính người đó khi nhìn từ trên xuống, nên nén chiều cao:
 * tới `ISO_UPRIGHT_SOFT` m giữ nguyên, phần vượt chỉ còn `ISO_UPRIGHT_KEEP` và không quá `ISO_UPRIGHT_MAX`. Hình nằm đất (vòng, vết chém, sóng,
 * decal) và pháp tướng cỡ lớn (rồng, tượng) không đổi: ưu tiên hình trên mặt đất.
 */
export const ISO_UPRIGHT_SHAPES: ReadonlySet<string> = new Set(['spike', 'rock_spire', 'bell_cage', 'diamond_cage', 'seal_block']);
export const ISO_UPRIGHT_SOFT = 1.8;
export const ISO_UPRIGHT_KEEP = 0.3;
export const ISO_UPRIGHT_MAX = 3.2;

/** Chiều cao (m) cho phép của hình `shape` khi muốn cao `h`; hình không thuộc nhóm đứng cao thì giữ `h`. */
export function isoFxHeight(shape: string, h: number): number {
  if (!ISO_UPRIGHT_SHAPES.has(shape) || h <= ISO_UPRIGHT_SOFT) return h;
  return Math.min(ISO_UPRIGHT_MAX, ISO_UPRIGHT_SOFT + (h - ISO_UPRIGHT_SOFT) * ISO_UPRIGHT_KEEP);
}
