// Luật chiến đấu dùng chung: phân cấp đòn và hình vùng báo trước.
// Server dùng để phán định; client chỉ dùng để vẽ cho khớp.

/** Hệ số chiêu từ mức này trở lên tính là đòn nặng. */
export const HEAVY_POWER = 2;

export function isHeavyHit(power: number): boolean {
  return power >= HEAVY_POWER;
}

export type HazardShape = 'circle' | 'rect' | 'cone';

/** Vùng báo trước: xem `HazardMsg` trong protocol.ts cho ý nghĩa từng trường. */
export interface HazardGeom {
  x: number;
  z: number;
  r: number;
  sh?: 'rect' | 'cone';
  yaw?: number;
  w?: number;
}

/** Điểm (px, pz) có nằm trong vùng không. Hướng `yaw` theo quy ước atan2(dx, dz): yaw 0 nhìn về +z. */
export function inHazard(h: HazardGeom, px: number, pz: number): boolean {
  const dx = px - h.x;
  const dz = pz - h.z;
  if (!h.sh) return dx * dx + dz * dz <= h.r * h.r;
  const yaw = h.yaw ?? 0;
  const fx = Math.sin(yaw);
  const fz = Math.cos(yaw);
  const along = dx * fx + dz * fz;
  if (h.sh === 'rect') {
    if (along < 0 || along > h.r) return false;
    const side = dx * fz - dz * fx;
    return Math.abs(side) <= (h.w ?? 1) / 2;
  }
  const d2 = dx * dx + dz * dz;
  if (d2 > h.r * h.r) return false;
  if (d2 < 1e-6) return true;
  return along >= Math.sqrt(d2) * Math.cos(h.w ?? Math.PI / 4);
}
