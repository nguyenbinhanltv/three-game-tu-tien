/**
 * Trần độ dốc ĐI BỘ (quy tắc thiết kế bản đồ Chân Cảnh, áp cho mọi bản đồ): không có lối đi/đường chính nào buộc người chơi leo dốc gắt.
 * Dốc hơn thì làm đường vòng thoải (điểm quặt), bậc thang hoặc bỏ lối. Đây là chuẩn kiểm khi dựng level (test quét heightmap), KHÔNG chặn di chuyển lúc chơi
 * (chặn leo lúc chơi chỉ có ở level đảo/hẻm, xem `MAX_SLOPE_UP` trong movement.ts).
 */
export const WALK_MAX_SLOPE_DEG = 30;
/** Độ dốc tối đa (m cao / m ngang) tương ứng `WALK_MAX_SLOPE_DEG`. */
export const WALK_MAX_SLOPE = Math.tan((WALK_MAX_SLOPE_DEG * Math.PI) / 180);

export function slopeDeg(slope: number): number {
  return (Math.atan(Math.abs(slope)) * 180) / Math.PI;
}

/** Độ dốc lớn nhất (m cao / m ngang) dọc đường gấp khúc `pts` (tọa độ thế giới), lấy mẫu mỗi `step` m. Trả cả điểm gắt nhất để báo lỗi. */
export function maxPathSlope(
  groundAt: (x: number, z: number) => number,
  pts: readonly (readonly [number, number])[],
  step = 0.5,
): { slope: number; x: number; z: number } {
  let best = { slope: 0, x: pts[0]?.[0] ?? 0, z: pts[0]?.[1] ?? 0 };
  for (let i = 0; i + 1 < pts.length; i++) {
    const [ax, az] = pts[i]!;
    const [bx, bz] = pts[i + 1]!;
    const len = Math.hypot(bx - ax, bz - az);
    const n = Math.max(1, Math.ceil(len / step));
    let px = ax;
    let pz = az;
    for (let k = 1; k <= n; k++) {
      const x = ax + ((bx - ax) * k) / n;
      const z = az + ((bz - az) * k) / n;
      const s = Math.abs(groundAt(x, z) - groundAt(px, pz)) / (len / n);
      if (s > best.slope) best = { slope: s, x: px, z: pz };
      px = x;
      pz = z;
    }
  }
  return best;
}

/**
 * Có đường đi bộ từ `from` tới `to` mà mọi bước (lưới `cell` m, 8 hướng, mẫu mịn dọc cạnh) dốc ≤ `maxSlope` và không vào `blocked` không?
 * Dùng trong test để bảo đảm điểm nhấn của bản đồ tới được không phải leo dốc gắt. Trả độ dài đường (m) hoặc null.
 */
export function walkableRouteLength(
  groundAt: (x: number, z: number) => number,
  from: readonly [number, number],
  to: readonly [number, number],
  opts: {
    box: { x0: number; z0: number; x1: number; z1: number };
    cell?: number;
    maxSlope?: number;
    blocked?: (x: number, z: number) => boolean;
  },
): number | null {
  const cell = opts.cell ?? 2;
  const cap = opts.maxSlope ?? WALK_MAX_SLOPE;
  const { x0, z0, x1, z1 } = opts.box;
  const nx = Math.floor((x1 - x0) / cell) + 1;
  const nz = Math.floor((z1 - z0) / cell) + 1;
  const at = (i: number, j: number): [number, number] => [x0 + i * cell, z0 + j * cell];
  const clamp = (v: number, n: number) => Math.min(n - 1, Math.max(0, v));
  const si = clamp(Math.round((from[0] - x0) / cell), nx);
  const sj = clamp(Math.round((from[1] - z0) / cell), nz);
  const gi = clamp(Math.round((to[0] - x0) / cell), nx);
  const gj = clamp(Math.round((to[1] - z0) / cell), nz);
  const dist = new Float64Array(nx * nz).fill(Infinity);
  dist[sj * nx + si] = 0;
  // Dijkstra với heap nhị phân đơn giản.
  const heap: [number, number][] = [[0, sj * nx + si]];
  const push = (e: [number, number]) => {
    heap.push(e);
    let c = heap.length - 1;
    while (c > 0) {
      const p = (c - 1) >> 1;
      if (heap[p]![0] <= heap[c]![0]) break;
      [heap[p], heap[c]] = [heap[c]!, heap[p]!];
      c = p;
    }
  };
  const pop = (): [number, number] => {
    const top = heap[0]!;
    const last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      let c = 0;
      for (;;) {
        const l = c * 2 + 1;
        const r = l + 1;
        let m = c;
        if (l < heap.length && heap[l]![0] < heap[m]![0]) m = l;
        if (r < heap.length && heap[r]![0] < heap[m]![0]) m = r;
        if (m === c) break;
        [heap[m], heap[c]] = [heap[c]!, heap[m]!];
        c = m;
      }
    }
    return top;
  };
  while (heap.length) {
    const [d, c] = pop();
    if (d > dist[c]!) continue;
    if (c === gj * nx + gi) return d;
    const ci = c % nx;
    const cj = (c / nx) | 0;
    const [ax, az] = at(ci, cj);
    for (let di = -1; di <= 1; di++)
      for (let dj = -1; dj <= 1; dj++) {
        if (!di && !dj) continue;
        const ni = ci + di;
        const nj = cj + dj;
        if (ni < 0 || nj < 0 || ni >= nx || nj >= nz) continue;
        const [bx, bz] = at(ni, nj);
        if (opts.blocked?.(bx, bz)) continue;
        const len = Math.hypot(di, dj) * cell;
        let ok = true;
        const sub = 4;
        let pg = groundAt(ax, az);
        for (let k = 1; k <= sub && ok; k++) {
          const g = groundAt(ax + ((bx - ax) * k) / sub, az + ((bz - az) * k) / sub);
          if (Math.abs(g - pg) / (len / sub) > cap) ok = false;
          pg = g;
        }
        if (!ok) continue;
        const nd = d + len;
        const ni2 = nj * nx + ni;
        if (nd < dist[ni2]!) {
          dist[ni2] = nd;
          push([nd, ni2]);
        }
      }
  }
  return null;
}
