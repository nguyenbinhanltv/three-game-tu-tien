// Bảo đảm E1-A giữ Vân Lam bit-for-bit: so `heightAt`/`groundAt`/`biomeAt`/`featureWeight`/`stepMove` mới (TerrainDef) với bản chép
// nguyên văn của thuật toán cũ (cuối file), và dựng một level giả lập để chứng minh đa level.
import { describe, expect, it } from 'vitest';
import { fbm, lerp, ridged, smoothstep } from './noise';
import {
  COLLIDERS,
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
  type TerrainDef,
  VACH,
  VALLEY,
  WADE_DEPTH,
  WATER_Y,
  WORLD_MARGIN,
  WORLD_SIZE,
} from './level';
import { biomeAt, featureWeight, groundAt, heightAt, inLakeWater, registerTerrain, terrainOf, VAN_LAM } from './terrain';
import { type MoveState, stepMove } from './movement';

// ---- Test ----

const bits = (n: number) => (Object.is(n, -0) ? '-0' : String(n));
const FEATS: Feature[] = [VALLEY, SUOI, FOREST, VACH, PORTAL_PAD, LAKE, KIEM_TRUNG, SECT];

describe('E1-A: Vân Lam bit-for-bit', () => {
  it('heightAt/groundAt/inLake mới == cũ trên lưới toàn thế giới', () => {
    let n = 0;
    for (let x = 0; x <= WORLD_SIZE; x += 37) {
      for (let z = 0; z <= WORLD_SIZE; z += 37) {
        const px = x + 0.37;
        const pz = z + 0.11;
        expect(bits(heightAt(px, pz))).toBe(bits(legacyHeightAt(px, pz)));
        expect(bits(groundAt(px, pz))).toBe(bits(legacyGroundAt(px, pz)));
        expect(inLakeWater(px, pz)).toBe(legacyInLake(px, pz));
        n++;
      }
    }
    expect(n).toBeGreaterThan(12000);
  });

  it('lưới dày quanh từng khu (mép bãi, bờ hồ, vách)', () => {
    for (const f of FEATS) {
      for (let dx = -f.outerR * 1.2; dx <= f.outerR * 1.2; dx += 7.3) {
        for (let dz = -f.outerR * 1.2; dz <= f.outerR * 1.2; dz += 7.3) {
          const x = f.x + dx;
          const z = f.z + dz;
          expect(bits(heightAt(x, z))).toBe(bits(legacyHeightAt(x, z)));
        }
      }
    }
  });

  it('featureWeight và biomeAt mới == cũ', () => {
    for (let x = 900; x <= 3200; x += 53) {
      for (let z = 900; z <= 3200; z += 53) {
        for (const f of FEATS) expect(bits(featureWeight(f, x, z))).toBe(bits(legacyFeatureWeight(f, x, z)));
        expect(biomeAt(x, z)).toBe(legacyBiomeAt(x, z));
      }
    }
  });

  it('stepMove: ctx.terrain = Vân Lam giống mặc định; luôn nằm trong chân vách; collider chặn', () => {
    const ctx = { canFly: true, frozen: false, speedMul: 1 };
    for (let k = 0; k < 8; k++) {
      const yaw = (k / 8) * Math.PI * 2;
      for (const fly of [0, 2]) {
        const s: MoveState = { x: SECT.x + 1000, y: 200, z: SECT.z + 40, vy: 0, grounded: false, flying: false };
        const s2 = { ...s };
        for (let i = 0; i < 400; i++) {
          stepMove(s, { s: i, mx: 0, mz: 1, yaw, f: fly }, ctx);
          stepMove(s2, { s: i, mx: 0, mz: 1, yaw, f: fly }, { ...ctx, terrain: VAN_LAM });
        }
        expect(s).toEqual(s2);
        expect(playDist(s.x, s.z)).toBeLessThanOrEqual(PLAY_WALL + 1e-6);
      }
    }
    const s: MoveState = { x: 2048, y: groundAt(2048, 2060), z: 2060, vy: 0, grounded: true, flying: false };
    for (let i = 0; i < 200; i++) stepMove(s, { s: i, mx: 0, mz: 1, yaw: 0, f: 0 }, ctx);
    expect(Math.hypot(s.x - COLLIDERS[0].x, s.z - COLLIDERS[0].z)).toBeGreaterThanOrEqual(COLLIDERS[0].r + 0.5 - 1e-6);
  });

  it('hằng số cũ vẫn khớp def: lề, kích thước, mặt nước, ranh', () => {
    const t = terrainOf('van_lam');
    expect(t.size).toBe(WORLD_SIZE);
    expect(t.margin).toBe(WORLD_MARGIN);
    expect(t.def.water?.y).toBe(WATER_Y);
    expect(t.playWall).toBe(PLAY_WALL);
    expect(terrainOf('kiem_trung')).toBe(t);
    expect(terrainOf({ id: 'kiem_trung' })).toBe(t);
  });
});

describe('E1-A: nhiều level', () => {
  const ISLE: TerrainDef = {
    id: 'test_isle',
    seed: 777,
    size: 1024,
    margin: 8,
    natural: { freq: 0.002, baseOct: 3, ridgeOct: 2, level: 0, baseAmp: 0, ridgeAmp: 0, maskFreq: 0.001, maskOct: 1, maskLo: 0, maskHi: 1 },
    islands: [
      { x: 300, z: 300, r: 60, edge: 20, y: 400 },
      { x: 700, z: 600, r: 80, edge: 30, y: 420 },
    ],
    voidFloor: -200,
    features: [{ id: 'altar', x: 300, z: 300, y: 405, flatR: 15, outerR: 40, round: true }],
    play: { cx: 512, cz: 512, half: 400, wallH: 100 },
    biomes: [{ feature: 'altar', biome: 'sect', min: 0.5 }],
    colliders: [{ x: 320, z: 300, r: 3 }],
  };
  const isle = registerTerrain(ISLE);

  it('terrainOf trả địa hình riêng theo level, level lạ ném lỗi', () => {
    expect(terrainOf('test_isle')).toBe(isle);
    expect(isle).not.toBe(VAN_LAM);
    expect(terrainOf({ id: 'x', terrain: 'test_isle' })).toBe(isle);
    expect(() => terrainOf('khong_co')).toThrow(/khong_co/);
  });

  it('độ cao theo level: đảo cao, khoảng trống thấp, khu phẳng, tất định', () => {
    expect(isle.heightAt(300, 350)).toBeCloseTo(400, 6);
    expect(isle.heightAt(300, 300)).toBeCloseTo(405, 6);
    expect(isle.heightAt(450, 450)).toBeCloseTo(-200, 6);
    expect(isle.heightAt(700, 600)).toBeCloseTo(420, 6);
    expect(isle.heightAt(123.4, 567.8)).toBe(isle.heightAt(123.4, 567.8));
    expect(heightAt(2048, 2048)).toBeCloseTo(150, 6); // Vân Lam không bị ảnh hưởng
    expect(isle.biomeAt(300, 300)).toBe('sect');
    expect(isle.biomeAt(700, 600)).toBe('wild');
    expect(isle.inWater(300, 300)).toBe(false);
    expect(isle.groundAt(450, 450)).toBe(-200);
  });

  it('stepMove theo level: collider, lề thế giới và ranh vùng chơi của level đó', () => {
    const ctx = { canFly: false, frozen: false, speedMul: 1, terrain: isle };
    // yaw 0: mx = +1 đi về +x
    const s: MoveState = { x: 300, y: 405, z: 300, vy: 0, grounded: true, flying: false };
    for (let i = 0; i < 100; i++) stepMove(s, { s: i, mx: 1, mz: 0, yaw: 0, f: 0 }, ctx);
    expect(s.x).toBeLessThanOrEqual(320 - 3 - 0.5 + 1e-6);
    // bay ra xa: dừng ở chân vách của level (half 400 → vách 390)
    const f: MoveState = { x: 512, y: 100, z: 512, vy: 0, grounded: false, flying: true };
    for (let i = 0; i < 2000; i++) stepMove(f, { s: i, mx: 0, mz: -1, yaw: 0, f: 2 }, { ...ctx, canFly: true });
    expect(isle.playDist(f.x, f.z)).toBeLessThanOrEqual(isle.playWall + 1e-6);
    expect(Math.abs(f.z - 512)).toBeGreaterThan(300);
    // collider Vân Lam (Chính điện 2048,2004) không áp ở level này
    const open = registerTerrain({ ...ISLE, id: 'test_open', size: 4096, margin: 24, play: undefined, colliders: [] });
    const t: MoveState = { x: 2048, y: 0, z: 2040, vy: 0, grounded: true, flying: false };
    for (let i = 0; i < 200; i++)
      stepMove(t, { s: i, mx: 0, mz: 1, yaw: 0, f: 0 }, { canFly: false, frozen: false, speedMul: 1, terrain: open });
    expect(t.z).toBeLessThan(2000);
  });
});

// ---- Bản chép nguyên văn thuật toán cũ (trước E1-A) ----

const MIN_LAND_Y = WATER_Y + 3;
/** Độ cao thêm của vách ranh vùng chơi (m). */
const PLAY_WALL_H = 330;

/**
 * Khoảng cách tới tâm khu, méo bằng nhiễu thấp tần số (±~20 %, biên độ nhiễu thực ~0,3): mép khu (bãi bằng, bờ hồ) là một hình lồi lõm như
 * hợp mượt của vài vòng tròn chứ không phải đĩa tròn đều. Mỗi khu có pha nhiễu riêng theo tâm.
 */
function legacyWarped(f: Feature, x: number, z: number): number {
  const dx = x - f.x;
  const dz = z - f.z;
  const d = Math.sqrt(dx * dx + dz * dz);
  if (d < 1) return d;
  const ph = f.x * 0.013 + f.z * 0.007;
  const n =
    fbm(x * 0.007 + ph, z * 0.007 - ph, 3, TERRAIN_SEED + 211) * 0.9 + fbm(x * 0.021 - ph, z * 0.021 + ph, 1, TERRAIN_SEED + 223) * 0.1;
  return d * (1 + 0.6 * n);
}

function legacyFeatureWeight(f: Feature, x: number, z: number): number {
  const dx = x - f.x;
  const dz = z - f.z;
  const d2 = dx * dx + dz * dz;
  // Ngoài 2 × outerR chắc chắn bằng 0 (méo tối đa ~60 % × biên độ nhiễu): bỏ qua nhiễu cho nhanh.
  if (d2 >= f.outerR * f.outerR * 4) return 0;
  // Sân tông môn, bệ cổng và lòng chảo Kiếm Trủng giữ hình tròn (kiến trúc/đấu trường dựng theo bán kính).
  const d = f === SECT || f === PORTAL_PAD || f === KIEM_TRUNG ? Math.sqrt(d2) : legacyWarped(f, x, z);
  if (d >= f.outerR) return 0;
  return smoothstep(f.outerR, f.flatR, d);
}

/** Độ cao địa hình tự nhiên trước khi đặt các khu. */
function legacyNatural(x: number, z: number): number {
  const base = fbm(x * 0.0011, z * 0.0011, 5, TERRAIN_SEED);
  const ridge = ridged(x * 0.0011, z * 0.0011, 4, TERRAIN_SEED + 101);
  // Vùng núi chiếm khoảng nửa bản đồ (mặt nạ nhiễu thấp tần số), sống núi uốn mềm theo gradient lệch trục.
  const mountainMask = smoothstep(-0.35, 0.3, fbm(x * 0.00055, z * 0.00055, 2, TERRAIN_SEED + 7));
  let h = 78 + base * 56 + ridge * ridge * 340 * mountainMask;

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
function legacyHeightAt(x: number, z: number): number {
  let h = legacyNatural(x, z);
  const detail = fbm(x * 0.021, z * 0.021, 2, TERRAIN_SEED + 53);

  let w = legacyFeatureWeight(VALLEY, x, z);
  if (w > 0) h = lerp(h, VALLEY.y + detail * 2.2, w);

  w = legacyFeatureWeight(SUOI, x, z);
  if (w > 0) h = lerp(h, SUOI.y + detail * 3, w);

  w = legacyFeatureWeight(FOREST, x, z);
  if (w > 0) h = lerp(h, FOREST.y + detail * 3.5, w);

  w = legacyFeatureWeight(VACH, x, z);
  if (w > 0) h = lerp(h, VACH.y + detail * 6 + ridged(x * 0.02, z * 0.02, 2, TERRAIN_SEED + 31) * 14, w);

  w = legacyFeatureWeight(PORTAL_PAD, x, z);
  if (w > 0) h = lerp(h, PORTAL_PAD.y, w);

  const wl = legacyFeatureWeight(LAKE, x, z);
  if (wl > 0) {
    h = lerp(h, LAKE.y, wl);
    const d = legacyWarped(LAKE, x, z);
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

  w = legacyFeatureWeight(KIEM_TRUNG, x, z);
  if (w > 0) h = lerp(h, KIEM_TRUNG.y + detail * 0.6, w);

  w = legacyFeatureWeight(SECT, x, z);
  if (w > 0) h = lerp(h, SECT.y, w);

  // Ranh vùng chơi: ngay sau chân vách (PLAY_WALL) địa hình dựng đứng lên, đi tới đó gặp vách.
  const dPlay = playDist(x, z);
  if (dPlay > PLAY_WALL) h += PLAY_WALL_H * smoothstep(PLAY_WALL, PLAY_WALL + 60, dPlay);

  return h;
}

function legacyInLake(x: number, z: number): boolean {
  const dx = x - LAKE.x;
  const dz = z - LAKE.z;
  return dx * dx + dz * dz < LAKE_WATER_R * LAKE_WATER_R;
}

/** Lơ lửng cao hơn mức này so với mặt đất thì coi là đang trên không (không ra chiêu được). Server và HUD dùng chung. */

/** Độ cao "đứng được": mặt đất, hoặc mặt nước trừ độ sâu lội trong hồ. */
function legacyGroundAt(x: number, z: number): number {
  const h = legacyHeightAt(x, z);
  if (h < WATER_Y - WADE_DEPTH && legacyInLake(x, z)) return WATER_Y - WADE_DEPTH;
  return h;
}

type LegacyBiome = string;

function legacyBiomeAt(x: number, z: number): LegacyBiome {
  if (legacyFeatureWeight(SECT, x, z) > 0.6) return 'sect';
  if (legacyFeatureWeight(KIEM_TRUNG, x, z) > 0.3) return 'dungeon';
  if (legacyFeatureWeight(LAKE, x, z) > 0.3) return 'lake';
  if (legacyFeatureWeight(FOREST, x, z) > 0.35) return 'forest';
  if (legacyFeatureWeight(VALLEY, x, z) > 0.35 || legacyFeatureWeight(SUOI, x, z) > 0.35) return 'valley';
  return 'wild';
}
