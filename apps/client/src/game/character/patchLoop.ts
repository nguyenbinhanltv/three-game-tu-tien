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

/**
 * Hệ số hiệu chỉnh độ dài chu kỳ (đo trong game, `pnpm shots chrv3 --slide`, `SLIDE_SEC=8`, trượt chân khi tiếp đất, trung vị m/s; 1,0 → 0,78; 1,05 → 0,41; 1,1 → 0,08;
 * 1,15 → 0,22; UAL cũ 3,25): tốc độ `AnimState` cao hơn quãng thân thực di chuyển trên màn hình (~7,6 so với ~6,7 m/s đo từ vị trí gốc), nên nhịp tính từ
 * tốc độ đó nhanh hơn ~10% so với chân cần để dính đất. Số này KHÔNG phải sai số của clip (chân trụ đo trên file khớp bảng, xem `patchLoopPhase.test.ts`).
 */
export const STRIDE_SCALE = 1.1;

/** Bảng đầy đủ cho `locoMix`/`locoClipName`: đi bộ UAL, chạy/chạy nhanh Patch (độ dài chu kỳ nhân `STRIDE_SCALE`). */
export const PATCH_TABLE: LocoTable = {
  walk: LOCO.walk,
  jog: { ...PATCH_LOCO.jog, stride: PATCH_LOCO.jog.stride * STRIDE_SCALE },
  sprint: { ...PATCH_LOCO.sprint, stride: PATCH_LOCO.sprint.stride * STRIDE_SCALE },
};

/** Bảng Patch với độ dài chu kỳ nhân thêm `k` (thử/quét trượt chân: `?pstride=<k>`, so với bảng đã hiệu chỉnh); k = 1 trả về `PATCH_TABLE`. */
export function scaledTable(k: number): LocoTable {
  if (k === 1 || !(k > 0)) return PATCH_TABLE;
  return {
    walk: LOCO.walk,
    jog: { ...PATCH_TABLE.jog, stride: PATCH_TABLE.jog.stride * k },
    sprint: { ...PATCH_TABLE.sprint, stride: PATCH_TABLE.sprint.stride * k },
  };
}

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
