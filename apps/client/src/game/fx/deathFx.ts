/**
 * Chết và hồi sinh (P2-B5): chỉ là lớp trình diễn ở client, theo cờ PF_DEAD server gửi về. Không gửi gì, không đổi luật.
 *
 * Chết: mực loang từ mép vào giữa màn (`ink` 0→1), cảnh khử bão hòa (`desat`), camera trôi chậm ra sau và lên cao
 * (`drift`). Bảng hồi sinh hiện khi mực đã phủ gần hết (`panelAt`). Hồi sinh: mực rút đi theo chiều ngược lại, `revived`
 * bật đúng một khung để engine nổ linh quang quanh nhân vật.
 *
 * Phần thuần (đồng hồ, easing) tách ở đây để test không cần renderer.
 */

/** Giây mực loang kín khi chết. */
export const INK_IN = 2.6;
/** Giây mực rút khi hồi sinh. */
export const INK_OUT = 1.5;
/** Giây camera trôi hết tầm. */
const DRIFT_TIME = 5;
/** Độ phủ mực tại đó bảng hồi sinh bắt đầu hiện. */
export const PANEL_INK = 0.62;
/** Độ phủ mực lúc hết (chừa lại một lớp mỏng cho giọng thủy mặc, không đen kịt để còn thấy cảnh). */
const INK_MAX = 1;

function smooth(x: number): number {
  const c = x < 0 ? 0 : x > 1 ? 1 : x;
  return c * c * (3 - 2 * c);
}

interface DeathOut {
  /** Độ phủ mực 0..1 (đã easing). */
  ink: number;
  /** Mức khử bão hòa 0..1. */
  desat: number;
  /** Camera trôi ra 0..1. */
  drift: number;
  /** Bảng hồi sinh nên hiện. */
  panel: boolean;
}

export class DeathFx {
  /** Tiến trình tuyến tính của mực 0..1 (lên khi chết, xuống khi hồi sinh). */
  private p = 0;
  private dead = false;
  private driftT = 0;
  /** Bật đúng một lần update khi vừa hồi sinh từ trạng thái đã chết. */
  revived = false;
  /** Bật đúng một lần update khi vừa chết. */
  died = false;
  readonly out: DeathOut = { ink: 0, desat: 0, drift: 0, panel: false };

  get active(): boolean {
    return this.dead || this.p > 0;
  }

  /** Đặt lại hẳn (đổi room, vào game): không chạy hiệu ứng rút. */
  reset(): void {
    this.p = 0;
    this.driftT = 0;
    this.dead = false;
    this.revived = false;
    this.died = false;
    this.fill();
  }

  update(dt: number, isDead: boolean): DeathOut {
    this.revived = false;
    this.died = false;
    if (isDead && !this.dead) this.died = true;
    // Chỉ coi là hồi sinh nếu mực đã loang đáng kể; chết rồi sống lại trong chớp mắt thì khỏi nổ linh quang.
    if (!isDead && this.dead && this.p > 0.15) this.revived = true;
    this.dead = isDead;
    if (isDead) {
      this.p = Math.min(1, this.p + dt / INK_IN);
      this.driftT = Math.min(DRIFT_TIME, this.driftT + dt);
    } else {
      this.p = Math.max(0, this.p - dt / INK_OUT);
      this.driftT = Math.max(0, this.driftT - dt * (DRIFT_TIME / INK_OUT));
    }
    this.fill();
    return this.out;
  }

  private fill(): void {
    const o = this.out;
    o.ink = smooth(this.p) * INK_MAX;
    // Màu rút nhanh hơn mực loang một chút để ánh sáng hồi sinh hiện lên trên cảnh còn màu.
    o.desat = smooth(Math.min(1, this.p * 1.8));
    o.drift = smooth(this.driftT / DRIFT_TIME);
    o.panel = this.dead && o.ink >= PANEL_INK;
  }
}
