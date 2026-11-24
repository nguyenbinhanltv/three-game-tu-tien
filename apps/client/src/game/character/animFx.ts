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
  return Math.max(-0.16, Math.min(0.16, accel * 0.012));
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
export function idleDue(still: number, after = 7): boolean {
  return still >= after;
}
