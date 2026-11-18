import * as THREE from 'three/webgpu';
import { clamp, exp, float, mix, smoothstep, sin, texture, time, uv, vec2, vec3 } from 'three/tsl';
import { SECT, type LacKiemSky, type SkyIsland } from '@dtl/shared';
import { createWorldMaterial } from '../../render/materials/world';
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
const GRASS_A = C(0x5fae78);
const GRASS_B = C(0x86c985);
const EARTH = C(0x8a7458);
const ROCK_TOP = C(0x9a8b76);
const ROCK_MID = C(0x7b8189);
const ROCK_LOW = C(0x56667a);
const MOSS = C(0x5c8f4e);
const ROOT = C(0x4a3626);
const JADE = C(0xe3ece6);
const JADE_SHADE = C(0xb9cbc2);
const JADE_GREEN = C(0x6fb59a);
const TRUNK = C(0x5a4333);
const LEAF_A = C(0x3f9a6a);
const LEAF_B = C(0x7fc07a);
const BLOSSOM = C(0xe08a9a);

// ---------- thân đảo ----------

const SEG = 44;
const RINGS = 16;

/** Toạ độ thế giới của tâm mặt trên đảo. */
export function islandTop(isl: SkyIsland): THREE.Vector3 {
  return new THREE.Vector3(SECT.x + isl.x, SECT.y + isl.y, SECT.z + isl.z);
}

/** Điểm mép đảo theo hướng (dx, dz) đã chuẩn hóa, cách tâm `r * k` mét. */
function rimPoint(isl: SkyIsland, dx: number, dz: number, k = 1): THREE.Vector3 {
  const t = islandTop(isl);
  return new THREE.Vector3(t.x + dx * isl.r * k, t.y, t.z + dz * isl.r * k);
}

function buildIsland(m: Mesher, isl: SkyIsland, seed: number): void {
  const top = islandTop(isl);
  const R = isl.r;
  const rand = rng(seed);
  const tmp = new THREE.Color();
  const radius = (a: number, t: number) => {
    const n = fbm3(Math.cos(a) * 1.6 + seed, Math.sin(a) * 1.6, t * 2.4, seed, 3);
    // Mép trên hơi vát, thân phình rồi thu nhọn về mũi đá.
    const shape = Math.pow(Math.max(0, 1 - Math.pow(t, 1.35)), 0.62) * (1 + 0.1 * Math.sin(t * 3.1));
    return R * shape * (0.82 + 0.4 * n);
  };
  // Mặt trên: quạt từ tâm (hơi gồ) ra mép; màu cỏ loang.
  const centerY = top.y + 0.9;
  const ring: number[][] = [];
  for (let k = 0; k <= RINGS; k++) {
    const t = k / RINGS;
    const row: number[] = [];
    for (let s = 0; s < SEG; s++) {
      const a = (s / SEG) * Math.PI * 2;
      const r = k === 0 ? radius(a, 0) : radius(a, t);
      const y = top.y - isl.depth * Math.pow(t, 0.95) * (0.92 + 0.16 * fbm3(a * 2 + seed, t * 3, 4.2, seed + 9, 2)) - (k === 0 ? 0 : 0);
      const cx = top.x + Math.cos(a) * r;
      const cz = top.z + Math.sin(a) * r;
      // Màu: mép trên đất nâu, rồi đá nâu xám → xanh xám; mảng rêu theo nhiễu.
      const moss = fbm3(cx * 0.07, y * 0.09, cz * 0.07, seed + 3, 3);
      if (t < 0.07) tmp.copy(EARTH).lerp(GRASS_A, 0.35);
      else if (t < 0.4) tmp.copy(ROCK_TOP).lerp(ROCK_MID, (t - 0.07) / 0.33);
      else tmp.copy(ROCK_MID).lerp(ROCK_LOW, Math.min(1, (t - 0.4) / 0.5));
      if (moss > 0.62 && t < 0.5) tmp.lerp(MOSS, Math.min(0.6, (moss - 0.62) * 3) * (1 - t * 1.4));
      // Vân đá xếp tầng: dải sáng tối ngang theo độ cao, lệch theo nhiễu (vách đá trầm tích).
      const strata = 0.9 + 0.14 * Math.sin(y * 0.62 + fbm3(cx * 0.05, y * 0.05, cz * 0.05, seed + 8, 2) * 5);
      const lum = strata * (0.88 + 0.24 * fbm3(cx * 0.2, y * 0.2, cz * 0.2, seed + 5, 2));
      tmp.multiplyScalar(lum);
      row.push(m.vert(cx, y, cz, tmp));
    }
    ring.push(row);
  }
  for (let k = 0; k < RINGS; k++)
    for (let s = 0; s < SEG; s++) {
      const s2 = (s + 1) % SEG;
      m.quad(ring[k][s], ring[k + 1][s], ring[k + 1][s2], ring[k][s2]);
    }
  // Mũi đá đáy.
  const tipLen = isl.depth * 0.28;
  const tip = m.vert(top.x, top.y - isl.depth - tipLen, top.z, ROCK_LOW);
  for (let s = 0; s < SEG; s++) m.tri(ring[RINGS][s], tip, ring[RINGS][(s + 1) % SEG]);
  // Mặt cỏ: vành ngoài (lệch cao thấp) + tâm.
  const grassRing: number[] = [];
  const bumpy = (x: number, z: number) => 0.55 * fbm3(x * 0.09, 0.3, z * 0.09, seed + 11, 3);
  for (let s = 0; s < SEG; s++) {
    const a = (s / SEG) * Math.PI * 2;
    const r = radius(a, 0);
    const x = top.x + Math.cos(a) * r;
    const z = top.z + Math.sin(a) * r;
    tmp.copy(GRASS_A).lerp(GRASS_B, fbm3(x * 0.05, 1.5, z * 0.05, seed + 2, 2));
    grassRing.push(m.vert(x, top.y + 0.08, z, tmp));
  }
  const inner: number[] = [];
  const innerK = 0.62;
  for (let s = 0; s < SEG; s++) {
    const a = (s / SEG) * Math.PI * 2;
    const r = radius(a, 0) * innerK;
    const x = top.x + Math.cos(a) * r;
    const z = top.z + Math.sin(a) * r;
    tmp.copy(GRASS_A).lerp(GRASS_B, fbm3(x * 0.05, 2.5, z * 0.05, seed + 4, 2));
    inner.push(m.vert(x, top.y + bumpy(x, z) + 0.2, z, tmp));
  }
  const ctr = m.vert(top.x, centerY - 0.2, top.z, GRASS_B);
  for (let s = 0; s < SEG; s++) {
    const s2 = (s + 1) % SEG;
    m.quad(grassRing[s], inner[s], inner[s2], grassRing[s2]);
    m.tri(inner[s], ctr, inner[s2]);
  }
  // Rễ cây và nhũ đá buông xuống từ thân (cong ra ngoài rồi rũ xuống).
  const nRoots = Math.round(R * 0.5);
  for (let i = 0; i < nRoots; i++) {
    const a = rand() * Math.PI * 2;
    const t0 = 0.12 + rand() * 0.38;
    const r0 = radius(a, t0);
    const len = isl.depth * (0.25 + rand() * 0.55);
    const w0 = 0.5 + rand() * 0.9;
    const sx = top.x + Math.cos(a) * r0;
    const sz = top.z + Math.sin(a) * r0;
    const sy = top.y - isl.depth * Math.pow(t0, 0.95);
    const bend = (rand() - 0.5) * 8;
    const steps = 6;
    let prev: number[] = [];
    for (let k = 0; k <= steps; k++) {
      const q = k / steps;
      const w = w0 * (1 - q) * (1 - q * 0.4) + 0.02;
      const cx = sx + Math.cos(a) * (q * q * 5 + bend * q) + Math.sin(a) * bend * 0.4 * q;
      const cy = sy - len * q;
      const cz = sz + Math.sin(a) * (q * q * 5 + bend * q) - Math.cos(a) * bend * 0.4 * q;
      tmp.copy(ROOT).lerp(ROCK_MID, q * 0.4);
      const row: number[] = [];
      for (let j = 0; j < 5; j++) {
        const b = (j / 5) * Math.PI * 2;
        row.push(m.vert(cx + Math.cos(b) * w, cy, cz + Math.sin(b) * w, tmp));
      }
      if (prev.length) for (let j = 0; j < 5; j++) m.quad(prev[j], row[j], row[(j + 1) % 5], prev[(j + 1) % 5]);
      prev = row;
    }
  }
  // Rừng nhỏ trên mặt đảo: thân + hai tầng tán, chừa vùng giữa cho công trình/đài.
  const nTrees = Math.round(R * 0.55);
  for (let i = 0; i < nTrees; i++) {
    const a = rand() * Math.PI * 2;
    const rr = R * (0.7 + rand() * 0.2) * (radius(a, 0) / R);
    const x = top.x + Math.cos(a) * rr;
    const z = top.z + Math.sin(a) * rr;
    const y = top.y + bumpy(x, z) + 0.15;
    const h = 2.5 + rand() * 3.2;
    const blossom = rand() < 0.28;
    const trunk = new THREE.Vector3(x, y + h * 0.5, z);
    m.box(
      trunk,
      new THREE.Vector3(0.25, h * 0.5, 0.25),
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(0, 0, 1),
      TRUNK,
    );
    for (let k = 0; k < 3; k++) {
      const lc = blossom ? BLOSSOM.clone().lerp(LEAF_B, k * 0.2) : LEAF_A.clone().lerp(LEAF_B, 0.2 + k * 0.3 + rand() * 0.2);
      const s = (3.2 - k * 0.8) * (0.8 + rand() * 0.5);
      const cy = y + h * (0.62 + k * 0.2);
      const rot = rand() * Math.PI;
      const u = new THREE.Vector3(Math.cos(rot), 0, Math.sin(rot));
      const w = new THREE.Vector3(-Math.sin(rot), 0, Math.cos(rot));
      m.box(new THREE.Vector3(x, cy, z), new THREE.Vector3(s, s * 0.45, s * 0.9), u, new THREE.Vector3(0, 1, 0), w, lc);
    }
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
  mat.opacityNode = clamp(streak.mul(edge).mul(fadeTop).mul(fadeBot).mul(0.95).add(edge.mul(0.12).mul(fadeBot)), 0, 0.92);
  mat.colorNode = mix(vec3(0.62, 0.86, 0.9), vec3(1, 1, 1), streak.mul(0.8));
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
  const parts: THREE.BufferGeometry[] = [];
  // Lưỡi: kim tự tháp dẹt, mũi hướng xuống (cắm đất), bề mặt cao 1.
  const blade = new THREE.CylinderGeometry(0.2, 0.0, 1, 4, 1).toNonIndexed();
  blade.rotateY(Math.PI / 4);
  blade.scale(1, 1, 0.3);
  blade.translate(0, 0.5, 0);
  parts.push(blade);
  const guard = new THREE.BoxGeometry(0.62, 0.07, 0.17).toNonIndexed();
  guard.translate(0, 1.0, 0);
  parts.push(guard);
  const grip = new THREE.BoxGeometry(0.075, 0.34, 0.075).toNonIndexed();
  grip.translate(0, 1.2, 0);
  parts.push(grip);
  const pommel = new THREE.BoxGeometry(0.14, 0.1, 0.14).toNonIndexed();
  pommel.translate(0, 1.42, 0);
  parts.push(pommel);
  const pos: number[] = [];
  const nor: number[] = [];
  const col: number[] = [];
  const tint = [
    new THREE.Color(1, 1, 1),
    new THREE.Color(0.8, 0.62, 0.3),
    new THREE.Color(0.35, 0.22, 0.14),
    new THREE.Color(0.8, 0.62, 0.3),
  ];
  parts.forEach((g, i) => {
    g.computeVertexNormals();
    const p = g.getAttribute('position');
    const n = g.getAttribute('normal');
    for (let k = 0; k < p.count; k++) {
      pos.push(p.getX(k), p.getY(k), p.getZ(k));
      nor.push(n.getX(k), n.getY(k), n.getZ(k));
      col.push(tint[i].r, tint[i].g, tint[i].b);
    }
    g.dispose();
  });
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return out;
}

// ---------- lớp dựng chính ----------

export class LacKiemSkyScene {
  readonly group = new THREE.Group();
  private disposables: { dispose(): void }[] = [];

  constructor(sky: LacKiemSky) {
    this.group.name = 'lacKiemSky';
    const ridges = new FarRidges(SECT.x, SECT.z);
    this.group.add(ridges.group);
    this.disposables.push(ridges);
    // Thân đảo + cầu (một vật liệu, màu đỉnh) và phần phát sáng (đèn ngọc, dải mây dưới cầu).
    const body = new Mesher();
    const glow = new Mesher();
    sky.islands.forEach((isl, i) => buildIsland(body, isl, 1013 + i * 97));
    for (const br of sky.bridges) {
      const [p0, p1] = bridgeEnds(sky, br.from, br.to);
      buildBridge(body, glow, p0, p1);
    }
    const bodyMat = createWorldMaterial({ vertexColors: true, roughness: 0.92, side: THREE.DoubleSide });
    const bodyMesh = new THREE.Mesh(body.geometry(), bodyMat);
    bodyMesh.name = 'sky-islands';
    bodyMesh.castShadow = true;
    bodyMesh.receiveShadow = true;
    bodyMesh.frustumCulled = false;
    this.group.add(bodyMesh);
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
    this.disposables.push(bodyMesh.geometry, bodyMat, glowMesh.geometry, glowMat);

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
      for (let k = 0; k < segs; k++) falls.quad(rows[k][0], rows[k][1], rows[k + 1][1], rows[k + 1][0]);
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
        const count = k === rings - 1 ? sky.swords - placed : Math.round((sky.swords * weights[k]) / wsum);
        for (let j = 0; j < count && placed < sky.swords; j++, placed++) {
          const a = ((j + r() * 0.6) / count) * Math.PI * 2 + k * 0.37;
          const rj = rr + (r() - 0.5) * dai.r * 0.05;
          const s = (7.5 - k * 0.55 + r() * 3.2) * (k === 0 ? 1.15 : 1);
          dummy.position.set(top.x + Math.cos(a) * rj, top.y + 0.9, top.z + Math.sin(a) * rj);
          const lean = 0.06 + k * 0.025;
          // Nghiêng ra ngoài theo bán kính + dao động nhỏ.
          dummy.rotation.set(Math.sin(a) * lean + (r() - 0.5) * 0.12, a + (r() - 0.5) * 0.3, -Math.cos(a) * lean + (r() - 0.5) * 0.12);
          dummy.rotation.order = 'YXZ';
          dummy.scale.set(s * (0.85 + r() * 0.3), s, s * (0.85 + r() * 0.3));
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
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
  }
}
