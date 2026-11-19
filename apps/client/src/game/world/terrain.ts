import * as THREE from 'three/webgpu';
import { texture, positionWorld, vertexColor, mix as tmix } from 'three/tsl';
import { getCloudNoise } from '../../render/noiseTex';
import { createWorldMaterial } from '../../render/materials/world';
import { applyGroundShader, clearGroundShader, setGroundStrata, setGroundTileBreak, type GroundLevel } from '../../render/materials/ground';
import type { GroundTextures } from '../../base/groundTextures';
import {
  COLLIDERS,
  fbm,
  featureWeight,
  FOREST,
  hash01,
  KIEM_TRUNG,
  LAKE,
  PORTAL_PAD,
  SECT,
  TERRAIN_SEED,
  trailsOf,
  VALLEY,
  WATER_Y,
} from '@dtl/shared';
import { LEVELS } from '@dtl/content';
import { levelTerrain } from '../../base/levelCtx';
import { col, G, GeoBuilder, mat } from '../core/geo';
import { withSightFade } from './occlusion';
import { sectPaving } from '../../render/groundMask';
import { nearPropTree } from './propScatter';
import { vanHaiArt, type VhPalette } from './vanHaiArt';
import { tkGroundColor } from './thienKhuyetArt';
import { bhGroundColor, riftPath, type RiftPt } from './bacHoangArt';
import { xichCracks, xichGroundColor } from './xichArt';

const TILE = 256;
const NEAR_R = 3;
const COARSE_CELL = 32;
const VEG_NEAR_R = 2;
const VEG_FAR_R = 4;

const C_GRASS_SECT = col(0x58a65c);
const C_GRASS_GOLD = col(0xb7b45a);
const C_GRASS_MOSS = col(0x3f7a47);
const C_GRASS_FRESH = col(0x84c168);
const C_ROCK_BLUE = col(0x7f95aa);
const C_GRASS_VALLEY = col(0x86b45c);
const C_GRASS_FOREST = col(0x4f8f4c);
const C_GRASS_WILD = col(0x6f9d58);
const C_GRASS_DRY = col(0x9aa86a);
const C_ROCK = col(0x7d7a76);
const C_ROCK_DARK = col(0x5f5d5c);
const C_SNOW = col(0xf3f6fa);
const C_SAND = col(0xcdbf96);
const C_STONE = col(0xb9b3a6);
const C_LAKEBED = col(0x5e7f86);
const C_TOMB = col(0x5d5a66);
const _c = new THREE.Color();

/** Địa hình riêng của Vân Lam (và Kiếm Trủng): các khu Vân Lam dùng cho màu, cây, mặt nạ. Level khác dùng màu theo biome. */
/** Địa hình của Terrain đang dựng (gắn lúc `new Terrain()`): hàm dựng ô gọi thẳng, không qua con trỏ level từng đỉnh. */
let T = levelTerrain();
let VL = T.id === 'van_lam';
/** Level dùng bảng màu đất son (Đoạn Mạch, E2-I). */
let OCHRE = T.id === 'doan_mach';
/** Level dùng bảng tro (Bắc Hoang, DV-1): hoang nguyên tro bên này, đất tro than bên kia vết nứt. */
let ASH = T.id === 'bac_hoang';
/** Level sân đá phiến thành cổ (Thiên Khuyết, E4-I). */
let SLATE = T.id === 'thien_khuyet';
/** Level phó bản hẻm núi Xích Tẫn Khích (DV-3K): bảng màu đất riêng theo `TerrainDef.canyon`. */
let XICH = T.def.canyon !== undefined && T.id === 'xich_tan_khich';
let XICH_CRACKS: RiftPt[][] = [];
const _tk: [number, number, number] = [0, 0, 0];
const _bh: [number, number, number] = [0, 0, 0];
let BH_PATH: RiftPt[] = [];
function heightAt(x: number, z: number): number {
  return T.surfaceAt(x, z);
}
function isVanLam(): boolean {
  return VL;
}

const C_OCHRE = col(0xb2a082);
const C_OCHRE_DRY = col(0xc4b08e);
const C_OCHRE_RED = col(0x9f8068);
const C_SANDSTONE = col(0xa09078);
const C_SANDSTONE_DARK = col(0x7d6e5c);
/** Đất son cốc đứt mạch: ngả vàng đất khô ↔ đỏ gạch theo nhiễu, dốc lộ sa thạch (không tuyết: art bible). */
// Màu đất Bắc Hoang (bảng phụ `rift_*`): `bacHoangArt.ts` `bhGroundColor`.

function ochreColor(x: number, z: number, h: number, ny: number, out: THREE.Color): void {
  const n = fbm(x * 0.013, z * 0.013, 2, T.def.seed + 300);
  out
    .copy(C_OCHRE)
    .lerp(n > 0 ? C_OCHRE_DRY : C_OCHRE_RED, Math.min(1, Math.abs(n) * 0.9))
    .multiplyScalar(0.94 + n * 0.12);
  const slope = 1 - ny;
  if (slope > 0.12) out.lerp(n > 0 ? C_SANDSTONE : C_SANDSTONE_DARK, Math.min(1, (slope - 0.12) * 4.5));
  const w = T.def.water;
  if (w && h < w.y + 2.2) out.lerp(C_SAND, Math.min(1, (w.y + 2.2 - h) / 1.6));
}

const C_ISLE_DARK = col(0x7c7d6c);
const C_CLOUD_LIGHT = col(0xc9d4d7);
const C_CLOUD_SHADE = col(0xa4b2b8);
const C_CLOUD_DEEP = col(0x8da2b4);
const C_CLOUD_WARM = col(0xe9e4d6);
/**
 * Màu level đảo nổi (E3-N, tông trầm theo art bible v3): mặt đảo là rêu xám-lục trộn đất nâu và mảng đá, dốc lộ đá; sàn mây là mặt mây
 * trắng xám gợn noise (không có cỏ, đá, cây). Vách đảo (cao hơn sàn nhiều) màu đá tối.
 */
const palCache = new Map<VhPalette, Record<'moss' | 'soil' | 'stone' | 'dark' | 'trail' | 'wet', THREE.Color>>();
function palColors(p: VhPalette) {
  let c = palCache.get(p);
  if (!c) {
    // nâng sáng: kết xuất (sương, grading) hạ màu đỉnh khoảng 40 %, bảng màu viết theo màu "thật" của đất
    const lift = (h: number) => {
      const c = col(h).multiplyScalar(1.3);
      c.r = Math.min(1, c.r);
      c.g = Math.min(1, c.g);
      c.b = Math.min(1, c.b);
      return c;
    };
    c = { moss: lift(p.moss), soil: lift(p.soil), stone: lift(p.stone), dark: lift(p.dark), trail: lift(p.trail), wet: lift(p.wet) };
    palCache.set(p, c);
  }
  return c;
}
function islandColor(x: number, z: number, h: number, ny: number, out: THREE.Color): void {
  const f = T.def.voidFloor ?? 0;
  const n = fbm(x * 0.013, z * 0.013, 2, T.def.seed + 300);
  if (h < f + 6) {
    const m = fbm(x * 0.02 + 40, z * 0.02 - 17, 3, T.def.seed + 411);
    // sàn mây: ba tầng nhiễu (mảng lớn, dải gợn, vân nhỏ) cho chiều sâu, ngả xanh lam ở chỗ trũng và ngà ở chỗ cao
    const swell = fbm(x * 0.006 - 9, z * 0.006 + 5, 2, T.def.seed + 433);
    const streak = fbm(x * 0.05 + z * 0.012, z * 0.014 - x * 0.004, 2, T.def.seed + 457);
    out.copy(C_CLOUD_LIGHT).lerp(C_CLOUD_SHADE, Math.max(0, Math.min(1, 0.5 + m * 1.4)) * 0.75);
    out.lerp(C_CLOUD_DEEP, Math.max(0, Math.min(1, 0.5 - swell * 1.5)) * 0.55);
    out.lerp(C_CLOUD_WARM, Math.max(0, Math.min(1, streak * 2.2 + 0.1)) * 0.5);
    return;
  }
  const art = vanHaiArt(T.def);
  const isl = art.islandAt(x, z);
  if (!isl || h < f + 40) {
    // vách đảo (cao hơn sàn nhiều nhưng ngoài mặt đảo): đá tối
    out.copy(C_ISLE_DARK);
    return;
  }
  const P = palColors(isl.pal);
  // gốc: rêu ↔ đất theo mảng vừa, đốm rêu sẫm theo mảng lớn
  const drift = fbm(x * 0.006 + 31, z * 0.006 - 7, 2, T.def.seed + 590);
  const m = fbm(x * 0.045, z * 0.045, 2, T.def.seed + 512);
  const patch = fbm(x * 0.021 + 13, z * 0.021 - 29, 2, T.def.seed + 530);
  out.copy(P.moss).lerp(P.soil, Math.max(0, Math.min(1, 0.5 + m * 1.7)));
  out.lerp(P.dark, Math.max(0, Math.min(1, patch * 2.6 - 0.1)) * 0.5);
  out.multiplyScalar(1 + drift * 0.3);
  // đá lộ: theo nhiễu + độ dốc + bias của đảo; vân tầng ngang như phiến đá
  const slope = 1 - ny;
  const rock = art.rockW(isl, x, z, slope);
  if (rock > 0.02) {
    const strata = 0.5 + 0.5 * Math.sin((x * 0.55 + z * 0.35) * 0.7 + n * 5);
    out.lerp(P.stone, rock * 0.9);
    out.multiplyScalar(1 - 0.12 * rock * strata);
  }
  if (slope > 0.1) out.lerp(P.dark, Math.min(1, (slope - 0.1) * 4));
  // lối mòn: đất nén sáng, lẫn sỏi
  const tw = art.trailW(isl, x, z);
  if (tw > 0) {
    out.lerp(P.trail, tw * (isl.kind === 'hub' ? 0.92 : 0.45));
    // Phù Đảo Các: lối lát đá, vân ô phiến (mỗi ô ~1,7 m một sắc độ riêng)
    if (isl.kind === 'hub')
      out.multiplyScalar(1 - tw * 0.1 + tw * 0.14 * hash01(Math.floor(x / 1.7), Math.floor(z / 1.7), 77) - 0.22 * tw * (1 - tw) * 4);
  }
  // bờ hồ gương: đất ẩm sẫm, lòng hồ phù sa
  const pw = art.pondW(x, z);
  if (pw > 0) out.lerp(P.wet, Math.min(1, pw * 1.3) * 0.85);
  // sỏi/đốm mịn và sáng tối theo nhiễu
  const fine = fbm(x * 0.19, z * 0.19, 2, T.def.seed + 700);
  out.multiplyScalar(0.96 + n * 0.22 + fine * 0.16);
  // rìa đảo ngả tối (đá treo và rễ bên dưới đổ bóng lên mép)
  const d = Math.hypot(x - isl.x, z - isl.z);
  if (d > isl.r - 14) out.multiplyScalar(1 - 0.16 * Math.min(1, (d - (isl.r - 14)) / 16));
}

/** Màu mặt đất của level không phải Vân Lam: cỏ/đá/tuyết theo độ dốc và độ cao, bờ nước ra cát. */
function genericColor(x: number, z: number, h: number, ny: number, out: THREE.Color): void {
  const t = T;
  if (t.def.islands) return islandColor(x, z, h, ny, out);
  const n = fbm(x * 0.013, z * 0.013, 2, t.def.seed + 300);
  out
    .copy(C_GRASS_WILD)
    .lerp(C_GRASS_DRY, Math.max(0, n) * 0.35)
    .multiplyScalar(0.92 + n * 0.14);
  const slope = 1 - ny;
  if (slope > 0.12) out.lerp(n > 0 ? C_ROCK : C_ROCK_DARK, Math.min(1, (slope - 0.12) * 4.5));
  if (h > 250) out.lerp(C_SNOW, Math.min(1, (h - 250) / 60) * (slope < 0.45 ? 1 : 0.4));
  const w = t.def.water;
  if (w && h < w.y + 2.2) out.lerp(C_SAND, Math.min(1, (w.y + 2.2 - h) / 1.6));
}

/** Màu mặt đất theo vị trí, độ cao và độ dốc. */
function terrainColor(x: number, z: number, h: number, ny: number, out: THREE.Color): void {
  if (SLATE) {
    tkGroundColor(T.def, x, z, ny, _tk);
    return void out.setRGB(_tk[0], _tk[1], _tk[2], THREE.SRGBColorSpace);
  }
  if (XICH) {
    xichGroundColor(T.def, XICH_CRACKS, x, z, h, ny, _bh);
    return void out.setRGB(_bh[0], _bh[1], _bh[2], THREE.SRGBColorSpace);
  }
  if (OCHRE) return ochreColor(x, z, h, ny, out);
  if (ASH) {
    bhGroundColor(T.def, BH_PATH, x, z, h, ny, _bh);
    return void out.setRGB(_bh[0], _bh[1], _bh[2], THREE.SRGBColorSpace);
  }
  if (!isVanLam()) return genericColor(x, z, h, ny, out);
  const wSect = featureWeight(SECT, x, z);
  const wValley = featureWeight(VALLEY, x, z);
  const wForest = featureWeight(FOREST, x, z);
  const wLake = featureWeight(LAKE, x, z);
  const wPad = featureWeight(PORTAL_PAD, x, z);
  const n = fbm(x * 0.013, z * 0.013, 2, TERRAIN_SEED + 300);

  out.copy(C_GRASS_WILD);
  if (wValley > 0) out.lerp(C_GRASS_VALLEY, Math.min(1, wValley * 1.4));
  if (wForest > 0) out.lerp(C_GRASS_FOREST, Math.min(1, wForest * 1.4));
  out.lerp(C_GRASS_DRY, Math.max(0, n) * 0.35);
  // MAP-1: cỏ đổi sắc theo mảng (vàng nắng, xanh đậm có rêu, lục non) thay cho một xanh bão hòa đều; giảm bão hòa nhẹ.
  const n2 = fbm(x * 0.045, z * 0.045, 2, TERRAIN_SEED + 410);
  const n3 = fbm(x * 0.021 + 90, z * 0.021, 2, TERRAIN_SEED + 520);
  out.lerp(C_GRASS_GOLD, Math.max(0, Math.min(1, (n2 - 0.05) * 2.2)) * 0.5);
  out.lerp(C_GRASS_MOSS, Math.max(0, Math.min(1, (-n2 - 0.1) * 2.2)) * 0.45);
  out.lerp(C_GRASS_FRESH, Math.max(0, Math.min(1, (n3 - 0.1) * 2.5)) * 0.4);
  const lum = out.r * 0.3 + out.g * 0.59 + out.b * 0.11;
  out.r += (lum - out.r) * 0.1;
  out.g += (lum - out.g) * 0.1;
  out.b += (lum - out.b) * 0.1;
  out.multiplyScalar(0.92 + n * 0.14);

  // Dốc đứng lộ đá: vân đá xếp tầng theo độ cao (vách trầm tích kiểu sơn thủy), càng cao càng ngả lam nhạt.
  const slope = 1 - ny;
  if (slope > 0.12) {
    const rock = n > 0 ? C_ROCK : C_ROCK_DARK;
    out.lerp(rock, Math.min(1, (slope - 0.12) * 4.5));
    const k = Math.min(1, (slope - 0.12) * 4.5);
    // Dải tầng rộng (chu kỳ ~55 m, hợp lưới thô của ô xa) + vệt khe dọc theo nhiễu: vách sơn thủy có vân thay vì mảng phẳng.
    const band = 0.5 + 0.5 * Math.sin(h * 0.115 + n * 4 + n2 * 3);
    const streak = fbm(x * 0.05 + z * 0.021, z * 0.05 - x * 0.021, 2, TERRAIN_SEED + 640);
    out.multiplyScalar(1 - k * (0.32 - band * 0.5 + Math.max(0, -streak) * 0.5));
    out.lerp(C_ROCK_BLUE, k * Math.max(0, Math.min(1, (h - 150) / 170)) * 0.4);
  }
  // Tuyết chỉ ở các đỉnh rất cao, mỏng (không phủ trắng cả sườn núi gần).
  if (h > 340) out.lerp(C_SNOW, Math.min(1, (h - 340) / 70) * (slope < 0.45 ? 0.75 : 0.3));
  // Bờ cát và lòng hồ.
  if (wLake > 0) {
    if (h < WATER_Y + 2.2) out.lerp(C_SAND, Math.min(1, (WATER_Y + 2.2 - h) / 1.6));
    if (h < WATER_Y - 1) out.lerp(C_LAKEBED, Math.min(1, (WATER_Y - 1 - h) / 5));
  }
  // Sân lát đá của tông môn và bệ cổng bí cảnh.
  // MAP-1: đỉnh núi tông môn phủ cỏ ngọc tươi; chỉ chỗ lát thật (đại lộ, sân, bát quái: `sectPaving`) mới ngả màu đá.
  if (wSect > 0.5) out.lerp(C_GRASS_SECT, Math.min(0.85, (wSect - 0.5) * 3));
  const paved = sectPaving(x - SECT.x, z - SECT.z);
  if (paved > 0) out.lerp(C_STONE, paved);
  if (wPad > 0.9) out.lerp(C_STONE, Math.min(1, (wPad - 0.9) * 10));
  // Đất chết xám tím của Kiếm Trủng.
  const wTomb = featureWeight(KIEM_TRUNG, x, z);
  if (wTomb > 0.15) out.lerp(C_TOMB, Math.min(1, (wTomb - 0.15) * 1.8));
}

/** Trọng số vùng cho shader mặt đất: x rừng, y đất khô, z đất chết Kiếm Trủng, w dự phòng. */
function biomeWeights(x: number, z: number, o: Float32Array, k: number): void {
  if (OCHRE || SLATE || ASH) {
    // Một lớp nền duy nhất: ở preset Vừa/Thấp lớp nền chọn cứng theo ngưỡng nên mảng đất/đất nứt hiện thành vệt mép gắt (E2-I); biến thiên màu do màu đỉnh (`ochreColor`) lo.
    o[k] = o[k + 1] = o[k + 2] = o[k + 3] = 0;
    return;
  }
  if (!isVanLam()) {
    o[k] = o[k + 1] = o[k + 2] = o[k + 3] = 0;
    return;
  }
  const n = fbm(x * 0.013, z * 0.013, 2, TERRAIN_SEED + 300);
  o[k] = Math.min(1, featureWeight(FOREST, x, z) * 1.4);
  o[k + 1] = Math.max(0, Math.min(1, n * 1.6 + 0.1 - featureWeight(VALLEY, x, z) * 0.6));
  o[k + 2] = Math.min(1, Math.max(0, (featureWeight(KIEM_TRUNG, x, z) - 0.15) * 1.8));
  o[k + 3] = 0;
}

/** Level đảo nổi: ô lưới có độ chênh cao hơn mức này (m) là vách đảo, không dựng mặt (vách là khối đá treo ở skyIslands.ts). */
const CLIFF_SKIP = 9;
/** Ô nằm ở vách ranh vùng chơi (không phải vách đảo): vẫn dựng mặt, nếu không để lại các khe mảnh như đường kẻ dọc trên trời. */
function onPlayWall(pos: Float32Array, a: number, d: number): boolean {
  const cx = (pos[a * 3]! + pos[d * 3]!) / 2;
  const cz = (pos[a * 3 + 2]! + pos[d * 3 + 2]!) / 2;
  return T.playDist(cx, cz) > T.playWall - 12;
}
function quadSpan(pos: Float32Array, a: number, b: number, c: number, d: number): number {
  const ya = pos[a * 3 + 1]!;
  const yb = pos[b * 3 + 1]!;
  const yc = pos[c * 3 + 1]!;
  const yd = pos[d * 3 + 1]!;
  return Math.max(ya, yb, yc, yd) - Math.min(ya, yb, yc, yd);
}

function buildTileGeometry(x0: number, z0: number, size: number, res: number, skirt: number): THREE.BufferGeometry {
  const cell = size / res;
  const w = res + 3;
  const hs = new Float32Array(w * w);
  for (let j = 0; j < w; j++) {
    for (let i = 0; i < w; i++) hs[j * w + i] = heightAt(x0 + (i - 1) * cell, z0 + (j - 1) * cell);
  }
  const n1 = res + 1;
  const skirtVerts = skirt > 0 ? n1 * 4 : 0;
  const vcount = n1 * n1 + skirtVerts;
  const pos = new Float32Array(vcount * 3);
  const nor = new Float32Array(vcount * 3);
  const colr = new Float32Array(vcount * 3);
  const bio = new Float32Array(vcount * 4);
  let o = 0;
  for (let j = 0; j < n1; j++) {
    for (let i = 0; i < n1; i++) {
      const hi = (j + 1) * w + (i + 1);
      const h = hs[hi]!;
      let nx = hs[hi - 1]! - hs[hi + 1]!;
      let ny = 2 * cell;
      let nz = hs[hi - w]! - hs[hi + w]!;
      const l = Math.sqrt(nx * nx + ny * ny + nz * nz);
      nx /= l;
      ny /= l;
      nz /= l;
      const x = x0 + i * cell;
      const z = z0 + j * cell;
      pos[o] = x;
      pos[o + 1] = h;
      pos[o + 2] = z;
      nor[o] = nx;
      nor[o + 1] = ny;
      nor[o + 2] = nz;
      terrainColor(x, z, h, ny, _c);
      colr[o] = _c.r;
      colr[o + 1] = _c.g;
      colr[o + 2] = _c.b;
      biomeWeights(x, z, bio, (o / 3) * 4);
      o += 3;
    }
  }
  const idx: number[] = [];
  const cliff = T.def.islands ? CLIFF_SKIP : Infinity;
  for (let j = 0; j < res; j++) {
    for (let i = 0; i < res; i++) {
      const a = j * n1 + i;
      const b = a + 1;
      const c = a + n1;
      const d = c + 1;
      if (cliff < Infinity && quadSpan(pos, a, b, c, d) > cliff && !onPlayWall(pos, a, d)) continue; // vách đảo: bỏ mặt đứng, `skyIslands.ts` dựng khối đá treo
      idx.push(a, c, b, b, c, d);
    }
  }
  if (skirt > 0) {
    // Viền rủ xuống che khe hở giữa các ô khác độ phân giải.
    let sv = n1 * n1;
    const edge = (get: (k: number) => number) => {
      const start = sv;
      for (let k = 0; k < n1; k++) {
        const src = get(k) * 3;
        const dst = sv * 3;
        pos[dst] = pos[src]!;
        pos[dst + 1] = pos[src + 1]! - skirt;
        pos[dst + 2] = pos[src + 2]!;
        nor[dst] = nor[src]!;
        nor[dst + 1] = nor[src + 1]!;
        nor[dst + 2] = nor[src + 2]!;
        colr[dst] = colr[src]!;
        colr[dst + 1] = colr[src + 1]!;
        colr[dst + 2] = colr[src + 2]!;
        bio.copyWithin(sv * 4, (src / 3) * 4, (src / 3) * 4 + 4);
        sv++;
      }
      for (let k = 0; k < res; k++) {
        const a = get(k);
        const b = get(k + 1);
        const c = start + k;
        const d = start + k + 1;
        idx.push(a, c, b, b, c, d, a, b, c, b, d, c);
      }
    };
    edge((k) => k);
    edge((k) => res * n1 + k);
    edge((k) => k * n1);
    edge((k) => k * n1 + res);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.BufferAttribute(colr, 3));
  g.setAttribute('biome', new THREE.BufferAttribute(bio, 4));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

// ---------- cây cối ----------

const C_STONE_ROCK = [col(0x8a8782), col(0x76746f), col(0x9a968f)];

function addRock(b: GeoBuilder, x: number, y: number, z: number, s: number, r: number): void {
  b.add(G.ico0, mat(x, y + 0.3 * s, z, r * 2, r * 6, r, 1.3 * s, 0.9 * s, 1.1 * s), C_STONE_ROCK[(r * 3) | 0]!);
}

function buildVegetation(tx: number, tz: number, far: boolean): THREE.BufferGeometry | null {
  if (!isVanLam()) return null;
  const b = new GeoBuilder();
  const cellSize = 16;
  const cells = TILE / cellSize;
  const x0 = tx * TILE;
  const z0 = tz * TILE;
  for (let j = 0; j < cells; j++) {
    for (let i = 0; i < cells; i++) {
      const gx = tx * cells + i;
      const gz = tz * cells + j;
      const r1 = hash01(gx, gz, 11);
      const r2 = hash01(gx, gz, 23);
      const r3 = hash01(gx, gz, 37);
      const r4 = hash01(gx, gz, 53);
      const x = x0 + (i + 0.15 + r1 * 0.7) * cellSize;
      const z = z0 + (j + 0.15 + r2 * 0.7) * cellSize;
      const h = heightAt(x, z);
      if (h < WATER_Y + 1.2 || h > 285) continue;
      if (T.def.islands && h < (T.def.voidFloor ?? 0) + 40) continue; // không cây/bụi trên sàn mây hay vách
      const wSect = featureWeight(SECT, x, z);
      const wForest = featureWeight(FOREST, x, z);
      const wValley = featureWeight(VALLEY, x, z);
      const wLake = featureWeight(LAKE, x, z);
      const wPad = featureWeight(PORTAL_PAD, x, z);
      if (wPad > 0.85 || featureWeight(KIEM_TRUNG, x, z) > 0.25) continue;
      // Quanh cổ thụ/thông Tripo (P2-A4) bỏ cây thủ tục để không chồng lên nhau.
      if (nearPropTree(x, z)) continue;
      // Độ dốc: bỏ cây trên vách đá.
      const slope = Math.abs(heightAt(x + 3, z) - h) + Math.abs(heightAt(x, z + 3) - h);

      if (wSect > 0.8) continue; // trong tông môn không rải đá/cây
      if (slope > 5.5) {
        if (r3 < 0.12 && !far) addRock(b, x, h, z, 1 + r4 * 2.2, r1);
        continue;
      }
      let density = 0.3;
      if (wForest > 0.3) density = 0.8;
      else if (wValley > 0.4) density = 0.14;
      else if (wLake > 0.3) density = 0.2;
      if (h > 200) density *= 0.5;
      if (r3 > density) {
        if (r3 > 0.94 && !far) addRock(b, x, h, z, 0.6 + r4 * 1.4, r1);
        continue;
      }
      // Cây là của propScatter.scatterTrees + PropLayer (cây Tripo); terrain chỉ rải đá.
    }
  }
  return b.count > 0 ? b.build() : null;
}

// ---------- quản lý ô ----------

interface TileRec {
  key: number;
  tx: number;
  tz: number;
  res: number;
  mesh: THREE.Mesh | null;
  veg: THREE.Mesh | null;
  vegFar: boolean | null;
}

export class Terrain {
  group = new THREE.Group();
  material = createWorldMaterial({ vertexColors: true });
  /** Cây, bụi: làm mờ khi đứng chắn giữa camera và nhân vật. */
  vegMaterial = withSightFade(createWorldMaterial({ vertexColors: true }));
  private tiles = new Map<number, TileRec>();
  private coarse: THREE.Mesh;
  private coarseIndex: THREE.BufferAttribute;
  private coarseDirty = true;
  private ctx = -999;
  private ctz = -999;
  shadows = false;
  /** Số ô đã dựng xong (để màn hình loading biết khi nào vào game). */
  ready = false;

  /** Cạnh thế giới của level lúc dựng (m) và số ô/lưới thô theo đó; mỗi level một đối tượng Terrain. */
  readonly size = levelTerrain().size;
  private readonly NT = this.size / TILE;
  private readonly COARSE_N = this.size / COARSE_CELL;

  constructor() {
    T = levelTerrain();
    VL = T.id === 'van_lam';
    OCHRE = T.id === 'doan_mach';
    ASH = T.id === 'bac_hoang';
    BH_PATH = ASH ? riftPath(T.def) : [];
    SLATE = T.id === 'thien_khuyet';
    XICH = T.def.canyon !== undefined && T.id === 'xich_tan_khich';
    XICH_CRACKS = XICH ? xichCracks(T.def, (x, z) => T.heightAt(x, z)) : [];
    const COARSE_N = this.COARSE_N;
    const g = buildTileGeometry(0, 0, this.size, COARSE_N, 0);
    this.coarseIndex = new THREE.BufferAttribute(new Uint16Array(COARSE_N * COARSE_N * 6), 1);
    g.setIndex(this.coarseIndex);
    if (T.def.islands) {
      // Đảo nổi (E3-I): màu đỉnh chỉ có độ phân giải ~4 m nên mặt đảo trông phẳng như thảm; nhân thêm hai tầng nhiễu theo tọa độ thế giới (mảng ~40 m và vân ~6 m,
      // từ texture nhiễu dùng chung của trời/mây) cho đất có đốm, vệt sáng tối. Chỉ vài phép lấy mẫu mỗi điểm ảnh.
      const nz = getCloudNoise();
      const big = texture(nz, positionWorld.xz.mul(1 / 71));
      const mid = texture(nz, positionWorld.xz.mul(1 / 9.7));
      const fine = texture(nz, positionWorld.xz.mul(1 / 2.3));
      this.material.colorNode = vertexColor().mul(
        tmix(0.86, 1.16, big.g)
          .mul(tmix(0.9, 1.1, mid.b))
          .mul(tmix(0.94, 1.06, fine.b)),
      );
    }
    this.coarse = new THREE.Mesh(g, this.material);
    this.coarse.frustumCulled = false;
    this.coarse.receiveShadow = false;
    this.group.add(this.coarse);
  }

  private desiredRes(d: number): number {
    return d <= 1 ? 64 : 32;
  }

  /** Gọi mỗi khung hình. Dựng tối đa `budget` ô mỗi lần để không giật. */
  update(px: number, pz: number, budget = 1): void {
    const ctx = Math.floor(px / TILE);
    const ctz = Math.floor(pz / TILE);
    if (ctx !== this.ctx || ctz !== this.ctz) {
      this.ctx = ctx;
      this.ctz = ctz;
      for (const [key, t] of this.tiles) {
        const d = Math.max(Math.abs(t.tx - ctx), Math.abs(t.tz - ctz));
        if (d > NEAR_R + 1) {
          this.disposeTile(t);
          this.tiles.delete(key);
          this.coarseDirty = true;
        }
      }
    }
    let pending = 0;
    // Duyệt từ gần ra xa để ô dưới chân có trước.
    for (let ring = 0; ring <= Math.max(NEAR_R, VEG_FAR_R) && budget > 0; ring++) {
      for (let dz = -ring; dz <= ring && budget > 0; dz++) {
        for (let dx = -ring; dx <= ring && budget > 0; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== ring) continue;
          const tx = ctx + dx;
          const tz = ctz + dz;
          if (tx < 0 || tz < 0 || tx >= this.NT || tz >= this.NT) continue;
          const key = tz * this.NT + tx;
          let t = this.tiles.get(key);
          if (!t) {
            t = { key, tx, tz, res: 0, mesh: null, veg: null, vegFar: null };
            this.tiles.set(key, t);
          }
          if (ring <= NEAR_R) {
            const res = this.desiredRes(ring);
            if (t.res !== res) {
              const geo = buildTileGeometry(tx * TILE, tz * TILE, TILE, res, (TILE / res) * 1.5 + 5);
              if (t.mesh) {
                this.group.remove(t.mesh);
                t.mesh.geometry.dispose();
              }
              t.mesh = new THREE.Mesh(geo, this.material);
              t.mesh.receiveShadow = this.shadows;
              this.group.add(t.mesh);
              t.res = res;
              this.coarseDirty = true;
              budget--;
              pending++;
              continue;
            }
          }
          const wantFar = ring > VEG_NEAR_R;
          if (ring <= VEG_FAR_R && t.vegFar !== wantFar) {
            const geo = buildVegetation(tx, tz, wantFar);
            if (t.veg) {
              this.group.remove(t.veg);
              t.veg.geometry.dispose();
              t.veg = null;
            }
            if (geo) {
              t.veg = new THREE.Mesh(geo, this.vegMaterial);
              t.veg.castShadow = this.shadows && !wantFar;
              this.group.add(t.veg);
            }
            t.vegFar = wantFar;
            budget--;
            pending++;
          }
        }
      }
    }
    if (pending === 0) this.ready = true;
    if (this.coarseDirty) this.rebuildCoarseIndex();
  }

  /** Khoét lỗ trên lưới thô ở những ô đã có lưới mịn. */
  private rebuildCoarseIndex(): void {
    this.coarseDirty = false;
    const per = TILE / COARSE_CELL;
    const COARSE_N = this.COARSE_N;
    const n1 = COARSE_N + 1;
    // Giữ nguyên một buffer chỉ số, chỉ ghi lại nội dung và đổi draw range
    // (thay buffer mới giữa chừng làm WebGPU báo lỗi).
    const idx = this.coarseIndex.array as Uint16Array;
    const cpos = T.def.islands ? (this.coarse.geometry.attributes.position!.array as Float32Array) : null;
    let o = 0;
    for (let j = 0; j < COARSE_N; j++) {
      const tz = (j / per) | 0;
      for (let i = 0; i < COARSE_N; i++) {
        const tx = (i / per) | 0;
        const t = this.tiles.get(tz * this.NT + tx);
        if (t && t.mesh) continue;
        const a = j * n1 + i;
        const b = a + 1;
        const c = a + n1;
        const d = c + 1;
        if (cpos && quadSpan(cpos, a, b, c, d) > CLIFF_SKIP && !onPlayWall(cpos, a, d)) continue;
        idx[o++] = a;
        idx[o++] = c;
        idx[o++] = b;
        idx[o++] = b;
        idx[o++] = c;
        idx[o++] = d;
      }
    }
    this.coarseIndex.needsUpdate = true;
    this.coarse.geometry.setDrawRange(0, o);
  }

  private disposeTile(t: TileRec): void {
    if (t.mesh) {
      this.group.remove(t.mesh);
      t.mesh.geometry.dispose();
    }
    if (t.veg) {
      this.group.remove(t.veg);
      t.veg.geometry.dispose();
    }
  }

  /** Bật shader mặt đất PBR khi bộ texture đã nạp; gọi lại khi đổi preset. */
  setGround(tex: GroundTextures | null, level: GroundLevel): void {
    setGroundTileBreak(XICH);
    setGroundStrata(isVanLam());
    if (tex) applyGroundShader(this.material, tex, level);
    else clearGroundShader(this.material);
  }

  tileCount(): number {
    let n = 0;
    for (const t of this.tiles.values()) if (t.mesh) n++;
    return n;
  }

  dispose(): void {
    for (const t of this.tiles.values()) this.disposeTile(t);
    this.tiles.clear();
    this.coarse.geometry.dispose();
    this.material.dispose();
    this.vegMaterial.dispose();
  }
}

/** Ảnh bản đồ thu nhỏ: mỗi pixel một màu địa hình. */
export function renderMinimap(size: number): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const g = cv.getContext('2d')!;
  const img = g.createImageData(size, size);
  const step = levelTerrain().size / size;
  const c = new THREE.Color();
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const x = (i + 0.5) * step;
      const z = (j + 0.5) * step;
      const h = heightAt(x, z);
      const hx = heightAt(x + step, z);
      const hz = heightAt(x, z + step);
      const ny = 1 / Math.sqrt(1 + ((hx - h) / step) ** 2 + ((hz - h) / step) ** 2);
      terrainColor(x, z, h, ny, c);
      // Đổ bóng theo hướng dốc cho nổi khối.
      const shade = 0.82 + Math.max(-0.3, Math.min(0.3, (h - hx + (h - hz)) / (step * 1.6)));
      let r = c.r * shade;
      let gg = c.g * shade;
      let bb = c.b * shade;
      const wy = levelTerrain().def.water?.y;
      if (isVanLam() ? h < WATER_Y && featureWeight(LAKE, x, z) > 0 : wy !== undefined && h < wy) {
        r = 0.25;
        gg = 0.5;
        bb = 0.66;
      }
      const o = (j * size + i) * 4;
      // Chuyển gần đúng từ tuyến tính sang sRGB.
      img.data[o] = Math.min(255, Math.sqrt(r) * 255);
      img.data[o + 1] = Math.min(255, Math.sqrt(gg) * 255);
      img.data[o + 2] = Math.min(255, Math.sqrt(bb) * 255);
      img.data[o + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return cv;
}

/** Bộ dựng bản đồ thủy mặc (U2-7): dựng một lần theo từng lát thời gian, không chặn khung. */
export interface InkBuilder {
  canvas: HTMLCanvasElement;
  /** Cạnh phủ (m): ảnh phủ vuông từ (0,0). */
  size: number;
  done: boolean;
  /** Chạy tối đa `budgetMs` ms; false nếu level đã đổi giữa chừng (bỏ bộ dựng này). */
  step(budgetMs: number): boolean;
}

const INK_PAPER: [number, number, number] = [239, 230, 208];
const INK_BLACK: [number, number, number] = [42, 40, 36];
const INK_JADE_LO: [number, number, number] = [47, 143, 127];
const INK_JADE_HI: [number, number, number] = [111, 214, 193];

const smooth = (a: number, b: number, x: number): number => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * Làm mượt hộp (trung bình cửa sổ 2r+1) theo hàng rồi theo cột, tại chỗ; mép giữ nguyên giá trị gần nhất.
 * Chạy chia lát: `step(end)` làm từng hàng/cột cho tới khi hết giờ (`performance.now() >= end`), trả true khi xong cả hai lượt.
 */
class BoxBlurJob {
  private tmp: Float32Array;
  private k = 0;
  private cols = false;
  constructor(
    private a: Float32Array,
    private stride: number,
    private r: number,
  ) {
    this.tmp = new Float32Array(stride);
  }
  step(end: number): boolean {
    const { a, stride, r, tmp } = this;
    const w = 2 * r + 1;
    const at = (i: number): number => Math.max(0, Math.min(stride - 1, i));
    while (performance.now() < end) {
      if (!this.cols) {
        const o = this.k * stride;
        let sum = 0;
        for (let q = -r; q <= r; q++) sum += a[o + at(q)]!;
        for (let i = 0; i < stride; i++) {
          tmp[i] = sum / w;
          sum += a[o + at(i + r + 1)]! - a[o + at(i - r)]!;
        }
        for (let i = 0; i < stride; i++) a[o + i] = tmp[i]!;
      } else {
        const i = this.k;
        let sum = 0;
        for (let q = -r; q <= r; q++) sum += a[at(q) * stride + i]!;
        for (let j = 0; j < stride; j++) {
          tmp[j] = sum / w;
          sum += a[at(j + r + 1) * stride + i]! - a[at(j - r) * stride + i]!;
        }
        for (let j = 0; j < stride; j++) a[j * stride + i] = tmp[j]!;
      }
      if (++this.k >= stride) {
        this.k = 0;
        if (this.cols) return true;
        this.cols = true;
      }
    }
    return false;
  }
}

/**
 * Đọc được địa hình trong thủy mặc: núi nét cọ (độ dốc đã làm mượt) có viền chân núi, đồng mức mảnh, sông hồ ngọc thanh viền mực mềm
 * (mặt nạ nước làm nhòe rồi ngưỡng mềm nên mép không răng cưa), đường mòn nét mực, kiến trúc là khối mực, rừng là chấm mực.
 * Mọi thứ sinh từ độ cao địa hình (`surfaceAt`) và dữ liệu level; ảnh `n`×`n` điểm ảnh, dựng chia lát.
 */
export function createInkMap(n = 1536): InkBuilder {
  const t0 = levelTerrain();
  const size = t0.size;
  const cell = size / n;
  const stride = n + 2;
  const H = new Float32Array(stride * stride);
  const water = new Float32Array(n * n);
  const wy = t0.def.water?.y;
  const vl = isVanLam();
  const cv = document.createElement('canvas');
  cv.width = cv.height = n;
  const g = cv.getContext('2d')!;
  const img = g.createImageData(n, n);
  let row = 0;
  /** 0 lấy mẫu độ cao · 1 làm mượt (chia lát) · 2 tô màu · 3 đưa lên canvas theo dải · 4 đường/kiến trúc · 5 rừng theo dải z. */
  let phase: 0 | 1 | 2 | 3 | 4 | 5 = 0;
  let jobs: BoxBlurJob[] = [];
  let hMin = Infinity;
  let hMax = -Infinity;
  const PUT_STRIP = 128;
  const b: InkBuilder = {
    canvas: cv,
    size,
    done: false,
    step(budgetMs) {
      if (levelTerrain() !== t0) return false;
      const end = performance.now() + budgetMs;
      // Mọi phase đều kiểm giờ giữa các hàng/dải nhỏ: không có bước nào chạy liền cả ảnh trong một khung.
      while (!b.done && performance.now() < end) {
        if (phase === 0) {
          // Lấy mẫu độ cao (có viền 1 ô để tính độ dốc) và mặt nạ nước.
          const j = row;
          const z = (j - 1 + 0.5) * cell;
          for (let i = 0; i < stride; i++) {
            const x = (i - 1 + 0.5) * cell;
            const h = heightAt(x, z);
            H[j * stride + i] = h;
            if (i >= 1 && i <= n && j >= 1 && j <= n) {
              if (h < hMin) hMin = h;
              if (h > hMax) hMax = h;
              const w = vl ? h < WATER_Y && featureWeight(LAKE, x, z) > 0 : wy !== undefined && h < wy;
              water[(j - 1) * n + (i - 1)] = w ? 1 : 0;
            }
          }
          if (++row >= stride) {
            row = 0;
            phase = 1;
            // Làm mượt độ cao trước khi tính độ dốc (bỏ gợn nhỏ, còn khối núi) và làm nhòe mặt nạ nước (mép mềm, không răng cưa).
            jobs = [
              new BoxBlurJob(H, stride, 4),
              new BoxBlurJob(H, stride, 4),
              new BoxBlurJob(H, stride, 4),
              new BoxBlurJob(water, n, 2),
              new BoxBlurJob(water, n, 2),
            ];
          }
        } else if (phase === 1) {
          if (jobs[0]!.step(end)) jobs.shift();
          if (!jobs.length) phase = 2;
        } else if (phase === 2) {
          shadeRow(row);
          if (++row >= n) {
            row = 0;
            phase = 3;
          }
        } else if (phase === 3) {
          const h = Math.min(PUT_STRIP, n - row);
          g.putImageData(img, 0, 0, 0, row, n, h);
          row += h;
          if (row >= n) {
            row = 0;
            phase = 4;
          }
        } else if (phase === 4) {
          overlayBase();
          row = 0;
          if (vl) phase = 5;
          else b.done = true;
        } else {
          // Rừng: từng hàng z (mỗi hàng ~190 mẫu).
          if (!treeRow(row)) b.done = true;
          row++;
        }
      }
      return true;
    },
  };

  function shadeRow(j: number): void {
    const range = Math.max(1, hMax - hMin);
    const waterY = vl ? WATER_Y : (wy ?? -1e9);
    for (let i = 0; i < n; i++) {
      const c = (j + 1) * stride + (i + 1);
      const h = H[c]!;
      const dx = (H[c + 1]! - H[c - 1]!) / (2 * cell);
      const dz = (H[c + stride]! - H[c - stride]!) / (2 * cell);
      const slope = Math.hypot(dx, dz);
      // Vân loang của giấy: hai sóng sin chồng nhau, biên độ nhỏ.
      const wash = Math.sin(i * 0.031 + Math.sin(j * 0.017) * 2) * 0.012 + Math.sin(j * 0.043 + i * 0.011) * 0.012;
      let r = INK_PAPER[0] * (1 + wash);
      let gg = INK_PAPER[1] * (1 + wash);
      let bb = INK_PAPER[2] * (1 + wash);
      const wi = j * n + i;
      // Đất: thân núi theo độ dốc + đổ bóng Tây Bắc + viền chân núi (dải hẹp ở độ dốc trung bình) + đồng mức mảnh + cao hơn thì đậm hơn.
      let ink = smooth(0.04, 0.8, slope) * 0.6 + Math.max(0, -(dx + dz) * 0.8) * 0.28;
      ink += smooth(0.16, 0.26, slope) * (1 - smooth(0.34, 0.46, slope)) * 0.36;
      const w8 = Math.max(0.03, (slope * cell) / 8);
      const f8 = (h / 8) % 1;
      if (slope < 0.3 && f8 < Math.min(0.14, w8)) ink += (h / 40) % 1 < Math.min(0.14, w8 / 5) ? 0.24 : 0.12;
      ink += ((h - hMin) / range) * 0.18;
      // Nước: alpha theo mặt nạ đã nhòe (ngưỡng mềm), đậm dần theo độ sâu; viền mực mềm ở chỗ chuyển tiếp.
      const wf = water[wi]!;
      const wa = smooth(0.3, 0.7, wf);
      if (wa > 0) {
        const d = smooth(0, 7, waterY - h);
        const jr = INK_JADE_HI[0] + (INK_JADE_LO[0] - INK_JADE_HI[0]) * d;
        const jg = INK_JADE_HI[1] + (INK_JADE_LO[1] - INK_JADE_HI[1]) * d;
        const jb = INK_JADE_HI[2] + (INK_JADE_LO[2] - INK_JADE_HI[2]) * d;
        r += (jr - r) * wa;
        gg += (jg - gg) * wa;
        bb += (jb - bb) * wa;
        ink *= 1 - wa;
      }
      ink += (1 - smooth(0, 0.2, Math.abs(wf - 0.5))) * 0.5;
      ink = Math.min(0.9, ink);
      const o = wi * 4;
      img.data[o] = r + (INK_BLACK[0] - r) * ink;
      img.data[o + 1] = gg + (INK_BLACK[1] - gg) * ink;
      img.data[o + 2] = bb + (INK_BLACK[2] - bb) * ink;
      img.data[o + 3] = 255;
    }
  }

  /** Đường mòn và kiến trúc (va chạm tĩnh, Vân Lam): vẽ chồng lên nền đã tô (vài trăm nét, rất nhẹ). */
  function overlayBase(): void {
    const k = n / size;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    const zones = LEVELS[t0.id]?.zones ?? [];
    const play = t0.def.play;
    g.strokeStyle = 'rgba(56, 40, 28, 0.78)';
    g.lineWidth = Math.max(1.6, 5 * k);
    for (const tr of trailsOf(t0.id, zones, play ? { cx: play.cx, cz: play.cz } : undefined)) {
      g.beginPath();
      for (let s = 0; s + 1 < tr.length; s++) {
        const [a, c] = [tr[s]!, tr[s + 1]!];
        const mx = (a[0] + c[0]) / 2 + (hash01(a[0], c[1], 4182) - 0.5) * 30;
        const mz = (a[1] + c[1]) / 2 + (hash01(a[1], c[0], 4183) - 0.5) * 30;
        if (s === 0) g.moveTo(a[0] * k, a[1] * k);
        g.quadraticCurveTo(mx * k, mz * k, c[0] * k, c[1] * k);
      }
      g.stroke();
    }
    if (!vl) return;
    // Kiến trúc: khối mực đặc có viền, to nhỏ theo bán kính va chạm (chính điện, đan phòng, tàng kiếm các, cổng…).
    g.fillStyle = 'rgba(46, 38, 30, 0.82)';
    g.strokeStyle = 'rgba(46, 38, 30, 0.95)';
    g.lineWidth = Math.max(1, 2 * k);
    for (const c of COLLIDERS) {
      g.beginPath();
      g.arc(c.x * k, c.z * k, Math.max(2.2, c.r * k * 1.25), 0, Math.PI * 2);
      g.fill();
      g.stroke();
    }
  }

  /** Rừng: một hàng z của lưới mẫu 22 m (chấm mực theo mật độ rừng, tránh nước). Trả false khi hết hàng. */
  function treeRow(zi: number): boolean {
    const step = 22;
    const z = step / 2 + zi * step;
    if (z >= size) return false;
    const k = n / size;
    g.fillStyle = 'rgba(52, 62, 44, 0.62)';
    for (let x = step / 2; x < size; x += step) {
      const w = featureWeight(FOREST, x, z);
      if (w < 0.45) continue;
      if (hash01(x, z, 4191) > 0.28 + w * 0.3) continue;
      const px = (x + (hash01(z, x, 4192) - 0.5) * step) * k;
      const pz = (z + (hash01(x, z, 4193) - 0.5) * step) * k;
      if (water[Math.min(n - 1, Math.floor(pz)) * n + Math.min(n - 1, Math.floor(px))]! > 0.4) continue;
      g.beginPath();
      g.arc(px, pz, Math.max(0.9, 3.2 * k), 0, Math.PI * 2);
      g.fill();
    }
    return true;
  }
  return b;
}
