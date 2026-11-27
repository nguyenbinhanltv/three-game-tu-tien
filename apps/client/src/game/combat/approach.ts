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

/** Lề cố định (ms) của lệnh tự đánh so với lúc hết khóa đòn, và phần chừa lại của bộ đệm server để lệnh không tới sớm quá mức bị từ chối. */
export const ATTACK_LEAD_BASE_MS = 30;
export const ATTACK_LEAD_SAFETY_MS = 50;

/**
 * Tự đánh gửi lệnh kế SỚM bao nhiêu ms so với lúc hết khóa đòn (theo đồng hồ server): một chiều đường truyền (`rtt / 2`) cộng lề, để lệnh tới server
 * đúng lúc được ra đòn thay vì trễ thêm một chiều ping. Không vượt `bufferMs − ATTACK_LEAD_SAFETY_MS` (server chỉ giữ lệnh tới sớm trong `bufferMs`).
 * Đo ở Diễn Võ Trường trước khi có hàm này: ping 0/150/300 ms cho 2,5 / 2,0 / 1,75 đòn mỗi giây.
 */
export function attackLeadMs(rttMs: number, bufferMs: number): number {
  const rtt = Number.isFinite(rttMs) && rttMs > 0 ? rttMs : 0;
  return Math.min(Math.max(ATTACK_LEAD_BASE_MS, bufferMs - ATTACK_LEAD_SAFETY_MS), ATTACK_LEAD_BASE_MS + rtt / 2);
}
