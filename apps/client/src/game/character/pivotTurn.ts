// Thân Pháp T2: ĐẢO CHIỀU GẤP (pivot) khi đang chạy. Hàm thuần (không đụng three) để test trong Node; `mannequin.ts` đọc kết quả mỗi khung.
// Trước đây đảo chiều 180° chỉ là thân quay cứng trong ~130 ms (hướng nhìn bám vận tốc theo hàm mũ 14/s), hông không hạ, chân vẫn guồng đủ sải.
// Ở đây nhận ra cú đảo chiều rồi dàn một nhịp ngắn "phanh → xoay → đạp đi", tất cả là lớp hình cộng thêm:
//  - phanh: nhịp chân chậm lại và dáng về gần đi bộ (thân dựng thẳng lên) qua hệ số tốc độ `speedMul` đưa vào bảng trộn đi/chạy;
//  - cắm chân: hông hạ `dip` (IK chân giữ bàn chân trên đất nên gối gập), thân ngả về hướng MỚI `lean`;
//  - xoay: thân quay có gia tốc (chậm lúc đầu, nhanh ở giữa) thay vì giật ngay khung đầu, qua độ lệch hướng nhìn `yawOffset`;
//    vai trễ sau hông `twist`, hai tay dạng ra giữ thăng bằng `arm`.
// Vị trí và vận tốc do server quyết; lớp này không đụng tới.

export const PIVOT = {
  /** Tốc độ tối thiểu (m/s) lúc đảo chiều: đi bộ quay đầu không cần phanh. */
  minSpeed: 3.2,
  /** Góc đổi hướng tối thiểu (rad, ~115°): rẽ gắt 90° vẫn là rẽ (đã có nghiêng thân), không phải đảo chiều. */
  minAngle: 2.0,
  /** Hằng số thời gian (s) của "hướng đang chạy" được nhớ; đứng lại lâu hơn mức này rồi chạy ngược thì không tính là đảo chiều. */
  memory: 0.25,
  /** Dưới tốc độ này (m/s) hướng nhớ phai dần thay vì cập nhật (người khác: tốc độ nội suy tụt về 0 giữa cú đảo chiều). */
  holdSpeed: 1,
  /** Độ dài cả nhịp (s). */
  duration: 0.38,
  /** Nghỉ giữa hai lần (s, tính từ lúc bắt đầu). */
  cooldown: 0.55,
  /** Hông hạ sâu nhất (m). */
  dip: 0.1,
  /** Thân ngả thêm về hướng mới (rad). */
  lean: 0.14,
  /** Giữ hướng cũ (s) rồi quay trong `turnTime` (s), ease hai đầu. */
  hold: 0.03,
  turnTime: 0.24,
  /** Hệ số tốc độ thấp nhất đưa vào bảng trộn đi/chạy lúc phanh. */
  slow: 0.38,
  /** Vai trễ sau hông (rad) ở giữa cú xoay. */
  twist: 0.3,
  /** Hai tay dạng ra (rad). */
  arm: 0.3,
} as const;

const wrap = (a: number): number => {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
};
const smooth = (u: number): number => {
  const t = Math.min(1, Math.max(0, u));
  return t * t * (3 - 2 * t);
};

/** Chuông lệch: lên nhanh tới đỉnh ở `peak` (0..1) rồi về 0 ở 1; 0 ngoài [0, 1]. */
export function pivotBell(u: number, peak: number): number {
  if (u <= 0 || u >= 1) return 0;
  return u < peak ? Math.sin((u / peak) * Math.PI * 0.5) : Math.cos(((u - peak) / (1 - peak)) * Math.PI * 0.5) ** 2;
}

/** Hệ số tốc độ lúc phanh tại tiến độ `u`: tụt nhanh về `slow`, giữ, rồi về 1 trước khi hết nhịp (đạp đi). */
export function pivotSpeedMul(u: number, slow: number = PIVOT.slow): number {
  if (u <= 0 || u >= 1) return 1;
  const down = smooth(u / 0.15);
  const up = smooth((u - 0.45) / 0.4);
  return 1 - (1 - slow) * down * (1 - up);
}

export class PivotTurn {
  /** Đang trong nhịp đảo chiều. */
  active = false;
  /** Tiến độ 0..1 của nhịp hiện tại. */
  u = 0;
  /** Hạ hông (m, ≥ 0). */
  dip = 0;
  /** Thân ngả về hướng mới (rad, ≥ 0), quanh trục vuông góc `(nx, nz)`. */
  lean = 0;
  /** Hướng mới (đơn vị, thế giới; `x = sin`, `z = cos` như hướng nhìn). */
  nx = 0;
  nz = 1;
  /** Cộng vào hướng nhìn hiển thị (rad): âm dần về 0 để thân quay chậm hơn gốc. */
  yawOffset = 0;
  /** Hệ số tốc độ đưa vào bảng trộn đi/chạy (≤ 1). */
  speedMul = 1;
  /** Vai trễ (rad, có dấu: ngược chiều quay). */
  twist = 0;
  /** Hai tay dạng ra (rad, ≥ 0). */
  arm = 0;
  /** Số lần đã đảo chiều (đo/kiểm). */
  count = 0;

  private fx = 0;
  private fz = 0;
  private lastYaw = Number.NaN;
  private t = 0;
  private cool = 0;
  /** Góc gốc đã quay từ lúc bắt đầu (rad, có dấu, không gói). */
  private acc = 0;

  /**
   * Cập nhật một bước. `heading` = hướng vận tốc (rad, cùng quy ước hướng nhìn), `yaw` = hướng nhìn của gốc (do engine đặt),
   * `ok` = được phép (đang chạy tự do trên đất, không ra đòn/bay/chết). Trả true đúng ở bước bắt đầu một cú đảo chiều.
   */
  update(dt: number, speed: number, heading: number, yaw: number, ok = true): boolean {
    if (dt <= 0) return false;
    const dy = Number.isFinite(this.lastYaw) ? wrap(yaw - this.lastYaw) : 0;
    this.lastYaw = yaw;
    this.cool = Math.max(0, this.cool - dt);
    const cx = Math.sin(heading);
    const cz = Math.cos(heading);
    let started = false;
    if (!ok) {
      if (this.active) this.end();
      this.fx = this.fz = 0;
      return false;
    }
    if (!this.active && this.cool === 0 && speed >= PIVOT.minSpeed) {
      const fl = Math.hypot(this.fx, this.fz);
      if (fl >= 0.6) {
        const ang = Math.acos(Math.max(-1, Math.min(1, (this.fx * cx + this.fz * cz) / fl)));
        if (ang >= PIVOT.minAngle) {
          this.active = started = true;
          this.t = 0;
          this.acc = 0;
          this.cool = PIVOT.cooldown;
          this.nx = cx;
          this.nz = cz;
          this.count++;
          // Hướng nhớ nhảy sang hướng mới: cú đảo chiều kế phải chạy được một quãng theo hướng này đã.
          this.fx = cx;
          this.fz = cz;
        }
      }
    }
    // Hướng nhớ: bám hướng chạy khi đủ nhanh, phai dần khi gần đứng.
    const k = 1 - Math.exp(-dt / PIVOT.memory);
    if (speed >= PIVOT.holdSpeed) {
      this.fx += (cx - this.fx) * k;
      this.fz += (cz - this.fz) * k;
    } else {
      this.fx -= this.fx * k;
      this.fz -= this.fz * k;
    }
    if (!this.active) return false;
    this.acc += dy;
    if (!started) this.t += dt;
    const u = this.t / PIVOT.duration;
    if (u >= 1 || speed < PIVOT.holdSpeed) {
      this.end();
      return started;
    }
    this.u = u;
    // Người chơi bẻ lái tiếp trong lúc xoay: ngả theo hướng đang chạy.
    this.nx = cx;
    this.nz = cz;
    this.dip = PIVOT.dip * pivotBell(u, 0.32);
    this.lean = PIVOT.lean * pivotBell(u, 0.3);
    this.speedMul = pivotSpeedMul(u);
    this.arm = PIVOT.arm * pivotBell(u, 0.35);
    const e = smooth((this.t - PIVOT.hold) / PIVOT.turnTime);
    // Gốc đã quay `acc`; thân mới quay được `e · acc`.
    this.yawOffset = -(1 - e) * this.acc;
    this.twist = -Math.sign(this.acc) * PIVOT.twist * Math.sin(Math.PI * e) * Math.min(1, Math.abs(this.acc) / 1.5);
    return started;
  }

  private end(): void {
    this.active = false;
    this.u = 0;
    this.dip = this.lean = this.yawOffset = this.twist = this.arm = 0;
    this.speedMul = 1;
  }

  /** Đặt lại (đổi LOD, chết, hồi sinh; `mannequin.ts` gọi ở các chỗ đó). Dịch chuyển không cần: hướng nhớ phai về 0 khi đứng lại. */
  reset(): void {
    this.end();
    this.fx = this.fz = 0;
    this.lastYaw = Number.NaN;
    this.cool = 0;
  }
}
