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

/** Bảng Patch với độ dài chu kỳ nhân thêm `k` (thử/quét trượt chân trong test, so với bảng đã hiệu chỉnh); k = 1 trả về `PATCH_TABLE`. */
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

/**
 * Hậu tố của bản đọc NGƯỢC thời gian của clip đi ngang, dùng cho hướng chéo-lùi. Clip lùi của UAL là clip tới đảo chiều thời gian (hông vẫn hướng trước,
 * chân chạy ngược), còn clip ngang là clip tới xoay hông ±90° (chân chạy xuôi): trộn hai thứ đó thì chuyển động chân triệt tiêu ở MỌI độ lệch pha
 * (đo 28/11 trên file clip: lùi 0,5 + ngang 0,5 chỉ còn sải 0,45 m/chu kỳ so với 5,9 của từng clip, tức chân gần như đứng yên khi thân đi 7 m/s).
 * Ghép đúng cho chéo-lùi là clip lùi + clip ngang PHÍA ĐỐI DIỆN đọc ngược (hông xoay sang bên kia, chân chạy ngược, thân vẫn đi về bên cần): sải 5,6–5,75.
 */
export const REV_SUFFIX = '|rev';

/**
 * Pha đọc của bản ngược = `REV_PHASE` − pha chung: chọn để chân trụ của nó trùng pha chân trụ của clip lùi (quét 0..1 trên file clip, 28/11:
 * đi bộ và chạy tốt nhất ở 0,52, chạy nhanh 0,56; quanh đỉnh ±0,04 sải đổi dưới 3%).
 */
export const REV_PHASE = 0.53;

/** Thời gian đọc clip (giây) tại pha chung `phase` ∈ [0,1) của clip dài `dur`, đã cộng độ lệch pha; clip mang hậu tố `|rev` đọc ngược thời gian. */
export function clipTimeAt(clipName: string, dur: number, phase: number): number {
  const ph = clipName.split('|').includes('rev') ? REV_PHASE - phase : phase + phaseOffsetOf(clipName);
  return (((ph % 1) + 1) % 1) * dur;
}

/**
 * Chéo-tới (clip chạy Patch trộn clip ngang UAL): sải THẬT của hỗn hợp ngắn hơn công thức tuyến tính của `locoMix`, vì hai clip khác dáng chạy. Tỉ số
 * sải thật / công thức theo phần hướng tới `f` (0 = ngang hẳn, 1 = tới hẳn), bước 0,1; đo trên file clip 28/11, trung bình dải chạy và chạy nhanh
 * (chạy 0,82 ở f = 0,7; chạy nhanh 0,84 ở f = 0,6). Đi bộ và chéo-lùi không cần bù (lệch dưới 6%).
 */
export const DIAG_STRIDE: readonly number[] = [1, 0.97, 0.95, 0.93, 0.895, 0.86, 0.835, 0.83, 0.86, 0.92, 1];

/**
 * Hệ số nhân vào độ dài chu kỳ khi đi chéo-tới bằng bảng Patch: `f` = phần hướng tới của hỗn hợp hướng, `run` = phần dải chạy + chạy nhanh (đi bộ không bù).
 * Nhịp chân = nhịp của `locoMix` chia cho số này.
 */
export function diagStrideGain(f: number, run: number): number {
  const x = Math.min(1, Math.max(0, f)) * (DIAG_STRIDE.length - 1);
  const i = Math.min(DIAG_STRIDE.length - 2, Math.floor(x));
  const g = DIAG_STRIDE[i]! + (DIAG_STRIDE[i + 1]! - DIAG_STRIDE[i]!) * (x - i);
  return 1 - (1 - g) * Math.min(1, Math.max(0, run));
}
