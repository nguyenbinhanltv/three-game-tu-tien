import * as THREE from 'three/webgpu';
import { clamp, exp, float, mix, smoothstep, sin, texture, time, uv, vec2, vec3 } from 'three/tsl';
import { SECT, type LacKiemSky, type SkyIsland } from '@dtl/shared';
import { createWorldMaterial } from '../../render/materials/world';
import { FOLIAGE_TILE, foliageMaterial, loadSkyTextures, rockMaterial } from './skyAssets';
import { FarRidges } from '../../render/farRidges';
import { getCloudNoise } from '../../render/noiseTex';

/**
 * Cảnh Lạc Kiếm trên không (MAP-1): đảo nổi quanh tông môn (thân đá treo rễ cây, mặt cỏ, rừng nhỏ), cầu mây ngọc nối
 * tông môn với các đảo, thác đổ từ mép đảo xuống biển mây, Kiếm Đài với hàng nghìn thanh kiếm cắm (InstancedMesh).
 * Chỉ để nhìn: không có va chạm. Công trình trên đảo (đài, đình, tháp) nằm trong `arch_sect` (script Blender,
 * cùng dữ liệu `lacKiemSky` ở `levels/van_lam.assets.json`).
 *
 * Draw call: thân đảo + cầu = 2 mesh gộp, kiếm = 1 InstancedMesh, thác = 1 mesh, sương chân thác = 1 mesh.
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
  const fx = x - xi;
  const fy = y - yi;
  const fz = z - zi;
  const s = (t: number) => t * t * (3 - 2 * t);
  const sx = s(fx);
  const sy = s(fy);
  const sz = s(fz);
  const l = (a: number, b: number, t: number) => a + (b - a) * t;
  const c = (dx: number, dy: number, dz: number) => hash(xi + dx, yi + dy, zi + dz, seed);
  return l(
    l(l(c(0, 0, 0), c(1, 0, 0), sx), l(c(0, 1, 0), c(1, 1, 0), sx), sy),
    l(l(c(0, 0, 1), c(1, 0, 1), sx), l(c(0, 1, 1), c(1, 1, 1), sx), sy),
    sz,
  );
}

function fbm3(x: number, y: number, z: number, seed: number, oct = 3): number {
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

function rng(seed: number): () => number {
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

// ---------- bộ dựng lưới gộp ----------

class Mesher {
  pos: number[] = [];
  col: number[] = [];
  idx: number[] = [];

  vert(x: number, y: number, z: number, c: THREE.Color): number {
    this.pos.push(x, y, z);
    this.col.push(c.r, c.g, c.b);
    return this.pos.length / 3 - 1;
  }

  tri(a: number, b: number, c: number): void {
    this.idx.push(a, b, c);
  }

  quad(a: number, b: number, c: number, d: number): void {
    this.idx.push(a, b, c, a, c, d);
  }

  /** Như `quad`/`tri` nhưng bỏ qua khi có chỉ số thiếu (đỉnh chưa dựng), thay cho khẳng định không-undefined. */
  quadIf(a?: number, b?: number, c?: number, d?: number): void {
    if (a === undefined || b === undefined || c === undefined || d === undefined) return;
    this.quad(a, b, c, d);
  }

  triIf(a?: number, b?: number, c?: number): void {
    if (a === undefined || b === undefined || c === undefined) return;
    this.tri(a, b, c);
  }

  /** Hộp có xoay: tâm, nửa kích thước, các trục địa phương (u, v, w đơn vị). */
  box(c: THREE.Vector3, h: THREE.Vector3, u: THREE.Vector3, v: THREE.Vector3, w: THREE.Vector3, color: THREE.Color): void {
    const corner = (sx: number, sy: number, sz: number) =>
      this.vert(
        c.x + u.x * h.x * sx + v.x * h.y * sy + w.x * h.z * sz,
        c.y + u.y * h.x * sx + v.y * h.y * sy + w.y * h.z * sz,
        c.z + u.z * h.x * sx + v.z * h.y * sy + w.z * h.z * sz,
        color,
      );
    // Mặt riêng cho từng hướng (đỉnh không dùng chung) để pháp tuyến phẳng sau computeVertexNormals.
    const f = (a: [number, number, number], b: [number, number, number], cc: [number, number, number], d: [number, number, number]) => {
      const i0 = corner(...a);
      const i1 = corner(...b);
      const i2 = corner(...cc);
      const i3 = corner(...d);
      this.quad(i0, i1, i2, i3);
    };
    f([-1, 1, -1], [-1, 1, 1], [1, 1, 1], [1, 1, -1]); // trên
    f([-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1]); // dưới
    f([-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]); // +w
    f([1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1]); // -w
    f([1, -1, 1], [1, -1, -1], [1, 1, -1], [1, 1, 1]); // +u
    f([-1, -1, -1], [-1, -1, 1], [-1, 1, 1], [-1, 1, -1]); // -u
  }

  geometry(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.idx);
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  }
}

const C = (hex: number) => new THREE.Color(hex);
const GRASS_A = C(0x7cc47e);
const GRASS_B = C(0xa6dc8c);
const EARTH = C(0x8a7458);
const ROCK_TOP = C(0x9a8b76);
const ROCK_MID = C(0x7b8189);
const ROCK_LOW = C(0x56667a);
const MOSS = C(0x5c8f4e);
const ROOT = C(0x6a5440);
const JADE = C(0xe3ece6);
const JADE_SHADE = C(0xb9cbc2);
const JADE_GREEN = C(0x6fb59a);
const TRUNK = C(0x5a4333);

// ---------- ống thuôn và khối tròn gồ ghề ----------

/** Ống thuôn qua chuỗi điểm: bán kính `radii[i]` tại `pts[i]`, `sides` cạnh, màu theo `colorAt(t)`. */
function tube(m: Mesher, pts: THREE.Vector3[], radii: number[], sides: number, colorAt: (t: number) => THREE.Color): void {
  let prev: number[] = [];
  const last = pts.length - 1;
  for (let i = 0; i <= last; i++) {
    const c = colorAt(i / last);
    const pt = pts[i];
    if (!pt) continue;
    const rad = radii[i] ?? 0;
    const row: number[] = [];
    for (let j = 0; j < sides; j++) {
      const b = (j / sides) * Math.PI * 2;
      row.push(m.vert(pt.x + Math.cos(b) * rad, pt.y, pt.z + Math.sin(b) * rad, c));
    }
    if (prev.length) for (let j = 0; j < sides; j++) m.quadIf(prev[j], row[j], row[(j + 1) % sides], prev[(j + 1) % sides]);
    prev = row;
  }
}

const _ico = new THREE.IcosahedronGeometry(1, 1);

/** Khối tròn méo theo nhiễu (tán cây, cụm lá): ico chia một lần, đỉnh chung dịch cùng nhau nên không rách. */
function blob(m: Mesher, c: THREE.Vector3, rx: number, ry: number, rz: number, color: THREE.Color, seed: number): void {
  const p = _ico.getAttribute('position');
  const tmp = new THREE.Color();
  const base: number[] = [];
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const n = 0.78 + 0.5 * fbm3(x * 1.7 + seed, y * 1.7, z * 1.7, seed, 2);
    tmp.copy(color).multiplyScalar(0.8 + 0.3 * (y * 0.5 + 0.5));
    base.push(m.vert(c.x + x * rx * n, c.y + y * ry * n, c.z + z * rz * n, tmp));
  }
  for (let i = 0; i < p.count; i += 3) m.triIf(base[i], base[i + 1], base[i + 2]);
}

// ---------- tán lá bằng thẻ (alpha) ----------

/** Lưới các thẻ (quad) có uv trỏ vào atlas tán lá; màu đỉnh nhân màu ảnh để đổi sắc theo cây. */
class CardMesher {
  pos: number[] = [];
  uv: number[] = [];
  col: number[] = [];
  idx: number[] = [];

  /** Thẻ rộng `w`, cao `h`, tâm `c`, trục ngang `r` và dọc `u` (đơn vị), ô atlas `tile`. */
  card(c: THREE.Vector3, r: THREE.Vector3, u: THREE.Vector3, w: number, h: number, tile: [number, number], color: THREE.Color): void {
    const base = this.pos.length / 3;
    const corners: [number, number][] = [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ];
    for (const [sx, sy] of corners) {
      this.pos.push(
        c.x + r.x * w * 0.5 * sx + u.x * h * 0.5 * sy,
        c.y + r.y * w * 0.5 * sx + u.y * h * 0.5 * sy,
        c.z + r.z * w * 0.5 * sx + u.z * h * 0.5 * sy,
      );
      // v = 0 ở hàng trên của ô (texture không lật), nên đỉnh trên (sy = 1) lấy v nhỏ.
      this.uv.push(tile[0] + (sx * 0.5 + 0.5) * 0.5, tile[1] + (0.5 - (sy * 0.5 + 0.5) * 0.5));
      this.col.push(color.r, color.g, color.b);
    }
    this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  get count(): number {
    return this.idx.length / 6;
  }

  geometry(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.idx);
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  }
}

type CrownKind = 'pine' | 'maple' | 'bamboo' | 'peach';

/** Loài cây theo đảo: Kiếm Đài tùng; đình Đông đào + tùng; tháp phong; đình Tây tùng + trúc; điện xa tùng + phong. */
const ISLAND_TREES: Record<string, CrownKind[]> = {
  kiem_dai: ['pine', 'pine', 'pine'],
  dinh_dong: ['peach', 'peach', 'pine'],
  thap_nam: ['maple', 'maple', 'pine'],
  dinh_tay: ['pine', 'bamboo', 'bamboo'],
  dien_xa: ['pine', 'maple', 'pine'],
};

/** Tán một cây: các thẻ lá xoè quanh tâm, nghiêng ngẫu nhiên (cành rủ với tùng, bụi dựng với trúc). */
function crown(cards: CardMesher, c: THREE.Vector3, size: number, kind: CrownKind, tint: THREE.Color, rand: () => number): void {
  const tile = FOLIAGE_TILE[kind];
  const n = kind === 'bamboo' ? 7 : kind === 'pine' ? 15 : 13;
  const col = new THREE.Color();
  for (let i = 0; i < n; i++) {
    const yaw = rand() * Math.PI * 2;
    const tilt = kind === 'bamboo' ? (rand() - 0.5) * 0.5 : kind === 'pine' ? 0.25 + rand() * 0.45 : (rand() - 0.5) * 0.9;
    const r = new THREE.Vector3(Math.cos(yaw), 0, Math.sin(yaw));
    const up = new THREE.Vector3(Math.sin(yaw) * Math.sin(tilt), Math.cos(tilt), -Math.cos(yaw) * Math.sin(tilt)).normalize();
    // Vị trí trong khối cầu dẹt quanh tâm tán; tùng xếp tầng (cao dần theo i).
    const a = rand() * Math.PI * 2;
    const rr = size * (0.15 + 0.5 * rand());
    const y = kind === 'pine' ? (i / n - 0.4) * size * 1.6 : (rand() - 0.4) * size * 0.9;
    const p = new THREE.Vector3(c.x + Math.cos(a) * rr, c.y + y, c.z + Math.sin(a) * rr);
    const sz = size * (kind === 'bamboo' ? 0.95 : 0.9 + rand() * 0.5);
    col.copy(tint).multiplyScalar(0.78 + rand() * 0.4);
    cards.card(p, r, up, sz, sz * (kind === 'bamboo' ? 1.2 : 1), tile, col);
  }
}

// ---------- thân đảo ----------

const SEG = 72;
const RINGS = 28;

/** Toạ độ thế giới của tâm mặt trên đảo. */
export function islandTop(isl: SkyIsland): THREE.Vector3 {
  return new THREE.Vector3(SECT.x + isl.x, SECT.y + isl.y, SECT.z + isl.z);
}

/** Điểm mép đảo theo hướng (dx, dz) đã chuẩn hóa, cách tâm `r * k` mét. */
function rimPoint(isl: SkyIsland, dx: number, dz: number, k = 1): THREE.Vector3 {
  const t = islandTop(isl);
  return new THREE.Vector3(t.x + dx * isl.r * k, t.y, t.z + dz * isl.r * k);
}

function buildIsland(rock: Mesher, prop: Mesher, cards: CardMesher, isl: SkyIsland, seed: number): void {
  const m = rock; // thân đá; phần cỏ, rễ, dây leo, thân cây ghi vào `prop` (tô màu đỉnh, không dán texture đá)
  const top = islandTop(isl);
  const R = isl.r;
  const rand = rng(seed);
  const tmp = new THREE.Color();
  const radius = (a: number, t: number) => {
    const n = fbm3(Math.cos(a) * 2.1 + seed, Math.sin(a) * 2.1, t * 2.8, seed, 3);
    // Mép trên hơi vát, thân phình rồi thu nhọn về mũi đá; bậc đá (ledge) theo độ cao, gân dọc thân.
    const shape = Math.pow(Math.max(0, 1 - Math.pow(t, 1.35)), 0.62) * (1 + 0.1 * Math.sin(t * 3.1));
    const f = (t * 6.5 + 0.35 * fbm3(a * 1.3 + seed, t * 2, 1.1, seed + 2, 2)) % 1;
    const ledge = 1 + 0.09 * Math.pow(f, 2.2) - 0.03;
    const rib = 1 + 0.07 * Math.sin(a * 9 + seed) * fbm3(a * 3 + seed, t * 4, 2.2, seed + 6, 2) * Math.min(1, t * 4);
    const crag = 1 + 0.11 * (fbm3(Math.cos(a) * 5.5 + seed, Math.sin(a) * 5.5, t * 7.5, seed + 4, 3) - 0.5) * Math.min(1, t * 6);
    return R * shape * (0.74 + 0.6 * n) * ledge * rib * crag;
  };
  // Mặt trên: quạt từ tâm (hơi gồ) ra mép; màu cỏ loang.
  const centerY = top.y + 0.9;
  const ring: number[][] = [];
  for (let k = 0; k <= RINGS; k++) {
    // Lưới không đều (không ra gạch đều): vòng lệch nhịp, góc từng đỉnh lệch, rồi xê dịch từng đỉnh.
    const t = k === 0 || k === RINGS ? k / RINGS : (k + (hash(k, 3, 1, seed) - 0.5) * 0.7) / RINGS;
    const row: number[] = [];
    for (let s = 0; s < SEG; s++) {
      const a = ((s + (hash(s, k, 2, seed) - 0.5) * 0.8) / SEG) * Math.PI * 2;
      const r = k === 0 ? radius(a, 0) : radius(a, t);
      const y = top.y - isl.depth * Math.pow(t, 0.95) * (0.92 + 0.16 * fbm3(a * 2 + seed, t * 3, 4.2, seed + 9, 2)) - (k === 0 ? 0 : 0);
      const jr = 1 + (hash(s, k, 5, seed) - 0.5) * 0.08 * Math.min(1, k / 2);
      const cx = top.x + Math.cos(a) * r * jr;
      const cz = top.z + Math.sin(a) * r * jr;
      // Màu: mép trên đất nâu, rồi đá nâu xám → xanh xám; mảng rêu theo nhiễu.
      const moss = fbm3(cx * 0.07, y * 0.09, cz * 0.07, seed + 3, 3);
      if (t < 0.07) tmp.copy(EARTH).lerp(GRASS_A, 0.35);
      else if (t < 0.4) tmp.copy(ROCK_TOP).lerp(ROCK_MID, (t - 0.07) / 0.33);
      else tmp.copy(ROCK_MID).lerp(ROCK_LOW, Math.min(1, (t - 0.4) / 0.5));
      if (moss > 0.62 && t < 0.5) tmp.lerp(MOSS, Math.min(0.6, (moss - 0.62) * 3) * (1 - t * 1.4));
      // Vân đá xếp tầng: dải sáng tối ngang theo độ cao, lệch theo nhiễu (vách đá trầm tích).
      const strata = 0.86 + 0.28 * Math.sin(y * 0.62 + fbm3(cx * 0.05, y * 0.05, cz * 0.05, seed + 8, 2) * 5);
      const lum = strata * (0.88 + 0.24 * fbm3(cx * 0.2, y * 0.2, cz * 0.2, seed + 5, 2));
      // Lớp đá xen kẽ ấm (sa thạch) / lạnh (đá xanh); chân đảo tối dần (bóng đổ).
      if (Math.sin(y * 0.62 + moss * 4) > 0.2 && t > 0.06) tmp.lerp(ROCK_TOP, 0.3);
      tmp.multiplyScalar(lum * (1 - t * 0.32) * (0.9 + 0.2 * hash(s, k, 7, seed)));
      row.push(m.vert(cx, y, cz, tmp));
    }
    ring.push(row);
  }
  for (let k = 0; k < RINGS; k++)
    for (let s = 0; s < SEG; s++) {
      const s2 = (s + 1) % SEG;
      m.quadIf(ring[k]?.[s], ring[k + 1]?.[s], ring[k + 1]?.[s2], ring[k]?.[s2]);
    }
  // Mũi đá đáy.
  const tipLen = isl.depth * 0.28;
  const tip = m.vert(top.x, top.y - isl.depth - tipLen, top.z, ROCK_LOW);
  const lastRing = ring[RINGS];
  if (lastRing) for (let s = 0; s < SEG; s++) m.triIf(lastRing[s], tip, lastRing[(s + 1) % SEG]);
  // Mặt cỏ: vành ngoài (lệch cao thấp) + tâm.
  const grassRing: number[] = [];
  const bumpy = (x: number, z: number) => 0.55 * fbm3(x * 0.09, 0.3, z * 0.09, seed + 11, 3);
  for (let s = 0; s < SEG; s++) {
    const a = (s / SEG) * Math.PI * 2;
    const r = radius(a, 0);
    const x = top.x + Math.cos(a) * r;
    const z = top.z + Math.sin(a) * r;
    tmp.copy(GRASS_A).lerp(GRASS_B, fbm3(x * 0.05, 1.5, z * 0.05, seed + 2, 2));
    grassRing.push(prop.vert(x, top.y + 0.08, z, tmp));
  }
  const inner: number[] = [];
  const innerK = 0.62;
  for (let s = 0; s < SEG; s++) {
    const a = (s / SEG) * Math.PI * 2;
    const r = radius(a, 0) * innerK;
    const x = top.x + Math.cos(a) * r;
    const z = top.z + Math.sin(a) * r;
    tmp.copy(GRASS_A).lerp(GRASS_B, fbm3(x * 0.05, 2.5, z * 0.05, seed + 4, 2));
    inner.push(prop.vert(x, top.y + bumpy(x, z) + 0.2, z, tmp));
  }
  const ctr = prop.vert(top.x, centerY - 0.2, top.z, GRASS_B);
  for (let s = 0; s < SEG; s++) {
    const s2 = (s + 1) % SEG;
    prop.quadIf(grassRing[s], inner[s], inner[s2], grassRing[s2]);
    prop.triIf(inner[s], ctr, inner[s2]);
  }
  const col = (hex: number) => C(hex);
  // Nhũ đá nhọn treo dưới thân: nhiều cỡ, nghiêng nhẹ, đá phân lớp tối dần về mũi.
  const nStal = Math.round(R * 1.3);
  for (let i = 0; i < nStal; i++) {
    const a = rand() * Math.PI * 2;
    const t0 = 0.28 + rand() * 0.6;
    const r0 = radius(a, t0) * (0.7 + rand() * 0.25);
    const len = isl.depth * (0.12 + rand() * 0.38) * (rand() < 0.12 ? 1.8 : 1);
    const w0 = (0.7 + rand() * 1.6) * (R / 120 + 0.8);
    const sx = top.x + Math.cos(a) * r0;
    const sz = top.z + Math.sin(a) * r0;
    const sy = top.y - isl.depth * Math.pow(t0, 0.95) + 1.5;
    const lean = (rand() - 0.5) * 3;
    const pts: THREE.Vector3[] = [];
    const rad: number[] = [];
    for (let k = 0; k <= 5; k++) {
      const q = k / 5;
      pts.push(new THREE.Vector3(sx + lean * q, sy - len * q, sz + lean * 0.5 * q));
      rad.push(w0 * Math.pow(1 - q, 0.85) + 0.03);
    }
    tube(m, pts, rad, 6, (q) =>
      ROCK_MID.clone()
        .lerp(ROCK_LOW, 0.3 + q * 0.7)
        .multiplyScalar(0.85 + rand() * 0.2),
    );
  }
  // Rễ cây khổng lồ bám thân đảo, cong ra ngoài rồi rũ xuống.
  const nRoots = Math.round(R * 0.2);
  for (let i = 0; i < nRoots; i++) {
    const a = rand() * Math.PI * 2;
    const t0 = 0.08 + rand() * 0.3;
    const r0 = radius(a, t0);
    const len = isl.depth * (0.25 + rand() * 0.5);
    const w0 = 0.16 + rand() * 0.3;
    const sx = top.x + Math.cos(a) * r0 * 0.96;
    const sz = top.z + Math.sin(a) * r0 * 0.96;
    const sy = top.y - isl.depth * Math.pow(t0, 0.95);
    const bend = (rand() - 0.5) * 8;
    const pts: THREE.Vector3[] = [];
    const rad: number[] = [];
    for (let k = 0; k <= 7; k++) {
      const q = k / 7;
      pts.push(
        new THREE.Vector3(
          sx + Math.cos(a) * (q * q * 5 + bend * q) + Math.sin(a) * bend * 0.4 * q,
          sy - len * q,
          sz + Math.sin(a) * (q * q * 5 + bend * q) - Math.cos(a) * bend * 0.4 * q,
        ),
      );
      rad.push(w0 * (1 - q) * (1 - q * 0.4) + 0.03);
    }
    tube(prop, pts, rad, 5, (q) => ROOT.clone().lerp(ROCK_MID, q * 0.35));
  }
  // Dây leo rủ xuống từ mép đảo, điểm cụm lá; mảng rêu dày ở chân vách trên.
  const nVines = Math.round(R * 0.9);
  const VINE = col(0x3d7a3e);
  const VINE_LEAF = col(0x6fb25a);
  for (let i = 0; i < nVines; i++) {
    const a = rand() * Math.PI * 2;
    const t0 = rand() * 0.1;
    const r0 = radius(a, t0) * (0.92 + rand() * 0.08);
    const len = 7 + rand() * 24 * (rand() < 0.2 ? 1.6 : 1);
    const sx = top.x + Math.cos(a) * r0;
    const sz = top.z + Math.sin(a) * r0;
    const sy = top.y - isl.depth * Math.pow(t0, 0.95);
    const segs = Math.max(4, Math.round(len / 2));
    const pts: THREE.Vector3[] = [];
    const rad: number[] = [];
    const sway = (rand() - 0.5) * 1.6;
    for (let k = 0; k <= segs; k++) {
      const q = k / segs;
      pts.push(new THREE.Vector3(sx + Math.cos(a) * q * 1.2 + Math.sin(q * 5 + i) * sway * 0.4, sy - len * q, sz + Math.sin(a) * q * 1.2));
      rad.push(0.11 * (1 - q * 0.5));
    }
    tube(prop, pts, rad, 4, (q) => VINE.clone().lerp(ROOT, q * 0.3));
    for (let k = 2; k <= segs; k += 3) {
      const pk = pts[k];
      if (pk) blob(prop, pk, 0.55, 0.38, 0.55, VINE_LEAF, seed + i * 7 + k);
    }
  }
  // Rừng nhỏ trên mặt đảo: thân tapered (tô màu đỉnh) + tán bằng thẻ lá alpha theo loài của đảo (chừa vùng giữa cho công trình/đài).
  const nTrees = Math.round(R * (isl.kind === 'kiem_dai' ? 0.22 : 0.5)); // Kiếm Đài: ít cây để kiếm là điểm nhìn chính
  const kinds = ISLAND_TREES[isl.id] ?? ['pine', 'maple', 'pine'];
  const tints: Record<CrownKind, THREE.Color> = { pine: C(0xd8ffd8), maple: C(0xfff0e0), bamboo: C(0xe8ffd0), peach: C(0xffffff) };
  for (let i = 0; i < nTrees; i++) {
    const a = rand() * Math.PI * 2;
    const rr = R * (0.72 + rand() * 0.2) * (radius(a, 0) / R);
    const x = top.x + Math.cos(a) * rr;
    const z = top.z + Math.sin(a) * rr;
    const y = top.y + bumpy(x, z) + 0.15;
    const kind = kinds[Math.floor(rand() * kinds.length)] ?? 'pine';
    const h = (kind === 'bamboo' ? 4 : 4.5) + rand() * 4.5;
    const lean = (rand() - 0.5) * 0.9;
    if (kind !== 'bamboo') {
      const tp: THREE.Vector3[] = [];
      const tr: number[] = [];
      for (let k = 0; k <= 4; k++) {
        const q = k / 4;
        tp.push(new THREE.Vector3(x + lean * q * q * h * 0.25, y + h * q, z));
        tr.push(0.34 * (1 - q * 0.7));
      }
      tube(prop, tp, tr, 6, (q) => TRUNK.clone().multiplyScalar(0.8 + q * 0.3));
    }
    const crownSize = (kind === 'bamboo' ? 3.2 : 3.4 + rand() * 1.6) * (R / 40 + 0.6);
    crown(cards, new THREE.Vector3(x + lean * h * 0.25, y + h * (kind === 'bamboo' ? 0.55 : 0.85), z), crownSize, kind, tints[kind], rand);
  }
}

// ---------- cầu mây ----------

interface Pt {
  x: number;
  y: number;
  z: number;
}

function bridgeEnds(sky: LacKiemSky, from: string, to: string): [Pt, Pt] {
  const find = (id: string) => sky.islands.find((i) => i.id === id);
  const a = find(from);
  const b = find(to);
  if (!b) throw new Error(`lacKiemSky: không có đảo ${to}`);
  const bt = islandTop(b);
  const at: Pt = a ? islandTop(a) : { x: SECT.x, y: SECT.y, z: SECT.z };
  const dir = new THREE.Vector2(bt.x - at.x, bt.z - at.z).normalize();
  const startR = a ? a.r * 0.82 : 92;
  const endR = b.r * 0.82;
  const dist = Math.hypot(bt.x - at.x, bt.z - at.z);
  return [
    { x: at.x + dir.x * startR, y: at.y + 0.2, z: at.z + dir.y * startR },
    { x: at.x + dir.x * (dist - endR), y: bt.y + 0.2, z: at.z + dir.y * (dist - endR) },
  ];
}

/** Điểm trên cầu theo tham số q ∈ [0, 1]: nội suy cao độ mượt, vồng lên giữa cầu. */
function bridgeAt(p0: Pt, p1: Pt, q: number): Pt {
  const e = q * q * (3 - 2 * q);
  return { x: p0.x + (p1.x - p0.x) * q, y: p0.y + (p1.y - p0.y) * e + Math.sin(q * Math.PI) * 2.2, z: p0.z + (p1.z - p0.z) * q };
}

function buildBridge(m: Mesher, glow: Mesher, p0: Pt, p1: Pt): void {
  const len = Math.hypot(p1.x - p0.x, p1.z - p0.z);
  const n = Math.max(8, Math.round(len / 1.5));
  const up = new THREE.Vector3(0, 1, 0);
  const half = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    const a = bridgeAt(p0, p1, i / n);
    const b = bridgeAt(p0, p1, (i + 1) / n);
    const c = new THREE.Vector3((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    const fwd = new THREE.Vector3(b.x - a.x, b.y - a.y, b.z - a.z);
    const L = fwd.length();
    fwd.normalize();
    const side = new THREE.Vector3().crossVectors(fwd, up).normalize();
    const upv = new THREE.Vector3().crossVectors(side, fwd).normalize();
    const col = i % 2 ? JADE_SHADE : JADE;
    // Ván cầu ngọc; dải ngọc lục giữa; thành bên.
    m.box(c, half.set(2.1, 0.22, L * 0.52), side, upv, fwd, col);
    m.box(c.clone().addScaledVector(upv, 0.24), half.set(0.7, 0.02, L * 0.5), side, upv, fwd, JADE_GREEN);
    for (const sg of [-1, 1]) {
      const sc = c
        .clone()
        .addScaledVector(side, sg * 2.0)
        .addScaledVector(upv, 0.55);
      m.box(sc, half.set(0.13, 0.14, L * 0.52), side, upv, fwd, JADE);
      if (i % 3 === 0) {
        const pc = c
          .clone()
          .addScaledVector(side, sg * 2.0)
          .addScaledVector(upv, 0.55);
        m.box(pc, half.set(0.2, 0.55, 0.2), side, upv, fwd, JADE_SHADE);
        // Đèn ngọc trên đầu trụ: phát sáng ấm.
        glow.box(pc.clone().addScaledVector(upv, 0.78), half.set(0.14, 0.14, 0.14), side, upv, fwd, C(0xffc678));
      }
    }
    // Dải mây ngọc phát sáng dưới ván (cầu "bay" trên mây).
    glow.box(c.clone().addScaledVector(upv, -0.28), half.set(1.8, 0.05, L * 0.5), side, upv, fwd, C(0x9fe8d2));
  }
  // Trụ đầu cầu.
  for (const [p, dirSign] of [
    [p0, 1],
    [p1, -1],
  ] as const) {
    const dx = (p1.x - p0.x) / len;
    const dz = (p1.z - p0.z) / len;
    const side = new THREE.Vector3(-dz, 0, dx);
    for (const sg of [-1, 1]) {
      const c = new THREE.Vector3(p.x + side.x * sg * 2.4 + dx * dirSign * 0.8, p.y + 1.6, p.z + side.z * sg * 2.4 + dz * dirSign * 0.8);
      m.box(c, half.set(0.55, 1.6, 0.55), side, up, new THREE.Vector3(dx, 0, dz), JADE_SHADE);
      m.box(c.clone().setY(c.y + 1.9), half.set(0.75, 0.2, 0.75), side, up, new THREE.Vector3(dx, 0, dz), JADE);
      glow.box(c.clone().setY(c.y + 2.35), half.set(0.28, 0.3, 0.28), side, up, new THREE.Vector3(dx, 0, dz), C(0xffc678));
    }
  }
}

// ---------- thác ----------

function fallMaterial(): THREE.MeshBasicNodeMaterial {
  const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide });
  const noise = getCloudNoise();
  const u = uv();
  const flow = time.mul(0.9);
  const a = texture(noise, vec2(u.x.mul(2.4), u.y.mul(-0.6).add(flow))).g;
  const b = texture(noise, vec2(u.x.mul(5.3).add(0.37), u.y.mul(-1.3).add(flow.mul(1.7)))).a;
  const streak = clamp(a.mul(0.7).add(b.mul(0.6)).sub(0.15), 0, 1);
  const edge = float(1).sub(u.x.sub(0.5).abs().mul(2)).pow(0.7);
  const fadeTop = smoothstep(0.0, 0.06, u.y.oneMinus());
  const fadeBot = smoothstep(0.0, 0.3, u.y);
  const foam = smoothstep(0.35, 0.0, u.y).mul(
    texture(noise, vec2(u.x.mul(7), u.y.mul(-3).add(flow.mul(2.4))))
      .a.mul(0.9)
      .add(0.3),
  );
  mat.opacityNode = clamp(
    streak.mul(edge).mul(fadeTop).mul(fadeBot).mul(0.95).add(edge.mul(0.12).mul(fadeBot)).add(foam.mul(edge).mul(0.5)),
    0,
    0.95,
  );
  // Bọt trắng đục ở chân thác (v nhỏ): nhiễu cuộn nhanh, đậm dần xuống chân.
  mat.colorNode = mix(mix(vec3(0.62, 0.86, 0.9), vec3(1, 1, 1), streak.mul(0.8)), vec3(1, 1, 1), clamp(foam, 0, 1));
  return mat;
}

function mistMaterial(): THREE.MeshBasicNodeMaterial {
  const mat = new THREE.MeshBasicNodeMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });
  const noise = getCloudNoise();
  const u = uv();
  const d = u.sub(0.5).length().mul(2);
  const n = texture(noise, vec2(u.x.mul(1.6).add(time.mul(0.02)), u.y.mul(1.6))).a;
  mat.opacityNode = clamp(float(1).sub(d).pow(1.6).mul(n.mul(0.9).add(0.25)).mul(0.5), 0, 0.5);
  mat.colorNode = vec3(0.82, 0.93, 0.97)
    .mul(exp(d.negate().mul(0.4)))
    .add(sin(time).mul(0.0));
  return mat;
}

// ---------- kiếm Kiếm Đài ----------

function swordGeometry(): THREE.BufferGeometry {
  const parts: { g: THREE.BufferGeometry; c: THREE.Color }[] = [];
  const steel = new THREE.Color(1, 1, 1);
  const dark = new THREE.Color(0.62, 0.66, 0.72);
  const gold = new THREE.Color(0.9, 0.7, 0.3);
  const wood = new THREE.Color(0.32, 0.2, 0.13);
  // Lưỡi thon, mũi hướng xuống (cắm đất), cao 1: mặt cắt đùn có vát cạnh; rãnh giữa là dải sẫm nổi nhẹ hai mặt.
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.lineTo(0.052, 0.085);
  shape.lineTo(0.06, 0.2);
  shape.lineTo(0.06, 0.985);
  shape.lineTo(-0.06, 0.985);
  shape.lineTo(-0.06, 0.2);
  shape.lineTo(-0.052, 0.085);
  shape.closePath();
  const blade = new THREE.ExtrudeGeometry(shape, {
    depth: 0.012,
    bevelEnabled: true,
    bevelThickness: 0.009,
    bevelSize: 0.012,
    bevelSegments: 1,
    curveSegments: 1,
  });
  blade.translate(0, 0, -0.006);
  parts.push({ g: blade.toNonIndexed(), c: steel });
  const fuller = new THREE.BoxGeometry(0.024, 0.74, 0.036);
  fuller.translate(0, 0.55, 0);
  parts.push({ g: fuller.toNonIndexed(), c: dark });
  // Tay nắm: thanh ngang có sừng vẫy lên ở hai đầu và gờ giữa.
  const guard = new THREE.BoxGeometry(0.3, 0.032, 0.05);
  guard.translate(0, 0.998, 0);
  parts.push({ g: guard.toNonIndexed(), c: gold });
  for (const sx of [-1, 1]) {
    const horn = new THREE.ConeGeometry(0.022, 0.1, 5);
    horn.rotateZ(sx * -0.45);
    horn.translate(sx * 0.158, 1.04, 0);
    parts.push({ g: horn.toNonIndexed(), c: gold });
  }
  const boss = new THREE.CylinderGeometry(0.03, 0.03, 0.05, 8);
  boss.rotateX(Math.PI / 2);
  boss.translate(0, 0.998, 0);
  parts.push({ g: boss.toNonIndexed(), c: gold });
  // Chuôi quấn dây (ba đai vàng) và đầu chuôi tròn có tua.
  const grip = new THREE.CylinderGeometry(0.02, 0.02, 0.3, 8);
  grip.translate(0, 1.165, 0);
  parts.push({ g: grip.toNonIndexed(), c: wood });
  for (const y of [1.07, 1.165, 1.26]) {
    const ring = new THREE.CylinderGeometry(0.026, 0.026, 0.012, 8);
    ring.translate(0, y, 0);
    parts.push({ g: ring.toNonIndexed(), c: gold });
  }
  const pommel = new THREE.IcosahedronGeometry(0.036, 0);
  pommel.translate(0, 1.34, 0);
  parts.push({ g: pommel.toNonIndexed(), c: gold });
  const tassel = new THREE.ConeGeometry(0.014, 0.16, 5);
  tassel.rotateX(Math.PI);
  tassel.translate(0, 1.4 - 0.08, 0.0);
  tassel.translate(0.0, -0.04, 0);
  parts.push({ g: tassel.toNonIndexed(), c: new THREE.Color(0.75, 0.2, 0.2) });
  const pos: number[] = [];
  const nor: number[] = [];
  const colr: number[] = [];
  for (const { g, c } of parts) {
    g.computeVertexNormals();
    const p = g.getAttribute('position');
    const n = g.getAttribute('normal');
    for (let k = 0; k < p.count; k++) {
      pos.push(p.getX(k), p.getY(k), p.getZ(k));
      nor.push(n.getX(k), n.getY(k), n.getZ(k));
      colr.push(c.r, c.g, c.b);
    }
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.Float32BufferAttribute(colr, 3));
  return out;
}

// ---------- lớp dựng chính ----------

export class LacKiemSkyScene {
  readonly group = new THREE.Group();
  private disposables: { dispose(): void }[] = [];
  private rockMesh: THREE.Mesh;
  private cardMesh: THREE.Mesh;
  private dead = false;

  constructor(sky: LacKiemSky) {
    this.group.name = 'lacKiemSky';
    const ridges = new FarRidges(SECT.x, SECT.z);
    this.group.add(ridges.group);
    this.disposables.push(ridges);
    // Thân đá (vật liệu PBR chiếu ba mặt phẳng sau khi nạp texture; trước đó là màu đỉnh flat shading), cỏ + rễ + dây + cầu (màu đỉnh, trơn),
    // tán lá bằng thẻ alpha (hiện sau khi nạp atlas) và phần phát sáng (đèn ngọc, dải mây dưới cầu).
    const rockM = new Mesher();
    const propM = new Mesher();
    const cardM = new CardMesher();
    const glow = new Mesher();
    sky.islands.forEach((isl, i) => buildIsland(rockM, propM, cardM, isl, 1013 + i * 97));
    for (const br of sky.bridges) {
      const [p0, p1] = bridgeEnds(sky, br.from, br.to);
      buildBridge(propM, glow, p0, p1);
    }
    const rockMat0 = createWorldMaterial({ vertexColors: true, roughness: 0.92, side: THREE.DoubleSide, flatShading: true });
    this.rockMesh = new THREE.Mesh(rockM.geometry(), rockMat0);
    this.rockMesh.name = 'sky-rock';
    this.rockMesh.castShadow = true;
    this.rockMesh.receiveShadow = true;
    this.rockMesh.frustumCulled = false;
    this.group.add(this.rockMesh);
    const propMat = createWorldMaterial({ vertexColors: true, roughness: 0.9, side: THREE.DoubleSide });
    const propMesh = new THREE.Mesh(propM.geometry(), propMat);
    propMesh.name = 'sky-props';
    propMesh.castShadow = true;
    propMesh.receiveShadow = true;
    propMesh.frustumCulled = false;
    this.group.add(propMesh);
    this.cardMesh = new THREE.Mesh(cardM.geometry(), createWorldMaterial({ vertexColors: true }));
    this.cardMesh.name = 'sky-foliage';
    this.cardMesh.visible = false;
    this.cardMesh.castShadow = true;
    this.cardMesh.frustumCulled = false;
    this.group.add(this.cardMesh);
    this.disposables.push(this.rockMesh.geometry, rockMat0, propMesh.geometry, propMat, this.cardMesh.geometry);
    void loadSkyTextures().then((tex) => {
      if (!tex || this.dead) return;
      const rm = rockMaterial(tex);
      const fm = foliageMaterial(tex);
      this.rockMesh.material = rm;
      (this.cardMesh.material as THREE.Material).dispose();
      this.cardMesh.material = fm;
      this.cardMesh.visible = true;
      this.disposables.push(rm, fm);
    });
    const glowMat = new THREE.MeshBasicNodeMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const glowMesh = new THREE.Mesh(glow.geometry(), glowMat);
    glowMesh.name = 'sky-glow';
    glowMesh.frustumCulled = false;
    glowMesh.renderOrder = 4;
    this.group.add(glowMesh);
    this.disposables.push(glowMesh.geometry, glowMat);

    // Thác và sương chân thác.
    const falls = new Mesher();
    const mists: THREE.Mesh[] = [];
    const white = C(0xffffff);
    for (const isl of sky.islands) {
      if (!isl.fall) continue;
      const top = islandTop(isl);
      const toward = new THREE.Vector2(top.x - SECT.x, top.z - SECT.z).normalize();
      const rim = rimPoint(isl, toward.x, toward.y, 0.97);
      const endY = sky.fallEndY;
      const H = rim.y - endY;
      const segs = 12;
      const wid = 7 + isl.r * 0.08;
      const sideX = -toward.y;
      const sideZ = toward.x;
      const rows: [number, number][] = [];
      for (let k = 0; k <= segs; k++) {
        const t = k / segs;
        // Thác bật ra khỏi mép rồi rơi gần thẳng, loe rộng dần.
        const out = Math.min(1, t * 5) * 3.2 + t * 2;
        const w = wid * (0.7 + 0.55 * t);
        const cx = rim.x + toward.x * out;
        const zc = rim.z + toward.y * out; // toward.y của Vector2 là hướng theo z thế giới
        const y = rim.y - H * t;
        const a = falls.vert(cx - sideX * w, y, zc - sideZ * w, white);
        const b = falls.vert(cx + sideX * w, y, zc + sideZ * w, white);
        rows.push([a, b]);
      }
      for (let k = 0; k < segs; k++) {
        const r0 = rows[k];
        const r1 = rows[k + 1];
        if (r0 && r1) falls.quad(r0[0], r0[1], r1[1], r1[0]);
      }
      // Vết uv: u theo bề ngang, v từ chân (0) lên đỉnh (1): dựng lại uv sau.
      const mistMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mistMaterial());
      mistMesh.position.set(rim.x + toward.x * 6, endY + 6, rim.z + toward.y * 6);
      mistMesh.scale.set(60, 26, 1);
      mistMesh.renderOrder = 5;
      mistMesh.userData.billboard = true;
      mists.push(mistMesh);
    }
    if (falls.pos.length) {
      const g = falls.geometry();
      // uv: x = 0..1 ngang, y = 1 ở đỉnh → 0 ở chân (mỗi dải gồm segs+1 hàng, hai đỉnh/hàng).
      const uvArr: number[] = [];
      const rowsPerFall = 13;
      for (let v = 0; v < g.getAttribute('position').count; v++) {
        const row = Math.floor(v / 2) % rowsPerFall;
        uvArr.push(v % 2, 1 - row / (rowsPerFall - 1));
      }
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uvArr, 2));
      const fm = fallMaterial();
      const fallMesh = new THREE.Mesh(g, fm);
      fallMesh.name = 'sky-falls';
      fallMesh.frustumCulled = false;
      fallMesh.renderOrder = 6;
      this.group.add(fallMesh);
      this.disposables.push(g, fm);
    }
    for (const mm of mists) {
      mm.frustumCulled = false;
      this.group.add(mm);
      this.disposables.push(mm.geometry, mm.material as THREE.Material);
    }
    this.mists = mists;

    // Kiếm Đài: hàng nghìn thanh kiếm cắm quanh đài, một InstancedMesh.
    const dai = sky.islands.find((i) => i.kind === 'kiem_dai');
    if (dai && sky.swords > 0) {
      const geo = swordGeometry();
      const mat = createWorldMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.35 });
      const mesh = new THREE.InstancedMesh(geo, mat, sky.swords);
      mesh.name = 'kiem-dai-swords';
      mesh.frustumCulled = false;
      mesh.castShadow = true;
      const top = islandTop(dai);
      const r = rng(777);
      const dummy = new THREE.Object3D();
      const color = new THREE.Color();
      // Bảy vòng kiếm đồng tâm quanh đài (nhịp đều, lệch nhẹ), kiếm to ở vòng trong, nhỏ và dày dần ra ngoài; vòng ngoài cùng cắm nghiêng ra.
      const rings = 7;
      const weights = Array.from({ length: rings }, (_, k) => 1 + k * 0.9);
      const wsum = weights.reduce((x, y) => x + y, 0);
      let placed = 0;
      for (let k = 0; k < rings && placed < sky.swords; k++) {
        const rr = dai.r * (0.42 + (0.5 * k) / (rings - 1));
        const count = k === rings - 1 ? sky.swords - placed : Math.round((sky.swords * (weights[k] ?? 0)) / wsum);
        for (let j = 0; j < count && placed < sky.swords; j++, placed++) {
          const a = ((j + r() * 0.6) / count) * Math.PI * 2 + k * 0.37;
          const rj = rr + (r() - 0.5) * dai.r * 0.05;
          const s = (7.5 - k * 0.55 + r() * 3.2) * (k === 0 ? 1.15 : 1);
          dummy.position.set(top.x + Math.cos(a) * rj, top.y + 0.9, top.z + Math.sin(a) * rj);
          const lean = 0.1 + k * 0.03;
          // Nghiêng ra ngoài theo bán kính + dao động nhỏ.
          dummy.rotation.set(Math.sin(a) * lean + (r() - 0.5) * 0.5, a + (r() - 0.5) * 1.2, -Math.cos(a) * lean + (r() - 0.5) * 0.5);
          dummy.rotation.order = 'YXZ';
          dummy.scale.setScalar(s);
          dummy.updateMatrix();
          mesh.setMatrixAt(placed, dummy.matrix);
          const q = r();
          if (q < 0.05) color.set(0xe0b860);
          else if (q < 0.12) color.set(0x8fd0b4);
          else color.setHSL(0.56 + (r() - 0.5) * 0.04, 0.12 + r() * 0.08, 0.6 + r() * 0.24);
          mesh.setColorAt(placed, color);
        }
      }
      mesh.count = placed;
      mesh.instanceMatrix.needsUpdate = true;
      this.group.add(mesh);
      this.disposables.push(geo, mat, mesh);
    }
  }

  private mists: THREE.Mesh[] = [];

  /** Sương chân thác luôn quay mặt về camera (billboard quanh trục đứng). */
  update(camera: THREE.Camera): void {
    for (const m of this.mists) m.rotation.y = Math.atan2(camera.position.x - m.position.x, camera.position.z - m.position.z);
  }

  dispose(): void {
    this.dead = true;
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
  }
}
