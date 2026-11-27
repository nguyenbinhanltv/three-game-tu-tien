// Tự áp sát của đòn thường cận chiến (Dạ Họa: Kiếm tu). Chỉ là Ý ĐỊNH di chuyển ở client (đặt điểm đến như bấm chuột phải);
// server vẫn tự kiểm tầm khi nhận lệnh đánh.

/** Khoảng đứng lùi vào trong tầm (m) để sai số nội suy vị trí không làm lệnh đánh bị từ chối vì ngoài tầm. */
export const APPROACH_MARGIN = 1;
/** Không đặt lại điểm đến khi mục tiêu mới dịch dưới ngần này (m): tránh giật dấu đích mỗi khung. */
export const APPROACH_RETARGET = 0.75;

/**
 * Điểm cần đi tới để đánh được mục tiêu ở (tx, tz) từ (px, pz) với tầm `range` (đã gồm bán kính thân mục tiêu): nằm trên đoạn nối hai bên,
 * cách mục tiêu `range − APPROACH_MARGIN`. Đã trong tầm thì trả null (không cần đi).
 */
export function approachPoint(px: number, pz: number, tx: number, tz: number, range: number): { x: number; z: number } | null {
  const dx = px - tx;
  const dz = pz - tz;
  const d = Math.hypot(dx, dz);
  const stand = Math.max(0.5, range - APPROACH_MARGIN);
  if (d <= stand) return null;
  return { x: tx + (dx / d) * stand, z: tz + (dz / d) * stand };
}
