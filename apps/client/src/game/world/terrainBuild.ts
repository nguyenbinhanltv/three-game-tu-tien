import * as THREE from 'three/webgpu';
import {
  fbm,
  featureWeight,
  FOREST,
  hash01,
  KIEM_TRUNG,
  LAKE,
  SECT,
  TERRAIN_SEED,
  VALLEY,
  WATER_Y,
} from '@dtl/shared';
import { levelId, levelTerrain } from '../../base/levelCtx';
import { col, G, GeoBuilder, mat } from '../core/geo';
import { portalPaving, sectPaving } from '../../render/groundMask';
import { nearPropTree } from './propScatter';
import { vanHaiArt, type VhPalette } from './vanHaiArt';
import { ckGroundColor } from './cuuKieuArt';
import { tkGroundColor } from './thienKhuyetArt';
import { faceTint, vdGroundColor } from './vanDinhArt';
import { bhGroundColor, riftPath, type RiftPt } from './bacHoangArt';
import { xichCracks, xichGroundColor } from './xichArt';
import { ktGroundColor } from './kiemTrungArt';
import { pmGroundColor } from './phucMachArt';

export const TILE = 256;
export const NEAR_R = 3;
/** Camera chéo (mặc định, tầm nhìn ~250 m): chỉ dựng ô quanh người, vài chục mét quanh người là toàn bộ khung hình. */
export const NEAR_R_ISO = 1;
export const VEG_FAR_R_ISO = 1;
/** Vấn Đỉnh: vách dốc làm viền hai ô khác độ phân giải lệch cao hàng chục mét; viền rủ phải dài hơn mức lệch đó, nếu không khe hở ra thành lỗ sáng hình thoi ở góc vách. */
export const VD_SKIRT = 90;
export const COARSE_CELL = 32;
export const VEG_NEAR_R = 2;
export const VEG_FAR_R = 4;

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
export let T = levelTerrain();
let VL = T.id === 'van_lam';
/** Level dùng bảng màu đất son (Đoạn Mạch, E2-I). */
let OCHRE = T.id === 'doan_mach';
/** Level dùng bảng tro (Bắc Hoang, DV-1): hoang nguyên tro bên này, đất tro than bên kia vết nứt. */
export let ASH = T.id === 'bac_hoang';
/** Level sân đá phiến thành cổ (Thiên Khuyết, E4-I). */
let SLATE = T.id === 'thien_khuyet' || T.id === 'van_dinh';
/** Level phó bản hẻm núi Xích Tẫn Khích (DV-3K): bảng màu đất riêng theo `TerrainDef.canyon`. */
export let XICH = T.def.canyon !== undefined && T.id === 'xich_tan_khich';
/** Bí cảnh Kiếm Trủng (DUN-1): dùng địa hình Vân Lam nhưng bảng màu đất riêng (xám lam, tro, rỉ). */
export let KT = false;
/** Bí cảnh Phục Mạch Quật (DUN-1 PR2): bảng màu đất hầm mỏ (son nâu, đất sét đỏ, đá vụn). */
export let PM = false;
export let XICH_CRACKS: RiftPt[][] = [];
const _tk: [number, number, number] = [0, 0, 0];
const _bh: [number, number, number] = [0, 0, 0];
let BH_PATH: RiftPt[] = [];
export function heightAt(x: number, z: number): number {
  return T.surfaceAt(x, z);
}
export function isVanLam(): boolean {
  return VL;
}

// MAP-2: bảng màu Đoạn Mạch đỏ son + vàng thu (đất vàng thu, thảm lá phong đỏ, sa thạch nâu đỏ).
const C_OCHRE = col(0xbd9a5c);
const C_OCHRE_DRY = col(0xd3b068);
const C_OCHRE_RED = col(0x94503a);
const C_SANDSTONE = col(0x9c6c4c);
const C_SANDSTONE_DARK = col(0x6c4434);
const C_MAPLE_LITTER = col(0xa83c26);
const C_MAPLE_GOLD = col(0xe0a64a);
/** Đất vàng thu ↔ đỏ gạch theo nhiễu, thảm lá phong rụng thành mảng đỏ/vàng, dốc lộ sa thạch nâu đỏ (không tuyết: art bible). */
// Màu đất Bắc Hoang (bảng phụ `rift_*`): `bacHoangArt.ts` `bhGroundColor`.

function ochreColor(x: number, z: number, h: number, ny: number, out: THREE.Color): void {
  const n = fbm(x * 0.013, z * 0.013, 2, T.def.seed + 300);
  out
    .copy(C_OCHRE)
    .lerp(n > 0 ? C_OCHRE_DRY : C_OCHRE_RED, Math.min(1, Math.abs(n) * 0.9))
    .multiplyScalar(0.94 + n * 0.12);
  // thảm lá phong: mảng lớn (~60 m) đỏ son, lẫn đốm vàng, chỉ ở chỗ bằng
  const m = fbm(x * 0.017 + 71, z * 0.017 - 33, 3, T.def.seed + 517);
  const slope = 1 - ny;
  if (m > 0.14) {
    const k = Math.min(1, (m - 0.14) * 3) * Math.max(0, 1 - slope * 5);
    const fleck = fbm(x * 0.18, z * 0.18, 2, T.def.seed + 529);
    out.lerp(fleck > 0.1 ? C_MAPLE_GOLD : C_MAPLE_LITTER, k * 0.55);
  }
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
export function terrainColor(x: number, z: number, h: number, ny: number, out: THREE.Color): void {
  if (KT) {
    ktGroundColor(x, z, ny, _tk);
    return void out.setRGB(_tk[0], _tk[1], _tk[2], THREE.SRGBColorSpace);
  }
  if (PM) {
    pmGroundColor(x, z, ny, _tk);
    return void out.setRGB(_tk[0], _tk[1], _tk[2], THREE.SRGBColorSpace);
  }
  if (T.id === 'cuu_kieu') {
    ckGroundColor(T.def, x, z, ny, _tk);
    return void out.setRGB(_tk[0], _tk[1], _tk[2], THREE.SRGBColorSpace);
  }
  if (SLATE) {
    if (T.id === 'van_dinh') {
      vdGroundColor(T.def, x, z, ny, _tk);
      faceTint(x - T.size / 2, _tk);
    } else tkGroundColor(T.def, x, z, ny, _tk);
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
  const pPad = portalPaving(x, z); // chỉ vòng quanh cổng (r ≤ 31 m); phần còn lại của cao nguyên phẳng là cỏ (POLISH-1)
  if (pPad > 0) out.lerp(C_STONE, pPad);
  // Đất chết xám tím của Kiếm Trủng.
  const wTomb = featureWeight(KIEM_TRUNG, x, z);
  if (wTomb > 0.15) out.lerp(C_TOMB, Math.min(1, (wTomb - 0.15) * 1.8));
}

/** Trọng số vùng cho shader mặt đất: x rừng, y đất khô, z đất chết Kiếm Trủng, w dự phòng. */
function biomeWeights(x: number, z: number, o: Float32Array, k: number): void {
  if (OCHRE || SLATE || ASH || KT || PM) {
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
export const CLIFF_SKIP = 9;
/** Ô gần (≤ 4,5 m): ngưỡng thấp hơn (độ dốc ~42°) để vành địa hình rủ ở mép đảo không lòi qua váy đá (POLISH-1); ô xa/lưới thô giữ 9 m vì cùng độ chênh là dốc thoải hơn nhiều. */
const CLIFF_NEAR = 4;
const NEAR_CELL = 4.5;
const cliffOf = (cell: number): number => (cell <= NEAR_CELL ? CLIFF_NEAR : CLIFF_SKIP);
/** Ô nằm ở vách ranh vùng chơi (không phải vách đảo): vẫn dựng mặt, nếu không để lại các khe mảnh như đường kẻ dọc trên trời. */
export function onPlayWall(pos: Float32Array, a: number, d: number): boolean {
  const cx = (pos[a * 3]! + pos[d * 3]!) / 2;
  const cz = (pos[a * 3 + 2]! + pos[d * 3 + 2]!) / 2;
  return T.playDist(cx, cz) > T.playWall - 12;
}
/** Điểm nằm trên vành dốc bên ngoài mép đảo (r + 2 … r + edge + 10): váy đá (skyIslands.ts) thay thế, địa hình không dựng để khỏi lòi tam giác ra ngoài váy. */
export function onIslandBevel(x: number, z: number): boolean {
  const isl = T.def.islands;
  if (!isl) return false;
  for (const i of isl) {
    const d = Math.hypot(x - i.x, z - i.z);
    if (d > i.r + 2 && d < i.r + i.edge + 10) return true;
  }
  return false;
}
export function quadSpan(pos: Float32Array, a: number, b: number, c: number, d: number): number {
  const ya = pos[a * 3 + 1]!;
  const yb = pos[b * 3 + 1]!;
  const yc = pos[c * 3 + 1]!;
  const yd = pos[d * 3 + 1]!;
  return Math.max(ya, yb, yc, yd) - Math.min(ya, yb, yc, yd);
}

export function buildTileGeometry(x0: number, z0: number, size: number, res: number, skirt: number): THREE.BufferGeometry {
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
  const cliff = T.def.islands ? cliffOf(cell) : Infinity;
  for (let j = 0; j < res; j++) {
    for (let i = 0; i < res; i++) {
      const a = j * n1 + i;
      const b = a + 1;
      const c = a + n1;
      const d = c + 1;
      if (
        cliff < Infinity &&
        !onPlayWall(pos, a, d) &&
        (quadSpan(pos, a, b, c, d) > cliff || onIslandBevel((pos[a * 3]! + pos[d * 3]!) / 2, (pos[a * 3 + 2]! + pos[d * 3 + 2]!) / 2))
      )
        continue; // vách đảo: bỏ mặt đứng, `skyIslands.ts` dựng khối đá treo
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
        // Level đảo nổi: ranh ô cắt qua vách đảo thì hai đỉnh kề nhau chênh hàng chục mét → viền rủ thành cột/vạt dài đâm xuống mây (POLISH-1); bỏ đoạn đó.
        if (cliff < Infinity && Math.abs(pos[a * 3 + 1]! - pos[b * 3 + 1]!) > CLIFF_SKIP) continue; // ngưỡng 9 m cố định: chỉ bỏ đoạn rủ qua vách thật, không hở khe giữa ô khác LOD
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

export function buildVegetation(tx: number, tz: number, far: boolean): THREE.BufferGeometry | null {
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
      if (portalPaving(x, z) > 0.02 || featureWeight(KIEM_TRUNG, x, z) > 0.25) continue;
      // Quanh cổ thụ/thông Tripo (P2-A4) bỏ cây thủ tục để không chồng lên nhau.
      if (nearPropTree(x, z)) continue;
      // Độ dốc: bỏ cây trên vách đá.
      const slope = Math.abs(heightAt(x + 3, z) - h) + Math.abs(heightAt(x, z + 3) - h);

      if (wSect > 0.8) continue; // trong tông môn không rải đá/cây
      if (slope > 5.5) {
        // quanh bệ cổng bí cảnh đá khối thủ tục (icosahedron phẳng) bị bỏ: đá PROP-1 (da_reu, cột đá) thay thế (POLISH-2)
        if (r3 < 0.12 && !far && Math.hypot(x - 2048, z - 1708) > 190) addRock(b, x, h, z, 1 + r4 * 2.2, r1);
        continue;
      }
      let density = 0.3;
      if (wForest > 0.3) density = 0.8;
      else if (wValley > 0.4) density = 0.14;
      else if (wLake > 0.3) density = 0.2;
      if (h > 200) density *= 0.5;
      if (r3 > density) {
        if (r3 > 0.94 && !far && Math.hypot(x - 2048, z - 1708) > 190) addRock(b, x, h, z, 0.6 + r4 * 1.4, r1); // quanh bệ cổng: đá PROP-1 thay đá khối thủ tục
        continue;
      }
      // Cây là của propScatter.scatterTrees + PropLayer (cây Tripo); terrain chỉ rải đá.
    }
  }
  return b.count > 0 ? b.build() : null;
}

/** Khởi tạo trạng thái dựng theo level đang hoạt động (`levelCtx`): gọi ở constructor `Terrain` (luồng chính) và ở worker sau `setActiveLevel`. */
export function initTerrainBuild(): void {
  T = levelTerrain();
  VL = T.id === 'van_lam';
  OCHRE = T.id === 'doan_mach';
  ASH = T.id === 'bac_hoang';
  BH_PATH = ASH ? riftPath(T.def) : [];
  SLATE = T.id === 'thien_khuyet' || T.id === 'van_dinh';
  KT = levelId() === 'kiem_trung';
  PM = levelId() === 'phuc_mach';
  XICH = T.def.canyon !== undefined && T.id === 'xich_tan_khich';
  XICH_CRACKS = XICH ? xichCracks(T.def, (x, z) => T.heightAt(x, z)) : [];
}

/** Hình học dạng mảng thuần (chuyển qua worker không sao chép). */
export interface PackedGeo {
  attrs: { name: string; array: Float32Array; size: number }[];
  index: Uint16Array | Uint32Array | null;
}
export function packGeometry(g: THREE.BufferGeometry): PackedGeo {
  const attrs: PackedGeo['attrs'] = [];
  for (const name of Object.keys(g.attributes)) {
    const a = g.attributes[name] as THREE.BufferAttribute;
    attrs.push({ name, array: a.array as Float32Array, size: a.itemSize });
  }
  return { attrs, index: g.index ? (g.index.array as Uint16Array | Uint32Array) : null };
}
export function unpackGeometry(p: PackedGeo): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  for (const a of p.attrs) g.setAttribute(a.name, new THREE.BufferAttribute(a.array, a.size));
  if (p.index) g.setIndex(new THREE.BufferAttribute(p.index, 1));
  g.computeBoundingSphere();
  return g;
}
export function packTransfer(p: PackedGeo): ArrayBuffer[] {
  const t: ArrayBuffer[] = p.attrs.map((a) => a.array.buffer as ArrayBuffer);
  if (p.index) t.push(p.index.buffer as ArrayBuffer);
  return t;
}
