import { BOTTLENECK_LEVELS, bottleneckReady, NGUNG_KHI_MAX } from '@dtl/shared';

/** Phần của nhân vật mà mốc đột phá cần biết (khớp `CharView`). */
export interface BreakChar {
  level: number;
  xp: number;
  xpNeed: number;
  bk: number;
}

export interface BreakGoal {
  /** Mốc kế tiếp: bình cảnh (`bk`), độ kiếp Trúc Cơ (`trib`), hoặc null khi đã qua Ngưng Khí. */
  kind: 'bk' | 'trib' | null;
  /** Tầng của mốc (bình cảnh: 5/10/15; độ kiếp: 15). */
  level: number;
  /** Đã đủ tu vi để đột phá ngay: nút Đột Phá trên HUD sáng lên. Chỉ là gợi ý; server kiểm lại mọi điều kiện. */
  ready: boolean;
}

/**
 * Mốc đột phá kế tiếp cho khung nhân vật: bình cảnh chưa vượt gần nhất từ tầng hiện tại, rồi tới độ kiếp ở tầng 15.
 * `ready` khi đang đứng ở mốc đó với tu vi đã đầy (độ kiếp còn cần Trúc Cơ Đan: bảng Nhân vật báo thiếu).
 */
export function breakGoal(c: BreakChar): BreakGoal {
  if (c.level > NGUNG_KHI_MAX) return { kind: null, level: 0, ready: false };
  const bk = BOTTLENECK_LEVELS.find((b) => b >= c.level && c.bk < b);
  if (bk !== undefined) return { kind: 'bk', level: bk, ready: bottleneckReady(c.level, c.bk, c.xp, c.xpNeed) };
  return { kind: 'trib', level: NGUNG_KHI_MAX, ready: c.level === NGUNG_KHI_MAX && c.xp >= c.xpNeed };
}
