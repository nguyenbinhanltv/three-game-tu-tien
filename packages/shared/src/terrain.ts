import { fbm, lerp, ridged, smoothstep } from './noise';
import {
  type Biome,
  type CircleCollider,
  type Feature,
  FOREST,
  KIEM_TRUNG,
  LAKE,
  PORTAL_PAD,
  SECT,
  SUOI,
  type TerrainDef,
  type TerrainFeature,
  VACH,
  VALLEY,
  VAN_LAM_TERRAIN,
} from './level';

/** Độ cao mặt cầu tại tham số t (0..1) dọc nhịp: nội suy hai đầu, võng ở giữa. */
export function bridgeDeckY(b: { ay: number; by: number; sag: number }, t: number): number {
  return b.ay + (b.by - b.ay) * t - b.sag * 4 * t * (1 - t);
}

/** Địa hình đã dựng của một level: hàm thuần, tất định, dùng chung client/server/công cụ. */
export interface Terrain {
  id: string;
  def: TerrainDef;
  size: number;
  margin: number;
  colliders: CircleCollider[];
  /** Chân vách vùng chơi (không đi quá); Infinity nếu level không có ranh. */
  playWall: number;
  /** Vùng chơi chính theo toạ độ thế giới (cả thế giới nếu không có ranh). */
  playBounds: { x0: number; z0: number; x1: number; z1: number };
  heightAt(x: number, z: number): number;
  /** Như `heightAt` nhưng bỏ mặt cầu (chỉ khác ở level có `bridges`): để dựng lưới địa hình. */
  surfaceAt(x: number, z: number): number;
  /** Độ cao "đứng được": mặt đất, hoặc mặt nước trừ độ sâu lội trong hồ. */
  groundAt(x: number, z: number): number;
  inWater(x: number, z: number): boolean;
  biomeAt(x: number, z: number): Biome;
  /** Trọng số khu (0..1) tại (x, z); `f` phải là khu của level này. */
  featureWeight(f: TerrainFeature, x: number, z: number): number;
  /** Khoảng cách ô vuông bo tròn từ tâm vùng chơi; 0 nếu không có ranh. */
  playDist(x: number, z: number): number;
  /** Level đảo nổi: bước lên bậc cao đột ngột (thành cầu, vách đảo) bị chặn, không "nhảy" lên được (movement.ts). */
  blockRise: boolean;
  /** Đẩy (x, z) về trong chân vách, ghi vào `out`. */
  clampPlay(x: number, z: number, out: { x: number; z: number }): { x: number; z: number };
}

export function makeTerrain(def: TerrainDef): Terrain {
  const seed = def.seed;
  const nat = def.natural;
  const feats = def.features;
  const water = def.water;
  const play = def.play;
  const minLandY = water ? water.y + 3 : -Infinity;
  const playWall = play ? play.half - 10 : Infinity;
  const islands = def.islands?.length ? def.islands : undefined;
  const bridges = def.bridges?.length ? def.bridges : undefined;

  /**
   * Khoảng cách tới tâm khu, méo bằng nhiễu thấp tần số (±~20 %, biên độ nhiễu thực ~0,3): mép khu (bãi bằng, bờ hồ) là một hình lồi lõm như
   * hợp mượt của vài vòng tròn chứ không phải đĩa tròn đều. Mỗi khu có pha nhiễu riêng theo tâm.
   */
  function warpedDist(f: Feature, x: number, z: number): number {
    const dx = x - f.x;
    const dz = z - f.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d < 1) return d;
    const ph = f.x * 0.013 + f.z * 0.007;
    const n = fbm(x * 0.007 + ph, z * 0.007 - ph, 3, seed + 211) * 0.9 + fbm(x * 0.021 - ph, z * 0.021 + ph, 1, seed + 223) * 0.1;
    return d * (1 + 0.6 * n);
  }

  function featureWeight(f: TerrainFeature, x: number, z: number): number {
    const dx = x - f.x;
    const dz = z - f.z;
    const d2 = dx * dx + dz * dz;
    // Ngoài 2 × outerR chắc chắn bằng 0 (méo tối đa ~60 % × biên độ nhiễu): bỏ qua nhiễu cho nhanh.
    if (d2 >= f.outerR * f.outerR * 4) return 0;
    const d = f.round ? Math.sqrt(d2) : warpedDist(f, x, z);
    if (d >= f.outerR) return 0;
    return smoothstep(f.outerR, f.flatR, d);
  }

  /** Độ cao địa hình tự nhiên trước khi đặt các khu. */
  function naturalHeight(x: number, z: number): number {
    if (islands) {
      let h = def.voidFloor ?? 0;
      for (const isl of islands) {
        const dx = x - isl.x;
        const dz = z - isl.z;
        const d = Math.sqrt(dx * dx + dz * dz);
        if (d < isl.r + isl.edge) h = lerp(h, isl.y, smoothstep(isl.r + isl.edge, isl.r, d));
      }
      return h;
    }
    const base = fbm(x * nat.freq, z * nat.freq, nat.baseOct, seed);
    const ridge = ridged(x * nat.freq, z * nat.freq, nat.ridgeOct, seed + 101);
    // Vùng núi chiếm khoảng nửa bản đồ (mặt nạ nhiễu thấp tần số), sống núi uốn mềm theo gradient lệch trục.
    const mountainMask = smoothstep(nat.maskLo, nat.maskHi, fbm(x * nat.maskFreq, z * nat.maskFreq, nat.maskOct, seed + 7));
    let h = nat.level + base * nat.baseAmp + ridge * ridge * nat.ridgeAmp * mountainMask;

    const hill = nat.hill;
    if (hill) {
      const dxs = x - hill.x;
      const dzs = z - hill.z;
      const ds = Math.sqrt(dxs * dxs + dzs * dzs);
      h += hill.amp * smoothstep(hill.r0, hill.r1, ds);
    }

    const e = nat.edge;
    if (e) {
      const edge = Math.min(x, z, def.size - x, def.size - z);
      h += e.amp * smoothstep(e.r0, e.r1, edge);
    }
    return h;
  }

  function playDist(x: number, z: number): number {
    if (!play) return 0;
    const dx = Math.abs(x - play.cx);
    const dz = Math.abs(z - play.cz);
    return Math.sqrt(Math.sqrt(dx * dx * dx * dx + dz * dz * dz * dz));
  }

  /** Mặt cầu: gần dải thì độ cao kéo về mặt cầu nếu mặt cầu cao hơn (đầu cầu trùng mặt đảo nên liền mạch). Mép dải dốc đứng nên cầu như bức tường nhìn từ sàn mây. */
  function withBridges(h: number, x: number, z: number): number {
    for (const b of bridges!) {
      const dx = b.bx - b.ax;
      const dz = b.bz - b.az;
      const len2 = dx * dx + dz * dz;
      const t = ((x - b.ax) * dx + (z - b.az) * dz) / len2;
      if (t < 0 || t > 1) continue;
      const px = b.ax + dx * t - x;
      const pz = b.az + dz * t - z;
      const d2 = px * px + pz * pz;
      const outer = b.halfW + 0.8;
      if (d2 >= outer * outer) continue;
      const deck = bridgeDeckY(b, t);
      if (deck > h) h = lerp(h, deck, smoothstep(outer, b.halfW, Math.sqrt(d2)));
    }
    return h;
  }

  function heightWith(x: number, z: number, withDeck: boolean): number {
    let h = naturalHeight(x, z);
    const detail = fbm(x * 0.021, z * 0.021, 2, seed + 53);

    for (let i = 0; i < feats.length; i++) {
      const f = feats[i];
      const lk = f.lake;
      if (lk && water) {
        const wl = featureWeight(f, x, z);
        if (wl > 0) {
          h = lerp(h, f.y, wl);
          const d = warpedDist(f, x, z);
          // Đảo nhỏ giữa hồ, nơi Hàn Giao trấn giữ.
          h += (lk.islandTop - f.y) * smoothstep(lk.islandR, lk.islandR * 0.45, d);
          // Bãi ven hồ: dải phẳng thấp hơn mặt nước vài mét (đi bộ, đánh quái được), ngoài đó núi mới dựng lên.
          const shelf = lerp(h, lk.shelfY + detail * 0.8, smoothstep(lk.shelfOut, lk.shelfR, d));
          h = lerp(h, shelf, smoothstep(f.flatR, f.flatR + 40, d));
        } else if (h < minLandY) {
          h = minLandY + (h - minLandY) * 0.1;
        }
        if (wl > 0 && wl < 0.25 && h < minLandY) {
          // Rìa lòng hồ không để trũng dưới mặt nước ngoài phạm vi đĩa nước.
          const dx = x - f.x;
          const dz = z - f.z;
          if (dx * dx + dz * dz > (lk.waterR - 20) * (lk.waterR - 20)) h = minLandY;
        }
        continue;
      }
      const w = featureWeight(f, x, z);
      if (w > 0) {
        let target = f.y + detail * (f.detail ?? 0);
        const rg = f.ridge;
        if (rg) target += ridged(x * rg.freq, z * rg.freq, rg.oct, seed + rg.seedOff) * rg.amp;
        h = lerp(h, target, w);
      }
    }

    if (bridges && withDeck) h = withBridges(h, x, z);

    // Ranh vùng chơi: ngay sau chân vách địa hình dựng đứng lên, đi tới đó gặp vách.
    if (play) {
      const dPlay = playDist(x, z);
      if (dPlay > playWall) h += play.wallH * smoothstep(playWall, playWall + 60, dPlay);
    }
    return h;
  }

  function heightAt(x: number, z: number): number {
    return heightWith(x, z, true);
  }
  /** Độ cao KHÔNG tính mặt cầu: client dựng lưới địa hình từ đây (cầu là mesh riêng, không để thành đất lòi ra dưới cầu). */
  function surfaceAt(x: number, z: number): number {
    return bridges ? heightWith(x, z, false) : heightWith(x, z, true);
  }

  function inWater(x: number, z: number): boolean {
    const lk = water?.lake;
    if (!lk) return false;
    const dx = x - lk.x;
    const dz = z - lk.z;
    return dx * dx + dz * dz < lk.r * lk.r;
  }

  function groundAt(x: number, z: number): number {
    const h = heightAt(x, z);
    if (water && h < water.y - water.wade && inWater(x, z)) return water.y - water.wade;
    return h;
  }

  const byId = new Map(feats.map((f) => [f.id, f]));
  const biomeRules = (def.biomes ?? []).map((b) => {
    const f = byId.get(b.feature);
    if (!f) throw new Error(`terrain ${def.id}: biome tham chiếu khu không có: ${b.feature}`);
    return { f, biome: b.biome, min: b.min };
  });
  function biomeAt(x: number, z: number): Biome {
    for (const r of biomeRules) if (featureWeight(r.f, x, z) > r.min) return r.biome;
    return 'wild';
  }

  const playBounds = play
    ? { x0: play.cx - play.half, z0: play.cz - play.half, x1: play.cx + play.half, z1: play.cz + play.half }
    : { x0: 0, z0: 0, x1: def.size, z1: def.size };

  function clampPlay(x: number, z: number, out: { x: number; z: number }) {
    const d = playDist(x, z);
    if (play && d > playWall) {
      const k = playWall / d;
      out.x = play.cx + (x - play.cx) * k;
      out.z = play.cz + (z - play.cz) * k;
    } else {
      out.x = x;
      out.z = z;
    }
    return out;
  }

  return { id: def.id, def, size: def.size, margin: def.margin, colliders: def.colliders, playWall, playBounds, blockRise: !!islands, heightAt, surfaceAt, groundAt, inWater, biomeAt, featureWeight, playDist, clampPlay };
}

// ---- Đăng ký theo level ----

const REGISTRY = new Map<string, Terrain>();
/** Level dùng chung địa hình với level khác (bí cảnh Kiếm Trủng nằm trên bản đồ Vân Lam). */
const TERRAIN_ALIAS: Record<string, string> = { kiem_trung: 'van_lam', do_kiep: 'van_lam', phuc_mach: 'van_lam' };

/** Đăng ký (hoặc thay) địa hình của một level. Trả địa hình đã dựng. */
export function registerTerrain(def: TerrainDef): Terrain {
  const t = makeTerrain(def);
  REGISTRY.set(def.id, t);
  return t;
}

export const VAN_LAM: Terrain = registerTerrain(VAN_LAM_TERRAIN);

/** Địa hình của level: nhận id hoặc LevelDef (có thể trỏ `terrain` sang id khác). Ném lỗi nếu chưa đăng ký. */
export function terrainOf(level: string | { id: string; terrain?: string }): Terrain {
  const raw = typeof level === 'string' ? level : (level.terrain ?? level.id);
  const t = REGISTRY.get(TERRAIN_ALIAS[raw] ?? raw);
  if (!t) throw new Error(`terrainOf: level chưa có địa hình: ${raw}`);
  return t;
}

// ---- Lối tắt cho Vân Lam (giữ API cũ) ----

/** Độ cao mặt đất Vân Lam tại (x, z). Hàm thuần, tất định. */
export const heightAt = VAN_LAM.heightAt;
export const inLakeWater = VAN_LAM.inWater;
export const groundAt = VAN_LAM.groundAt;
export const biomeAt = VAN_LAM.biomeAt;

/** Lơ lửng cao hơn mức này so với mặt đất thì coi là đang trên không (không ra chiêu được). Server và HUD dùng chung. */
export const AIRBORNE_HEIGHT = 2.5;

const LEGACY = new Map<Feature, TerrainFeature>(
  [
    [VALLEY, 'valley'],
    [SUOI, 'suoi'],
    [FOREST, 'forest'],
    [VACH, 'vach'],
    [PORTAL_PAD, 'portal'],
    [LAKE, 'lake'],
    [KIEM_TRUNG, 'kiem_trung'],
    [SECT, 'sect'],
  ].map(([f, id]) => [f as Feature, VAN_LAM_TERRAIN.features.find((x) => x.id === id) as TerrainFeature]),
);
/** Trọng số khu Vân Lam theo hằng `Feature` của level.ts (SECT, LAKE…). */
export function featureWeight(f: Feature, x: number, z: number): number {
  const tf = LEGACY.get(f) ?? (f as TerrainFeature);
  return VAN_LAM.featureWeight(tf, x, z);
}
