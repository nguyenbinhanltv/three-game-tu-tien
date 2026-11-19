import * as THREE from 'three/webgpu';
import { atan, clamp, float, mix, positionWorld, smoothstep, sin, texture, time, uv, vec2, vec3, vertexColor } from 'three/tsl';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import type { ThienKhuyetSky, TkIsland } from '@dtl/shared';
import { createWorldMaterial } from '../../render/materials/world';
import { getCloudNoise } from '../../render/noiseTex';

/**
 * Cảnh Thiên Khuyết (MAP-4): đảo tiên cung đổ nát lơ lửng, bậc thang xoắn lên trời tới Cổng Tiên Vỡ, tượng thần khổng lồ
 * gãy đổ, cột ngọc vỡ dọc đại lộ, mảnh đá trời, vòng tiên môn gãy, trận pháp cổ phát sáng trên quảng trường.
 * Chỉ để nhìn (không va chạm). Mọi thứ tất định theo dữ liệu `thienKhuyetSky` của `levels/thien_khuyet.assets.json`.
 *
 * Mesh vát cạnh và lathe (không flat-shading); gộp theo vật liệu: đá (PBR nhám), vàng kim (kim loại), phát sáng (cộng sáng).
 * Draw call: đá 1, vàng 1, phát sáng 1, cổng 1, trận pháp 1, mảnh đá trời 1, vòng tiên môn 1.
 */

// ---------- nhiễu tất định ----------

function hash(x: number, y: number, z: number, seed: number): number {
  let h = (x * 374761393 + y * 668265263 + z * 2147483647 + seed * 1274126177) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function vnoise(x: number, y: number, z: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  const s = (t: number) => t * t * (3 - 2 * t);
  const sx = s(x - xi);
  const sy = s(y - yi);
  const sz = s(z - zi);
  const l = (a: number, b: number, t: number) => a + (b - a) * t;
  const c = (dx: number, dy: number, dz: number) => hash(xi + dx, yi + dy, zi + dz, seed);
  return l(
    l(l(c(0, 0, 0), c(1, 0, 0), sx), l(c(0, 1, 0), c(1, 1, 0), sx), sy),
    l(l(c(0, 0, 1), c(1, 0, 1), sx), l(c(0, 1, 1), c(1, 1, 1), sx), sy),
    sz,
  );
}

export function tkFbm(x: number, y: number, z: number, seed: number, oct = 3): number {
  let a = 0.5;
  let sum = 0;
  let f = 1;
  for (let i = 0; i < oct; i++) {
    sum += a * vnoise(x * f, y * f, z * f, seed + i * 17);
    a *= 0.5;
    f *= 2.1;
  }
  return sum / (1 - Math.pow(0.5, oct));
}

export function tkRng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}

// ---------- bảng màu tím + vàng kim ----------

const C = (hex: number) => new THREE.Color(hex);
const STONE = C(0xb2a6c4);
const STONE_WARM = C(0xc8b8a4);
const STONE_DARK = C(0x6d5f8a);
const ROCK_TOP = C(0x8c7ea4);
const ROCK_MID = C(0x65578a);
const ROCK_LOW = C(0x3c3060);
const PAVE = C(0xcabfd6);
const TILE = C(0x5a3fa0);
const GOLD = C(0xe6b24c);
const GOLD_DARK = C(0xa8782c);
const GLOW_GOLD = C(0xffc860);
const GLOW_VIOLET = C(0xa070ff);

type Bucket = 'stone' | 'gold' | 'glow';

/** Gom hình học (đã tô màu đỉnh) theo vật liệu rồi gộp thành mỗi vật liệu một BufferGeometry. */
class Parts {
  private list: Record<Bucket, THREE.BufferGeometry[]> = { stone: [], gold: [], glow: [] };

  add(bucket: Bucket, geo: THREE.BufferGeometry, m: THREE.Matrix4, color: THREE.Color, jitter = 0, seed = 1): void {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    g.deleteAttribute('uv');
    g.applyMatrix4(m);
    const n = g.getAttribute('position').count;
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const k = jitter ? 1 - jitter + jitter * 2 * hash(i % 97, Math.round(m.elements[12]!), Math.round(m.elements[14]!), seed) : 1;
      col[i * 3] = color.r * k;
      col[i * 3 + 1] = color.g * k;
      col[i * 3 + 2] = color.b * k;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.list[bucket].push(g);
  }

  merged(bucket: Bucket): THREE.BufferGeometry | null {
    const l = this.list[bucket];
    if (!l.length) return null;
    const g = mergeGeometries(l, false);
    for (const x of l) x.dispose();
    this.list[bucket] = [];
    g?.computeBoundingSphere();
    return g;
  }
}

const mat4 = (x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx): THREE.Matrix4 =>
  new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')),
    new THREE.Vector3(sx, sy, sz),
  );

// ---------- hình học dùng lại ----------

/** Cột: bệ ba tầng, thân thon có gân, đầu cột loe (nếu không gãy). `cut` < 1 = gãy ở tỉ lệ đó, mặt gãy lởm chởm theo nhiễu. */
export function columnGeometry(h: number, r: number, cut = 1, seed = 1): THREE.BufferGeometry {
  const prof: THREE.Vector2[] = [];
  const P = (rad: number, y: number) => prof.push(new THREE.Vector2(rad, y));
  P(r * 1.75, 0);
  P(r * 1.75, h * 0.025);
  P(r * 1.55, h * 0.03);
  P(r * 1.5, h * 0.055);
  P(r * 1.18, h * 0.065);
  P(r * 1.12, h * 0.08);
  const top = h * Math.min(cut, 1);
  const shaftEnd = cut >= 1 ? h * 0.9 : top;
  const steps = 10;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const y = h * 0.08 + (shaftEnd - h * 0.08) * t;
    const entasis = 1 - 0.17 * (y / h) + 0.035 * Math.sin(Math.PI * (y / h));
    P(r * entasis, y);
  }
  if (cut >= 1) {
    P(r * 0.88, h * 0.93);
    P(r * 1.18, h * 0.945);
    P(r * 1.5, h * 0.975);
    P(r * 1.52, h);
  }
  const g = new THREE.LatheGeometry(prof, 18);
  if (cut < 1) {
    const p = g.getAttribute('position');
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i);
      if (y >= top - 0.001) {
        const a = Math.atan2(p.getZ(i), p.getX(i));
        const jag = tkFbm(Math.cos(a) * 3 + seed, Math.sin(a) * 3, seed * 0.3, seed, 3);
        p.setY(i, y - jag * h * 0.12 * (0.4 + 0.6 * hash(i, 1, 2, seed)));
      }
    }
    g.computeVertexNormals();
  }
  return g;
}

const BOX = new RoundedBoxGeometry(1, 1, 1, 2, 0.06);

/** Hộp vát cạnh kích thước (w, h, d), tâm tại (x, y, z), xoay Euler. */
function box(
  parts: Parts,
  b: Bucket,
  w: number,
  h: number,
  d: number,
  x: number,
  y: number,
  z: number,
  color: THREE.Color,
  rx = 0,
  ry = 0,
  rz = 0,
  jitter = 0.06,
  seed = 3,
): void {
  parts.add(b, BOX, mat4(x, y, z, rx, ry, rz, w, h, d), color, jitter, seed);
}

function shardGeometry(seed: number): THREE.BufferGeometry {
  const g0 = new THREE.IcosahedronGeometry(1, 3);
  g0.deleteAttribute('uv');
  g0.deleteAttribute('normal');
  const g = mergeVertices(g0, 1e-4);
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const n = 0.65 + 0.7 * tkFbm(x * 1.6 + seed, y * 1.6, z * 1.6, seed, 3);
    const spike = y > 0.55 ? 1 + (y - 0.55) * 1.4 : y < -0.4 ? 1 + (-y - 0.4) * 2.4 : 1;
    p.setXYZ(i, x * n * 0.8, y * n * spike, z * n * 0.7);
  }
  g.computeVertexNormals();
  return g;
}

// ---------- đảo nổi ----------

const SEG = 44;
const RINGS = 16;

/** Thân đảo: vành nhiễu, vát, thu nhọn xuống mũi đá; pháp tuyến mượt (đỉnh dùng chung). */
function islandGeometry(isl: TkIsland, seed: number): THREE.BufferGeometry {
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const tmp = new THREE.Color();
  const R = isl.r;
  const radius = (a: number, t: number) => {
    const n = tkFbm(Math.cos(a) * 2 + seed, Math.sin(a) * 2, t * 2.6, seed, 3);
    const shape = Math.pow(Math.max(0, 1 - Math.pow(t, 1.25)), 0.6);
    const ledge = 1 + 0.08 * Math.pow((t * 7 + 0.3 * tkFbm(a, t * 2, 1, seed + 2, 2)) % 1, 2);
    const crag = 1 + 0.16 * (tkFbm(Math.cos(a) * 5 + seed, Math.sin(a) * 5, t * 7, seed + 4, 3) - 0.5) * Math.min(1, t * 5);
    return R * shape * (0.8 + 0.4 * n) * ledge * crag;
  };
  const ringsV: number[][] = [];
  for (let k = 0; k <= RINGS; k++) {
    const t = k / RINGS;
    const row: number[] = [];
    for (let s = 0; s < SEG; s++) {
      const a = (s / SEG) * Math.PI * 2;
      const r = radius(a, t);
      const y = isl.y - isl.depth * Math.pow(t, 0.9) * (0.92 + 0.16 * tkFbm(a * 2 + seed, t * 3, 4, seed + 9, 2));
      const x = isl.x + Math.cos(a) * r;
      const z = isl.z + Math.sin(a) * r;
      const strata = 0.78 + 0.42 * Math.sin(y * 0.5 + tkFbm(x * 0.04, y * 0.05, z * 0.04, seed + 8, 2) * 5);
      if (t < 0.05) tmp.copy(ROCK_TOP).lerp(PAVE, 0.5);
      else if (t < 0.45) tmp.copy(ROCK_TOP).lerp(ROCK_MID, (t - 0.05) / 0.4);
      else tmp.copy(ROCK_MID).lerp(ROCK_LOW, Math.min(1, (t - 0.45) / 0.5));
      tmp.multiplyScalar(strata * (0.9 + 0.2 * tkFbm(x * 0.2, y * 0.2, z * 0.2, seed + 5, 2)) * (1 - t * 0.25));
      pos.push(x, y, z);
      col.push(tmp.r, tmp.g, tmp.b);
      row.push(pos.length / 3 - 1);
    }
    ringsV.push(row);
  }
  for (let k = 0; k < RINGS; k++)
    for (let s = 0; s < SEG; s++) {
      const s2 = (s + 1) % SEG;
      const a = ringsV[k]![s]!;
      const b = ringsV[k + 1]![s]!;
      const c = ringsV[k + 1]![s2]!;
      const d = ringsV[k]![s2]!;
      idx.push(a, d, c, a, c, b);
    }
  // Mũi đá đáy.
  pos.push(isl.x, isl.y - isl.depth * 1.25, isl.z);
  col.push(ROCK_LOW.r, ROCK_LOW.g, ROCK_LOW.b);
  const tip = pos.length / 3 - 1;
  for (let s = 0; s < SEG; s++) idx.push(ringsV[RINGS]![s]!, ringsV[RINGS]![(s + 1) % SEG]!, tip);
  // Mặt trên: nắp phẳng lát đá (tâm hơi nhô).
  pos.push(isl.x, isl.y + 0.4, isl.z);
  col.push(PAVE.r, PAVE.g, PAVE.b);
  const ctr = pos.length / 3 - 1;
  const topRow: number[] = [];
  for (let s = 0; s < SEG; s++) {
    const a = (s / SEG) * Math.PI * 2;
    const r = radius(a, 0.0) * 0.97;
    pos.push(isl.x + Math.cos(a) * r, isl.y + 0.1, isl.z + Math.sin(a) * r);
    tmp.copy(PAVE).multiplyScalar(0.85 + 0.2 * tkFbm(isl.x + Math.cos(a) * r, 2, isl.z + Math.sin(a) * r, seed, 2));
    col.push(tmp.r, tmp.g, tmp.b);
    topRow.push(pos.length / 3 - 1);
  }
  for (let s = 0; s < SEG; s++) idx.push(topRow[s]!, ctr, topRow[(s + 1) % SEG]!);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Nhũ đá nhọn và rễ đá treo dưới đảo. */
function stalactites(parts: Parts, isl: TkIsland, seed: number): void {
  const rand = tkRng(seed + 31);
  const n = Math.round(isl.r * 0.35);
  for (let i = 0; i < n; i++) {
    const a = rand() * Math.PI * 2;
    const t = 0.25 + rand() * 0.45;
    const r = isl.r * Math.pow(1 - t, 0.6) * (0.55 + rand() * 0.25);
    const len = isl.depth * (0.15 + rand() * 0.35);
    const g = new THREE.ConeGeometry(0.9 + rand() * 2.2, len, 7, 1, true);
    g.rotateX(Math.PI);
    parts.add(
      'stone',
      g,
      mat4(
        isl.x + Math.cos(a) * r,
        isl.y - isl.depth * Math.pow(t, 0.9) - len * 0.4,
        isl.z + Math.sin(a) * r,
        (rand() - 0.5) * 0.25,
        0,
        (rand() - 0.5) * 0.25,
      ),
      ROCK_MID,
      0.15,
      seed,
    );
  }
}

/** Tiên cung đổ nát trên đảo: nền ba bậc, bốn cột góc (có cột gãy), mái ngói tím nứt vỡ, vòm gãy, hàng cột ven đảo, cột đổ. */
function palaceRuins(parts: Parts, glow: Parts, isl: TkIsland, seed: number): void {
  const rand = tkRng(seed);
  const top = isl.y;
  const hall = isl.r * 0.42;
  // Nền ba bậc có viền vàng.
  for (let i = 0; i < 3; i++) {
    const s = hall * (1.35 - i * 0.14);
    box(parts, 'stone', s * 2, 1.4, s * 1.5, isl.x, top + 0.7 + i * 1.4, isl.z, i === 0 ? STONE_WARM : STONE, 0, 0, 0, 0.05, seed + i);
  }
  box(parts, 'gold', hall * 2.52, 0.18, 0.5, isl.x, top + 1.45, isl.z + hall * 0.75, GOLD, 0, 0, 0, 0.05);
  const fl = top + 4.2;
  // Cột góc: hai cao nguyên vẹn, hai gãy.
  const H = isl.r * 0.55;
  const corners: [number, number, number][] = [
    [-1, -1, 1],
    [1, -1, 0.6],
    [-1, 1, 0.38],
    [1, 1, 1],
  ];
  corners.forEach(([sx, sz, cut], i) => {
    parts.add(
      'stone',
      columnGeometry(H, H * 0.07, cut, seed + i),
      mat4(isl.x + sx * hall * 0.95, fl, isl.z + sz * hall * 0.62),
      i % 2 ? STONE : STONE_WARM,
      0.05,
      seed,
    );
    if (cut >= 1)
      box(parts, 'gold', H * 0.17, 0.5, H * 0.17, isl.x + sx * hall * 0.95, fl + H * 0.74, isl.z + sz * hall * 0.62, GOLD, 0, 0, 0, 0.04);
  });
  // Xà ngang nối hai cột nguyên (một đầu đã rơi), mái nghiêng vỡ.
  box(parts, 'stone', hall * 1.9, H * 0.08, H * 0.1, isl.x, fl + H * 0.97, isl.z + hall * 0.62, STONE_DARK, 0, 0, 0.05, 0.05);
  box(parts, 'gold', hall * 1.9, H * 0.02, H * 0.11, isl.x, fl + H * 1.02, isl.z + hall * 0.62, GOLD, 0, 0, 0.05, 0.04);
  box(
    parts,
    'stone',
    hall * 1.3,
    1.1,
    hall * 0.9,
    isl.x + hall * 0.45,
    fl + H * 0.52,
    isl.z + hall * 0.55,
    TILE,
    0.18,
    0.1,
    -0.3,
    0.12,
    seed + 4,
  );
  box(parts, 'gold', hall * 1.3, 0.2, 0.5, isl.x + hall * 0.45, fl + H * 0.52 + 0.7, isl.z + hall * 0.98, GOLD_DARK, 0.18, 0.1, -0.3, 0.05);
  box(parts, 'stone', hall * 0.8, 1, hall * 0.7, isl.x - hall * 0.8, fl + 0.5, isl.z - hall * 0.2, TILE, 0.45, 0.6, 0.35, 0.12, seed + 5);
  // Vòm gãy: nửa vòng đá.
  const arch = new THREE.TorusGeometry(hall * 0.5, H * 0.045, 8, 22, Math.PI * 0.62);
  parts.add('stone', arch, mat4(isl.x - hall * 0.1, fl + H * 0.4, isl.z - hall * 0.55, 0, 0.1, 0.45), STONE, 0.05, seed);
  // Hàng cột ven đảo: mọc, gãy, đổ nằm.
  const n = 9;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + 0.3;
    const rr = isl.r * (0.72 + rand() * 0.1);
    const cx = isl.x + Math.cos(a) * rr;
    const cz = isl.z + Math.sin(a) * rr;
    if (Math.hypot(cx - isl.x, cz - isl.z) < hall * 1.5) continue;
    const q = rand();
    const h = isl.r * (0.28 + rand() * 0.2);
    if (q < 0.3) parts.add('stone', columnGeometry(h, h * 0.06, 1, seed + i), mat4(cx, top, cz), STONE, 0.05, seed);
    else if (q < 0.7)
      parts.add('stone', columnGeometry(h, h * 0.06, 0.35 + rand() * 0.45, seed + i), mat4(cx, top, cz), STONE_WARM, 0.05, seed);
    else {
      const g = columnGeometry(h, h * 0.06, 0.8, seed + i);
      g.translate(0, 0, 0);
      parts.add('stone', g, mat4(cx, top + h * 0.07, cz, Math.PI / 2 - 0.12, a, 0), STONE, 0.05, seed);
    }
  }
  // Vài mảnh ngọc phát sáng tím rơi trên nền.
  for (let i = 0; i < 4; i++) {
    const a = rand() * Math.PI * 2;
    const g = new THREE.OctahedronGeometry(0.8 + rand() * 1.4, 0);
    glow.add(
      'glow',
      g,
      mat4(isl.x + Math.cos(a) * hall * 0.3, fl + 0.8, isl.z + Math.sin(a) * hall * 0.3, rand(), rand(), rand(), 1, 1.6, 1),
      GLOW_VIOLET,
    );
  }
}

/** Bệ Cổng Tiên Vỡ: hai cột khổng lồ (một gãy), xà đổ chéo viền vàng, mảnh mái rơi, đài sau cổng. */
function gateRuins(parts: Parts, glow: Parts, isl: TkIsland, seed: number): void {
  const span = 34;
  const H = 92;
  const R = 5.4;
  const y0 = isl.y;
  // Sàn lát bậc.
  for (let i = 0; i < 3; i++)
    box(
      parts,
      'stone',
      118 - i * 20,
      1.6,
      66 - i * 10,
      isl.x,
      y0 + 0.8 + i * 1.6,
      isl.z + 8,
      i === 0 ? STONE_WARM : STONE,
      0,
      0,
      0,
      0.05,
      seed + i,
    );
  box(parts, 'gold', 78, 0.2, 0.9, isl.x, y0 + 5.0, isl.z + 31, GOLD, 0, 0, 0, 0.04);
  const lx = isl.x - span;
  const rx = isl.x + span;
  const base = y0 + 4.8;
  parts.add('stone', columnGeometry(H, R, 1, seed), mat4(lx, base, isl.z), STONE, 0.04, seed);
  parts.add('stone', columnGeometry(H, R, 0.58, seed + 2), mat4(rx, base, isl.z), STONE_WARM, 0.04, seed);
  // Dải vàng quanh thân cột.
  for (let i = 1; i <= 5; i++) {
    const g = new THREE.TorusGeometry(R * (1 - 0.17 * (i / 7)) * 1.03, 0.28, 8, 24);
    g.rotateX(Math.PI / 2);
    parts.add('gold', g, mat4(lx, base + (H * i) / 7, isl.z), GOLD, 0.03);
  }
  // Xà ngang: tựa vào đầu cột trái, đầu kia đã sập xuống đống đổ nát.
  const lintelLen = span * 2 + 22;
  const tilt = 0.32;
  box(
    parts,
    'stone',
    lintelLen,
    7,
    9,
    isl.x + 3,
    base + H * 0.78 - Math.sin(tilt) * lintelLen * 0.3,
    isl.z,
    STONE_DARK,
    0,
    0,
    -tilt,
    0.04,
    seed,
  );
  box(
    parts,
    'gold',
    lintelLen * 0.98,
    1.2,
    9.6,
    isl.x + 3,
    base + H * 0.78 - Math.sin(tilt) * lintelLen * 0.3 + 4,
    isl.z,
    GOLD,
    0,
    0,
    -tilt,
    0.04,
  );
  // Mái ngói tím đổ vỡ và đá rơi.
  box(parts, 'stone', 38, 3, 24, rx + 14, base + 3, isl.z + 16, TILE, 0.16, 0.5, 0.2, 0.12, seed + 6);
  box(parts, 'stone', 26, 2.6, 18, lx - 22, base + 2, isl.z + 18, TILE, 0.3, -0.4, 0.2, 0.12, seed + 7);
  const rand = tkRng(seed + 3);
  for (let i = 0; i < 9; i++) {
    const s = 2 + rand() * 5;
    box(
      parts,
      'stone',
      s,
      s * 0.7,
      s * 0.9,
      rx + (rand() - 0.5) * 50,
      base + s * 0.3,
      isl.z + 8 + rand() * 20,
      STONE,
      rand(),
      rand(),
      rand(),
      0.1,
      seed + i,
    );
  }
  // Cột phụ nhỏ hai bên ven đảo.
  for (const sx of [-1, 1])
    for (let i = 0; i < 3; i++) {
      const h = 22 - i * 3;
      parts.add(
        'stone',
        columnGeometry(h, 1.6, i === 1 ? 0.6 : 1, seed + i + 9),
        mat4(isl.x + sx * (50 + i * 7), y0 + 0.2, isl.z + 18 + i * 3),
        STONE,
        0.05,
      );
    }
  // Mảnh ngọc lớn phát sáng giữa cổng (hạt nhân trận cổng).
  const core = new THREE.OctahedronGeometry(3.2, 0);
  glow.add('glow', core, mat4(isl.x, base + 26, isl.z, 0.3, 0.5, 0), GLOW_GOLD, 0, 1);
}

// ---------- bậc thang xoắn ----------

/** Điểm giữa bậc thang tại tham số u (0..1): (x, y, z) và góc tiếp tuyến. */
export function stairPoint(s: ThienKhuyetSky['stair'], u: number): { x: number; y: number; z: number; tangent: number; r: number } {
  const a = s.a0 + s.turns * Math.PI * 2 * u;
  const r = s.r0 + (s.r1 - s.r0) * u;
  return { x: s.cx + Math.cos(a) * r, y: s.y0 + (s.y1 - s.y0) * u, z: s.cz + Math.sin(a) * r, tangent: a + Math.PI / 2, r };
}

function stair(parts: Parts, glow: Parts, s: ThienKhuyetSky['stair'], seed: number): void {
  const len = s.turns * Math.PI * 2 * ((s.r0 + s.r1) / 2);
  const n = Math.round(len / 2.4);
  const rand = tkRng(seed);
  const a = ((s.y1 - s.y0) / n) * 1.0;
  for (let i = 0; i < n; i++) {
    const u = (i + 0.5) / n;
    const p = stairPoint(s, u);
    const miss = i > 12 && i < n - 6 && hash(i, 1, 1, seed) > 0.965;
    if (!miss) {
      const sk = 1 - 0.1 * hash(i, 2, 2, seed);
      box(parts, 'stone', 2.62, a * 3.2, s.width * sk, p.x, p.y - a * 1.0, p.z, i % 2 ? STONE : STONE_WARM, 0, -p.tangent, 0, 0.05, seed);
    }
    // Dải vàng chạy mép thang (mỗi 3 bậc) và đèn ngọc tím mỗi 8 bậc.
    if (!miss && i % 3 === 0) {
      const ox = Math.cos(p.tangent - Math.PI / 2);
      const oz = Math.sin(p.tangent - Math.PI / 2);
      for (const sd of [-1, 1])
        box(
          parts,
          'gold',
          2.7,
          0.32,
          0.5,
          p.x + ox * sd * s.width * 0.5,
          p.y + a * 0.62,
          p.z + oz * sd * s.width * 0.5,
          GOLD,
          0,
          -p.tangent,
          0,
          0.03,
        );
    }
    if (i % 8 === 4) {
      const ox = Math.cos(p.tangent - Math.PI / 2);
      const oz = Math.sin(p.tangent - Math.PI / 2);
      for (const sd of [-1, 1]) {
        const g = new THREE.OctahedronGeometry(0.55, 0);
        glow.add(
          'glow',
          g,
          mat4(p.x + ox * sd * s.width * 0.56, p.y + 2.4, p.z + oz * sd * s.width * 0.56, 0, rand(), 0, 1, 1.6, 1),
          GLOW_VIOLET,
        );
      }
    }
    // Lan can: cột ngắn gãy dần mỗi 16 bậc.
    if (i % 16 === 8) {
      const ox = Math.cos(p.tangent - Math.PI / 2);
      const oz = Math.sin(p.tangent - Math.PI / 2);
      for (const sd of [-1, 1])
        parts.add(
          'stone',
          columnGeometry(7, 0.55, hash(i, sd + 3, 4, seed) > 0.55 ? 1 : 0.5, i),
          mat4(p.x + ox * sd * s.width * 0.56, p.y + a * 0.6, p.z + oz * sd * s.width * 0.56),
          STONE,
          0.05,
        );
    }
  }
  // Thân thang treo: tấm đá dày vát nhọn dần, tối.
  const seg = 70;
  for (let i = 0; i < seg; i++) {
    const u0 = i / seg;
    const u1 = (i + 1) / seg;
    const p0 = stairPoint(s, u0);
    const p1 = stairPoint(s, u1);
    const mx = (p0.x + p1.x) / 2;
    const mz = (p0.z + p1.z) / 2;
    const L = Math.hypot(p1.x - p0.x, p1.z - p0.z, p1.y - p0.y) * 1.04;
    const th = 7 + 3 * Math.sin(u0 * 9) + hash(i, 5, 5, seed) * 3.5;
    const pitch = Math.atan2(p1.y - p0.y, Math.hypot(p1.x - p0.x, p1.z - p0.z));
    box(
      parts,
      'stone',
      L,
      th,
      s.width * (1.02 + 0.1 * hash(i, 6, 6, seed)),
      mx,
      (p0.y + p1.y) / 2 - th * 0.5 - a * 2.4,
      mz,
      STONE_DARK,
      0,
      -Math.atan2(p1.z - p0.z, p1.x - p0.x) + 0,
      -pitch,
      0.1,
      seed + 3,
    );
  }
}

// ---------- tượng thần đổ ----------

function statue(parts: Parts, st: ThienKhuyetSky['statue'], gy: number): void {
  const u = st.size / 110;
  const place = (lx: number, ly: number, lz: number, rx: number, ry: number, rz: number) => {
    // Trục dài của tượng chạy theo +x địa phương, xoay theo yaw và nghiêng nằm.
    const v = new THREE.Vector3(lx * u, ly * u, lz * u).applyAxisAngle(new THREE.Vector3(0, 1, 0), st.yaw);
    return mat4(st.x + v.x, gy + v.y - 3, st.z + v.z, rx, ry + st.yaw, rz, u);
  };
  const add = (g: THREE.BufferGeometry, b: Bucket, c: THREE.Color, lx: number, ly: number, lz: number, rx = 0, ry = 0, rz = 0) =>
    parts.add(b, g, place(lx, ly, lz, rx, ry, rz), c, 0.07, 41);
  const cyl = (rt: number, rb: number, h: number, seg = 14) => new THREE.CylinderGeometry(rt, rb, h, seg);
  const rbx = (w: number, h: number, d: number) => new RoundedBoxGeometry(w, h, d, 3, 1.6);
  // Thân giáp: ngực, bụng, đai vàng.
  add(rbx(34, 26, 44), 'stone', STONE_DARK, 0, 14, 0);
  add(rbx(20, 20, 38), 'stone', STONE, -22, 12, 0, 0, 0, 0.1);
  add(rbx(8, 28, 46), 'gold', GOLD_DARK, -12, 14, 0);
  add(rbx(4, 26, 44), 'gold', GOLD, 8, 14, 0);
  // Vai giáp (cầu) và đầu gối.
  for (const sz of [-1, 1]) {
    const sh = new THREE.SphereGeometry(10, 18, 12);
    add(sh, 'stone', STONE_DARK, 6, 22, sz * 27);
    add(cyl(2.2, 2.6, 4, 12), 'gold', GOLD, 6, 31, sz * 27);
  }
  // Chân: hai ống thon; chân phải gãy giữa, mảnh rời xa.
  add(cyl(7.5, 9, 52), 'stone', STONE, -58, 9, -12, 0, 0, Math.PI / 2);
  add(cyl(6.5, 7.5, 34), 'stone', STONE, -48, 8, 14, 0.2, 0, Math.PI / 2 - 0.15);
  add(cyl(6.6, 7.5, 24), 'stone', STONE_WARM, -92, 3, 34, 0.5, 0.5, Math.PI / 2 - 0.3);
  add(rbx(18, 8, 12), 'stone', STONE_DARK, -88, 5, -14);
  // Đầu rơi: mũ trụ, mào vàng, cổ gãy trên thân.
  add(cyl(5, 8, 6, 12), 'stone', STONE_DARK, 22, 28, 0, 0, 0, Math.PI / 2 + 0.2);
  const head = new THREE.SphereGeometry(10, 20, 14);
  add(head, 'stone', STONE, 52, 8, 22, 0.2, 0, 0.4);
  const helm = new THREE.SphereGeometry(11.2, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.55);
  add(helm, 'stone', STONE_DARK, 52, 9.5, 22, 0.2, 0, 0.4);
  for (let i = 0; i < 5; i++) {
    const spike = new THREE.ConeGeometry(1.8, 14, 6);
    add(spike, 'gold', GOLD, 52 - 2 + i * 2.2, 20 + (i === 2 ? 4 : 0), 22 + (i - 2) * 3.2, 0.2, 0, 0.4 + (i - 2) * 0.35);
  }
  add(rbx(7, 14, 10), 'stone', STONE_WARM, 56, 3, 28, 0.1, 0.2, 0.5);
  // Cánh tay phải gập, tay trái vươn lên chống đất.
  add(cyl(4.4, 5.4, 34), 'stone', STONE, 8, 8, 40, 0.1, 0, Math.PI / 2 + 0.25);
  add(cyl(4, 4.6, 30), 'stone', STONE_WARM, 30, 6, 56, 0, 0.7, Math.PI / 2 - 0.1);
  add(rbx(10, 8, 9), 'stone', STONE, 52, 5, 68);
  add(cyl(4.6, 5.4, 36), 'stone', STONE, 12, 20, -42, 0.6, 0, Math.PI / 2 - 0.9);
  // Đại đao gãy cắm nghiêng cạnh tượng.
  add(rbx(3.4, 130, 9), 'stone', STONE_WARM, 20, 56, -64, 0.1, 0, -0.18);
  add(rbx(3.6, 130, 1.6), 'gold', GOLD, 20, 56, -59.2, 0.1, 0, -0.18);
  add(rbx(9, 5, 30), 'gold', GOLD_DARK, 4, -4, -64, 0.1, 0, -0.18);
}

// ---------- vòng tiên môn gãy ----------

function ringBroken(parts: Parts, glow: Parts, x: number, y: number, z: number, R: number): void {
  const arc = Math.PI * 1.55;
  const g = new THREE.TorusGeometry(R, 2.6, 12, 120, arc);
  parts.add('gold', g, mat4(x, y, z, 0, 0, -0.4), GOLD_DARK, 0.04);
  const inner = new THREE.TorusGeometry(R - 5.4, 0.7, 6, 120, arc * 0.96);
  glow.add('glow', inner, mat4(x, y, z, 0, 0, -0.4), GLOW_GOLD, 0, 2);
  // Hai đầu gãy: mảnh trôi.
  for (let i = 0; i < 6; i++) {
    const s = 3 + i * 1.7;
    const a = -0.4 + arc + 0.12 + i * 0.1;
    box(
      parts,
      'gold',
      s,
      s * 0.7,
      s * 0.8,
      x + Math.cos(a) * (R + i * 2),
      y + Math.sin(a) * (R + i * 2) - i * 3,
      z,
      GOLD_DARK,
      i,
      i * 0.7,
      0.2,
      0.08,
      9,
    );
  }
}

// ---------- vật liệu ----------

function stoneMaterial(): THREE.MeshStandardNodeMaterial {
  const mat = createWorldMaterial({ vertexColors: true, roughness: 0.78, metalness: 0.02 });
  const noise = getCloudNoise();
  // Chi tiết đá: nhiễu hai tỉ lệ theo toạ độ thế giới (ba mặt phẳng) nhân vào màu đỉnh, tạo vân và lốm đốm không có texture riêng.
  const p = positionWorld;
  const a = texture(noise, vec2(p.x.mul(0.07), p.z.mul(0.07))).g;
  const b = texture(noise, vec2(p.x.mul(0.31), p.y.mul(0.31))).b;
  const c = texture(noise, vec2(p.z.mul(0.31), p.y.mul(0.19))).g;
  const detail = mix(0.74, 1.22, a.mul(0.5).add(b.mul(0.3)).add(c.mul(0.2)));
  mat.colorNode = vertexColor().mul(detail);
  return mat;
}

function goldMaterial(): THREE.MeshStandardNodeMaterial {
  return createWorldMaterial({ vertexColors: true, roughness: 0.34, metalness: 0.92 });
}

function glowMaterial(): THREE.MeshBasicNodeMaterial {
  return new THREE.MeshBasicNodeMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}

/** Cổng ánh sáng: màn xoáy vàng-tím rách mép, đặt giữa hai cột Cổng Tiên Vỡ. */
function portalMaterial(): THREE.MeshBasicNodeMaterial {
  const mat = new THREE.MeshBasicNodeMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });
  const noise = getCloudNoise();
  const u = uv();
  const p = u.sub(vec2(0.5, 0.5));
  const swirl = texture(noise, vec2(u.x.mul(1.3).add(time.mul(0.03)), u.y.mul(1.6).sub(time.mul(0.05)))).a;
  const swirl2 = texture(noise, vec2(u.x.mul(3.1).sub(time.mul(0.06)), u.y.mul(2.3).add(time.mul(0.08)))).g;
  const edge = float(1)
    .sub(p.x.abs().mul(2))
    .mul(float(1).sub(p.y.abs().mul(2)))
    .pow(0.5);
  const torn = smoothstep(0.18, 0.55, edge.add(swirl.sub(0.5).mul(0.9)));
  const body = swirl.mul(0.65).add(swirl2.mul(0.45));
  mat.colorNode = mix(vec3(0.62, 0.38, 1.0), vec3(1.0, 0.78, 0.36), clamp(body.mul(1.2).sub(0.2), 0, 1)).mul(1.1);
  mat.opacityNode = clamp(torn.mul(body.add(0.2)).mul(0.78), 0, 0.85);
  return mat;
}

/** Trận pháp cổ: các vòng đồng tâm, hàng chữ chạy chậm ngược chiều, sáu cánh sao xoay. */
function arrayMaterial(): THREE.MeshBasicNodeMaterial {
  const mat = new THREE.MeshBasicNodeMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  const p = uv().sub(0.5).mul(2);
  const d = p.length();
  const ang = atan(p.y, p.x);
  const line = (r: number, w: number) => float(1).sub(smoothstep(0, w, d.sub(r).abs()));
  const rings = line(0.985, 0.012).add(line(0.93, 0.008)).add(line(0.64, 0.01)).add(line(0.34, 0.012)).add(line(0.12, 0.01));
  const tickA = ang.mul(24 / (Math.PI * 2)).add(time.mul(0.02));
  const ticks = smoothstep(
    0.35,
    0.5,
    sin(tickA.mul(Math.PI * 2))
      .mul(0.5)
      .add(0.5),
  ).mul(smoothstep(0, 0.02, d.sub(0.68).abs().oneMinus().sub(0.88)));
  const runeBand = smoothstep(0.64, 0.66, d).mul(float(1).sub(smoothstep(0.92, 0.93, d)));
  const runes = smoothstep(
    0.45,
    0.6,
    sin(ang.mul(36).sub(time.mul(0.35)))
      .mul(sin(d.mul(70)).mul(0.5).add(0.6))
      .mul(0.5)
      .add(0.5),
  )
    .mul(runeBand)
    .mul(0.7);
  const star = sin(ang.mul(3).add(time.mul(0.12)))
    .abs()
    .pow(60)
    .mul(float(1).sub(smoothstep(0.62, 0.64, d)))
    .mul(smoothstep(0.1, 0.14, d));
  const star2 = sin(ang.mul(3).sub(time.mul(0.12)).add(1.047))
    .abs()
    .pow(60)
    .mul(float(1).sub(smoothstep(0.62, 0.64, d)))
    .mul(smoothstep(0.1, 0.14, d));
  const pulse = sin(time.mul(0.9)).mul(0.15).add(0.85);
  const k = clamp(rings.add(runes).add(star).add(star2).add(ticks.mul(0.0)), 0, 1.4);
  mat.colorNode = mix(vec3(1.0, 0.72, 0.28), vec3(0.78, 0.55, 1.0), smoothstep(0.5, 0.9, d))
    .mul(k)
    .mul(pulse)
    .mul(1.25);
  mat.opacityNode = clamp(k.mul(pulse), 0, 0.9).mul(float(1).sub(smoothstep(0.985, 1.0, d)));
  return mat;
}

// ---------- cảnh ----------

export class ThienKhuyetSkyScene {
  readonly group = new THREE.Group();
  private disposables: { dispose(): void }[] = [];
  private shards: THREE.InstancedMesh | null = null;

  constructor(sky: ThienKhuyetSky, groundAt: (x: number, z: number) => number) {
    this.group.name = 'thienKhuyetSky';
    const parts = new Parts();
    const glow = new Parts();
    const bodyGeos: THREE.BufferGeometry[] = [];
    sky.islands.forEach((isl, i) => {
      const seed = 2113 + i * 131;
      bodyGeos.push(islandGeometry(isl, seed));
      const st = new Parts();
      stalactites(st, isl, seed);
      const sg = st.merged('stone');
      if (sg) bodyGeos.push(sg);
      if (isl.kind === 'cong') gateRuins(parts, glow, isl, seed);
      else palaceRuins(parts, glow, isl, seed);
    });
    // Thân đảo cần cùng thuộc tính với phần còn lại (position, normal, color, không index) để gộp.
    const rock = bodyGeos.map((g) => (g.index ? g.toNonIndexed() : g));
    for (const g of rock) {
      if (!g.getAttribute('normal')) g.computeVertexNormals();
    }
    const rockMerged = mergeGeometries(rock, false);
    for (const g of bodyGeos) g.dispose();
    stair(parts, glow, sky.stair, 7001);
    statue(parts, sky.statue, groundAt(sky.statue.x, sky.statue.z));
    // Cột ngọc vỡ dọc đại lộ và quanh quảng trường.
    const rand = tkRng(8123);
    let placed = 0;
    for (let guard = 0; guard < 400 && placed < sky.pillars; guard++) {
      const side = rand() < 0.5 ? -1 : 1;
      const z = 470 + rand() * 600;
      const x = 1034 + side * (46 + rand() * 40) + (z - 470) * 0.004;
      if (Math.hypot(x - 1144, z - 684) < 50) continue;
      const q = rand();
      const h = 16 + rand() * 20;
      const gy = groundAt(x, z);
      if (q < 0.62)
        parts.add(
          'stone',
          columnGeometry(h, h * 0.075, 0.3 + rand() * 0.6, placed + 5),
          mat4(x, gy - 0.3, z, (rand() - 0.5) * 0.1, 0, (rand() - 0.5) * 0.1),
          rand() < 0.5 ? STONE : STONE_WARM,
          0.06,
          5,
        );
      else
        parts.add(
          'stone',
          columnGeometry(h, h * 0.075, 0.9, placed + 5),
          mat4(x, gy + h * 0.06, z, Math.PI / 2 - 0.1 - rand() * 0.15, rand() * 6.28, 0),
          STONE,
          0.06,
          5,
        );
      if (q > 0.85) {
        const g = new THREE.OctahedronGeometry(0.7, 0);
        glow.add('glow', g, mat4(x + 1.4, gy + 0.9, z + 1.2, rand(), rand(), 0, 1, 1.7, 1), GLOW_VIOLET);
      }
      placed++;
    }
    // Vòng tiên môn gãy sau Cổng Tiên Vỡ.
    const gate = sky.islands.find((i) => i.kind === 'cong');
    if (gate) ringBroken(parts, glow, gate.x, gate.y + 78, gate.z - 34, 118);

    const stoneMat = stoneMaterial();
    const goldMat = goldMaterial();
    const glowMat = glowMaterial();
    const stoneGeo = parts.merged('stone');
    const goldGeo = parts.merged('gold');
    const glowGeo = glow.merged('glow');
    const addMesh = (geo: THREE.BufferGeometry | null | undefined, mat: THREE.Material, name: string, shadow: boolean, order = 0) => {
      if (!geo) return;
      const m = new THREE.Mesh(geo, mat);
      m.name = name;
      m.frustumCulled = false;
      m.castShadow = shadow;
      m.receiveShadow = shadow;
      m.renderOrder = order;
      this.group.add(m);
      this.disposables.push(geo);
    };
    addMesh(rockMerged, stoneMat, 'tk-islands', true);
    addMesh(stoneGeo, stoneMat, 'tk-ruins', true);
    addMesh(goldGeo, goldMat, 'tk-gold', true);
    addMesh(glowGeo, glowMat, 'tk-glow', false, 4);
    this.disposables.push(stoneMat, goldMat, glowMat);

    // Màn sáng Cổng Tiên Vỡ.
    if (gate) {
      const pm = portalMaterial();
      const pg = new THREE.PlaneGeometry(52, 90);
      const portal = new THREE.Mesh(pg, pm);
      portal.name = 'tk-portal';
      portal.position.set(gate.x, gate.y + 4.8 + 46, gate.z + 0.5);
      portal.renderOrder = 5;
      portal.frustumCulled = false;
      this.group.add(portal);
      this.disposables.push(pg, pm);
    }
    // Trận pháp trên mặt quảng trường.
    {
      const am = arrayMaterial();
      const ag = new THREE.PlaneGeometry(sky.array.r * 2, sky.array.r * 2);
      ag.rotateX(-Math.PI / 2);
      const arr = new THREE.Mesh(ag, am);
      arr.name = 'tk-array';
      arr.position.set(sky.array.x, groundAt(sky.array.x, sky.array.z) + 0.35, sky.array.z);
      arr.renderOrder = 3;
      arr.frustumCulled = false;
      this.group.add(arr);
      this.disposables.push(ag, am);
    }
    // Mảnh đá trời lơ lửng (InstancedMesh).
    if (sky.shards > 0) {
      const sg = shardGeometry(17);
      const sm = createWorldMaterial({ vertexColors: false, roughness: 0.7, metalness: 0.05, color: 0xffffff });
      const mesh = new THREE.InstancedMesh(sg, sm, sky.shards);
      mesh.name = 'tk-shards';
      mesh.frustumCulled = false;
      const r = tkRng(991);
      const d = new THREE.Object3D();
      const c = new THREE.Color();
      for (let i = 0; i < sky.shards; i++) {
        const a = r() * Math.PI * 2;
        const rr = 160 + r() * 520;
        const x = 1044 + Math.cos(a) * rr * 1.1;
        const z = 520 + Math.sin(a) * rr * 0.8;
        const y = 150 + r() * 230;
        d.position.set(x, y, z);
        d.rotation.set(r() * 6, r() * 6, r() * 6);
        d.scale.setScalar(2.5 + Math.pow(r(), 2.4) * 16);
        d.updateMatrix();
        mesh.setMatrixAt(i, d.matrix);
        const q = r();
        if (q < 0.07) c.copy(GOLD_DARK).multiplyScalar(0.7);
        else
          c.copy(ROCK_MID)
            .lerp(ROCK_LOW, r() * 0.7)
            .multiplyScalar(0.8 + r() * 0.35);
        mesh.setColorAt(i, c);
      }
      mesh.instanceMatrix.needsUpdate = true;
      this.group.add(mesh);
      this.shards = mesh;
      this.disposables.push(sg, sm, mesh);
    }
  }

  /** Mảnh đá trời nhấp nhô rất chậm (chỉ tịnh tiến cả khối, không dựng lại ma trận). */
  update(t: number): void {
    if (this.shards) this.shards.position.y = Math.sin(t * 0.35) * 1.6;
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
  }
}
