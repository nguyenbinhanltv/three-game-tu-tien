// "Thân Pháp" T1: lớp cường điệu additive cho camera chéo. Hàm thuần (không đụng three) để test trong Node; mannequin.ts gọi sau mixer.
// Không sửa clip gốc: khuếch đại độ lệch của xương so với tư thế nghỉ, nảy bước, nghiêng thân khi rẽ. Cờ bật/tắt để so A/B (`?thanphap=0|1`, mặc định tắt
// cho tới khi người dùng duyệt pilot; `window.__animlab.fx({...})` đổi lúc chạy).

import { FLAGS } from '../../base/flags';
import type { SpringParams } from './spring';

export interface AnimFxFlags {
  /** T1: khuếch đại biên độ tay/vai/hông. */
  exaggerate: boolean;
  /** T1: nảy bước + nghiêng thân mạnh hơn khi rẽ. */
  bounce: boolean;
  /** T4: dùng bản pose `<id>_tp` (dồn lực sâu, đường chém 2 khung, giữ đỉnh đòn ≥3 khung) khi có. */
  poses: boolean;
  /** T4: nét kéo lưỡi kiếm ở đường chém. */
  smear: boolean;
  /** T6: lò xo tóc/dải (nhóm `dtl_o_*` ngoài vạt và tay áo) mềm và rộng góc hơn: chạy cùng Thiên Y, không thay thế. Đọc lúc dựng nhân vật. */
  spring: boolean;
  /** T2: lướt thấp khi chạy + nghiêng theo tăng/giảm tốc (bắt đầu/dừng). */
  loco: boolean;
  /** T3: idle đặc trưng Kiếm tu khi đứng lâu. */
  idle: boolean;
  /** T7: cut-in chiêu cuối (khựng 0,5 s + tranh Codex quét ngang + tên chiêu); chỉ Kiếm tu trong pilot. */
  cutin: boolean;
}

/** Trạng thái cờ chạy (mặc định theo `?thanphap=1`); phòng thử đổi được. */
export const ANIM_FX: AnimFxFlags = {
  exaggerate: FLAGS.thanPhap,
  bounce: FLAGS.thanPhap,
  poses: FLAGS.thanPhap,
  smear: FLAGS.thanPhap,
  spring: FLAGS.thanPhap,
  loco: FLAGS.thanPhap,
  idle: FLAGS.thanPhap,
  cutin: FLAGS.thanPhap,
};

/** T6: thông số lò xo sống động hơn `V3_SPRING` (130/8/30°): tần số riêng thấp hơn, cản nhẹ hơn, góc rộng hơn; ở góc chéo tóc/dải đọc được rõ. */
export const SPRING_TP: SpringParams = { stiffness: 85, drag: 4.5, maxAngle: 42, maxInward: 10 };

/** Hệ số khuếch đại độ lệch quanh tư thế nghỉ theo xương (1 = giữ nguyên). Tay/vai/hông +15–30% (kế hoạch Thân Pháp T1). */
export const EXAG_GAIN: Readonly<Record<string, number>> = {
  upperarm_l: 1.3,
  upperarm_r: 1.3,
  lowerarm_l: 1.2,
  lowerarm_r: 1.2,
  clavicle_l: 1.25,
  clavicle_r: 1.25,
  pelvis: 1.2,
};

/** Tốc độ (m/s) mà từ đó khuếch đại đạt đủ: đứng yên giữ nguyên clip (idle không bị lắc), chạy thì đủ hệ số. */
export function exagBlend(speed: number): number {
  const t = Math.min(1, Math.max(0, (speed - 0.6) / 2.4));
  return t * t * (3 - 2 * t);
}

/** Hệ số khuếch đại thực tế của một xương ở tốc độ `speed` (1 + (gain−1)·blend). */
export function exagGain(bone: string, speed: number): number {
  const g = EXAG_GAIN[bone];
  return g === undefined ? 1 : 1 + (g - 1) * exagBlend(speed);
}

/** Độ nảy dọc (m) của thân theo pha bước (0..1 mỗi chu kỳ chạy, hai bước/chu kỳ): thấp nhất lúc chân chạm, cao lúc lơ lửng. Tỉ lệ theo tốc độ. */
export function bobOf(phase: number, speed: number): number {
  if (speed < 0.8) return 0;
  const amp = 0.035 * Math.min(1, speed / 5.4);
  return amp * (0.5 - 0.5 * Math.cos(phase * Math.PI * 4));
}

/** Nghiêng thân khi rẽ mạnh hơn bản gốc (`leanOf` kẹp 0,13 rad): kẹp 0,2 rad, hệ số ×1,5. */
export function leanBoost(base: number): number {
  return Math.max(-0.2, Math.min(0.2, base * 1.5));
}

/** T2: nghiêng thân (rad, dương = cúi về trước) theo gia tốc dọc (m/s²): tăng tốc thì chúi tới, phanh thì ngả ra sau; kẹp ±0,16. */
export function accelLean(accel: number): number {
  return Math.max(-0.16, Math.min(0.16, accel * 0.006));
}

/** T2: dáng "lướt thấp" của Kiếm tu khi chạy: thân chúi nhẹ (rad) tăng theo tốc độ, 0 khi đi bộ/đứng. */
export function glideLean(speed: number): number {
  return 0.09 * exagBlend(speed) * Math.min(1, speed / 5.4);
}

/** T2: hạ hông (m) khi lướt thấp. */
export function glideDip(speed: number): number {
  return 0.04 * exagBlend(speed);
}

/** T3: pose idle Kiếm tu: cầm kiếm (đang ở thế đấu) thì xoay kiếm, tay không thì chắp tay ngắm trời; luân phiên theo `n`. */
export const IDLE_POSES = { drawn: 'kiem_idle_xoay', free: 'kiem_idle_chap_tay' } as const;
export function idlePoseFor(drawn: boolean): string {
  return drawn ? IDLE_POSES.drawn : IDLE_POSES.free;
}

/** T3: đứng yên liên tục `still` giây thì tới lượt idle khi quá `after` giây (đặt lại về âm ngẫu nhiên sau mỗi lần). */
/** Kiếm đang cầm (còn trong thế đấu sau đòn cuối, ~4 s): xoay kiếm sau chừng này giây đứng yên, kịp cửa sổ đó. */
export const IDLE_DRAWN_AFTER = 2.5;
export function idleDue(still: number, after = 7): boolean {
  return still >= after;
}

/** T7: chiêu cuối có tranh cut-in trong pilot (khóa theo id chiêu; mở rộng khi cuốn chiếu TP-3). Giá trị = tiền tố tên tranh `<tiền tố>_<m|f>.webp`. */
export const CUTIN_ART: Readonly<Record<string, string>> = { skl_van_kiem_quy_tong: 'kiem_tu' };

/** Thời gian khựng của cut-in (ms): trong khoảng 0,4–0,6 s của kế hoạch. */
export const CUTIN_FREEZE_MS = 500;

/** Tên file tranh cut-in của chiêu `skill` cho người chơi giới `g` ('m'|'f'), hoặc null nếu chiêu chưa có tranh. */
export function cutinArt(skill: string, g: string): string | null {
  const k = CUTIN_ART[skill];
  return k ? `${k}_${g === 'f' ? 'f' : 'm'}` : null;
}

/** T2: sự kiện di chuyển nhận ra từ tốc độ và tốc độ xoay. */
export type LocoEvent = 'start' | 'stop' | 'pivot';

/**
 * T2 bắt đầu/dừng/pivot (thay clip riêng bằng xung lò xo tắt dần cộng thêm lên thân): nhận sự kiện từ tốc độ (m/s) và tốc độ xoay (rad/s) rồi trả
 * độ chúi thân `pitch` (rad, dương = cúi về trước), nghiêng `roll` (rad, dương = nghiêng sang trái người chạy) và hạ hông `dip` (m).
 * - bắt đầu chạy (vọt qua 0,8 m/s từ đứng yên): chúi tới + hạ hông (đạp đà);
 * - dừng (rớt dưới 0,6 m/s từ ≥ 2,5 m/s): ngả ra sau + hạ hông (phanh), mạnh theo tốc độ trước đó;
 * - pivot (xoay ≥ 5 rad/s khi đang ≥ 2 m/s, cách nhau ≥ 0,35 s): nghiêng ngược chiều xoay + hạ hông.
 * Vị trí do server quyết định, đây chỉ là dáng người; không đụng vị trí.
 */
export class LocoImpulse {
  pitch = 0;
  roll = 0;
  dip = 0;
  private vp = 0;
  private vr = 0;
  private vd = 0;
  private prevSpeed = 0;
  private peak = 0;
  private cool = 0;

  /** Đẩy xung (vận tốc ban đầu của lò xo). */
  kick(e: LocoEvent, mag: number, dir = 1): void {
    if (e === 'start') {
      this.vp += 1.6 * mag;
      this.vd += -0.5 * mag;
    } else if (e === 'stop') {
      this.vp += -2.2 * mag;
      this.vd += -0.6 * mag;
    } else {
      this.vr += 2.4 * mag * dir;
      this.vd += -0.35 * mag;
    }
  }

  /** Cập nhật một bước; trả sự kiện vừa nhận ra (nếu có). */
  update(dt: number, speed: number, yawRate: number): LocoEvent | null {
    if (dt <= 0) return null;
    this.cool = Math.max(0, this.cool - dt);
    this.peak = speed > this.peak ? speed : this.peak - dt * 1.5;
    let ev: LocoEvent | null = null;
    if (this.prevSpeed < 0.3 && speed >= 0.8) {
      ev = 'start';
      this.kick('start', 1);
    } else if (this.prevSpeed >= 0.6 && speed < 0.6 && this.peak >= 2.5) {
      ev = 'stop';
      this.kick('stop', Math.min(1, this.peak / 5.4));
      this.peak = 0;
    } else if (this.cool === 0 && speed >= 2 && Math.abs(yawRate) >= 5) {
      ev = 'pivot';
      this.kick('pivot', Math.min(1, Math.abs(yawRate) / 8), -Math.sign(yawRate));
      this.cool = 0.35;
    }
    this.prevSpeed = speed;
    // Lò xo tắt dần tới 0 (tần số riêng ~2,1 Hz, tắt ~0,6 s): x'' = −k x − c x'.
    const k = 180;
    const c = 14;
    const step = (x: number, v: number): [number, number] => {
      const nv = v + (-k * x - c * v) * dt;
      return [x + nv * dt, nv];
    };
    [this.pitch, this.vp] = step(this.pitch, this.vp);
    [this.roll, this.vr] = step(this.roll, this.vr);
    [this.dip, this.vd] = step(this.dip, this.vd);
    return ev;
  }

  /** Đặt lại về nghỉ (đổi LOD, hồi sinh, bay...). */
  reset(): void {
    this.pitch = this.roll = this.dip = this.vp = this.vr = this.vd = 0;
    this.prevSpeed = this.peak = this.cool = 0;
  }
}

/** Biên độ kẹp của xung T2 để không bao giờ làm gãy thân. */
export const LOCO_CLAMP = { pitch: 0.22, roll: 0.16, dip: 0.07 } as const;
