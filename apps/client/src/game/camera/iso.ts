/**
 * Thiên Nhãn P0: camera chéo khóa góc (`?cam=iso`). Toàn hàm thuần, không đụng Three.js để test được.
 * Camera phối cảnh FOV hẹp, nghiêng cố định, hướng cố định theo bản đồ, khoảng cách cố định, không xoay, không zoom.
 */

/** Quy ước như camera cũ: camera nằm ở (target + (sin yaw, cos yaw) · khoảng cách ngang). */
export const ISO_FOV = 32;
export const ISO_PITCH = (52 * Math.PI) / 180;
/** Khoảng cách cố định camera→điểm nhìn (m). Khóa cả góc lẫn khoảng cách: không zoom. */
export const ISO_DIST = 20;
export const ISO_FAR = 250;
/** Hướng nhìn mặc định (rad). 45° chéo: bản đồ nào cần hướng khác thì thêm vào `ISO_YAW`. */
export const ISO_YAW_DEFAULT = Math.PI * 0.25;
export const ISO_YAW: Readonly<Record<string, number>> = {};
/** Dẫn trước tối đa (m) theo con trỏ, tính trên mặt đất, và hệ số theo khoảng cách con trỏ tới nhân vật. */
export const ISO_LEAD_MAX = 3.2;
export const ISO_LEAD_K = 0.22;
/** Tới đích (m) thì dừng đi chuột phải. */
export const ISO_ARRIVE = 0.45;

export function isoYawFor(level: string): number {
  return ISO_YAW[level] ?? ISO_YAW_DEFAULT;
}

export interface IsoPose {
  x: number;
  y: number;
  z: number;
}

/** Vị trí camera nhìn vào (tx, ty, tz) từ khoảng cách `dist`. */
export function isoCameraPos(tx: number, ty: number, tz: number, dist: number, yaw: number, pitch = ISO_PITCH): IsoPose {
  const cp = Math.cos(pitch);
  return { x: tx + Math.sin(yaw) * cp * dist, y: ty + Math.sin(pitch) * dist, z: tz + Math.cos(yaw) * cp * dist };
}

/** Dẫn trước: dịch điểm nhìn về phía con trỏ (dx, dz = con trỏ trên đất − nhân vật). */
export function isoLead(dx: number, dz: number): { x: number; z: number } {
  const d = Math.hypot(dx, dz);
  if (d < 1e-4) return { x: 0, z: 0 };
  const m = Math.min(ISO_LEAD_MAX, d * ISO_LEAD_K);
  return { x: (dx / d) * m, z: (dz / d) * m };
}

/**
 * Giao tia (gốc o, hướng d) với mặt đất `ground(x, z)`: bước thô rồi chia đôi. Trả null khi tia không chạm trong `maxT`.
 */
export function rayGround(
  o: { x: number; y: number; z: number },
  d: { x: number; y: number; z: number },
  ground: (x: number, z: number) => number,
  maxT = 400,
): { x: number; y: number; z: number } | null {
  if (d.y >= -1e-4) return null;
  const f = (t: number) => o.y + d.y * t - ground(o.x + d.x * t, o.z + d.z * t);
  let a = 0;
  let b = 0;
  const step = 2;
  let fa = f(0);
  if (fa <= 0) return { x: o.x, y: ground(o.x, o.z), z: o.z };
  for (let t = step; t <= maxT; t += step) {
    if (f(t) <= 0) {
      b = t;
      break;
    }
    a = t;
  }
  if (b === 0) return null;
  for (let i = 0; i < 12; i++) {
    const m = (a + b) / 2;
    if (f(m) > 0) a = m;
    else b = m;
  }
  fa = (a + b) / 2;
  const x = o.x + d.x * fa;
  const z = o.z + d.z * fa;
  return { x, y: ground(x, z), z };
}

/**
 * Hướng đi thế giới (dx, dz) → ý định (mx, mz) cùng quy ước `stepMove` ở `yaw` của camera:
 * dirX = −sin·mz + cos·mx, dirZ = −cos·mz − sin·mx (nghịch đảo phép quay).
 */
export function worldToIntent(dx: number, dz: number, yaw: number): { mx: number; mz: number } {
  const len = Math.hypot(dx, dz);
  if (len < 1e-6) return { mx: 0, mz: 0 };
  const nx = dx / len;
  const nz = dz / len;
  const s = Math.sin(yaw);
  const c = Math.cos(yaw);
  return { mx: c * nx - s * nz, mz: -(s * nx + c * nz) };
}

export { nearestTo } from '@dtl/shared';

/** Dẫn về phía mục tiêu đang chọn (dx, dz = mục tiêu − nhân vật): kéo camera tới 50% khoảng cách (điểm giữa người và mục tiêu), tối đa 9 m, để cả hai nằm trong khung. */
export function isoLeadTarget(dx: number, dz: number): { x: number; z: number } {
  const d = Math.hypot(dx, dz);
  if (d < 1e-4) return { x: 0, z: 0 };
  const m = Math.min(9, d * 0.5);
  return { x: (dx / d) * m, z: (dz / d) * m };
}
