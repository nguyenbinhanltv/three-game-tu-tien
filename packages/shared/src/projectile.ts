// Đạn đánh xa của quái (D1): bay thẳng, chậm, nhìn thấy được, né bằng di chuyển.
// Server mô phỏng và phán định trúng theo vị trí người chơi do server giữ; client chỉ nội suy
// bằng cùng công thức dưới đây từ gói spawn (gốc, hướng, tốc độ, thời điểm phát).

import { COLLIDERS } from './level';
import { PLAYER_RADIUS } from './movement';
import { groundAt } from './terrain';

/** Đạn bay cách mặt đất (hoặc mặt nước) chừng này mét, ngang ngực người. */
export const BOLT_HEIGHT = 1.1;
/** Chiều cao thân người chơi dùng để phán định trúng theo trục đứng (mét, tính từ chân). */
export const BOLT_BODY_H = 1.8;
/** Tối đa số đạn đang bay trong một room; vượt thì quái không bắn thêm (chặn phình bộ nhớ/băng thông). */
export const BOLT_MAX_LIVE = 64;
/** Đạn sống tối đa (giây) dù dữ liệu ghi gì. */
export const BOLT_MAX_LIFE = 4;

/** Đạn được nâng tối đa chừng này mét theo độ cao mục tiêu lúc bắn (vùng nổ trúng người bay tới 8 m). */
export const BOLT_MAX_LIFT = 6.5;

/**
 * Độ nâng của đạn: mục tiêu đứng cao hơn mặt đất bao nhiêu lúc bắn (ngự kiếm, nhảy) thì đạn bay cao
 * chừng đó, kẹp trong [0, BOLT_MAX_LIFT]. Bay lơ lửng không né được; đổi độ cao/bước ngang thì né được.
 */
export function boltLift(targetY: number, groundY: number): number {
  const h = targetY - groundY;
  return h > 0 ? Math.min(h, BOLT_MAX_LIFT) : 0;
}

/** Độ cao tâm đạn tại (x, z) với độ nâng `lift`: bám mặt "đứng được" (groundAt đã tính mặt nước hồ). */
export function boltY(x: number, z: number, lift = 0): number {
  return groundAt(x, z) + BOLT_HEIGHT + lift;
}

/** Vị trí ngang của đạn sau `t` giây (bay thẳng theo `yaw`, quy ước yaw = atan2(dx, dz)). */
export function boltXZ(x0: number, z0: number, yaw: number, v: number, t: number, out: { x: number; z: number }): { x: number; z: number } {
  out.x = x0 + Math.sin(yaw) * v * t;
  out.z = z0 + Math.cos(yaw) * v * t;
  return out;
}

/** Hướng của `n` viên trong một loạt, tỏa đều quanh `yaw` với tổng góc `spread` (radian). */
export function boltYaws(yaw: number, n: number, spread: number): number[] {
  if (n <= 1) return [yaw];
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(yaw - spread / 2 + (spread * i) / (n - 1));
  return out;
}

/** Tham số t ∈ [0, 1] của điểm trên đoạn AB gần (cx, cz) nhất (mặt phẳng ngang). */
export function segParam(ax: number, az: number, bx: number, bz: number, cx: number, cz: number): number {
  const ux = bx - ax;
  const uz = bz - az;
  const L = ux * ux + uz * uz;
  const t = L > 0 ? ((cx - ax) * ux + (cz - az) * uz) / L : 0;
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

/** Khoảng cách bình phương từ điểm (cx, cz) tới đoạn AB trên mặt phẳng ngang. */
export function segDist2(ax: number, az: number, bx: number, bz: number, cx: number, cz: number): number {
  const t = segParam(ax, az, bx, bz, cx, cz);
  const dx = ax + (bx - ax) * t - cx;
  const dz = az + (bz - az) * t - cz;
  return dx * dx + dz * dz;
}

/**
 * Đạn bán kính `r`, độ nâng `lift`, quét từ A tới B trong một tick có trúng người chơi đứng ở (px, py, pz)
 * không (py là chân). Quét theo đoạn nên đạn nhanh không xuyên qua người giữa hai tick; trục đứng xét
 * tại điểm trên đoạn gần người nhất.
 */
export function boltHits(ax: number, az: number, bx: number, bz: number, r: number, lift: number, px: number, py: number, pz: number): boolean {
  const t = segParam(ax, az, bx, bz, px, pz);
  const qx = ax + (bx - ax) * t;
  const qz = az + (bz - az) * t;
  const dx = qx - px;
  const dz = qz - pz;
  const rr = r + PLAYER_RADIUS;
  if (dx * dx + dz * dz > rr * rr) return false;
  const by = boltY(qx, qz, lift);
  return !(by + r < py || by - r > py + BOLT_BODY_H);
}

/**
 * Đạn quét từ A tới B chạm vật cản tĩnh (kiến trúc, cự kiếm Kiếm Trủng) đầu tiên ở tham số t ∈ [0, 1]
 * nào; -1 nếu không chạm. Xét cả đoạn nên tick dài cũng không xuyên tường.
 */
export function boltBlockedAt(ax: number, az: number, bx: number, bz: number, r: number): number {
  const ux = bx - ax;
  const uz = bz - az;
  const a = ux * ux + uz * uz;
  let best = -1;
  for (const c of COLLIDERS) {
    const fx = ax - c.x;
    const fz = az - c.z;
    const rr = c.r + r;
    const cc = fx * fx + fz * fz - rr * rr;
    if (cc <= 0) return 0; // đã ở trong vật cản
    if (a <= 0) continue;
    const b = 2 * (fx * ux + fz * uz);
    const disc = b * b - 4 * a * cc;
    if (disc < 0) continue;
    const t = (-b - Math.sqrt(disc)) / (2 * a);
    if (t >= 0 && t <= 1 && (best < 0 || t < best)) best = t;
  }
  return best;
}

/** Điểm (x, z) đang nằm trong vật cản tĩnh (đầu nòng mọc trong tường). */
export function boltBlocked(x: number, z: number, r: number): boolean {
  return boltBlockedAt(x, z, x, z, r) === 0;
}
