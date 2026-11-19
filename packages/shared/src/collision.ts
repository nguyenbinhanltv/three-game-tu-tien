// Lõi va chạm 3D nhẹ (COL-1 / C-1), dùng chung client dự đoán + server quyết định. Bổ sung cho vòng tròn `COLLIDERS`:
// - `box`: hộp xoay theo yaw (nhà, tường, cột vuông, bậc thang, bệ, thuyền, xác thú…), cao từ `y0` tới `y1` (độ cao tuyệt đối).
// - `cyl`: trụ tròn (thân cây, cột tròn, tượng, tinh thể…).
// - Mặt đi được (`walk`, mặc định của `box`): đỉnh hộp đứng được nếu cao hơn chân ≤ `STEP_UP`; có độ dốc dọc trục z cục bộ
//   (`y1b`: cao độ đỉnh ở mép +z; dùng cho dốc, cầu, cầu thang mịn). Bước hụt khỏi mép thì rơi (stepMove xử lý).
// - Khối lơ lửng: `y0` > mặt đất (đảo bay): đỉnh đứng được, đáy chặn đầu, đi/ nhảy từ dưới lên không xuyên.
// - Ngự kiếm: `fly: 'block'` (mặc định: kiến trúc, đảo, vách) chặn; `fly: 'pass'` (tán lá, đồ nhỏ) bay xuyên.
// Lưới băm không gian (ô 16 m) để mỗi bước chỉ xét vài hình. Hàm thuần, không phụ thuộc terrain/level.

/** Chiều cao thân người chơi dùng cho va chạm (m). */
export const BODY_H = 1.8;
/** Bước lên được khi đỉnh mặt đi được cao hơn chân tối đa chừng này (m). */
export const STEP_UP = 0.5;
const CELL = 16;
const OFF = 512;

export interface ShapeBase {
  x: number;
  z: number;
  /** Đáy và đỉnh, độ cao tuyệt đối (m). Đảo bay: `y0` là đáy đảo. */
  y0: number;
  y1: number;
  /** Ngự kiếm: 'block' (mặc định) chặn; 'pass' bay xuyên (tán lá, đồ nhỏ). */
  fly?: 'block' | 'pass';
  /** Nhãn gỡ lỗi / báo cáo (vd. id prop, tên kiến trúc). */
  tag?: string;
}

export interface BoxShape extends ShapeBase {
  k: 'box';
  /** Nửa kích thước theo trục cục bộ x, z (m). */
  hx: number;
  hz: number;
  /** Góc quay quanh Y (radian), cùng quy ước Three.js (`rotation.y`). */
  yaw: number;
  /** Đỉnh đứng được (mặc định true). */
  walk?: boolean;
  /** Dốc: cao độ đỉnh ở mép +z cục bộ (mép -z là `y1`). Thiếu = đỉnh phẳng. */
  y1b?: number;
}

export interface CylShape extends ShapeBase {
  k: 'cyl';
  r: number;
}

export type Shape = BoxShape | CylShape;

/** Cao độ đỉnh của hộp tại tọa độ cục bộ `lz` (có dốc thì nội suy). */
function boxTop(b: BoxShape, lz: number): number {
  if (b.y1b === undefined) return b.y1;
  const t = Math.max(0, Math.min(1, (lz + b.hz) / (2 * b.hz)));
  return b.y1 + (b.y1b - b.y1) * t;
}

/** Đỉnh cao nhất của hình (dốc: max hai đầu). */
export function shapeMaxTop(s: Shape): number {
  return s.k === 'box' && s.y1b !== undefined ? Math.max(s.y1, s.y1b) : s.y1;
}

/** Bán kính bao ngoài trên mặt phẳng xz. */
function shapeExtent(s: Shape): number {
  return s.k === 'cyl' ? s.r : Math.hypot(s.hx, s.hz);
}

const cellKey = (cx: number, cz: number): number => (cx + OFF) * 1024 + (cz + OFF);

export interface BodyState {
  x: number;
  y: number;
  z: number;
  flying: boolean;
  /** Đang đứng trên đất: chỉ khi đó mới có bước-lên `STEP_UP` (nhảy không cộng thêm). */
  grounded?: boolean;
}

export class CollisionSet {
  readonly shapes: Shape[] = [];
  /** Bán kính bao (xz) từng hình, song song `shapes`: lọc thô trước khi xét chính xác. */
  private readonly ext: number[] = [];
  private readonly grid = new Map<number, number[]>();
  private mark: Int32Array = new Int32Array(0);
  private stamp = 0;

  get size(): number {
    return this.shapes.length;
  }

  add(list: readonly Shape[]): void {
    for (const s of list) {
      const i = this.shapes.length;
      this.shapes.push(s);
      const e = shapeExtent(s);
      this.ext.push(e);
      const c0 = Math.floor((s.x - e) / CELL);
      const c1 = Math.floor((s.x + e) / CELL);
      const d0 = Math.floor((s.z - e) / CELL);
      const d1 = Math.floor((s.z + e) / CELL);
      for (let cx = c0; cx <= c1; cx++)
        for (let cz = d0; cz <= d1; cz++) {
          const k = cellKey(cx, cz);
          const a = this.grid.get(k);
          if (a) a.push(i);
          else this.grid.set(k, [i]);
        }
    }
    if (this.mark.length < this.shapes.length) this.mark = new Int32Array(this.shapes.length + 256);
  }

  clear(): void {
    this.shapes.length = 0;
    this.ext.length = 0;
    this.grid.clear();
    this.mark.fill(0);
    this.stamp = 0;
  }

  /** Gọi `fn` cho mỗi hình có ô lưới chạm vòng (x, z, r), mỗi hình một lần. (Đường nóng dùng `gather`, không cấp phát closure.) */
  near(x: number, z: number, r: number, fn: (s: Shape) => void): void {
    const n = this.gather(x, z, r);
    const hits = this.buf.slice(0, n);
    for (let i = 0; i < n; i++) fn(hits[i]!);
  }

  /** Mảng dùng lại cho `gather` (đừng giữ tham chiếu qua lần gọi kế). */
  private readonly buf: Shape[] = [];

  /**
   * Gom hình có ô lưới chạm vòng (x, z, r) vào `this.buf` (mỗi hình một lần), trả số hình. Không cấp phát: đường nóng của `stepMove` và quái.
   * Lọc thô theo bán kính bao (`ext`) trước khi trả.
   */
  private gather(x: number, z: number, r: number): number {
    if (!this.shapes.length) return 0;
    // Bộ đếm quấn trong Int32: về 0 thì xóa dấu để không bao giờ trùng giá trị cũ (server chạy nhiều ngày).
    this.stamp = (this.stamp + 1) | 0;
    if (this.stamp === 0) {
      this.mark.fill(0);
      this.stamp = 1;
    }
    const stamp = this.stamp;
    const buf = this.buf;
    let n = 0;
    const c0 = Math.floor((x - r) / CELL);
    const c1 = Math.floor((x + r) / CELL);
    const d0 = Math.floor((z - r) / CELL);
    const d1 = Math.floor((z + r) / CELL);
    for (let cx = c0; cx <= c1; cx++)
      for (let cz = d0; cz <= d1; cz++) {
        const a = this.grid.get(cellKey(cx, cz));
        if (!a) continue;
        for (let k = 0; k < a.length; k++) {
          const i = a[k]!;
          if (this.mark[i] === stamp) continue;
          this.mark[i] = stamp;
          const s = this.shapes[i]!;
          const dx = x - s.x;
          const dz = z - s.z;
          const rr = this.ext[i]! + r;
          if (dx * dx + dz * dz > rr * rr) continue; // ngoài bán kính bao
          buf[n++] = s;
        }
      }
    return n;
  }

  /**
   * Cao độ đứng được lớn nhất của mọi mặt đi được dưới (x, z) mà đỉnh không cao hơn `maxTop` (cao độ chân + `STEP_UP`).
   * Trả `-Infinity` nếu không có. Dùng điểm (không tính bán kính) nên bước ra mép thì rơi.
   */
  standY(x: number, z: number, maxTop: number): number {
    let best = -Infinity;
    const n = this.gather(x, z, 0.01);
    for (let i = 0; i < n; i++) {
      const s = this.buf[i]!;
      if (s.k !== 'box' || s.walk === false) continue;
      const dx = x - s.x;
      const dz = z - s.z;
      const c = Math.cos(s.yaw);
      const sn = Math.sin(s.yaw);
      const lx = c * dx - sn * dz;
      const lz = sn * dx + c * dz;
      if (lx < -s.hx || lx > s.hx || lz < -s.hz || lz > s.hz) continue;
      const top = boxTop(s, lz);
      if (top <= maxTop && top > best) best = top;
    }
    return best;
  }

  /** Đáy thấp nhất của khối nằm ngay trên đầu tại (x, z) (chân `y`): chặn đầu khi nhảy/bay lên (`flying`: bỏ qua hình `fly:'pass'`). `Infinity` nếu trống. */
  ceilingAt(x: number, z: number, y: number, r: number, flying = false): number {
    let best = Infinity;
    const head = y + BODY_H;
    const n = this.gather(x, z, r);
    for (let i = 0; i < n; i++) {
      const s = this.buf[i]!;
      if (s.y0 < head - 1e-3 || s.y0 >= best) continue;
      if (flying && s.fly === 'pass') continue; // ngự kiếm xuyên tán lá cả khi bay thẳng lên (giống `push`)
      if (s.y0 > head + 8) continue;
      if (footprintDist(s, x, z) < r) best = s.y0;
    }
    return best;
  }

  /**
   * Đoạn A→B (bán kính `r`, cao độ `y`) chạm hình rắn đầu tiên ở tham số t ∈ [0, 1] (lấy mẫu 0,6 m); -1 nếu không chạm.
   * Dùng cho đạn: hình `fly:'pass'` (tán lá) không chặn; hình phải có khoảng cao [y0 − r, đỉnh + r] chứa `y`.
   */
  segmentBlockedAt(ax: number, az: number, bx: number, bz: number, r: number, y: number): number {
    if (!this.shapes.length) return -1;
    const len = Math.hypot(bx - ax, bz - az);
    const m = this.gather((ax + bx) / 2, (az + bz) / 2, len / 2 + r);
    const cands: Shape[] = [];
    for (let i = 0; i < m; i++) {
      const s = this.buf[i]!;
      if (s.fly === 'pass' || y < s.y0 - r || y > shapeMaxTop(s) + r) continue;
      cands.push(s);
    }
    if (!cands.length) return -1;
    const n = Math.max(1, Math.ceil(len / 0.6));
    for (let k = 0; k <= n; k++) {
      const x = ax + ((bx - ax) * k) / n;
      const z = az + ((bz - az) * k) / n;
      for (let i = 0; i < cands.length; i++) if (footprintDist(cands[i]!, x, z) < r) return k / n;
    }
    return -1;
  }

  /**
   * Đẩy thân trụ bán kính `r` tại `p` ra khỏi mọi hình chặn theo độ cao hiện tại; sửa `p.x/z`. Trả true nếu có đẩy.
   * Hình không chặn khi: mặt đi được và chân đã ≥ đỉnh − STEP_UP (leo lên được, không khi ngự kiếm), ngự kiếm qua `fly:'pass'`,
   * hoặc khoảng [y, y + BODY_H] không giao [y0, y1].
   */
  push(p: BodyState, r: number): boolean {
    let moved = false;
    for (let it = 0; it < 2; it++) {
      let any = false;
      const n = this.gather(p.x, p.z, r);
      for (let i = 0; i < n; i++) {
        const s = this.buf[i]!;
        if (p.flying && s.fly === 'pass') continue;
        const y = p.y;
        if (y + BODY_H <= s.y0 || y >= shapeMaxTop(s)) continue;
        if (s.k === 'cyl') {
          const dx = p.x - s.x;
          const dz = p.z - s.z;
          const rr = s.r + r;
          const d2 = dx * dx + dz * dz;
          if (d2 >= rr * rr) continue;
          if (d2 < 1e-8) {
            p.x = s.x + rr;
          } else {
            const d = Math.sqrt(d2);
            p.x = s.x + (dx / d) * rr;
            p.z = s.z + (dz / d) * rr;
          }
          any = true;
          continue;
        }
        const dx = p.x - s.x;
        const dz = p.z - s.z;
        const c = Math.cos(s.yaw);
        const sn = Math.sin(s.yaw);
        const lx = c * dx - sn * dz;
        const lz = sn * dx + c * dz;
        const qx = lx < -s.hx ? -s.hx : lx > s.hx ? s.hx : lx;
        const qz = lz < -s.hz ? -s.hz : lz > s.hz ? s.hz : lz;
        let nx = lx - qx;
        let nz = lz - qz;
        const d2 = nx * nx + nz * nz;
        if (d2 >= r * r) continue;
        // Leo lên được: đỉnh tại điểm gần nhất không cao hơn chân quá STEP_UP.
        if (!p.flying && s.walk !== false && y >= boxTop(s, qz) - (p.grounded ? STEP_UP : 0) - 1e-3) continue;
        let px: number;
        let pz: number;
        if (d2 > 1e-10) {
          const d = Math.sqrt(d2);
          nx /= d;
          nz /= d;
          px = qx + nx * r - lx;
          pz = qz + nz * r - lz;
        } else {
          // Tâm nằm trong hộp: đẩy ra mặt gần nhất.
          const ox = s.hx - Math.abs(lx);
          const oz = s.hz - Math.abs(lz);
          if (ox < oz) {
            px = (lx >= 0 ? 1 : -1) * (ox + r);
            pz = 0;
          } else {
            px = 0;
            pz = (lz >= 0 ? 1 : -1) * (oz + r);
          }
        }
        p.x += c * px + sn * pz;
        p.z += -sn * px + c * pz;
        any = true;
      }
      if (!any) break;
      moved = true;
    }
    return moved;
  }
}

/** Khoảng cách từ (x, z) tới hình trên mặt phẳng xz (0 nếu trong hình). */
export function footprintDist(s: Shape, x: number, z: number): number {
  const dx = x - s.x;
  const dz = z - s.z;
  if (s.k === 'cyl') return Math.max(0, Math.hypot(dx, dz) - s.r);
  const c = Math.cos(s.yaw);
  const sn = Math.sin(s.yaw);
  const lx = c * dx - sn * dz;
  const lz = sn * dx + c * dz;
  const ex = Math.max(0, Math.abs(lx) - s.hx);
  const ez = Math.max(0, Math.abs(lz) - s.hz);
  return Math.hypot(ex, ez);
}

/** Điểm (x, z, y) có nằm trong khối của hình không (dùng báo cáo phủ va chạm). */
export function shapeCovers(s: Shape, x: number, z: number, margin = 0): boolean {
  return footprintDist(s, x, z) <= margin;
}

// ---- Registry theo level (C-2): mỗi `levelId` một bộ hình, KHÔNG theo địa hình (Kiếm Trủng, Phục Mạch… dùng chung địa hình Vân Lam nhưng bố cục khác).
const REG = new Map<string, CollisionSet>();

/** Bộ hình va chạm của level (tạo rỗng nếu chưa đăng ký). Client và server cùng truyền vào `MoveCtx.collision`. */
export function collisionOf(level: string | { id: string }): CollisionSet {
  const id = typeof level === 'string' ? level : level.id;
  let c = REG.get(id);
  if (!c) REG.set(id, (c = new CollisionSet()));
  return c;
}

/** Thêm hình va chạm cho level (gọi ở nơi nạp dữ liệu, cùng dữ liệu trên client và server). */
export function registerCollision(level: string | { id: string }, shapes: readonly Shape[]): void {
  collisionOf(level).add(shapes);
}

// ---- Collider cục bộ theo asset (C-2): hình trong hệ tọa độ của asset (gốc ở chân, mặt trước +Z, y từ chân), áp lên từng instance ----

export type LocalShape =
  | {
      k: 'box';
      x: number;
      z: number;
      hx: number;
      hz: number;
      y0: number;
      y1: number;
      yaw?: number;
      walk?: boolean;
      y1b?: number;
      fly?: 'block' | 'pass';
    }
  | { k: 'cyl'; x: number; z: number; r: number; y0: number; y1: number; fly?: 'block' | 'pass' };

/** Vị trí đặt một instance: (x, z) và cao độ chân `y`, quay `yaw` quanh Y (rad, Three.js), tỉ lệ đều `s`, tỉ lệ cao thêm `sy` (cây). */
export interface Placement {
  x: number;
  y: number;
  z: number;
  yaw: number;
  s: number;
  sy?: number;
  /** Nghiêng quanh trục ngang cục bộ x sau `yaw` (rad; cột đổ, tượng nghiêng). ≥ `LEAN_MIN` thì thân đổi thành hộp nằm dọc hướng đổ. */
  lean?: number;
}

/** Từ góc nghiêng này trở lên hình đứng không còn đúng: thay bằng hộp nằm (cột đổ). */
export const LEAN_MIN = 0.35;

/**
 * Áp một bộ hình cục bộ lên một instance → hình thế giới. Quy ước quay giống `CollisionSet` (world = R(yaw)·local):
 * (lx, lz) → (lx·cos + lz·sin, −lx·sin + lz·cos). Cao độ nhân `s·sy`.
 */
export function instantiateShapes(local: readonly LocalShape[], p: Placement, out: Shape[] = [], tag?: string): Shape[] {
  const c = Math.cos(p.yaw);
  const sn = Math.sin(p.yaw);
  const sy = p.s * (p.sy ?? 1);
  const lean = p.lean && Math.abs(p.lean) >= LEAN_MIN ? Math.abs(p.lean) : 0;
  for (const l of local) {
    if (lean) {
      // Thân nghiêng: gốc ở chân, đầu trên đổ về +z cục bộ (sau yaw). Hộp nằm: dài L·sin(lean) + 2r dọc hướng đổ, rộng 2r, cao L·cos(lean) + 2r.
      const r = (l.k === 'cyl' ? l.r : Math.max(l.hx, l.hz)) * p.s;
      const len = (l.y1 - l.y0) * sy;
      const run = len * Math.sin(lean);
      const sgn = (p.lean ?? 0) < 0 ? -1 : 1;
      const lx = l.x * p.s;
      const lz = l.z * p.s + (sgn * run) / 2;
      out.push({
        k: 'box',
        x: p.x + lx * c + lz * sn,
        z: p.z + -lx * sn + lz * c,
        hx: r,
        hz: run / 2 + r,
        yaw: p.yaw,
        y0: p.y + l.y0 * sy,
        y1: p.y + l.y0 * sy + len * Math.cos(lean) + 2 * r,
        walk: false,
        fly: l.fly,
        tag,
      });
      continue;
    }
    const x = p.x + (l.x * c + l.z * sn) * p.s;
    const z = p.z + (-l.x * sn + l.z * c) * p.s;
    const y0 = p.y + l.y0 * sy;
    const y1 = p.y + l.y1 * sy;
    if (l.k === 'cyl') out.push({ k: 'cyl', x, z, r: l.r * p.s, y0, y1, fly: l.fly, tag });
    else
      out.push({
        k: 'box',
        x,
        z,
        hx: l.hx * p.s,
        hz: l.hz * p.s,
        yaw: p.yaw + (l.yaw ?? 0),
        y0,
        y1,
        walk: l.walk,
        y1b: l.y1b === undefined ? undefined : p.y + l.y1b * sy,
        fly: l.fly,
        tag,
      });
  }
  return out;
}

const _slide: BodyState = { x: 0, y: 0, z: 0, flying: false, grounded: true };
/**
 * Quái/thực thể đi bộ: đẩy (x, z) ra khỏi hình rắn theo cao độ chân `y` (trượt dọc hình, không pathfinding). Sửa `p`, trả true nếu có đẩy.
 * Hình thấp (≤ `STEP_UP`) bước qua được như người chơi.
 */
export function slideOut(set: CollisionSet, p: { x: number; z: number }, y: number, r: number): boolean {
  if (!set.size) return false;
  _slide.x = p.x;
  _slide.z = p.z;
  _slide.y = y;
  const moved = set.push(_slide, r);
  if (moved) {
    p.x = _slide.x;
    p.z = _slide.z;
  }
  return moved;
}

/** (x, z) có nằm trong hình rắn (tính bán kính `r`) ở độ cao chân `y` không: đặt chỗ quái/điểm hồi sinh. */
export function blockedAt(set: CollisionSet, x: number, z: number, y: number, r: number): boolean {
  if (!set.size) return false;
  let hit = false;
  set.near(x, z, r, (s) => {
    if (hit || y + BODY_H <= s.y0 || y >= shapeMaxTop(s) - STEP_UP) return;
    if (footprintDist(s, x, z) < r) hit = true;
  });
  return hit;
}
