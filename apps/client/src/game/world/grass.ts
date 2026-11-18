import { baseOf } from '../../base/quality';
import * as THREE from 'three/webgpu';
import {
  abs,
  cameraViewMatrix,
  cos,
  float,
  floor,
  instancedBufferAttribute,
  int,
  length,
  max,
  min,
  mix,
  positionGeometry,
  sin,
  smoothstep,
  step,
  texture,
  uniform,
  uniformArray,
  uv,
  vec2,
  vec3,
} from 'three/tsl';
import { FOREST, featureWeight, fbm, hash01, KIEM_TRUNG, LAKE, PORTAL_PAD, SECT, TERRAIN_SEED, VALLEY, WATER_Y } from '@dtl/shared';
import { heightAt, levelTerrain } from '../../base/levelCtx';
import { vanHaiArt } from './vanHaiArt';
import { tkGrassDensity } from './thienKhuyetArt';
import type { N } from '../../render/vfx/common';

/**
 * Cỏ tương tác (V4 trong bài học game demo, P2 số 13).
 *
 * MỘT lưới, MỘT draw call: `InstancedBufferGeometry` của một bụi cỏ vài lá, mỗi instance chỉ có 8 float
 * (gốc x,y,z + góc xoay; cỡ + màu). Xoay, gió, rạp theo người/quái và mờ dần ở biên đều tính trong vertex
 * shader TSL, CPU chỉ đặt bụi cỏ khi một ô 16 m mới vào tầm (vài ô mỗi khung, không cấp phát mỗi khung).
 *
 * Rạp cỏ: `uniformArray` 6 vec4 (x, y, z, bán kính): người chơi và 5 người/quái gần nhất. Không vật lý,
 * không lưu dấu: cỏ dựng lại ngay khi thực thể đi qua (rẻ, đủ để thấy thế giới "sống").
 */

/** Số vị trí rạp cỏ truyền vào shader (mình + 5 thực thể gần nhất). */
export const GRASS_PUSH_SLOTS = 6;
const CHUNK = 16;

interface GrassPreset {
  /** Bán kính quanh người chơi có cỏ (m); 0 = tắt. */
  radius: number;
  /** Khoảng cách lưới đặt bụi cỏ (m). */
  spacing: number;
}

/** Thấp tắt cỏ; Vừa/Cao khác tầm và mật độ. */
export const GRASS_PRESETS: Record<string, GrassPreset> = {
  low: { radius: 0, spacing: 1 },
  medium: { radius: 32, spacing: 1.1 },
  high: { radius: 46, spacing: 0.9 },
  // Cực cao: cỏ rộng và dày hơn (tầm 68 m, giãn 0,78 m; ~gấp 2 số bụi của Cao). Ô dựng mỗi khung vẫn theo `budget`, trần instance bên dưới.
  ultra: { radius: 68, spacing: 0.78 },
};

/** Trần số instance (ứng với preset Cực cao), cấp phát một lần. */
const MAX_INSTANCES = 50000;

const C_SUN = new THREE.Color(0x7ea25a); // leaf_grass
const C_DRY = new THREE.Color(0xb7ac74); // leaf_dry
const C_SHADE = new THREE.Color(0x3e7552); // leaf
const _c = new THREE.Color();

/** Ô lưới độ cao (m): trùng ô của lưới địa hình gần (TILE 256 / res 64) để cỏ nằm đúng trên mặt đất đang vẽ. */
const HCELL = 4;
const HN = CHUNK / HCELL + 1;
const _hs = new Float64Array(HN * HN);
const _cols: { x: number; z: number; r: number }[] = [];

/**
 * Độ cao và độ dốc tại (x, z) trong ô đang dựng, nội suy trên lưới `_hs` theo đúng cách chia tam giác
 * của `terrain.ts` (a, c, b / b, c, d). Ghi độ dốc (m chênh trên 1,5 m) vào `_slope`.
 */
let _slope = 0;
function sampleHeight(x0: number, z0: number, x: number, z: number): number {
  const u = (x - x0) / HCELL;
  const v = (z - z0) / HCELL;
  const i = Math.min(HN - 2, Math.max(0, Math.floor(u)));
  const j = Math.min(HN - 2, Math.max(0, Math.floor(v)));
  const fx = u - i;
  const fz = v - j;
  const a = _hs[j * HN + i];
  const b = _hs[j * HN + i + 1];
  const c = _hs[(j + 1) * HN + i];
  const d = _hs[(j + 1) * HN + i + 1];
  let gx: number;
  let gz: number;
  let h: number;
  if (fx + fz <= 1) {
    gx = b - a;
    gz = c - a;
    h = a + gx * fx + gz * fz;
  } else {
    gx = d - c;
    gz = d - b;
    h = d - gx * (1 - fx) - gz * (1 - fz);
  }
  _slope = ((Math.abs(gx) + Math.abs(gz)) / HCELL) * 1.5;
  return h;
}

function nearCollider(x: number, z: number, pad: number): boolean {
  for (const c of _cols) {
    const dx = x - c.x;
    const dz = z - c.z;
    const r = c.r + pad;
    if (dx * dx + dz * dz < r * r) return true;
  }
  return false;
}

/**
 * Bụi cỏ tại điểm (x, z) với độ cao `h`, độ dốc `slope`: trả false nếu không mọc (sân đá, bệ cổng,
 * Kiếm Trủng, nước, dốc, tuyết, chân công trình), không thì ghi gốc, góc, cỡ, màu vào `out` (8 float).
 */
function grassTuftAt(x: number, z: number, h: number, slope: number, r: number, out: Float32Array, o: number): boolean {
  if (h < WATER_Y + 2.2 || h > 240 || slope > 2.2) return false;
  const isl = levelTerrain().def;
  if (isl.islands && h < (isl.voidFloor ?? 0) + 40) return false; // không cỏ trên sàn mây và vách đảo
  if (featureWeight(SECT, x, z) > 0.8 || featureWeight(PORTAL_PAD, x, z) > 0.8 || featureWeight(KIEM_TRUNG, x, z) > 0.12) return false;
  const wValley = featureWeight(VALLEY, x, z);
  const wForest = featureWeight(FOREST, x, z);
  const wLake = featureWeight(LAKE, x, z);
  const n = fbm(x * 0.045, z * 0.045, 2, TERRAIN_SEED + 777);
  // Mật độ theo vùng, cộng nhiễu thành từng đám, thưa dần trên dốc và trên cao.
  let dens = 0.62 + wValley * 0.3 - wForest * 0.15 + n * 0.55;
  dens *= 1 - slope / 2.6;
  if (h > 170) dens *= 0.5;
  // Bờ hồ thưa dần: không cỏ sát mặt nước, đầy dần khi cách mực nước 2 → 9 m.
  if (wLake > 0.3) dens *= Math.min(1, Math.max(0, (h - WATER_Y - 2.2) / 6.8));
  if (r > dens) return false;
  if (nearCollider(x, z, 1.2)) return false;

  const r2 = hash01(Math.floor(x * 7.3), Math.floor(z * 7.3), 811);
  _c.copy(C_SUN);
  if (wForest > 0) _c.lerp(C_SHADE, Math.min(1, wForest * 1.2) * 0.75);
  _c.lerp(C_DRY, Math.max(0, Math.min(1, -n * 0.9 + (h > 150 ? 0.35 : 0) + (wLake > 0.3 ? 0.25 : 0))));
  if (isl.islands) _c.lerp(C_DRY, 0.7); // đảo nổi: cỏ nhạt, tông trầm
  _c.multiplyScalar(0.82 + r2 * 0.3);
  out[o] = x;
  out[o + 1] = h - 0.04;
  out[o + 2] = z;
  out[o + 3] = r2 * Math.PI * 2;
  out[o + 4] = 0.75 + hash01(Math.floor(x * 5.1), Math.floor(z * 5.1), 823) * 0.65 + Math.max(0, n) * 0.4;
  out[o + 5] = _c.r;
  out[o + 6] = _c.g;
  out[o + 7] = _c.b;
  return true;
}

/** Kiểu cỏ: bụi lá thủ tục xanh của Vân Lam, hoặc thẻ alpha cỏ khô/bụi gai (Đoạn Mạch, E2-I). */
type GrassStyle = 'blades' | 'cards';
/** Trọng số chọn thẻ trong atlas (`tools/asset-pipeline/src/grass-cards.ts`, thứ tự `CARDS`): hoang_coc, linh_rung, van_hai, gai_sa_thach. */
const CARD_WEIGHTS = [0.34, 0.26, 0.2, 0.2];
const C_STRAW = new THREE.Color(0xd8c9a8);

/**
 * Bụi cỏ khô ở Đoạn Mạch: thưa, thành từng đám theo nhiễu, không mọc trên dốc và chân công trình.
 * `iRoot.w` mã hóa cả góc xoay lẫn chỉ số thẻ: `angle + 10 · thẻ`.
 */
function ochreTuftAt(x: number, z: number, h: number, slope: number, r: number, out: Float32Array, o: number): boolean {
  if (slope > 1.9) return false;
  const n = fbm(x * 0.03, z * 0.03, 2, 20261116 + 777);
  const c = fbm(x * 0.008, z * 0.008, 2, 20261116 + 313);
  // Đám cỏ thưa: đa số ô trống, vài đám dày; cao nguyên cao thì thưa hơn.
  let dens = 0.06 + Math.max(0, n + 0.15) * 0.9 + Math.max(0, c) * 0.25;
  dens *= 1 - slope / 2.4;
  if (h > 150) dens *= 0.6;
  if (r > dens) return false;
  if (nearCollider(x, z, 1.2)) return false;
  const r2 = hash01(Math.floor(x * 7.3), Math.floor(z * 7.3), 811);
  const pick = hash01(Math.floor(x * 3.7), Math.floor(z * 3.7), 829);
  let card = 0;
  for (let acc = 0; card < CARD_WEIGHTS.length - 1; card++) {
    acc += CARD_WEIGHTS[card];
    if (pick < acc) break;
  }
  _c.copy(C_STRAW).multiplyScalar(0.8 + r2 * 0.34);
  out[o] = x;
  out[o + 1] = h - 0.03;
  out[o + 2] = z;
  out[o + 3] = r2 * Math.PI * 2 + card * 10;
  out[o + 4] = 0.7 + hash01(Math.floor(x * 5.1), Math.floor(z * 5.1), 823) * 0.5 + Math.max(0, n) * 0.3;
  out[o + 5] = _c.r;
  out[o + 6] = _c.g;
  out[o + 7] = _c.b;
  return true;
}

const C_STAR = new THREE.Color(0x9fb8c0);
const C_STAR_DEEP = new THREE.Color(0x56807f);
/**
 * Cỏ sao Thiên Khuyết (E4-I): thẻ cỏ xanh lam sẫm của atlas `grass-night`, thưa, thành đám, chỉ lọt qua kẽ đá (không trên sân lát/đại lộ, mật độ ở `tkGrassDensity`).
 * Thẻ 0 (cỏ sao, có hoa) chủ đạo; màu trộn giữa xanh ngọc xỉn và lam nhạt như phủ sương đêm.
 */
function tkTuftAt(x: number, z: number, h: number, slope: number, r: number, out: Float32Array, o: number): boolean {
  if (r > tkGrassDensity(levelTerrain().def, x, z, slope)) return false;
  if (nearCollider(x, z, 1.2)) return false;
  const r2 = hash01(Math.floor(x * 7.3), Math.floor(z * 7.3), 811);
  const pick = hash01(Math.floor(x * 3.7), Math.floor(z * 3.7), 829);
  const card = pick < 0.5 ? 0 : pick < 0.75 ? 1 : pick < 0.9 ? 2 : 3;
  const n = fbm(x * 0.03, z * 0.03, 2, 20261116 + 5);
  _c.copy(C_STAR_DEEP)
    .lerp(C_STAR, Math.max(0, Math.min(1, 0.45 + n * 0.8)))
    .multiplyScalar(0.8 + r2 * 0.32);
  out[o] = x;
  out[o + 1] = h - 0.03;
  out[o + 2] = z;
  out[o + 3] = r2 * Math.PI * 2 + card * 10;
  out[o + 4] = 0.7 + hash01(Math.floor(x * 5.1), Math.floor(z * 5.1), 823) * 0.5 + Math.max(0, n) * 0.3;
  out[o + 5] = _c.r;
  out[o + 6] = _c.g;
  out[o + 7] = _c.b;
  return true;
}

/**
 * Cỏ Vân Hải (E3-I): thẻ cỏ (atlas dùng chung với Đoạn Mạch, thẻ `van_hai` là chủ đạo) mọc THÀNH ĐÁM theo nhiễu, mật độ và màu theo bản sắc từng đảo
 * (`vanHaiArt`): rậm quanh hồ gương và trên Tùng Đài, thưa trên Thạch Quy/Lôi Vân, không mọc trên lối mòn, đá lộ, lòng hồ hay sát mép đảo.
 */
function vanHaiTuftAt(x: number, z: number, h: number, slope: number, r: number, out: Float32Array, o: number): boolean {
  const def = levelTerrain().def;
  if (slope > 1.8 || h < (def.voidFloor ?? 0) + 40) return false;
  const art = vanHaiArt(def);
  const isl = art.islandAt(x, z);
  if (!isl) return false;
  const d = Math.hypot(x - isl.x, z - isl.z);
  if (d > isl.r - 2) return false;
  const P = isl.pal;
  const pw = art.pondW(x, z);
  if (pw > 0.75) return false;
  if (art.trailW(isl, x, z) > 0.12) return false;
  const rock = art.rockW(isl, x, z, slope / 1.5);
  if (rock > 0.6) return false;
  const c = fbm(x * 0.055 + 3, z * 0.055 - 8, 2, def.seed + 777);
  const n = fbm(x * 0.02, z * 0.02, 2, def.seed + 313);
  // đám: nền thưa, lõi đám dày; `grassClump` quyết định độ tương phản giữa đám và nền
  let dens = P.grassDensity * 1.5 * (1 - P.grassClump + P.grassClump * Math.max(0, Math.min(1.7, c * 2.6 + 0.3)));
  dens += pw * 0.35; // bờ hồ rậm
  // ven lối mòn: cụm cỏ dày hơn (rõ nhất ở Phù Đảo Các)
  const td = art.trailD(isl, x, z);
  if (td > 2 && td < 8) dens += (isl.kind === 'hub' ? 0.7 : 0.25) * (1 - (td - 2) / 6) * Math.max(0, c * 2 + 0.6);
  dens *= (1 - rock * 1.4) * (1 - slope / 2.2) * (d > isl.r - 14 ? 0.55 : 1);
  if (r > dens) return false;
  if (nearCollider(x, z, 1.2)) return false;
  const dry = Math.max(0, Math.min(1, 0.2 - n * 1.4 + rock * 0.5));
  const r2 = hash01(Math.floor(x * 7.3), Math.floor(z * 7.3), 811);
  const pick = hash01(Math.floor(x * 3.7), Math.floor(z * 3.7), 829);
  const card = dry > 0.55 && pick < 0.6 ? 0 : pick < 0.62 ? 2 : pick < 0.9 ? 1 : 0;
  const bloom = isl.kind === 'hub' && td < 9 && hash01(Math.floor(x * 0.4), Math.floor(z * 0.4), 839) < 0.35;
  _c.setHex(P.grass)
    .lerp(_g2.setHex(P.grassDry), dry)
    .multiplyScalar((0.82 + r2 * 0.36) * 1.5);
  if (bloom) _c.lerp(_g2.setHex(0xf3dde6), 0.65); // vài cụm hoa nhạt ven lối
  out[o] = x;
  out[o + 1] = h - 0.03;
  out[o + 2] = z;
  out[o + 3] = r2 * Math.PI * 2 + card * 10;
  out[o + 4] = 0.5 + hash01(Math.floor(x * 5.1), Math.floor(z * 5.1), 823) * 0.4 + Math.max(0, c) * 0.4;
  out[o + 5] = _c.r;
  out[o + 6] = _c.g;
  out[o + 7] = _c.b;
  return true;
}
const _g2 = new THREE.Color();

/** Dựng bụi cỏ trong một ô CHUNK×CHUNK (gốc tại cx·CHUNK, cz·CHUNK). Xác định: mọi client thấy cỏ cùng chỗ. */
export function buildGrassChunk(cx: number, cz: number, spacing: number, style: GrassStyle = 'blades'): Float32Array {
  const x0 = cx * CHUNK;
  const z0 = cz * CHUNK;
  // CHUNK là bội của HCELL nên lưới mẫu trùng đỉnh lưới địa hình: chỉ 25 lần heightAt mỗi ô.
  for (let j = 0; j < HN; j++) for (let i = 0; i < HN; i++) _hs[j * HN + i] = heightAt(x0 + i * HCELL, z0 + j * HCELL);
  _cols.length = 0;
  for (const c of levelTerrain().colliders) {
    const pad = c.r + 2;
    if (c.x > x0 - pad && c.x < x0 + CHUNK + pad && c.z > z0 - pad && c.z < z0 + CHUNK + pad) _cols.push(c);
  }
  const per = Math.max(1, Math.round(CHUNK / spacing));
  const step = CHUNK / per;
  const tmp = new Float32Array(per * per * 8);
  let k = 0;
  for (let j = 0; j < per; j++) {
    for (let i = 0; i < per; i++) {
      const gx = cx * per + i;
      const gz = cz * per + j;
      const x = x0 + (i + 0.1 + hash01(gx, gz, 701) * 0.8) * step;
      const z = z0 + (j + 0.1 + hash01(gx, gz, 709) * 0.8) * step;
      const h = sampleHeight(x0, z0, x, z);
      if (
        (style === 'cards'
          ? levelTerrain().def.islands
            ? vanHaiTuftAt
            : levelTerrain().id === 'thien_khuyet'
              ? tkTuftAt
              : ochreTuftAt
          : grassTuftAt)(x, z, h, _slope, hash01(gx, gz, 719), tmp, k * 8)
      )
        k++;
    }
  }
  return tmp.slice(0, k * 8);
}

/** Lưới một bụi cỏ: 6 lá, mỗi lá 2 đoạn (3 tam giác), gốc tại (0,0,0), uv.y = 0 gốc → 1 ngọn. */
export function buildTuftGeometry(): THREE.BufferGeometry {
  const pos: number[] = [];
  const uvs: number[] = [];
  const nor: number[] = [];
  const idx: number[] = [];
  const blades = 6;
  for (let b = 0; b < blades; b++) {
    const a = (b / blades) * Math.PI * 2 + hash01(b, 3, 41) * 0.8;
    const rr = 0.04 + hash01(b, 5, 41) * 0.16;
    const ox = Math.cos(a) * rr;
    const oz = Math.sin(a) * rr;
    const facing = a + Math.PI / 2 + (hash01(b, 7, 41) - 0.5) * 0.9;
    const fx = Math.cos(facing);
    const fz = Math.sin(facing);
    const lean = 0.06 + hash01(b, 9, 41) * 0.12;
    const H = 0.36 + hash01(b, 11, 41) * 0.26;
    const W = 0.045 + hash01(b, 13, 41) * 0.02;
    const base = pos.length / 3;
    const rows = [
      { t: 0, w: W },
      { t: 0.55, w: W * 0.7 },
    ];
    for (const row of rows) {
      const y = row.t * H;
      const lx = ox + Math.cos(a) * lean * row.t * row.t;
      const lz = oz + Math.sin(a) * lean * row.t * row.t;
      pos.push(lx - fx * row.w, y, lz - fz * row.w, lx + fx * row.w, y, lz + fz * row.w);
      uvs.push(0, row.t, 1, row.t);
      nor.push(0, 1, 0, 0, 1, 0);
    }
    pos.push(ox + Math.cos(a) * lean, H, oz + Math.sin(a) * lean);
    uvs.push(0.5, 1);
    nor.push(0, 1, 0);
    idx.push(base, base + 1, base + 2, base + 1, base + 3, base + 2, base + 2, base + 3, base + 4);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  return g;
}

/** Thẻ cỏ: 3 mặt phẳng đứng cắt chéo (0°, 60°, 120°), rộng 0,9 m cao 0,675 m (đúng tỉ lệ ô atlas 4:3), gốc ở giữa đáy, uv.y = 0 gốc → 1 ngọn. */
function buildCardGeometry(): THREE.BufferGeometry {
  const pos: number[] = [];
  const uvs: number[] = [];
  const nor: number[] = [];
  const idx: number[] = [];
  const W = 0.45;
  const H = 0.675;
  for (let q = 0; q < 3; q++) {
    const a = (q / 3) * Math.PI;
    const dx = Math.cos(a) * W;
    const dz = Math.sin(a) * W;
    const base = pos.length / 3;
    pos.push(-dx, 0, -dz, dx, 0, dz, -dx, H, -dz, dx, H, dz);
    uvs.push(0, 0, 1, 0, 0, 1, 1, 1);
    for (let i = 0; i < 4; i++) nor.push(0, 1, 0);
    idx.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  return g;
}

/**
 * Bán kính rạp cỏ của một con quái (m); 0 = không đè. Quái chết (kể cả xác đã ẩn) không đè, để không
 * còn vòng cỏ rạp trơ trọi và không chiếm chỗ của người/quái còn sống trong 5 ô. Quái to (boss) đè rộng
 * hơn: lấy theo chiều cao thanh máu.
 */
export function monsterPushRadius(dead: boolean, visible: boolean, barY: number): number {
  if (dead || !visible) return 0;
  return Math.max(1.4, Math.min(4, barY * 0.7));
}

/** Một vị trí rạp cỏ: chân thực thể và bán kính ảnh hưởng. */
export interface Pusher {
  x: number;
  y: number;
  z: number;
  r: number;
}

/**
 * Chọn tối đa `out.length - 1` thực thể gần `me` nhất (trong `maxDist`) trong `count` phần tử đầu của
 * `others`, ghi vào out[1..]; out[0] là `me`.
 * Ô thừa có r = 0 (shader bỏ qua). Không cấp phát.
 */
export function pickPushers(me: Pusher, others: readonly Pusher[], out: Pusher[], maxDist = 40, count = others.length): void {
  const n = out.length;
  out[0].x = me.x;
  out[0].y = me.y;
  out[0].z = me.z;
  out[0].r = me.r;
  for (let i = 1; i < n; i++) out[i].r = 0;
  const d2 = _d2;
  for (let i = 1; i < n; i++) d2[i] = Infinity;
  const lim = maxDist * maxDist;
  for (let q = 0; q < count; q++) {
    const p = others[q];
    const dx = p.x - me.x;
    const dz = p.z - me.z;
    const d = dx * dx + dz * dz;
    if (d > lim || d < 1e-6) continue;
    // Chèn vào danh sách gần nhất (n nhỏ: chèn tuyến tính).
    let i = n - 1;
    if (d >= d2[i]) continue;
    while (i > 1 && d2[i - 1] > d) {
      d2[i] = d2[i - 1];
      const a = out[i];
      const b = out[i - 1];
      a.x = b.x;
      a.y = b.y;
      a.z = b.z;
      a.r = b.r;
      i--;
    }
    d2[i] = d;
    out[i].x = p.x;
    out[i].y = p.y;
    out[i].z = p.z;
    out[i].r = p.r;
  }
}
const _d2 = new Float64Array(16);

interface ChunkRec {
  data: Float32Array;
}

/** Khóa số của ô (chỉ số có thể âm ở mép bản đồ). */
const KEY_OFF = 1024;
const chunkKey = (cx: number, cz: number) => (cz + KEY_OFF) * 4096 + (cx + KEY_OFF);
const chunkX = (k: number) => (k % 4096) - KEY_OFF;
const chunkZ = (k: number) => Math.floor(k / 4096) - KEY_OFF;

export class Grass {
  readonly mesh: THREE.Mesh;
  readonly material: THREE.MeshStandardNodeMaterial;
  private readonly geo: THREE.InstancedBufferGeometry;
  private readonly a0: THREE.InstancedBufferAttribute;
  private readonly a1: THREE.InstancedBufferAttribute;
  private readonly uTime = uniform(0);
  private readonly uCenter = uniform(new THREE.Vector3());
  private readonly uRadius = uniform(30);
  private readonly pushVec = Array.from({ length: GRASS_PUSH_SLOTS }, () => new THREE.Vector4());
  private readonly uPush = uniformArray(this.pushVec, 'vec4');
  private preset: GrassPreset = GRASS_PRESETS.medium;
  /** Level tắt cỏ (`features.grass: false`, vd. Bắc Hoang): lớp cỏ không bao giờ hiện lại dù cập nhật đổi `visible`. */
  private enabled = true;
  private chunks = new Map<number, ChunkRec>();
  private want: number[] = [];
  private wantSet = new Set<number>();
  private ccx = -1e9;
  private ccz = -1e9;
  private dirty = false;
  private t = 0;
  /** Số bụi cỏ đang vẽ (đo đạc). */
  count = 0;
  readonly style: GrassStyle;
  /** Kiểu thẻ: true khi atlas đã nạp xong (chưa xong thì không vẽ). */
  private ready: boolean;
  private cardTex: THREE.Texture | null = null;
  private disposed = false;

  /** `cardSet`: thư mục atlas thẻ cỏ trong `public/` (Đoạn Mạch: `grass-ochre`); bỏ trống = bụi lá thủ tục. */
  constructor(cardSet?: string) {
    this.style = cardSet ? 'cards' : 'blades';
    this.ready = !cardSet;
    const tuft = this.style === 'cards' ? buildCardGeometry() : buildTuftGeometry();
    this.geo = new THREE.InstancedBufferGeometry();
    for (const k of ['position', 'normal', 'uv']) this.geo.setAttribute(k, tuft.getAttribute(k));
    this.geo.setIndex(tuft.getIndex());
    const mk = () => {
      const a = new THREE.InstancedBufferAttribute(new Float32Array(MAX_INSTANCES * 4), 4);
      return a;
    };
    this.a0 = mk();
    this.a1 = mk();
    this.geo.setAttribute('iRoot', this.a0);
    this.geo.setAttribute('iLook', this.a1);
    this.geo.instanceCount = 0;
    this.geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1);

    this.material = new THREE.MeshStandardNodeMaterial({ roughness: 0.9, metalness: 0, side: THREE.DoubleSide });
    this.material.name = 'env-grass';
    if (cardSet) void this.loadCards(cardSet);
    else this.buildShader();
    this.mesh = new THREE.Mesh(this.geo, this.material);
    this.mesh.name = 'env-grass';
    this.mesh.castShadow = false;
    this.mesh.visible = false;
  }

  private buildShader(atlas?: THREE.Texture, cols = 2, rows = 2): void {
    const p0: N = instancedBufferAttribute(this.a0);
    const p1: N = instancedBufferAttribute(this.a1);
    const root: N = p0.xyz;
    const scale: N = p1.x;
    const lp: N = positionGeometry.mul(scale);
    // Thẻ: `w` = góc + 10 · chỉ số thẻ.
    const card: N = atlas ? floor(p0.w.div(10)) : float(0);
    const ang: N = atlas ? p0.w.sub(card.mul(10)) : p0.w;
    const c: N = cos(ang);
    const s: N = sin(ang);
    const rp: N = vec3(lp.x.mul(c).sub(lp.z.mul(s)), lp.y, lp.x.mul(s).add(lp.z.mul(c)));
    const h: N = uv().y;

    // Rạp: cộng hướng đẩy từ mọi vị trí (gần tâm đẩy mạnh), chặn độ lớn ở 1.
    let push: N = vec2(0, 0);
    for (let i = 0; i < GRASS_PUSH_SLOTS; i++) {
      const p: N = this.uPush.element(int(i));
      const r: N = max(p.w, 0.05);
      const d: N = root.xz.sub(p.xz);
      const dist: N = max(length(d), 0.001);
      const near: N = float(1).sub(smoothstep(r.mul(0.55), r, dist));
      // Chỉ thực thể đứng sát mặt cỏ mới đè được (bay/ngự kiếm thì không).
      const ground: N = float(1).sub(smoothstep(1.2, 2.4, abs(p.y.sub(root.y))));
      push = push.add(d.div(dist).mul(near.mul(ground).mul(step(0.01, p.w))));
    }
    const pl: N = min(length(push), 1);
    const pdir: N = push.div(max(length(push), 0.001));
    // Gió: hai sóng lệch pha theo vị trí, thổi chếch đông bắc.
    const gust: N = sin(this.uTime.mul(1.7).add(root.x.mul(0.21)).add(root.z.mul(0.17)))
      .mul(0.55)
      .add(sin(this.uTime.mul(3.3).add(root.x.mul(0.8)).add(root.z.mul(0.6))).mul(0.2))
      .add(0.4);
    const wind: N = vec2(0.82, 0.57).mul(gust.mul(0.32));
    const bend: N = pdir.mul(pl.mul(1.5)).add(wind.mul(float(1).sub(pl)));
    const off: N = bend.mul(rp.y).mul(h);
    const y: N = rp.y.mul(float(1).sub(pl.mul(0.72)));
    // Mờ dần ở biên tầm cỏ: thu bụi cỏ về gốc, không có đường cắt.
    const fade: N = float(1).sub(smoothstep(this.uRadius.mul(0.72), this.uRadius, length(root.xz.sub(this.uCenter.xz))));
    this.material.positionNode = root.add(vec3(rp.x.add(off.x), y, rp.z.add(off.y)).mul(fade));
    // Pháp tuyến hướng lên như mặt đất: hai mặt lá sáng như nhau, bụi cỏ hòa vào nền thay vì lấp lánh.
    this.material.normalNode = cameraViewMatrix.transformDirection(vec3(0, 1, 0));
    if (atlas) {
      const cell: N = vec2(card.mod(cols), floor(card.div(cols)));
      const tuv: N = vec2(cell.x.add(uv().x), cell.y.add(float(1).sub(uv().y))).div(vec2(cols, rows));
      const t: N = texture(atlas, tuv);
      // Gốc tối (khuất), ngọn sáng; màu thẻ nhân sắc từng bụi.
      this.material.colorNode = t.rgb.mul(p1.yzw).mul(mix(1.1, 2.6, h));
      this.material.opacityNode = t.a;
      this.material.alphaTest = 0.45;
      return;
    }
    // Gốc tối (khuất), ngọn sáng.
    this.material.colorNode = p1.yzw.mul(mix(0.42, 1.08, h));
  }

  /** Nạp atlas thẻ cỏ (WebP RGBA, ~270 KB) rồi mới dựng shader; chưa xong thì lưới ẩn. */
  private async loadCards(set: string): Promise<void> {
    try {
      const base = import.meta.env.BASE_URL;
      const man = (await (await fetch(`${base}${set}/manifest.json`)).json()) as { atlas: string; cols: number; rows: number };
      const res = await fetch(`${base}${set}/${man.atlas}`);
      if (!res.ok) throw new Error(`${man.atlas}: ${res.status}`);
      const bmp = await createImageBitmap(await res.blob(), { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
      if (this.disposed) {
        bmp.close();
        return;
      }
      const t = new THREE.Texture(bmp);
      t.colorSpace = THREE.SRGBColorSpace;
      t.flipY = false;
      t.premultiplyAlpha = false;
      t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
      t.magFilter = THREE.LinearFilter;
      t.minFilter = THREE.LinearMipmapLinearFilter;
      t.generateMipmaps = true;
      t.anisotropy = 4;
      t.needsUpdate = true;
      this.cardTex = t;
      this.buildShader(t, man.cols, man.rows);
      this.ready = true;
      this.material.needsUpdate = true;
      this.mesh.visible = this.enabled && this.geo.instanceCount > 0;
    } catch (e) {
      console.warn('[grass] không nạp được thẻ cỏ:', e);
    }
  }

  setQuality(q: string, shadows = false): void {
    const next = GRASS_PRESETS[q] ?? GRASS_PRESETS[baseOf(q)];
    this.mesh.receiveShadow = shadows;
    if (next.radius === this.preset.radius && next.spacing === this.preset.spacing) return;
    const respace = next.spacing !== this.preset.spacing;
    this.preset = next;
    if (respace) this.chunks.clear();
    this.ccx = this.ccz = -1e9;
    this.mesh.visible = this.enabled && next.radius > 0;
    if (next.radius <= 0) {
      this.chunks.clear();
      this.geo.instanceCount = 0;
      this.count = 0;
    }
  }

  /** Gọi mỗi khung. `center`: vị trí người chơi; `pushers`: GRASS_PUSH_SLOTS phần tử (pickPushers). `budget`: số ô dựng tối đa. */
  update(dt: number, center: { x: number; y: number; z: number }, pushers: Pusher[], budget = 1): void {
    this.t += dt;
    this.uTime.value = this.t;
    const R = this.preset.radius;
    if (R <= 0) return;
    for (let i = 0; i < GRASS_PUSH_SLOTS; i++) {
      const p = pushers[i];
      if (p) this.pushVec[i].set(p.x, p.y, p.z, p.r);
      else this.pushVec[i].set(0, -1e4, 0, 0);
    }
    this.uCenter.value.set(center.x, center.y, center.z);
    this.uRadius.value = R;
    // Hình cầu bao (để frustum cull cả lưới khi nhìn lên trời) bám mặt đất dưới chân MỖI khung, không theo
    // độ cao người chơi: bay cao qua ranh ô rồi đáp xuống trong cùng ô thì cầu không bị kẹt trên không.
    const bs = this.geo.boundingSphere!;
    bs.center.set(center.x, heightAt(center.x, center.z), center.z);
    bs.radius = R + CHUNK + 60;

    const cx = Math.floor(center.x / CHUNK);
    const cz = Math.floor(center.z / CHUNK);
    if (cx !== this.ccx || cz !== this.ccz) {
      this.ccx = cx;
      this.ccz = cz;
      // Ô có điểm gần nhất cách tâm ô người chơi dưới R + 6 m thì cần (người chơi lệch tâm ô tới ~11 m,
      // nhưng phần thiếu ở mép rơi vào dải mờ dần 72–100% R nên không thấy).
      const n = Math.ceil(R / CHUNK) + 1;
      const px = (cx + 0.5) * CHUNK;
      const pz = (cz + 0.5) * CHUNK;
      const lim = R + 6;
      this.want = [];
      for (let dz = -n; dz <= n; dz++) {
        for (let dx = -n; dx <= n; dx++) {
          const x0 = (cx + dx) * CHUNK;
          const z0 = (cz + dz) * CHUNK;
          const nx = Math.max(x0, Math.min(px, x0 + CHUNK)) - px;
          const nz = Math.max(z0, Math.min(pz, z0 + CHUNK)) - pz;
          if (nx * nx + nz * nz <= lim * lim) this.want.push(chunkKey(cx + dx, cz + dz));
        }
      }
      // Gần trước.
      this.want.sort((a, b) => this.keyDist(a, cx, cz) - this.keyDist(b, cx, cz));
      this.wantSet = new Set(this.want);
      for (const [k] of this.chunks) if (!this.wantSet.has(k)) this.chunks.delete(k);
      this.dirty = true;
    }
    for (const k of this.want) {
      if (budget <= 0) break;
      if (this.chunks.has(k)) continue;
      this.chunks.set(k, { data: buildGrassChunk(chunkX(k), chunkZ(k), this.preset.spacing, this.style) });
      budget--;
      this.dirty = true;
    }
    if (this.dirty) this.rebuild(center);
  }

  private keyDist(k: number, cx: number, cz: number): number {
    return (chunkX(k) - cx) ** 2 + (chunkZ(k) - cz) ** 2;
  }

  /** Ghép dữ liệu các ô đang cần vào bộ đệm instance (chỉ khi tập ô đổi). */
  private rebuild(_center: { x: number; y: number; z: number }): void {
    this.dirty = false;
    const A = this.a0.array as Float32Array;
    const B = this.a1.array as Float32Array;
    let n = 0;
    for (const k of this.want) {
      const ch = this.chunks.get(k);
      if (!ch) continue;
      const d = ch.data;
      const m = Math.min(d.length / 8, MAX_INSTANCES - n);
      for (let i = 0; i < m; i++) {
        const s = i * 8;
        const o = (n + i) * 4;
        A[o] = d[s];
        A[o + 1] = d[s + 1];
        A[o + 2] = d[s + 2];
        A[o + 3] = d[s + 3];
        B[o] = d[s + 4];
        B[o + 1] = d[s + 5];
        B[o + 2] = d[s + 6];
        B[o + 3] = d[s + 7];
      }
      n += m;
      if (n >= MAX_INSTANCES) break;
    }
    for (const a of [this.a0, this.a1]) {
      a.clearUpdateRanges();
      a.addUpdateRange(0, Math.max(4, n * 4));
      a.needsUpdate = true;
    }
    this.geo.instanceCount = n;
    this.count = n;
    this.mesh.visible = this.enabled && n > 0 && this.ready;
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    if (!on) this.mesh.visible = false;
  }

  dispose(): void {
    this.disposed = true;
    this.cardTex?.dispose();
    this.mesh.removeFromParent();
    this.geo.dispose();
    this.material.dispose();
    this.chunks.clear();
  }
}
