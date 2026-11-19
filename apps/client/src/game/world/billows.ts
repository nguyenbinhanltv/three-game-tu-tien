import { hash01, type BridgeDef, type IslandDef } from '@dtl/shared';

/** Một khối mây của biển mây (ellipsoid: bán kính ngang `sx` × `sz`, nửa cao `sy`, quay `yaw` quanh y). */
export interface Billow {
  x: number;
  y: number;
  z: number;
  sx: number;
  sy: number;
  sz: number;
  yaw: number;
  tower: boolean;
}

/** Mây không được vươn lên quá mức này dưới mặt đảo thấp nhất ở nơi hình chiếu chồng lên đảo/cầu (m). */
export const BILLOW_MARGIN = 22;

function segDist(px: number, pz: number, b: BridgeDef): number {
  const dx = b.bx - b.ax;
  const dz = b.bz - b.az;
  const t = Math.max(0, Math.min(1, ((px - b.ax) * dx + (pz - b.az) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(px - (b.ax + dx * t), pz - (b.az + dz * t));
}

/**
 * Vị trí và cỡ các khối mây (hàm thuần, có test). Khối có hình chiếu (bán kính ngang `sx`) chồng lên đảo thật hoặc cầu thì đỉnh
 * (`y + sy`) bị kẹp dưới `min(đảo.y) − BILLOW_MARGIN`; mây tháp cao chỉ ở chỗ trống (không chồng đảo/cầu), nơi chồng thì thành khối thường.
 */
export function billowPlan(
  size: number,
  floor: number,
  islands: readonly IslandDef[],
  bridges: readonly BridgeDef[],
  n: number,
): Billow[] {
  const lowest = islands.reduce((m, i) => Math.min(m, i.y), Infinity);
  const ceiling = lowest - BILLOW_MARGIN;
  const out: Billow[] = [];
  for (let i = 0; i < n; i++) {
    const x = hash01(i, 11, 801) * size;
    const z = hash01(i, 13, 803) * size;
    const k = hash01(i, 29, 811);
    let tower = i % 7 === 0;
    let rr = tower ? 90 + hash01(i, 17, 805) * 80 : 40 + hash01(i, 17, 805) * 90;
    let y = tower ? floor - 8 + hash01(i, 19, 807) * 10 : floor + 1 + hash01(i, 19, 807) * 26;
    const sx = rr * (1 + k * 0.7);
    const reach = sx + 8;
    const overIsland = islands.some((isl) => Math.hypot(x - isl.x, z - isl.z) < isl.r + isl.edge + reach);
    const overBridge = bridges.some((b) => segDist(x, z, b) < b.halfW + reach);
    if (overIsland || overBridge) {
      if (tower) {
        tower = false;
        rr = 40 + hash01(i, 17, 805) * 60;
      }
      y = floor + 1 + hash01(i, 19, 807) * 8;
    }
    let sy = rr * (tower ? 0.85 : 0.5);
    if (overIsland || overBridge) sy = Math.min(sy, Math.max(6, ceiling - y)); // đỉnh dưới mặt đảo thấp nhất trừ biên
    out.push({ x, y, z, sx: rr * (1 + k * 0.7), sy, sz: rr, yaw: hash01(i, 23, 809) * 6.28, tower });
  }
  return out;
}
