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

/**
 * Kẹp độ lệch camera (dẫn trước) để nhân vật luôn nằm trong vùng an toàn giữa màn hình, tránh HUD trái dưới (chat) và phải dưới (thanh chiêu):
 * ngang tối đa ±`ISO_SAFE_X` m, và người không bị đẩy xuống thấp hơn `ISO_SAFE_DOWN` m (trên mặt đất) so với tâm khung.
 * `lx, lz`: độ lệch điểm nhìn so với người (m); `yaw`: hướng camera. Trả độ lệch đã kẹp.
 */
export const ISO_SAFE_X = 4.5;
export const ISO_SAFE_DOWN = 2.2;
export const ISO_SAFE_UP = 4.5;
export function clampLeadSafe(lx: number, lz: number, yaw: number): { x: number; z: number } {
  const s = Math.sin(yaw);
  const c = Math.cos(yaw);
  // trục màn hình trên mặt đất: phải = (cos, −sin), xuống (về phía camera) = (sin, cos)
  let sx = lx * c - lz * s;
  let sy = lx * s + lz * c;
  sx = Math.max(-ISO_SAFE_X, Math.min(ISO_SAFE_X, sx));
  // điểm nhìn dịch ra xa camera (sy < 0) thì người tụt xuống dưới tâm khung
  sy = Math.max(-ISO_SAFE_DOWN, Math.min(ISO_SAFE_UP, sy));
  return { x: sx * c + sy * s, z: -sx * s + sy * c };
}

/** Vùng an toàn của MỤC TIÊU trên màn hình (m trên mặt đất quanh tâm khung): ngang, và không cao hơn `ISO_TGT_UP` (minimap phải trên), không thấp hơn `ISO_TGT_DOWN`. */
export const ISO_TGT_X = 6.5;
export const ISO_TGT_UP = 3.3;
export const ISO_TGT_DOWN = 4;

function fitInterval(want: number, lo: number, hi: number, pLo: number, pHi: number): number {
  // giao của vùng an toàn người chơi [pLo, pHi] và vùng an toàn mục tiêu [lo, hi]; rỗng thì ưu tiên người chơi
  const a = Math.max(pLo, lo);
  const b = Math.min(pHi, hi);
  return a <= b ? Math.max(a, Math.min(b, want)) : Math.max(pLo, Math.min(pHi, want));
}

/**
 * Kẹp độ lệch camera để người chơi VÀ mục tiêu (độ lệch thế giới `tx, tz` so với người) cùng nằm trong vùng an toàn; không thể cả hai thì ưu tiên người chơi.
 * Không có mục tiêu thì như `clampLeadSafe`.
 */
export function clampLeadFrame(lx: number, lz: number, yaw: number, tx?: number, tz?: number): { x: number; z: number } {
  if (tx === undefined || tz === undefined) return clampLeadSafe(lx, lz, yaw);
  const s = Math.sin(yaw);
  const c = Math.cos(yaw);
  const wantR = lx * c - lz * s;
  const wantD = lx * s + lz * c;
  const tR = tx * c - tz * s;
  const tD = tx * s + tz * c;
  // L = vị trí điểm nhìn so với người; người ở (−Lr, −Ld), mục tiêu ở (tR − Lr, tD − Ld) so với tâm khung (D dương = xuống màn hình)
  const lr = fitInterval(wantR, tR - ISO_TGT_X, tR + ISO_TGT_X, -ISO_SAFE_X, ISO_SAFE_X);
  const ld = fitInterval(wantD, tD - ISO_TGT_DOWN, tD + ISO_TGT_UP, -ISO_SAFE_DOWN, ISO_SAFE_UP);
  return { x: lr * c + ld * s, z: -lr * s + ld * c };
}
