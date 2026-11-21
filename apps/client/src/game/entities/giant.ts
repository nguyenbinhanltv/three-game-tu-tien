// Hóa hình Cổ Thần (TN-5): thân to lớn tạm thời. Hàm thuần: mức hóa hình hiển thị trôi dần tới đích, rồi đổi ra tỉ lệ thân.
// Server chỉ gửi cờ `hh` (0/1) theo tư thế `skl_hoa_hinh`; to ra nhanh hơn lúc nhỏ lại để khoảnh khắc biến hình có lực.

/** Tỉ lệ thân khi đã hóa hình hoàn toàn. */
export const GIANT_SCALE = 1.55;
/** Tốc độ trôi (đơn vị mức/giây): to ra 0,45 giây, nhỏ lại 0,8 giây. */
const RISE = 2.2;
const FALL = 1.25;

/** Mức hóa hình sau `dt` giây khi đích là `on`. Luôn trong [0, 1]. */
export function stepGiant(cur: number, on: boolean, dt: number): number {
  const d = Math.max(0, Math.min(dt, 0.25));
  return on ? Math.min(1, cur + RISE * d) : Math.max(0, cur - FALL * d);
}

/** Tỉ lệ thân từ mức hóa hình (làm mượt đầu/cuối để không giật). */
export function giantScale(k: number): number {
  const u = Math.max(0, Math.min(1, k));
  return 1 + (GIANT_SCALE - 1) * (u * u * (3 - 2 * u));
}
