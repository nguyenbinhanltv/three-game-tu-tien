/**
 * Hình học cụm nút cảm ứng (U2-6), hàm thuần để test. Mọi số đo tính bằng px CSS thật (chế độ cảm ứng dùng `--ui-scale` = 1 nên
 * không có vùng thiết kế riêng), từ TÂM nút đánh lớn: dx âm = sang trái, dy âm = lên trên. Mọi nút ≥ `MIN_TOUCH` (44 px).
 */
import { MIN_TOUCH } from '../../../input/touchMode';

export interface TPos {
  dx: number;
  dy: number;
  d: number;
}

export const TG = {
  main: 84,
  slot: 48,
  quick: 48,
  gap: 8,
  innerR: 140,
  outerR: 198,
  /** Lề từ mép màn hình tới nút đánh lớn (cộng thêm safe-area bằng CSS). */
  inset: 10,
} as const;

const at = (r: number, deg: number, d: number): TPos => {
  const a = (deg * Math.PI) / 180;
  return { dx: r * Math.cos(a), dy: r * Math.sin(a), d };
};

export interface TouchCluster {
  main: TPos;
  /** Chiêu 2–5 (phím 2–5): cung trong. */
  inner: TPos[];
  /** Chiêu 6–10: cung ngoài. */
  outer: TPos[];
  /** Hàng dưới: Lướt, Nhảy, Ngự kiếm, Đả tọa, Tương tác, Đổi mục tiêu. */
  quick: TPos[];
}

export const INNER_N = 4;
export const OUTER_N = 5;
export const QUICK_N = 6;

/** Màn hẹp (điện thoại cầm dọc): hàng nút phụ co lại 44 px, khoảng cách 4 px để cả 6 nút nằm trong bề rộng ~390 px. */
export const COMPACT_W = 460;

export function touchCluster(compact = false): TouchCluster {
  const qd = compact ? 44 : TG.quick;
  const qg = compact ? 4 : TG.gap;
  const main: TPos = { dx: 0, dy: 0, d: TG.main };
  const inner = Array.from({ length: INNER_N }, (_, i) => at(TG.innerR, 205 + (i * 65) / (INNER_N - 1), TG.slot));
  const outer = Array.from({ length: OUTER_N }, (_, i) => at(TG.outerR, 195 + (i * 80) / (OUTER_N - 1), TG.slot));
  const x0 = -(TG.main / 2 + qg + qd / 2);
  const quick = Array.from({ length: QUICK_N }, (_, i) => ({ dx: x0 - i * (qd + qg), dy: 0, d: qd }));
  return { main, inner, outer, quick };
}

/** Hai nút tròn (ô vuông ngoại tiếp) có chạm nhau không. */
export function tposTouch(a: TPos, b: TPos, gap = 0): boolean {
  return Math.hypot(a.dx - b.dx, a.dy - b.dy) < (a.d + b.d) / 2 + gap;
}

export const allTPos = (c: TouchCluster): TPos[] => [c.main, ...c.inner, ...c.outer, ...c.quick];

/** Bề rộng/cao cụm tính từ tâm nút lớn (để biết cần chừa bao nhiêu chỗ). */
export function clusterReach(c: TouchCluster): { left: number; up: number } {
  const all = allTPos(c);
  return {
    left: Math.max(...all.map((p) => -p.dx + p.d / 2)),
    up: Math.max(...all.map((p) => -p.dy + p.d / 2)),
  };
}

export { MIN_TOUCH };
