import { MF_BURROW, MF_REFLECT, MF_WEAK } from '@dtl/shared';

/**
 * Cờ quái mở rộng (E1-E) → hình. Chỉ là lớp trình bày: server giữ trạng thái và phán định (`mf`/`ce` của MonS).
 * - phản đòn: vòng pháp trận đỏ son dưới chân suốt thời gian cờ (kể cả `warn` đầu, vòng chạy hết là lúc bắt đầu phản)
 * - lộ yếu điểm: vòng vàng nhạt
 * - chui đất: ẩn thân, đốm bụi lúc xuống và lúc trồi (không vẽ vòng)
 */
export interface MonFlagEdge {
  on: number;
  off: number;
}

/** Cờ vừa bật/tắt giữa hai khung (chỉ xét ba cờ mở rộng); null nếu không đổi. */
export function monFlagEdge(prev: number, cur: number): MonFlagEdge | null {
  const mask = MF_REFLECT | MF_WEAK | MF_BURROW;
  const a = prev & mask;
  const b = cur & mask;
  if (a === b) return null;
  return { on: b & ~a, off: a & ~b };
}

export const MON_AURA_REFLECT = { color: 0xd8584a, radius: 2.4 };
export const MON_AURA_WEAK = { color: 0xffde96, radius: 1.9 };
export const MON_BURROW_DIRT = 0x8a6a3a;

/** Thân quái có bị ẩn không (đang chui đất). */
export function monHidden(mf: number): boolean {
  return (mf & MF_BURROW) !== 0;
}
