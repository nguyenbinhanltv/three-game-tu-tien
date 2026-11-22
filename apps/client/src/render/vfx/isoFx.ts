/**
 * Thiên Nhãn P4-1: chỉnh hình VFX cho camera chéo (`?cam=iso`, nhìn xuống 52°). Hàm thuần để test.
 *
 * Hình đứng cao (cột đá, lồng, khối ấn) dựng trên người/mục tiêu sẽ che chính người đó khi nhìn từ trên xuống, nên nén chiều cao THẬT (mét):
 * tới `ISO_UPRIGHT_SOFT` m giữ nguyên, phần vượt chỉ còn `ISO_UPRIGHT_KEEP` và không quá `ISO_UPRIGHT_MAX`. Hình nằm đất (vòng, vết chém,
 * sóng, decal), pháp tướng cỡ lớn (rồng, tượng) và gai `spike` (trục dài là +Z, dựng bằng `rot`, hướng tùy từng hiệu ứng) không đổi.
 * Chiều ngang giữ nguyên nên hình thấp đi nhưng không dẹt thành vệt.
 */
export const ISO_UPRIGHT_SHAPES: ReadonlySet<string> = new Set(['rock_spire', 'bell_cage', 'diamond_cage', 'seal_block']);
export const ISO_UPRIGHT_SOFT = 1.8;
export const ISO_UPRIGHT_KEEP = 0.3;
export const ISO_UPRIGHT_MAX = 3.2;

/** Chiều cao (m) cho phép của hình `shape` khi muốn cao `h` mét; hình không thuộc nhóm đứng cao thì giữ `h`. */
export function isoFxHeight(shape: string, h: number): number {
  if (!ISO_UPRIGHT_SHAPES.has(shape) || h <= ISO_UPRIGHT_SOFT) return h;
  return Math.min(ISO_UPRIGHT_MAX, ISO_UPRIGHT_SOFT + (h - ISO_UPRIGHT_SOFT) * ISO_UPRIGHT_KEEP);
}

/**
 * Hệ số `scale.y` sau nén: `sy` là scale.y của sự kiện, `baseH` là chiều cao gốc (m, bounding box y) của lưới ở scale 1.
 * Chiều cao thật = `sy · baseH`; trả `sy` mới sao cho chiều cao thật bằng `isoFxHeight`.
 */
export function isoFxScaleY(shape: string, sy: number, baseH: number): number {
  if (!(baseH > 1e-6) || !ISO_UPRIGHT_SHAPES.has(shape)) return sy;
  return isoFxHeight(shape, sy * baseH) / baseH;
}
