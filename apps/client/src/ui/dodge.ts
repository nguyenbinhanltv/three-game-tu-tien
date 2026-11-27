/**
 * Né nhãn tên: thông báo nổi và lời boss nằm ở giữa nửa trên màn hình, đúng chỗ nhãn tên + cấp của mục tiêu đang khóa hay rơi vào
 * (camera chéo cố định, quái đứng phía bắc người chơi). Hàm thuần ở đây tính độ dời để hai lớp chữ không đè nhau; HUD áp bằng thuộc tính
 * CSS `translate` (không đụng `transform` gốc của phần tử).
 */

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Hai hộp có giao nhau không, tính cả khoảng đệm `pad` px quanh `b`. */
export function boxesHit(a: Box, b: Box, pad = 0): boolean {
  return a.x < b.x + b.w + pad && a.x + a.w > b.x - pad && a.y < b.y + b.h + pad && a.y + a.h > b.y - pad;
}

/** Diện tích giao nhau (px²) của hai hộp. */
export function overlapArea(a: Box, b: Box): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

export interface DodgeBounds {
  /** Mép trên thấp nhất được phép (dưới khung mục tiêu / thanh boss). */
  minY: number;
  /** Mép trái và mép phải của vùng được phép (chừa cột bên và bản đồ nhỏ). */
  minX: number;
  maxX: number;
  pad?: number;
}

/**
 * Độ dời (dx, dy) để `box` (ở vị trí GỐC) khỏi đè `avoid`. Thứ tự thử: lên trên nhãn (gần chỗ cũ nhất, không che thân mục tiêu),
 * sang phải, sang trái; hết chỗ mới xuống dưới nhãn. Không đè thì (0, 0).
 */
export function dodgeOffset(box: Box, avoid: Box | null, b: DodgeBounds): { dx: number; dy: number } {
  const pad = b.pad ?? 8;
  if (!avoid || !boxesHit(box, avoid, pad)) return { dx: 0, dy: 0 };
  const up = avoid.y - pad - (box.y + box.h);
  if (box.y + up >= b.minY) return { dx: 0, dy: Math.round(up) };
  const right = avoid.x + avoid.w + pad - box.x;
  if (box.x + right + box.w <= b.maxX) return { dx: Math.round(right), dy: 0 };
  const left = avoid.x - pad - (box.x + box.w);
  if (box.x + left >= b.minX) return { dx: Math.round(left), dy: 0 };
  return { dx: 0, dy: Math.round(avoid.y + avoid.h + pad - box.y) };
}
