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

/** Thẻ pháp tướng 2D (billboard, `card`) rơi/đứng trên mục tiêu phủ lên người khi nhìn từ trên xuống: thu nhỏ và giảm độ đục. */
export const ISO_CARD_SCALE = 0.8;
export const ISO_CARD_ALPHA = 0.55;
/** Tia sét (`bolt`) kéo thành cột cao trên màn hình ở góc nghiêng: thu độ cao đỉnh (hệ số nhân `BOLT_HEIGHT`); bề rộng, quầng và vòng chạm đất giữ nguyên. */
export const ISO_BOLT_HEIGHT = 0.7;

/** Vòng sét ở điểm rơi của tia (`bolt*` nhắm mục tiêu/đất): bán kính theo bề ngang tia, trong [1.6, 3.2] m; thời gian sống (s). */
export const ISO_BOLT_FOOT_LIFE = 0.55;
export function isoBoltFootRadius(widthScale: number): number {
  return Math.min(3.2, Math.max(1.6, 1.4 + widthScale));
}
/** Tia nhắm xuống đất/mục tiêu (không phải tia phóng từ người). */
export function isBoltGroundHit(shape: string, at: string | undefined): boolean {
  return shape.startsWith('bolt') && (at === 'target' || at === 'ground');
}

/** Thẻ pháp tướng neo vào người (`at: self`): đặt cách người chừng này (m) về phía XA camera, giữa màn hình phía trên người, thay vì lệch sang bên/trước. */
export const ISO_CARD_BEHIND = 4.5;
/** Vị trí (x, z) phía xa camera so với người (ax, az), cách `dist` m trên mặt đất. Camera trùng người thì giữ chỗ người. */
export function isoBehind(camX: number, camZ: number, ax: number, az: number, dist = ISO_CARD_BEHIND): { x: number; z: number } {
  const dx = ax - camX;
  const dz = az - camZ;
  const l = Math.hypot(dx, dz);
  return l < 1e-3 ? { x: ax, z: az } : { x: ax + (dx / l) * dist, z: az + (dz / l) * dist };
}
