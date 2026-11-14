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

/** Độ cao tâm đạn tại (x, z): bám mặt "đứng được" (groundAt đã tính mặt nước hồ). */
export function boltY(x: number, z: number): number {
  return groundAt(x, z) + BOLT_HEIGHT;
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

/** Khoảng cách bình phương từ điểm (cx, cz) tới đoạn AB trên mặt phẳng ngang. */
export function segDist2(ax: number, az: number, bx: number, bz: number, cx: number, cz: number): number {
  const ux = bx - ax;
  const uz = bz - az;
  const L = ux * ux + uz * uz;
  let t = L > 0 ? ((cx - ax) * ux + (cz - az) * uz) / L : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const dx = ax + ux * t - cx;
  const dz = az + uz * t - cz;
  return dx * dx + dz * dz;
}

/**
 * Đạn bán kính `r` quét từ A tới B trong một tick có trúng người chơi đứng ở (px, py, pz) không
 * (py là chân). Quét theo đoạn nên đạn nhanh không xuyên qua người giữa hai tick.
 */
export function boltHits(ax: number, az: number, bx: number, bz: number, r: number, px: number, py: number, pz: number): boolean {
  const by = boltY(bx, bz);
  if (by + r < py || by - r > py + BOLT_BODY_H) return false;
  const rr = r + PLAYER_RADIUS;
  return segDist2(ax, az, bx, bz, px, pz) <= rr * rr;
}

/** Đạn chạm vật cản tĩnh (kiến trúc, cự kiếm Kiếm Trủng) thì vỡ. */
export function boltBlocked(x: number, z: number, r: number): boolean {
  for (const c of COLLIDERS) {
    const dx = x - c.x;
    const dz = z - c.z;
    const rr = c.r + r;
    if (dx * dx + dz * dz < rr * rr) return true;
  }
  return false;
}
