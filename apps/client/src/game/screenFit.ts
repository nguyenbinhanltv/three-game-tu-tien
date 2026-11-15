/**
 * Giới hạn kích thước trên màn hình của nhãn 3D (P2-E4): tên, thanh máu là vật thể trong thế giới nên camera càng
 * gần càng to (che nhân vật), càng xa càng bé. Hàm trả hệ số nhân để chiều rộng trên màn hình nằm trong [minPx, maxPx].
 */

/** Chiều rộng (px) trên màn hình của một vật rộng `worldW` mét, cách camera `dist` mét. */
export function screenWidthPx(worldW: number, dist: number, fovDeg: number, viewH: number): number {
  const tan = Math.tan((fovDeg * Math.PI) / 360);
  return (worldW / Math.max(0.05, 2 * dist * tan)) * viewH;
}

/** Hệ số nhân kích thước thế giới để rộng trên màn hình nằm trong [minPx, maxPx]. 1 nếu đã trong khoảng. */
export function fitFactor(worldW: number, dist: number, fovDeg: number, viewH: number, minPx: number, maxPx: number): number {
  const px = screenWidthPx(worldW, dist, fovDeg, viewH);
  if (px > maxPx) return maxPx / px;
  if (px < minPx) return minPx / px;
  return 1;
}

export interface Box {
  /** Tâm và nửa kích thước (px). */
  x: number;
  y: number;
  hw: number;
  hh: number;
}

export function boxesOverlap(a: Box, b: Box, pad = 0): boolean {
  return Math.abs(a.x - b.x) < a.hw + b.hw + pad && Math.abs(a.y - b.y) < a.hh + b.hh + pad;
}
