// Thanh máu boss nhiều lớp (Chân Cảnh U3): hàm thuần, chỉ để hiển thị từ máu/máu tối đa server gửi (không quyết định gì).

import { bossPhaseAt } from '@dtl/shared';

/** Mỗi lớp ứng khoảng 12.000 máu, từ 1 đến 6 lớp: boss nhỏ vẫn là một thanh. */
const LAYER_HP = 12000;
export const BOSS_LAYERS_MAX = 6;
/** Số màu lớp quay vòng (khớp `data-layer` ở hud.css). */
export const BOSS_LAYER_COLORS = 5;

export interface BossLayers {
  /** Tổng số lớp. */
  n: number;
  /** Lớp đang đánh, 0 = lớp cuối cùng (sắp chết), n-1 = lớp trên cùng. */
  cur: number;
  /** Phần còn lại của lớp đang đánh, 0..1. */
  frac: number;
}

export function bossLayers(hp: number, mhp: number): BossLayers {
  const n = Math.max(1, Math.min(BOSS_LAYERS_MAX, Math.round(mhp / LAYER_HP)));
  if (!(mhp > 0) || hp <= 0) return { n, cur: 0, frac: 0 };
  const x = Math.min(1, hp / mhp) * n; // 0..n
  const cur = Math.min(n - 1, Math.ceil(x) - 1);
  return { n, cur, frac: Math.max(0, Math.min(1, x - cur)) };
}

/** Màu lớp theo thứ tự từ trên xuống (lớp trên cùng = màu 0). */
export function layerColor(layer: BossLayers, k = layer.cur): number {
  return (layer.n - 1 - k) % BOSS_LAYER_COLORS;
}

/** Pha hiện tại (1…) theo các ngưỡng máu chuyển pha `marks` (0–1, giảm dần); `max` là số pha. */
export function bossPhase(hp: number, mhp: number, marks: readonly number[] | undefined): { n: number; max: number } | null {
  if (!marks?.length || !(mhp > 0)) return null;
  // Quy tắc pha dùng chung với server (`bossPhaseAt`, chuyển pha khi máu ≤ ngưỡng): không chép lại ở client.
  return {
    n:
      1 +
      bossPhaseAt(
        hp / mhp,
        marks.map((m) => ({ hp: m })),
      ),
    max: marks.length + 1,
  };
}
