import { CUU_KIEU_ROAD, CUU_KIEU_ROAD_HALF, fbm, type TerrainDef } from '@dtl/shared';

/**
 * Mặt đất Thiên Lộ Giới (TN-7, mỹ thuật): đồng cỏ xanh rêu ngả vàng úa (không chanh), biến thiên macro theo mảng (cỏ ẩm sẫm, cỏ khô vàng, đất trần nâu, đá lộ xám),
 * sườn dốc ngả rêu, vách dựng đứng đá xám ấm có vân dọc, rêu loang và vỉa sáng (không đen kịt dù hoàng hôn). Con đường lát đá là mặt lưới riêng (`ckWonders.ts`),
 * không vẽ vào màu đất. Hàm thuần, viết vào `out` (RGB 0..1, sRGB).
 */
const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
const smooth = (a: number, b: number, v: number): number => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const mix3 = (a: readonly number[], b: readonly number[], t: number): [number, number, number] => [
  a[0]! + (b[0]! - a[0]!) * t,
  a[1]! + (b[1]! - a[1]!) * t,
  a[2]! + (b[2]! - a[2]!) * t,
];

const MOSS_GREEN = [0.25, 0.33, 0.16] as const;
const OLIVE = [0.43, 0.43, 0.21] as const;
const DRY = [0.55, 0.46, 0.26] as const;
const EARTH = [0.44, 0.34, 0.23] as const;
const ROCK = [0.5, 0.5, 0.45] as const;
const CLIFF = [0.52, 0.49, 0.42] as const;
const CLIFF_MOSS = [0.34, 0.43, 0.27] as const;

export function ckGroundColor(def: TerrainDef, x: number, z: number, ny: number, out: [number, number, number]): void {
  const n = fbm(x * 0.011, z * 0.011, 2, def.seed + 300);
  const m = fbm(x * 0.04, z * 0.04, 2, def.seed + 331);
  const macro1 = fbm(x * 0.0042, z * 0.0042, 3, def.seed + 17); // mảng ẩm/khô lớn
  const macro2 = fbm(x * 0.0071, z * 0.0071, 2, def.seed + 91); // đất trần
  const macro3 = fbm(x * 0.0093, z * 0.0093, 2, def.seed + 203); // đá lộ
  let c = mix3(MOSS_GREEN, OLIVE, clamp01(0.5 + n * 1.5));
  c = mix3(c, DRY, smooth(-0.04, 0.2, macro1) * 0.95);
  c = mix3(c, EARTH, smooth(0.06, 0.24, macro2) * 0.9);
  c = mix3(c, ROCK, smooth(0.2, 0.34, macro3) * 0.75);
  const k = 0.9 + m * 0.24;
  c = [c[0] * k, c[1] * k, c[2] * k];
  const slope = 1 - ny;
  if (slope > 0.06) {
    // sườn: rêu xanh sẫm
    c = mix3(c, [CLIFF_MOSS[0] * (0.9 + n * 0.2), CLIFF_MOSS[1] * (0.9 + n * 0.2), CLIFF_MOSS[2]], Math.min(0.85, (slope - 0.06) * 4));
  }
  if (slope > 0.3) {
    // vách đứng: đá xám ấm, vân dọc (dải theo toạ độ ngang), rêu loang, vỉa sáng mảnh
    const a = clamp01((slope - 0.3) * 3);
    const streak = 0.5 + 0.5 * Math.sin((x * 1.7 + z * 1.3) * 0.33 + n * 6 + m * 3);
    const dark = 0.88 + streak * 0.28;
    const moss = clamp01((m + 0.15) * 1.6 + Math.max(0, n) * 0.5);
    let r = mix3(CLIFF, CLIFF_MOSS, moss * 0.7);
    // sáng hơn (×1,5): ở xa vách chỉ còn màu đỉnh (nhân 0,62), không để vách thành mảng xanh tối
    r = [Math.min(1, r[0] * dark * 1.5), Math.min(1, r[1] * dark * 1.5), Math.min(1, r[2] * dark * 1.45)];
    const vein = Math.pow(Math.max(0, Math.sin((x * 0.9 - z * 1.1) * 0.21 + n * 4) - 0.8) / 0.2, 2) * 0.4;
    r = mix3(r, [0.78, 0.74, 0.62], vein);
    c = mix3(c, r, a);
  }
  // Chi tiết và sắc chính đến từ texture Codex (bộ `terrain-ck`); màu đỉnh chỉ nghiêng sắc nhẹ và quyết định màu ở xa: kéo về gần xám để bớt vàng.
  const lum = c[0] * 0.299 + c[1] * 0.587 + c[2] * 0.114;
  out[0] = lum + (c[0] - lum) * 0.8;
  out[1] = lum + (c[1] - lum) * 0.8;
  out[2] = lum + (c[2] - lum) * 0.8;
}

/**
 * Hệ số 0..1 cho mật độ cỏ lá mảnh Họa Cảnh quanh con đường lát đá (và sân hub ở đầu đường): trên mặt đường chỉ còn vài búi (0,08), tăng dần tới 1 ở cách mép
 * đường 2,5 m (cùng khoảng đệm với búi cỏ chân của `ckWonders`). Hàm thuần.
 */
export function ckGrassK(x: number, z: number): number {
  let d2 = Infinity;
  for (let i = 0; i + 1 < CUU_KIEU_ROAD.length; i++) {
    const a = CUU_KIEU_ROAD[i]!;
    const b = CUU_KIEU_ROAD[i + 1]!;
    const vx = b[0] - a[0];
    const vz = b[1] - a[1];
    const l2 = vx * vx + vz * vz || 1;
    const u = Math.max(0, Math.min(1, ((x - a[0]) * vx + (z - a[1]) * vz) / l2));
    const dx = x - (a[0] + vx * u);
    const dz = z - (a[1] + vz * u);
    d2 = Math.min(d2, dx * dx + dz * dz);
  }
  const d = Math.sqrt(d2) - CUU_KIEU_ROAD_HALF;
  const t = Math.min(1, Math.max(0, d / 2.5));
  return 0.08 + 0.92 * t * t * (3 - 2 * t);
}
