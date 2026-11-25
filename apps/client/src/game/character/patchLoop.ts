// Thân Pháp: vòng chạy/chạy nhanh bằng clip CC0 của Patch (`PM_Run`, `PM_Sprint`) thay `Jog_Fwd_Loop`/`Sprint_Loop` của UAL (hướng tới); đi bộ,
// lùi, ngang vẫn là UAL. Hàm thuần (không đụng three) để test trong Node. Hệ trộn đi/chạy/chạy nhanh khóa MỘT pha chung cho mọi clip (chân trụ khớp
// mặt đất khi đổi nhịp), nên mỗi clip Patch có độ lệch pha để chạm đất cùng nhịp với `Jog_Fwd_Loop` (clip tham chiếu của dải chạy, cùng pha với
// bản lùi/ngang dựng từ nó).
import { LOCO, type LocoBand, type LocoTable } from './mannequinAnim';

export interface LocoBandDef {
  clip: string;
  /** Tốc độ gốc (m/s) của clip (chuyển động gốc đo trước khi bỏ `root.translation`). */
  speed: number;
  /** Độ dài chu kỳ (m): tốc độ × thời lượng clip. */
  stride: number;
}

/**
 * Chạy/chạy nhanh của Patch: `PM_Run` 3,68 m trong 0,67 s (5,5 m/s), `PM_Sprint` 4,06 m trong 0,60 s (6,8 m/s) (docs/handbook/vfx-animation.md).
 * Dải đi bộ giữ nguyên bảng UAL (`LOCO.walk`).
 */
export const PATCH_LOCO = {
  jog: { clip: 'PM_Run', speed: 5.5, stride: 3.68 },
  sprint: { clip: 'PM_Sprint', speed: 6.8, stride: 4.06 },
} as const satisfies Partial<Record<LocoBand, LocoBandDef>>;

/** Bảng đầy đủ cho `locoMix`/`locoClipName`: đi bộ UAL, chạy/chạy nhanh Patch. */
export const PATCH_TABLE: LocoTable = { walk: LOCO.walk, ...PATCH_LOCO };

/**
 * Độ lệch pha (phần chu kỳ cộng vào pha chung trước khi đọc clip): đo bước chân trụ (chân trái chạm đất) bằng `patchLoop.test.ts`:
 * `Jog_Fwd_Loop` chạm ở 0,150 chu kỳ, `PM_Run` ở 0,121, `PM_Sprint` ở 0,125 ⇒ lệch -0,029 và -0,025 (cộng 1 để dương).
 */
export const PATCH_PHASE: Readonly<Record<string, number>> = {
  PM_Run: 1 - 0.029,
  PM_Sprint: 1 - 0.025,
};

/** Độ lệch pha của clip (theo tên, bỏ hậu tố `|upper`/`|lower` của clip tách nửa thân); 0 nếu không phải clip Patch. */
export function phaseOffsetOf(clipName: string): number {
  return PATCH_PHASE[clipName.split('|')[0]!] ?? 0;
}

/** Thời gian đọc clip (giây) tại pha chung `phase` ∈ [0,1) của clip dài `dur`, đã cộng độ lệch pha. */
export function clipTimeAt(clipName: string, dur: number, phase: number): number {
  return ((((phase + phaseOffsetOf(clipName)) % 1) + 1) % 1) * dur;
}
