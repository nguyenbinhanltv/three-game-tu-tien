// Làm chậm quái: nhiều nguồn cùng ghi `slow` (chiêu vùng biến thức, đòn bạo kích của bộ trang bị, trận Khốn), nên gộp thay vì ghi đè.

/** Hiệu ứng làm chậm: hết hạn lúc `until` (ms), nhân tốc độ `mul` (nhỏ hơn = chậm hơn). */
export interface SlowState {
  until: number;
  mul: number;
}

/**
 * Gộp hiệu ứng làm chậm mới `next` vào cái đang có `cur` (đã hết hạn lúc `now` thì coi như không có): giữ hạn lớn hơn và hệ số nhỏ hơn.
 * Nguồn dài/mạnh hơn không bị nguồn ngắn/yếu hơn cắt.
 */
export function mergeSlow(cur: SlowState | undefined, next: SlowState, now: number): SlowState {
  if (!cur || cur.until <= now) return { until: next.until, mul: next.mul };
  return { until: Math.max(cur.until, next.until), mul: Math.min(cur.mul, next.mul) };
}
