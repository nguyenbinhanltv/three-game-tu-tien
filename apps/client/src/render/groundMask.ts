import {
  featureWeight,
  fbm,
  FOREST,
  heightAt,
  LAKE,
  PORTAL_PAD,
  SECT,
  TERRAIN_SEED,
  VALLEY,
  WATER_Y,
  WORLD_SIZE,
} from '@dtl/shared';

/**
 * Mặt nạ vùng của mặt đất, vẽ thủ tục từ level.ts, nạp một lần vào texture RGBA8 `MASK_RES`²
 * phủ cả bản đồ (4 m/điểm ảnh; lọc song tuyến nên ranh giới mượt):
 *   R = trường khoảng cách có dấu tới đường mòn (0,5 = mép; > 0,5 trong lòng đường; ±PATH_RANGE m)
 *   G = sân lát đá (sân tông môn, bệ cổng bí cảnh)
 *   B = cát ven hồ và lòng hồ
 *   A = nhiễu vĩ mô 0..1 (đổi màu/độ nhám theo mảng, và là nguồn nhiễu chống lặp cho shader)
 * Hàm thuần (không đụng GPU) để test được.
 */
export const MASK_RES = 1024;
export const PATH_RANGE = 10;
export const PATH_HALF_WIDTH = 1.7;

interface P {
  x: number;
  z: number;
}

/** Đường mòn nối các khu: tông môn ↔ thung lũng, rừng, bệ cổng, hồ; thung lũng ↔ rừng. */
const ROUTES: { from: P; to: P; bend: number; seed: number }[] = [
  { from: { x: SECT.x, z: SECT.z + 90 }, to: { x: VALLEY.x, z: VALLEY.z - 200 }, bend: 40, seed: 1 },
  { from: { x: SECT.x + 90, z: SECT.z }, to: { x: FOREST.x - 230, z: FOREST.z }, bend: 55, seed: 2 },
  { from: { x: SECT.x, z: SECT.z - 90 }, to: { x: PORTAL_PAD.x, z: PORTAL_PAD.z + 55 }, bend: 35, seed: 3 },
  { from: { x: SECT.x - 90, z: SECT.z }, to: { x: LAKE.x + 330, z: LAKE.z }, bend: 60, seed: 4 },
  { from: { x: VALLEY.x + 120, z: VALLEY.z - 80 }, to: { x: FOREST.x - 220, z: FOREST.z + 120 }, bend: 50, seed: 5 },
];

const STEPS = 28;

/** Đa tuyến uốn lượn của từng đường mòn (tất định). */
export function pathPolylines(): P[][] {
  return ROUTES.map((r) => {
    const dx = r.to.x - r.from.x;
    const dz = r.to.z - r.from.z;
    const len = Math.hypot(dx, dz);
    const nx = -dz / len;
    const nz = dx / len;
    const pts: P[] = [];
    for (let i = 0; i <= STEPS; i++) {
      const t = i / STEPS;
      const off = (Math.sin(t * Math.PI * 3 + r.seed * 1.7) * 0.6 + Math.sin(t * Math.PI * 7 + r.seed) * 0.25) * r.bend * Math.sin(t * Math.PI);
      pts.push({ x: r.from.x + dx * t + nx * off, z: r.from.z + dz * t + nz * off });
    }
    return pts;
  });
}

function segDist(px: number, pz: number, a: P, b: P): number {
  const abx = b.x - a.x;
  const abz = b.z - a.z;
  const t = Math.max(0, Math.min(1, ((px - a.x) * abx + (pz - a.z) * abz) / (abx * abx + abz * abz)));
  return Math.hypot(px - (a.x + abx * t), pz - (a.z + abz * t));
}

/** Khoảng cách (m) từ (x, z) tới đường mòn gần nhất; Infinity nếu xa hơn `max`. */
export function distToPaths(x: number, z: number, lines: P[][], max = PATH_RANGE + 6): number {
  let best = Infinity;
  for (const line of lines) {
    for (let i = 0; i < line.length - 1; i++) {
      const a = line[i];
      const b = line[i + 1];
      if (x < Math.min(a.x, b.x) - max || x > Math.max(a.x, b.x) + max || z < Math.min(a.z, b.z) - max || z > Math.max(a.z, b.z) + max) continue;
      const d = segDist(x, z, a, b);
      if (d < best) best = d;
    }
  }
  return best;
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Điểm ảnh (i, j) của mặt nạ → RGBA 0..255. */
export function maskPixel(i: number, j: number, lines: P[][], out: Uint8ClampedArray, o: number): void {
  const x = ((i + 0.5) / MASK_RES) * WORLD_SIZE;
  const z = ((j + 0.5) / MASK_RES) * WORLD_SIZE;
  // R: đường mòn. Đã trừ nửa bề rộng nên 0,5 đúng mép đường.
  const d = distToPaths(x, z, lines);
  out[o] = Number.isFinite(d) ? clamp01(0.5 + (PATH_HALF_WIDTH - d) / (2 * PATH_RANGE)) * 255 : 0;
  // G: sân lát đá.
  const wSect = featureWeight(SECT, x, z);
  const wPad = featureWeight(PORTAL_PAD, x, z);
  out[o + 1] = clamp01(Math.max((wSect - 0.8) * 9, (wPad - 0.88) * 12)) * 255;
  // B: cát ven hồ (chỉ gần hồ mới tốn heightAt).
  let sand = 0;
  if (featureWeight(LAKE, x, z) > 0) {
    const h = heightAt(x, z);
    sand = clamp01((WATER_Y + 2.6 - h) / 1.8);
  }
  out[o + 2] = sand * 255;
  // A: nhiễu vĩ mô.
  out[o + 3] = clamp01(0.5 + fbm(x * 0.012, z * 0.012, 3, TERRAIN_SEED + 700) * 0.9) * 255;
}

export function buildMaskData(): Uint8ClampedArray {
  const lines = pathPolylines();
  const data = new Uint8ClampedArray(MASK_RES * MASK_RES * 4);
  for (let j = 0; j < MASK_RES; j++) for (let i = 0; i < MASK_RES; i++) maskPixel(i, j, lines, data, (j * MASK_RES + i) * 4);
  return data;
}
