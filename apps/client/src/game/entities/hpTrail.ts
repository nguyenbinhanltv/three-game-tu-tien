/**
 * Thanh trễ (đoạn nhạt nằm sau phần máu vừa mất), chỉ là hiển thị phía client.
 *
 * Khi máu tụt: đoạn trễ đứng yên `HOLD` giây để mắt kịp thấy lượng vừa mất, rồi rút về máu hiện tại,
 * nhanh hơn khi khoảng cách lớn. Đòn đến trong lúc đang rút không đặt lại thời gian giữ, nên boss bị
 * cả nhóm đánh liên tục vẫn thấy đoạn trễ rút đều thay vì đứng mãi. Máu tăng thì đoạn trễ theo ngay.
 *
 * Dùng chung cho thanh DOM (khung mình, thanh boss) và thanh trên đầu (instanced).
 */
export const TRAIL_HOLD = 0.45;
/** Tốc độ rút tối thiểu (phần thanh mỗi giây). */
const TRAIL_MIN_RATE = 0.18;
/** Phần rút thêm tỉ lệ với khoảng cách còn lại (mỗi giây). */
const TRAIL_PROP_RATE = 2.6;

export class HpTrail {
  /** Vị trí mép đoạn trễ, 0..1. */
  value: number;
  private hold = 0;
  /** Đang rút (đã hết giữ, chưa bắt kịp máu). */
  private draining = false;

  constructor(frac = 1) {
    this.value = clamp01(frac);
  }

  /** Đặt thẳng về `frac` (vừa hiện lại, đổi mục tiêu, hồi sinh). */
  reset(frac: number): void {
    this.value = clamp01(frac);
    this.hold = 0;
    this.draining = false;
  }

  /** Cập nhật theo máu hiện tại `frac` (0..1) sau `dt` giây; trả về `value`. */
  update(frac: number, dt: number): number {
    const f = clamp01(frac);
    if (f >= this.value) {
      this.reset(f);
      return this.value;
    }
    if (!this.draining && this.hold <= 0) this.hold = TRAIL_HOLD;
    if (this.hold > 0) {
      this.hold -= dt;
      if (this.hold > 0) return this.value;
      dt = -this.hold;
      this.hold = 0;
      this.draining = true;
    }
    const gap = this.value - f;
    this.value = Math.max(f, this.value - (TRAIL_MIN_RATE + gap * TRAIL_PROP_RATE) * dt);
    if (this.value <= f) this.draining = false;
    return this.value;
  }
}

function clamp01(x: number): number {
  return x > 1 ? 1 : x > 0 ? x : 0;
}
