// Hình VÙNG TRÚNG THẬT (Diễn Võ Trường, sân boss), phần thuần: dựng hình từ đúng dữ liệu mà server dùng để phán định.
// - Đòn vùng của quái/boss: tin `S.HAZARD` mang nguyên hình server lưu và kiểm bằng `inHazard` (`packages/shared/src/combat.ts`), nên
//   viền vẽ từ tin đó là vùng thật, không phải ước lượng.
// - Chiêu của người chơi: tin `S.FX` của chiêu vùng mang tâm + bán kính, chiêu đường thẳng mang điểm cuối + dài + rộng (đúng số server
//   dùng trong `resolveSkill`); đòn thường chém quét dùng cung `arc` của hướng tu với hướng người đánh → mục tiêu.
// Không đụng three.js hay DOM (xem `zoneOverlay.ts`).
import type { HazardGeom } from '@dtl/shared';

export type Zone =
  | { kind: 'circle'; x: number; z: number; r: number }
  /** Chữ nhật: gốc (x, z) ở giữa cạnh sau, chạy `len` theo hướng `yaw`, rộng `w`. */
  | { kind: 'rect'; x: number; z: number; yaw: number; len: number; w: number }
  /** Quạt: đỉnh (x, z), bán kính `r`, nửa góc mở `half` (rad) quanh hướng `yaw`. */
  | { kind: 'cone'; x: number; z: number; yaw: number; r: number; half: number };

/** Hình của một vùng báo của server (cùng quy ước với `inHazard`: thiếu `w` thì chữ nhật rộng 1 m, quạt nửa góc 45°). */
export function zoneOfHazard(h: HazardGeom): Zone {
  if (h.sh === 'rect') return { kind: 'rect', x: h.x, z: h.z, yaw: h.yaw ?? 0, len: h.r, w: h.w ?? 1 };
  if (h.sh === 'cone') return { kind: 'cone', x: h.x, z: h.z, yaw: h.yaw ?? 0, r: h.r, half: h.w ?? Math.PI / 4 };
  return { kind: 'circle', x: h.x, z: h.z, r: h.r };
}

/** Chiêu đường thẳng của người chơi: từ chỗ người đánh (ox, oz) tới điểm cuối (ex, ez) của tin FX, rộng `width` (như `inLine`). */
export function zoneOfLine(ox: number, oz: number, ex: number, ez: number, width: number): Zone {
  const dx = ex - ox;
  const dz = ez - oz;
  return { kind: 'rect', x: ox, z: oz, yaw: Math.atan2(dx, dz), len: Math.hypot(dx, dz), w: width };
}

/** Đòn chém quét: cung trước mặt người đứng ở (px, pz) nhìn về (tx, tz), bán kính `r`, góc mở `deg` độ (như `inArc`, chưa cộng thân quái). */
export function zoneOfArc(px: number, pz: number, tx: number, tz: number, r: number, deg: number): Zone {
  if (deg >= 360) return { kind: 'circle', x: px, z: pz, r };
  return { kind: 'cone', x: px, z: pz, yaw: Math.atan2(tx - px, tz - pz), r, half: (Math.max(0, deg) * Math.PI) / 360 };
}

/** Điểm (px, pz) có trong vùng không. Cùng phép với `inHazard` của server. */
export function inZone(zn: Zone, px: number, pz: number): boolean {
  const dx = px - zn.x;
  const dz = pz - zn.z;
  if (zn.kind === 'circle') return dx * dx + dz * dz <= zn.r * zn.r;
  const fx = Math.sin(zn.yaw);
  const fz = Math.cos(zn.yaw);
  const along = dx * fx + dz * fz;
  if (zn.kind === 'rect') return along >= 0 && along <= zn.len && Math.abs(dx * fz - dz * fx) <= zn.w / 2;
  const d2 = dx * dx + dz * dz;
  if (d2 > zn.r * zn.r) return false;
  if (d2 < 1e-6) return true;
  return along >= Math.sqrt(d2) * Math.cos(zn.half);
}

/** Đường viền khép kín của vùng (các điểm [x, z], cách nhau ≤ `step` mét trên cung). */
export function zoneOutline(zn: Zone, step = 0.3): [number, number][] {
  const pts: [number, number][] = [];
  const arc = (a0: number, a1: number, r: number) => {
    const n = Math.max(4, Math.ceil((Math.abs(a1 - a0) * r) / step));
    for (let i = 0; i <= n; i++) {
      const a = a0 + ((a1 - a0) * i) / n;
      pts.push([zn.x + Math.sin(a) * r, zn.z + Math.cos(a) * r]);
    }
  };
  if (zn.kind === 'circle') {
    arc(0, Math.PI * 2, zn.r);
    pts.pop();
  } else if (zn.kind === 'cone') {
    pts.push([zn.x, zn.z]);
    arc(zn.yaw - zn.half, zn.yaw + zn.half, zn.r);
  } else {
    const fx = Math.sin(zn.yaw);
    const fz = Math.cos(zn.yaw);
    const sx = fz * (zn.w / 2);
    const sz = -fx * (zn.w / 2);
    pts.push(
      [zn.x - sx, zn.z - sz],
      [zn.x - sx + fx * zn.len, zn.z - sz + fz * zn.len],
      [zn.x + sx + fx * zn.len, zn.z + sz + fz * zn.len],
      [zn.x + sx, zn.z + sz],
    );
  }
  return pts;
}

/** Diện tích vùng (m²). */
export function zoneArea(zn: Zone): number {
  if (zn.kind === 'circle') return Math.PI * zn.r * zn.r;
  if (zn.kind === 'rect') return zn.len * zn.w;
  return zn.half * zn.r * zn.r;
}

/** Hộp bao theo trục của vùng, nới thêm `pad` mét. */
export function zoneBounds(zn: Zone, pad = 0): { x0: number; z0: number; x1: number; z1: number } {
  let x0 = Infinity;
  let z0 = Infinity;
  let x1 = -Infinity;
  let z1 = -Infinity;
  for (const [x, z] of zoneOutline(zn)) {
    x0 = Math.min(x0, x);
    z0 = Math.min(z0, z);
    x1 = Math.max(x1, x);
    z1 = Math.max(z1, z);
  }
  return { x0: x0 - pad, z0: z0 - pad, x1: x1 + pad, z1: z1 + pad };
}

/** Khoảng cách (m) từ điểm tới vùng: 0 nếu ở trong, không thì khoảng cách tới đường viền. */
export function zoneDistOutside(zn: Zone, px: number, pz: number): number {
  if (inZone(zn, px, pz)) return 0;
  if (zn.kind === 'circle') return Math.hypot(px - zn.x, pz - zn.z) - zn.r;
  const pts = zoneOutline(zn, 0.15);
  let best = Infinity;
  for (let i = 0; i < pts.length; i++) {
    const [ax, az] = pts[i]!;
    const [bx, bz] = pts[(i + 1) % pts.length]!;
    const sx = bx - ax;
    const sz = bz - az;
    const l2 = sx * sx + sz * sz;
    const k = l2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * sx + (pz - az) * sz) / l2)) : 0;
    best = Math.min(best, Math.hypot(px - ax - sx * k, pz - az - sz * k));
  }
  return best;
}
