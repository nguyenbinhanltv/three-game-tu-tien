import * as THREE from 'three/webgpu';
import { atan, bumpMap, clamp, float, mix, positionWorld, smoothstep, sin, texture, time, uv, vec2, vec3, vertexColor } from 'three/tsl';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import type { ThienKhuyetSky, TkIsland } from '@dtl/shared';
import { createWorldMaterial } from '../../render/materials/world';
import { FarRidges, type RidgeLayer } from '../../render/farRidges';
import { TkWall } from './thienKhuyetWall';
import { assets, type AssetHandle } from '../core/assets';
import { toFloatGeometry } from './skyIslands';
import { getCloudNoise } from '../../render/noiseTex';

/**
 * Cảnh Thiên Khuyết trên trời (MAP-4, phong cách B). Phần kiến trúc (bậc thang xoắn, Cổng Tiên Vỡ, tiên cung đổ nát, cột
 * dọc đại lộ, tượng thần đổ) là GLB Blender `arch_thien_khuyet` dựng từ kit "Thiên Công Khai Vật"
 * (`tools/blender/thien_khuyet_arch.py`, nạp ở `engine/levelLoad.ts` `loadTkModel`). File này dựng phần còn lại bằng code:
 * thân đảo đá (rêu, nhũ đá, cây), màn sáng Cổng Tiên Vỡ, trận pháp cổ trên quảng trường, mảnh đá trời lơ lửng.
 * Chỉ để nhìn (không va chạm). Tất định theo `thienKhuyetSky` của `levels/thien_khuyet.assets.json`.
 */

/** Gốc của GLB `arch_thien_khuyet` = tâm quảng trường Điện Tiền (khớp CX, CY, CZ trong script Blender). */
export const TK_ORIGIN = { x: 1044, y: 80, z: 374 } as const;

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

// ---------- màu: mỗi vật thể có màu riêng, tím chỉ ở trời/sương ----------

const C = (hex: number) => new THREE.Color(hex);
const ROCK_TOP = C(0x9a948c);
const ROCK_MID = C(0x7d7872);
const ROCK_LOW = C(0x56524f);
const ROCK_WARM = C(0x8f8070);
const MOSS_A = C(0x5f8a46);
const MOSS_B = C(0x7aa152);
const PAVE = C(0xcfc9c2);
const BARK = C(0x5a4636);
const LEAF_A = C(0x4f7f3c);
const LEAF_B = C(0x7aa64a);
const GOLD = C(0xd9a93a);
const GLOW_GOLD = C(0xffc860);

// ---------- hình học ----------

type Bucket = 'stone' | 'leaf' | 'glow';

class Parts {
  private list: Record<Bucket, THREE.BufferGeometry[]> = { stone: [], leaf: [], glow: [] };

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

const SEG = 56;
const RINGS = 20;

/** Bán kính thân đảo theo góc `a` và độ sâu `t` (0 = mép trên, 1 = mũi đá). */
function islandRadius(isl: TkIsland, seed: number, a: number, t: number): number {
  const R = isl.r;
  const n = tkFbm(Math.cos(a) * 2 + seed, Math.sin(a) * 2, t * 2.6, seed, 3);
  const shape = Math.pow(Math.max(0, 1 - Math.pow(t, 1.25)), 0.6);
  const ledge = 1 + 0.08 * Math.pow((t * 7 + 0.3 * tkFbm(a, t * 2, 1, seed + 2, 2)) % 1, 2);
  const crag = 1 + 0.16 * (tkFbm(Math.cos(a) * 5 + seed, Math.sin(a) * 5, t * 7, seed + 4, 3) - 0.5) * Math.min(1, t * 5);
  return R * shape * (0.8 + 0.4 * n) * ledge * crag;
}

/** Thân đảo: đá xám ấm phân tầng, rêu xanh bám mép trên, nắp trên lát đá có mảng cỏ rêu; pháp tuyến mượt. */
function islandGeometry(isl: TkIsland, seed: number): THREE.BufferGeometry {
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const tmp = new THREE.Color();
  const ringsV: number[][] = [];
  for (let k = 0; k <= RINGS; k++) {
    const t = k / RINGS;
    const row: number[] = [];
    for (let s = 0; s < SEG; s++) {
      const a = (s / SEG) * Math.PI * 2;
      const r = islandRadius(isl, seed, a, t);
      const y = isl.y - isl.depth * Math.pow(t, 0.9) * (0.92 + 0.16 * tkFbm(a * 2 + seed, t * 3, 4, seed + 9, 2));
      const x = isl.x + Math.cos(a) * r;
      const z = isl.z + Math.sin(a) * r;
      const strata = 0.78 + 0.42 * Math.sin(y * 0.5 + tkFbm(x * 0.04, y * 0.05, z * 0.04, seed + 8, 2) * 5);
      if (t < 0.45) tmp.copy(ROCK_TOP).lerp(ROCK_MID, t / 0.45);
      else tmp.copy(ROCK_MID).lerp(ROCK_LOW, Math.min(1, (t - 0.45) / 0.5));
      if (Math.sin(y * 0.5 + 1.3) > 0.35) tmp.lerp(ROCK_WARM, 0.35);
      tmp.multiplyScalar(strata * (0.9 + 0.2 * tkFbm(x * 0.2, y * 0.2, z * 0.2, seed + 5, 2)) * (1 - t * 0.25));
      // Rêu rủ từ mép trên xuống thân, thưa dần.
      const moss = tkFbm(x * 0.09, y * 0.12, z * 0.09, seed + 3, 3);
      if (moss > 0.5 && t < 0.35) tmp.lerp(MOSS_A, Math.min(0.85, (moss - 0.5) * 3.2) * (1 - t / 0.35));
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
  pos.push(isl.x, isl.y - isl.depth * 1.25, isl.z);
  col.push(ROCK_LOW.r, ROCK_LOW.g, ROCK_LOW.b);
  const tip = pos.length / 3 - 1;
  for (let s = 0; s < SEG; s++) idx.push(ringsV[RINGS]![s]!, ringsV[RINGS]![(s + 1) % SEG]!, tip);
  // Nắp trên: vành cỏ rêu ngoài, giữa lát đá (nơi kiến trúc đứng); hai vòng điểm để chuyển màu mượt.
  const rimRow: number[] = [];
  const midRow: number[] = [];
  for (let s = 0; s < SEG; s++) {
    const a = (s / SEG) * Math.PI * 2;
    const r = islandRadius(isl, seed, a, 0) * 0.99;
    for (const [k, row] of [
      [1.0, rimRow],
      [0.72, midRow],
    ] as const) {
      const x = isl.x + Math.cos(a) * r * k;
      const z = isl.z + Math.sin(a) * r * k;
      const m = tkFbm(x * 0.08, 3, z * 0.08, seed + 6, 3);
      tmp.copy(MOSS_A).lerp(MOSS_B, m);
      if (k < 0.9) tmp.lerp(PAVE, 0.55);
      pos.push(x, isl.y + (k < 0.9 ? 0.05 : 0.0), z);
      col.push(tmp.r, tmp.g, tmp.b);
      row.push(pos.length / 3 - 1);
    }
  }
  pos.push(isl.x, isl.y + 0.05, isl.z);
  col.push(PAVE.r, PAVE.g, PAVE.b);
  const ctr = pos.length / 3 - 1;
  for (let s = 0; s < SEG; s++) {
    const s2 = (s + 1) % SEG;
    idx.push(rimRow[s]!, midRow[s]!, midRow[s2]!, rimRow[s]!, midRow[s2]!, rimRow[s2]!);
    idx.push(midRow[s]!, ctr, midRow[s2]!);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Nhũ đá nhọn treo dưới đảo. */
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

/** Ống thon theo đường cong `pts` (bán kính `r0` → ~0): rễ cây đá và dây leo rủ từ mép đảo. */
function taperedTube(pts: THREE.Vector3[], r0: number, radial: number, segs: number): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(pts);
  const g = new THREE.TubeGeometry(curve, segs, r0, radial, false);
  const p = g.getAttribute('position');
  for (let i = 0; i <= segs; i++) {
    const c = curve.getPoint(i / segs);
    const k = Math.pow(1 - i / segs, 0.9) + 0.04;
    for (let j = 0; j <= radial; j++) {
      const idx = i * (radial + 1) + j;
      p.setXYZ(idx, c.x + (p.getX(idx) - c.x) * k, c.y + (p.getY(idx) - c.y) * k, c.z + (p.getZ(idx) - c.z) * k);
    }
  }
  g.computeVertexNormals();
  return g;
}

/** Rễ cây đá bám thân đảo (cong ra ngoài rồi rũ xuống) và dây leo xanh rủ từ mép, như đảo Lạc Kiếm. */
function roots(parts: Parts, isl: TkIsland, seed: number): void {
  const rand = tkRng(seed + 55);
  const nR = Math.round(isl.r * 0.45);
  for (let i = 0; i < nR; i++) {
    const a = rand() * Math.PI * 2;
    const t0 = 0.04 + rand() * 0.22;
    const r0 = islandRadius(isl, seed, a, t0) * 0.97;
    const sx = isl.x + Math.cos(a) * r0;
    const sz = isl.z + Math.sin(a) * r0;
    const sy = isl.y - isl.depth * Math.pow(t0, 0.9);
    const len = isl.depth * (0.25 + rand() * 0.5);
    const bend = (rand() - 0.5) * 9;
    const pts: THREE.Vector3[] = [];
    for (let k = 0; k <= 5; k++) {
      const q = k / 5;
      pts.push(
        new THREE.Vector3(
          sx + Math.cos(a) * (q * q * 5 + bend * q) - Math.sin(a) * bend * 0.4 * q,
          sy - len * q,
          sz + Math.sin(a) * (q * q * 5 + bend * q) + Math.cos(a) * bend * 0.4 * q,
        ),
      );
    }
    parts.add(
      'stone',
      taperedTube(pts, 0.35 + rand() * 0.6, 6, 12),
      new THREE.Matrix4(),
      BARK.clone().lerp(ROCK_MID, rand() * 0.4),
      0.1,
      seed + i,
    );
  }
  const nV = Math.round(isl.r * 0.9);
  for (let i = 0; i < nV; i++) {
    const a = rand() * Math.PI * 2;
    const r0 = islandRadius(isl, seed, a, 0.0) * 0.98;
    const sx = isl.x + Math.cos(a) * r0;
    const sz = isl.z + Math.sin(a) * r0;
    const len = 8 + rand() * 24;
    const sway = (rand() - 0.5) * 3;
    const pts = [0, 1, 2, 3, 4].map(
      (k) => new THREE.Vector3(sx + Math.cos(a) * k * 0.4 + sway * (k / 4), isl.y - (len * k) / 4, sz + Math.sin(a) * k * 0.4),
    );
    parts.add('leaf', taperedTube(pts, 0.14 + rand() * 0.1, 4, 8), new THREE.Matrix4(), rand() < 0.5 ? LEAF_A : LEAF_B, 0.15, seed + i + 7);
  }
}

/** Cây xanh trên đảo: thân nâu, tán ba khối tròn mượt (ico chia nhỏ), mọc ở vành cỏ ngoài. */
function trees(parts: Parts, isl: TkIsland, seed: number): void {
  const rand = tkRng(seed + 77);
  const n = Math.round(isl.r * 0.16);
  const crown = new THREE.IcosahedronGeometry(1, 2);
  crown.deleteAttribute('uv');
  const trunk = new THREE.CylinderGeometry(0.22, 0.4, 1, 7);
  for (let i = 0; i < n; i++) {
    const a = rand() * Math.PI * 2;
    const rr = isl.r * (0.62 + rand() * 0.3);
    const x = isl.x + Math.cos(a) * rr;
    const z = isl.z + Math.sin(a) * rr;
    const h = 5 + rand() * 6;
    parts.add('stone', trunk, mat4(x, isl.y + h * 0.5, z, 0, 0, 0, 1, h, 1), BARK, 0.1, seed);
    for (let k = 0; k < 3; k++) {
      const s = (2.6 + rand() * 1.6) * (1 - k * 0.18);
      parts.add(
        'leaf',
        crown,
        mat4(x + (rand() - 0.5) * 2.4, isl.y + h * (0.85 + k * 0.22), z + (rand() - 0.5) * 2.4, rand(), rand() * 6, 0, s, s * 0.8, s),
        rand() < 0.5 ? LEAF_A : LEAF_B,
        0.12,
        seed + k,
      );
    }
  }
}

// ---------- vật liệu ----------

function stoneMaterial(roughness = 0.82): THREE.MeshStandardNodeMaterial {
  const mat = createWorldMaterial({ vertexColors: true, roughness, metalness: 0.0 });
  const noise = getCloudNoise();
  // Chi tiết đá: nhiễu hai tỉ lệ theo toạ độ thế giới (ba mặt phẳng) nhân vào màu đỉnh.
  const p = positionWorld;
  const a = texture(noise, vec2(p.x.mul(0.07), p.z.mul(0.07))).g;
  const b = texture(noise, vec2(p.x.mul(0.31), p.y.mul(0.31))).b;
  const c = texture(noise, vec2(p.z.mul(0.31), p.y.mul(0.19))).g;
  mat.colorNode = vertexColor().mul(mix(0.74, 1.22, a.mul(0.5).add(b.mul(0.3)).add(c.mul(0.2))));
  // Nhám bề mặt đá: pháp tuyến lệch theo nhiễu chiếu chéo (vân nứt, gờ tầng), tạo khối đá thật thay vì mặt nhẵn như đất sét.
  const bumpUv = vec2(p.x.add(p.z).mul(0.23), p.y.mul(0.31));
  mat.normalNode = bumpMap(texture(noise, bumpUv.mul(2.3)), float(1.4));
  return mat;
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

/** Màn sáng Cổng Tiên Vỡ: xoáy vàng-tím rách mép, đặt giữa hai cột. */
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
  mat.colorNode = mix(vec3(0.62, 0.42, 1.0), vec3(1.0, 0.78, 0.36), clamp(body.mul(1.2).sub(0.2), 0, 1)).mul(1.1);
  mat.opacityNode = clamp(torn.mul(body.add(0.2)).mul(0.7), 0, 0.8);
  return mat;
}

/** Trận pháp cổ: vòng đồng tâm, hàng chữ chạy ngược chiều, sáu cánh sao xoay. */
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
  const k = clamp(rings.add(runes).add(star).add(star2), 0, 1.4);
  mat.colorNode = mix(vec3(1.0, 0.72, 0.28), vec3(0.85, 0.62, 1.0), smoothstep(0.5, 0.9, d))
    .mul(k)
    .mul(pulse)
    .mul(1.25);
  mat.opacityNode = clamp(k.mul(pulse), 0, 0.9).mul(float(1).sub(smoothstep(0.985, 1.0, d)));
  return mat;
}

// ---------- cảnh ----------

/** Phông núi xa nhiều lớp sau vách bao quanh (POLISH-1): tím xám nhạt dần, chân chìm trong sương; tâm trùng tâm vùng chơi (`thien_khuyet.terrain.json` play). */
const TK_RIDGES: RidgeLayer[] = [
  { radius: 1250, amp: 1150, base: 150, color: 0x2f2640, haze: 0.1, seed: 7, freq: 20, sharp: 1.7 },
  { radius: 1900, amp: 1500, base: 130, color: 0x4a3d62, haze: 0.3, seed: 17, freq: 27, sharp: 1.6 },
  { radius: 2700, amp: 1900, base: 110, color: 0x6c5f88, haze: 0.5, seed: 31, freq: 36, sharp: 1.5 },
];

export class ThienKhuyetSkyScene {
  readonly group = new THREE.Group();
  private disposables: { dispose(): void }[] = [];
  private shards: THREE.InstancedMesh | null = null;

  constructor(sky: ThienKhuyetSky, groundAt: (x: number, z: number) => number) {
    this.group.name = 'thienKhuyetSky';
    const wall = new TkWall(groundAt);
    this.group.add(wall.group);
    this.disposables.push(wall);
    const ridges = new FarRidges(1044, 884, TK_RIDGES);
    this.group.add(ridges.group);
    this.disposables.push(ridges);
    const parts = new Parts();
    const bodyGeos: THREE.BufferGeometry[] = [];
    sky.islands.forEach((isl, i) => {
      const seed = 2113 + i * 131;
      bodyGeos.push(islandGeometry(isl, seed));
      stalactites(parts, isl, seed);
      roots(parts, isl, seed);
      trees(parts, isl, seed);
    });
    const rock = bodyGeos.map((g) => (g.index ? g.toNonIndexed() : g));
    const rockMerged = mergeGeometries(rock, false);
    for (const g of bodyGeos) g.dispose();
    const glow = new Parts();
    const gate = sky.islands.find((i) => i.kind === 'cong');
    if (gate) glow.add('glow', new THREE.OctahedronGeometry(3.2, 0), mat4(gate.x, gate.y + 31, gate.z, 0.3, 0.5, 0), GLOW_GOLD);

    const stoneMat = stoneMaterial();
    const leafMat = stoneMaterial(0.9);
    const glowMat = glowMaterial();
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
    addMesh(parts.merged('stone'), stoneMat, 'tk-rock-details', true);
    addMesh(parts.merged('leaf'), leafMat, 'tk-trees', true);
    addMesh(glow.merged('glow'), glowMat, 'tk-glow', false, 4);
    this.disposables.push(stoneMat, leafMat, glowMat);

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
    // POLISH-1: số mảnh giảm còn ~40% và thay bằng bộ khối đá đảo vệ tinh Vân Hải (arch_vh_island) khi GLB về; mảnh dẹt thủ tục chỉ là dự phòng
    const shardN = Math.round(sky.shards * 0.4);
    if (shardN > 0) {
      const sg = shardGeometry(17);
      const sm = createWorldMaterial({ vertexColors: false, roughness: 0.78, metalness: 0.02, color: 0xffffff });
      const mesh = new THREE.InstancedMesh(sg, sm, shardN);
      mesh.name = 'tk-shards';
      mesh.frustumCulled = false;
      const r = tkRng(991);
      const d = new THREE.Object3D();
      const c = new THREE.Color();
      for (let i = 0; i < shardN; i++) {
        const a = r() * Math.PI * 2;
        const rr = 160 + r() * 520;
        d.position.set(1044 + Math.cos(a) * rr * 1.1, 150 + r() * 230, 520 + Math.sin(a) * rr * 0.8);
        d.rotation.set(r() * 6, r() * 6, r() * 6);
        d.scale.setScalar(2.5 + Math.pow(r(), 2.4) * 16);
        d.updateMatrix();
        mesh.setMatrixAt(i, d.matrix);
        if (r() < 0.07) c.copy(GOLD).multiplyScalar(0.7);
        else
          c.copy(ROCK_TOP)
            .lerp(ROCK_LOW, r() * 0.8)
            .multiplyScalar(0.8 + r() * 0.35);
        mesh.setColorAt(i, c);
      }
      mesh.instanceMatrix.needsUpdate = true;
      this.group.add(mesh);
      this.shards = mesh;
      this.disposables.push(sg, sm, mesh);
      void this.useIslandRocks(mesh);
    }
  }

  private rockHandle: AssetHandle | null = null;
  private gone = false;

  /** Thay hình mảnh đá bằng khối đá đảo vệ tinh (nón ngược có vân tầng); mặt cỏ xanh trên đỉnh đổi sang rêu xám để hợp tông Thiên Khuyết. */
  private async useIslandRocks(mesh: THREE.InstancedMesh): Promise<void> {
    try {
      const h = await assets.acquire('arch_vh_island', { priority: 300 });
      if (this.gone) {
        h.release();
        return;
      }
      this.rockHandle = h;
      let geo: THREE.BufferGeometry | null = null;
      h.scene.updateMatrixWorld(true);
      h.scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh && o.name === 'vhsat_c') geo = toFloatGeometry(m.geometry).applyMatrix4(m.matrixWorld);
      });
      if (!geo) return;
      const g: THREE.BufferGeometry = geo;
      const col = g.attributes.color as THREE.BufferAttribute;
      const pos = g.attributes.position!;
      const c = new THREE.Color();
      for (let i = 0; i < pos.count; i++) {
        c.setRGB(col.getX(i), col.getY(i), col.getZ(i));
        if (c.g > c.r * 1.12 && c.g > c.b * 1.2) c.setRGB(c.r * 0.9, c.g * 0.82, c.b * 0.6); // cỏ xanh → rêu xám ấm
        col.setXYZ(i, c.r, c.g, c.b);
      }
      const ng = this.track(g);
      const mat = this.track(stoneMaterial(0.86));
      const old = mesh.geometry;
      mesh.geometry = ng;
      mesh.material = mat;
      // hình mới cao ~50 m (R 22): co theo cỡ mảnh cũ (2,5–18 → 0,15–0,9)
      const m4 = new THREE.Matrix4();
      const p = new THREE.Vector3();
      const q = new THREE.Quaternion();
      const sc = new THREE.Vector3();
      for (let i = 0; i < mesh.count; i++) {
        mesh.getMatrixAt(i, m4);
        m4.decompose(p, q, sc);
        const k = sc.x * 0.05;
        m4.compose(p, new THREE.Quaternion().setFromEuler(new THREE.Euler(0, (i * 2.399) % 6.28, 0)), sc.set(k, k * 0.9, k));
        mesh.setMatrixAt(i, m4);
      }
      mesh.instanceMatrix.needsUpdate = true;
      old.dispose();
    } catch {
      /* giữ mảnh dẹt thủ tục */
    }
  }

  private track<T extends { dispose(): void }>(o: T): T {
    this.disposables.push(o);
    return o;
  }

  /** Mảnh đá trời nhấp nhô rất chậm (tịnh tiến cả khối). */
  update(t: number): void {
    if (this.shards) this.shards.position.y = Math.sin(t * 0.35) * 1.6;
  }

  dispose(): void {
    this.gone = true;
    this.rockHandle?.release();
    this.rockHandle = null;
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
  }
}
