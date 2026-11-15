import { fbm, lerp, ridged, smoothstep } from './noise';
import {
  type Feature,
  FOREST,
  ISLAND_R,
  KIEM_TRUNG,
  LAKE,
  LAKE_SHELF_OUT,
  LAKE_SHELF_R,
  LAKE_SHELF_Y,
  LAKE_WATER_R,
  PLAY_WALL,
  PORTAL_PAD,
  playDist,
  SECT,
  SUOI,
  TERRAIN_SEED,
  VACH,
  VALLEY,
  WADE_DEPTH,
  WATER_Y,
  WORLD_SIZE,
} from './level';

const MIN_LAND_Y = WATER_Y + 3;
/** Độ cao thêm của vách ranh vùng chơi (m). */
const PLAY_WALL_H = 330;

function featureWeight(f: Feature, x: number, z: number): number {
  const dx = x - f.x;
  const dz = z - f.z;
  const d2 = dx * dx + dz * dz;
  if (d2 >= f.outerR * f.outerR) return 0;
  return smoothstep(f.outerR, f.flatR, Math.sqrt(d2));
}

/** Độ cao địa hình tự nhiên trước khi đặt các khu. */
function naturalHeight(x: number, z: number): number {
  const base = fbm(x * 0.0011, z * 0.0011, 5, TERRAIN_SEED);
  const ridge = ridged(x * 0.00075, z * 0.00075, 4, TERRAIN_SEED + 101);
  const mountainMask = smoothstep(-0.15, 0.55, fbm(x * 0.00042, z * 0.00042, 2, TERRAIN_SEED + 7));
  let h = 78 + base * 46 + ridge * ridge * 300 * mountainMask;

  // Ngọn núi lớn dưới chân tông môn.
  const dxs = x - SECT.x;
  const dzs = z - SECT.z;
  const ds = Math.sqrt(dxs * dxs + dzs * dzs);
  h += 110 * smoothstep(1100, 150, ds);

  // Dãy núi bao quanh rìa bản đồ.
  const edge = Math.min(x, z, WORLD_SIZE - x, WORLD_SIZE - z);
  h += 220 * smoothstep(420, 40, edge);
  return h;
}

/** Độ cao mặt đất tại (x, z). Hàm thuần, tất định. */
export function heightAt(x: number, z: number): number {
  let h = naturalHeight(x, z);
  const detail = fbm(x * 0.021, z * 0.021, 2, TERRAIN_SEED + 53);

  let w = featureWeight(VALLEY, x, z);
  if (w > 0) h = lerp(h, VALLEY.y + detail * 2.2, w);

  w = featureWeight(SUOI, x, z);
  if (w > 0) h = lerp(h, SUOI.y + detail * 3, w);

  w = featureWeight(FOREST, x, z);
  if (w > 0) h = lerp(h, FOREST.y + detail * 3.5, w);

  w = featureWeight(VACH, x, z);
  if (w > 0) h = lerp(h, VACH.y + detail * 6 + ridged(x * 0.02, z * 0.02, 2, TERRAIN_SEED + 31) * 14, w);

  w = featureWeight(PORTAL_PAD, x, z);
  if (w > 0) h = lerp(h, PORTAL_PAD.y, w);

  const wl = featureWeight(LAKE, x, z);
  if (wl > 0) {
    h = lerp(h, LAKE.y, wl);
    const dx = x - LAKE.x;
    const dz = z - LAKE.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    // Đảo nhỏ giữa hồ, nơi Hàn Giao trấn giữ.
    h += (WATER_Y + 4 - LAKE.y) * smoothstep(ISLAND_R, ISLAND_R * 0.45, d);
    // Bãi ven hồ: dải phẳng thấp hơn mặt nước vài mét (đi bộ, đánh quái được), ngoài đó núi mới dựng lên.
    const shelf = lerp(h, LAKE_SHELF_Y + detail * 0.8, smoothstep(LAKE_SHELF_OUT, LAKE_SHELF_R, d));
    h = lerp(h, shelf, smoothstep(LAKE.flatR, LAKE.flatR + 40, d));
  } else if (h < MIN_LAND_Y) {
    h = MIN_LAND_Y + (h - MIN_LAND_Y) * 0.1;
  }
  if (wl > 0 && wl < 0.25 && h < MIN_LAND_Y) {
    // Rìa lòng hồ không để trũng dưới mặt nước ngoài phạm vi đĩa nước.
    const dx = x - LAKE.x;
    const dz = z - LAKE.z;
    if (dx * dx + dz * dz > (LAKE_WATER_R - 20) * (LAKE_WATER_R - 20)) h = MIN_LAND_Y;
  }

  w = featureWeight(KIEM_TRUNG, x, z);
  if (w > 0) h = lerp(h, KIEM_TRUNG.y + detail * 0.6, w);

  w = featureWeight(SECT, x, z);
  if (w > 0) h = lerp(h, SECT.y, w);

  // Ranh vùng chơi: ngay sau chân vách (PLAY_WALL) địa hình dựng đứng lên, đi tới đó gặp vách.
  const dPlay = playDist(x, z);
  if (dPlay > PLAY_WALL) h += PLAY_WALL_H * smoothstep(PLAY_WALL, PLAY_WALL + 60, dPlay);

  return h;
}

export function inLakeWater(x: number, z: number): boolean {
  const dx = x - LAKE.x;
  const dz = z - LAKE.z;
  return dx * dx + dz * dz < LAKE_WATER_R * LAKE_WATER_R;
}

/** Lơ lửng cao hơn mức này so với mặt đất thì coi là đang trên không (không ra chiêu được). Server và HUD dùng chung. */
export const AIRBORNE_HEIGHT = 2.5;

/** Độ cao "đứng được": mặt đất, hoặc mặt nước trừ độ sâu lội trong hồ. */
export function groundAt(x: number, z: number): number {
  const h = heightAt(x, z);
  if (h < WATER_Y - WADE_DEPTH && inLakeWater(x, z)) return WATER_Y - WADE_DEPTH;
  return h;
}

export type Biome = 'sect' | 'valley' | 'forest' | 'lake' | 'wild' | 'dungeon';

export function biomeAt(x: number, z: number): Biome {
  if (featureWeight(SECT, x, z) > 0.6) return 'sect';
  if (featureWeight(KIEM_TRUNG, x, z) > 0.3) return 'dungeon';
  if (featureWeight(LAKE, x, z) > 0.3) return 'lake';
  if (featureWeight(FOREST, x, z) > 0.35) return 'forest';
  if (featureWeight(VALLEY, x, z) > 0.35 || featureWeight(SUOI, x, z) > 0.35) return 'valley';
  return 'wild';
}

export { featureWeight };
