import { MF_BURROW, MF_CHANT } from '@dtl/shared';

/**
 * Cờ quái mở rộng (E1-E) → hình. Chỉ là lớp trình bày: server giữ trạng thái và phán định (`mf`/`ce` của MonS).
 * - phản đòn, lộ yếu điểm, thể thật, bị soi, mặt Âm/Dương: hình do `game/fx/statusFx.ts` vẽ theo cờ (HPL2 PR2a), không còn vòng rune dưới chân
 * - chui đất: ẩn thân, đốm bụi lúc xuống và lúc trồi (không vẽ vòng)
 */
export interface MonFlagEdge {
  on: number;
  off: number;
}

/** Cờ vừa bật/tắt giữa hai khung (chui đất + niệm chú: chỉ hai cờ còn cần bắt cạnh); null nếu không đổi. */
export function monFlagEdge(prev: number, cur: number): MonFlagEdge | null {
  const mask = MF_BURROW | MF_CHANT;
  const a = prev & mask;
  const b = cur & mask;
  if (a === b) return null;
  return { on: b & ~a, off: a & ~b };
}

export const MON_BURROW_DIRT = 0x8a6a3a;

/** Thân quái có bị ẩn không (đang chui đất). */
export function monHidden(mf: number): boolean {
  return (mf & MF_BURROW) !== 0;
}
