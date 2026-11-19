import {
  featureWeight,
  fbm,
  FOREST,
  heightAt,
  KIEM_TRUNG,
  LAKE,
  PORTAL_PAD,
  SECT,
  SUOI,
  TERRAIN_SEED,
  VACH,
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
const PATH_RANGE = 10;
export const PATH_HALF_WIDTH = 1.7;

interface P {
  x: number;
  z: number;
}

/** Đường mòn nối các khu: tông môn ↔ thung lũng, rừng, bệ cổng, hồ; thung lũng ↔ suối ↔ rừng ↔ vách; cổng ↔ Kiếm Trủng (đèo tây bắc). */
const ROUTES: { from: P; to: P; bend: number; seed: number }[] = [
  { from: { x: SECT.x, z: SECT.z + 90 }, to: { x: VALLEY.x, z: VALLEY.z - 80 }, bend: 28, seed: 1 },
  { from: { x: SECT.x + 90, z: SECT.z }, to: { x: FOREST.x - 130, z: FOREST.z }, bend: 30, seed: 2 },
  { from: { x: SECT.x, z: SECT.z - 90 }, to: { x: PORTAL_PAD.x, z: PORTAL_PAD.z + 55 }, bend: 25, seed: 3 },
  { from: { x: SECT.x - 90, z: SECT.z }, to: { x: LAKE.x + 200, z: LAKE.z - 20 }, bend: 40, seed: 4 },
  { from: { x: VALLEY.x - 100, z: VALLEY.z + 10 }, to: { x: LAKE.x + 60, z: LAKE.z + 165 }, bend: 30, seed: 9 },
  { from: { x: VALLEY.x + 100, z: VALLEY.z - 20 }, to: { x: SUOI.x - 90, z: SUOI.z }, bend: 24, seed: 5 },
  { from: { x: SUOI.x, z: SUOI.z - 100 }, to: { x: FOREST.x, z: FOREST.z + 110 }, bend: 28, seed: 6 },
  { from: { x: FOREST.x, z: FOREST.z - 110 }, to: { x: VACH.x, z: VACH.z + 100 }, bend: 30, seed: 7 },
  { from: { x: PORTAL_PAD.x - 40, z: PORTAL_PAD.z - 20 }, to: { x: KIEM_TRUNG.x + 60, z: KIEM_TRUNG.z + 150 }, bend: 90, seed: 8 },
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
      const off =
        (Math.sin(t * Math.PI * 3 + r.seed * 1.7) * 0.6 + Math.sin(t * Math.PI * 7 + r.seed) * 0.25) * r.bend * Math.sin(t * Math.PI);
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
      const a = line[i]!;
      const b = line[i + 1]!;
      if (x < Math.min(a.x, b.x) - max || x > Math.max(a.x, b.x) + max || z < Math.min(a.z, b.z) - max || z > Math.max(a.z, b.z) + max)
        continue;
      const d = segDist(x, z, a, b);
      if (d < best) best = d;
    }
  }
  return best;
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Mép mềm: 1 trong `a`, 0 ngoài `b` (a < b). */
const soft = (v: number, a: number, b: number) => clamp01((b - v) / (b - a));

/**
 * Chỗ lát đá của sân tông môn (MAP-1): chỉ đại lộ, vòng bát quái, sân chính điện, sân hai đình và sân sơn môn (toạ độ tương đối tâm
 * tông môn, khớp `tools/blender/thien_cong_sect.py`). Phần còn lại của đỉnh núi là cỏ, đất và rêu thay cho lát đá phủ kín.
 */
export function sectPaving(lx: number, lz: number): number {
  const ax = Math.abs(lx);
  const avenue = Math.min(soft(ax, 7.5, 10), soft(Math.abs(lz - 26), 56, 60));
  const bagua = soft(Math.hypot(lx, lz - 18), 11, 14);
  const hall = Math.min(soft(ax, 22, 26), soft(Math.abs(lz + 44), 17, 21));
  const dinh = soft(Math.hypot(ax - 52, lz - 4), 9, 12);
  const gate = Math.min(soft(ax, 17, 21), soft(Math.abs(lz - 80), 6, 9));
  return Math.max(avenue, bagua, hall, dinh, gate);
}

/** Điểm ảnh (i, j) của mặt nạ → RGBA 0..255. */
export function maskPixel(i: number, j: number, lines: P[][], out: Uint8ClampedArray, o: number): void {
  const x = ((i + 0.5) / MASK_RES) * WORLD_SIZE;
  const z = ((j + 0.5) / MASK_RES) * WORLD_SIZE;
  // R: đường mòn. Đã trừ nửa bề rộng nên 0,5 đúng mép đường.
  const d = distToPaths(x, z, lines);
  out[o] = Number.isFinite(d) ? clamp01(0.5 + (PATH_HALF_WIDTH - d) / (2 * PATH_RANGE)) * 255 : 0;
  // G: sân lát đá.
  const wPad = featureWeight(PORTAL_PAD, x, z);
  out[o + 1] = clamp01(Math.max(sectPaving(x - SECT.x, z - SECT.z), (wPad - 0.88) * 12)) * 255;
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
