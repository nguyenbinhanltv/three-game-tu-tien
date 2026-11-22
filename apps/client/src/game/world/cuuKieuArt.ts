import { fbm, type TerrainDef } from '@dtl/shared';

/**
 * Mặt đất Thiên Lộ Giới (TN-7, mỹ thuật): đồng cỏ xanh tươi (xanh lá ngả vàng nắng theo nhiễu), sườn dốc ngả xanh rêu, vách dựng đứng đá xám xanh
 * có vân dọc (nước chảy, rêu). Con đường lát đá là mặt lưới riêng (`ckWonders.ts`), không vẽ vào màu đất. Hàm thuần, viết vào `out` (RGB 0..1, sRGB).
 */
export function ckGroundColor(def: TerrainDef, x: number, z: number, ny: number, out: [number, number, number]): void {
  const n = fbm(x * 0.011, z * 0.011, 2, def.seed + 300);
  const m = fbm(x * 0.04, z * 0.04, 2, def.seed + 331);
  const t = Math.min(1, Math.max(0, 0.5 + n * 1.4));
  const k = 0.92 + m * 0.2;
  // đồng cỏ: xanh lá đậm → xanh vàng nắng
  let r = (0.3 + (0.52 - 0.3) * t) * k;
  let g = (0.47 + (0.6 - 0.47) * t) * k;
  let b = (0.21 + (0.32 - 0.21) * t) * k;
  const slope = 1 - ny;
  if (slope > 0.06) {
    // sườn: rêu xanh sẫm
    const a = Math.min(0.85, (slope - 0.06) * 4);
    const mr = (0.26 + n * 0.1) * 1.0;
    const mg = (0.38 + n * 0.12) * 1.0;
    const mb = 0.22 + n * 0.06;
    r += (mr - r) * a;
    g += (mg - g) * a;
    b += (mb - b) * a;
  }
  if (slope > 0.3) {
    // vách đứng: đá xám xanh, vân dọc (dải theo toạ độ ngang) và rêu loang
    const a = Math.min(1, (slope - 0.3) * 3);
    const streak = 0.5 + 0.5 * Math.sin((x * 1.7 + z * 1.3) * 0.33 + n * 6 + m * 3);
    const dark = 0.82 + streak * 0.3;
    const moss = Math.max(0, m + 0.1) * 0.9;
    const rr = (0.46 - moss * 0.14) * dark;
    const rg = (0.51 - moss * 0.02) * dark;
    const rb = (0.47 - moss * 0.12) * dark;
    r += (rr - r) * a;
    g += (rg - g) * a;
    b += (rb - b) * a;
  }
  out[0] = r;
  out[1] = g;
  out[2] = b;
}
