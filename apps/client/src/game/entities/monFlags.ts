import { MF_BURROW, MF_CHANT, MF_FACE, MF_REAL, MF_REFLECT, MF_SENSED, MF_WEAK } from '@dtl/shared';

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

/** Cờ vừa bật/tắt giữa hai khung (ba cờ mở rộng + cờ niệm chú, V5); null nếu không đổi. */
export function monFlagEdge(prev: number, cur: number): MonFlagEdge | null {
  const mask = MF_REFLECT | MF_WEAK | MF_BURROW | MF_REAL | MF_SENSED | MF_CHANT | MF_FACE;
  const a = prev & mask;
  const b = cur & mask;
  if (a === b) return null;
  return { on: b & ~a, off: a & ~b };
}

export const MON_AURA_REFLECT = { color: 0xd8584a, radius: 2.4 };
export const MON_AURA_WEAK = { color: 0xffde96, radius: 1.9 };
export const MON_BURROW_DIRT = 0x8a6a3a;
/** Thể thật của boss gương (E3-M): vết ngọc lam dưới chân, bóng giả không có; thần thức soi ra thì thêm vòng vàng. */
export const MON_AURA_REAL = { color: 0x4fb8d8, radius: 1.5 };
/** Mặt Âm của boss hai mặt (TN-3): vòng tím sương bám chân tới lúc lật (cờ MF_FACE); mặt Dương không có vòng. */
export const MON_AURA_FACE = { color: 0x8a7ad8, radius: 5.4 };
export const MON_AURA_SENSED = { color: 0xffd36a, radius: 2.6 };

/** Thân quái có bị ẩn không (đang chui đất). */
export function monHidden(mf: number): boolean {
  return (mf & MF_BURROW) !== 0;
}
