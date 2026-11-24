// "Thân Pháp" T1: lớp cường điệu additive cho camera chéo. Hàm thuần (không đụng three) để test trong Node; mannequin.ts gọi sau mixer.
// Không sửa clip gốc: khuếch đại độ lệch của xương so với tư thế nghỉ, nảy bước, nghiêng thân khi rẽ. Cờ bật/tắt để so A/B (`?thanphap=0|1`, mặc định tắt
// cho tới khi người dùng duyệt pilot; `window.__animlab.fx({...})` đổi lúc chạy).

import { FLAGS } from '../../base/flags';

export interface AnimFxFlags {
  /** T1: khuếch đại biên độ tay/vai/hông. */
  exaggerate: boolean;
  /** T1: nảy bước + nghiêng thân mạnh hơn khi rẽ. */
  bounce: boolean;
}

/** Trạng thái cờ chạy (mặc định theo `?thanphap=1`); phòng thử đổi được. */
export const ANIM_FX: AnimFxFlags = { exaggerate: FLAGS.thanPhap, bounce: FLAGS.thanPhap };

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
