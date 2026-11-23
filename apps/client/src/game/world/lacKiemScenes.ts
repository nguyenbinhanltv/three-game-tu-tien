import * as THREE from 'three/webgpu';
import {
  abs,
  attribute,
  cameraFar,
  cameraNear,
  clamp,
  float,
  length,
  mix,
  normalWorld,
  positionView,
  positionWorld,
  sin,
  smoothstep,
  time,
  uv,
  vec2,
  vec3,
  viewportLinearDepth,
  viewZToOrthographicDepth,
} from 'three/tsl';
import { BRIDGE_A, BRIDGE_B, hash01, SCENE_GLB, SECT, TC_BRIDGE, TC_GATE, TC_POND, type SceneGlb, type SceneGlbId } from '@dtl/shared';
import { heightAt } from '../../base/levelCtx';
import { assets } from '../core/assets';
import { vnoise } from '../../render/materials/isoDetail';
import { createWorldMaterial } from '../../render/materials/world';
import { GlbScatter, type GlbPlace } from './glbScatter';
import { withSightFade } from './occlusion';
import { loadSkyTextures, rockMaterial } from './skyAssets';

/**
 * Tiểu cảnh Lạc Kiếm Tông (Chân Cảnh M1+M2, pilot): mỗi khung ~20 × 12 m của camera chéo có một điểm nhấn, một lớp tiền cảnh tự mờ khi che
 * người (`withSightFade`) và một lớp "đáy" (nước, suối, sương dưới hác). Chỉ để nhìn: KHÔNG va chạm, tất định, không đụng server/heightmap.
 * Đá, đèn, bia, tre là prop PBR có sẵn của kit (GLB, `GlbScatter`); phần thủ tục chỉ còn công trình (cổng, cầu, đường), ao, hác.
 * Bản đồ tiểu cảnh và lý do chọn chỗ: `docs/map/lac-kiem-tieu-canh.md`. Tọa độ trong `SCENES` tương đối tâm tông môn (SECT).
 */

export type GlbId = SceneGlbId;

export type ScenePiece =
  | ({ k: 'glb' } & SceneGlb)
  | { k: 'cong_bai'; x: number; z: number; yaw: number; w: number }
  | { k: 'ao'; x: number; z: number; r: number }
  | { k: 'cau_treo'; ax: number; az: number; bx: number; bz: number; lift: number }
  | { k: 'loi_vach'; pts: [number, number][] }
  /** Hác sâu: áo đá phủ sườn dốc + suối dưới đáy + sương. (x, z) tâm; `dir` hướng dọc hác (rad). */
  | { k: 'hac'; x: number; z: number; dir: number; len: number; wid: number }
  /** Sương thấp sát đất (đáy cho cảnh phẳng). */
  | { k: 'suong'; x: number; z: number; r: number; dy: number };

export interface TieuCanh {
  id: string;
  /** Điểm quan sát đề xuất (người đứng) để chụp/kiểm; tương đối tâm tông môn. */
  at: [number, number];
  pieces: ScenePiece[];
}

export { BRIDGE_A, BRIDGE_B };
const BR = TC_BRIDGE;
/** Vật GLB của một cảnh, đọc từ shared (cùng nguồn với va chạm server). */
const glbs = (id: string): ScenePiece[] => (SCENE_GLB[id] ?? []).map((g) => ({ k: 'glb' as const, ...g }));

export const SCENES: TieuCanh[] = [
  {
    id: 'cong_bai',
    at: [0, 114],
    pieces: [{ k: 'cong_bai', ...TC_GATE }, ...glbs('cong_bai'), { k: 'suong', x: 0, z: 124, r: 16, dy: 0.7 }],
  },
  {
    id: 'ao_sen',
    at: [-60, 58],
    pieces: [{ k: 'ao', ...TC_POND }, ...glbs('ao_sen'), { k: 'suong', x: TC_POND.x, z: TC_POND.z, r: 13, dy: 0.5 }],
  },
  { id: 'kiem_bia', at: [66, 58], pieces: [...glbs('kiem_bia'), { k: 'suong', x: 66, z: 64, r: 12, dy: 0.5 }] },
  {
    id: 'loi_vach',
    at: [-116, 62],
    pieces: [
      {
        k: 'loi_vach',
        pts: [[-92, 54], [-104, 56], [-116, 60], [-128, 64], BRIDGE_A],
      },
      ...glbs('loi_vach'),
    ],
  },
  {
    id: 'cau_treo',
    at: [-136, 80],
    pieces: [
      { k: 'hac', x: BR.cx, z: BR.cz, dir: BR.dir - Math.PI / 2, len: 34, wid: 22 },
      { k: 'cau_treo', ax: BRIDGE_A[0], az: BRIDGE_A[1], bx: BRIDGE_B[0], bz: BRIDGE_B[1], lift: 0.35 },
      ...glbs('cau_treo'),
    ],
  },
  { id: 'thach_lam', at: [96, -8], pieces: [...glbs('thach_lam'), { k: 'suong', x: 96, z: -8, r: 13, dy: 0.5 }] },
];

// ---------- hình thủ tục ----------

const BOX = new THREE.BoxGeometry(1, 1, 1);
const CYL = new THREE.CylinderGeometry(0.5, 0.5, 1, 8);
const PETAL = new THREE.SphereGeometry(0.5, 6, 4);
const PAD = (() => {
  // Lá sen: đĩa tròn khuyết một rãnh, mép cong lên.
  const g = new THREE.CircleGeometry(1, 28, 0.35, Math.PI * 2 - 0.35);
  g.rotateX(-Math.PI / 2);
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const r = Math.hypot(p.getX(i), p.getZ(i));
    p.setY(i, 0.04 + r * r * 0.12);
  }
  return g;
})();

/** Bảng màu bán tả thực, hơi lạnh (sương sớm). */
const C = {
  lacquer: new THREE.Color('#7a2a22'),
  wood: new THREE.Color('#6c4c33'),
  woodDark: new THREE.Color('#4a3524'),
  woodLight: new THREE.Color('#8a6a48'),
  rope: new THREE.Color('#a8905f'),
  tile: new THREE.Color('#3c5558'),
  pad: new THREE.Color('#3f6a3c'),
  padVein: new THREE.Color('#78a060'),
  petal: new THREE.Color('#f1d3dc'),
  petalTip: new THREE.Color('#d97f9a'),
  heart: new THREE.Color('#e8c860'),
  slab: new THREE.Color('#8a948f'),
  slabDark: new THREE.Color('#5f6a66'),
  earth: new THREE.Color('#7a6e45'),
  moss: new THREE.Color('#74904c'),
  lamp: new THREE.Color('#ffc874'),
};

/** Gộp nhiều hình có màu đỉnh vào một BufferGeometry không chỉ mục (pháp tuyến phẳng). */
export class Mesher {
  private pos: number[] = [];
  private col: number[] = [];
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly e = new THREE.Euler();
  private readonly v = new THREE.Vector3();
  private readonly s = new THREE.Vector3();
  private readonly tmp = new THREE.Color();
  tris = 0;

  private push(g: THREE.BufferGeometry, color: THREE.Color, seed: number, tip?: THREE.Color): void {
    const ng = g.index ? g.toNonIndexed() : g;
    const p = ng.attributes.position as THREE.BufferAttribute;
    const k = 0.9 + hash01(seed, 7, 3) * 0.2;
    const v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      this.tmp.copy(color);
      // màu đổi theo vị trí cục bộ của đỉnh (cánh sen: gốc → ngọn; lá sen: tâm → mép)
      if (tip) this.tmp.lerp(tip, Math.min(1, Math.max(0, g === PAD ? Math.hypot(v.x, v.z) : (v.y + 0.5) * 1.2)));
      this.tmp.multiplyScalar(k);
      v.applyMatrix4(this.m);
      this.pos.push(v.x, v.y, v.z);
      this.col.push(this.tmp.r, this.tmp.g, this.tmp.b);
    }
    this.tris += p.count / 3;
    if (ng !== g) ng.dispose();
  }

  put(
    g: THREE.BufferGeometry,
    x: number,
    y: number,
    z: number,
    sx: number,
    sy: number,
    sz: number,
    color: THREE.Color,
    yaw = 0,
    rx = 0,
    rz = 0,
    tip?: THREE.Color,
  ): void {
    this.e.set(rx, yaw, rz, 'YXZ');
    this.q.setFromEuler(this.e);
    this.m.compose(this.v.set(x, y, z), this.q, this.s.set(sx, sy, sz));
    this.push(g, color, Math.floor(x * 7 + z * 13), tip);
  }
  box(x: number, y: number, z: number, sx: number, sy: number, sz: number, color: THREE.Color, yaw = 0, rx = 0, rz = 0): void {
    this.put(BOX, x, y, z, sx, sy, sz, color, yaw, rx, rz);
  }
  cyl(x: number, y: number, z: number, d: number, h: number, color: THREE.Color): void {
    this.put(CYL, x, y, z, d, h, d, color);
  }
  /** Đoạn thẳng dày `t` từ a đến b (dây, xà). */
  seg(a: THREE.Vector3, b: THREE.Vector3, t: number, color: THREE.Color): void {
    const d = new THREE.Vector3().subVectors(b, a);
    const len = d.length();
    this.q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), d.normalize());
    this.m.compose(this.v.copy(a).add(b).multiplyScalar(0.5), this.q, this.s.set(t, t, len));
    this.push(BOX, color, Math.floor(a.x * 3 + a.z * 5));
  }
  geometry(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  }
  get empty(): boolean {
    return this.pos.length === 0;
  }
}

const gy = (x: number, z: number): number => heightAt(SECT.x + x, SECT.z + z);

interface Disc {
  x: number;
  y: number;
  z: number;
  r: number;
}
interface Out {
  stone: Mesher;
  wood: Mesher;
  glow: Mesher;
  plants: Mesher;
  places: Map<GlbId, GlbPlace[]>;
  ponds: Disc[];
  mist: Disc[];
  /** Lưới phụ dựng riêng: áo đá hác, bờ ao, dải suối. */
  extra: { geo: THREE.BufferGeometry; kind: 'skin' | 'bank' | 'stream' }[];
}

function congBai(o: Out, p: Extract<ScenePiece, { k: 'cong_bai' }>): void {
  const { wood, stone } = o;
  const s = Math.sin(p.yaw);
  const c = Math.cos(p.yaw);
  const y0 = gy(p.x, p.z);
  const at = (lx: number, ly: number) => [p.x + c * lx, y0 + ly, p.z - s * lx] as const;
  const half = p.w / 2;
  for (const sx of [-1, 1]) {
    const [x, y, z] = at(sx * half, 0);
    stone.box(x, y + 0.4, z, 1.7, 0.8, 1.7, C.slabDark, p.yaw);
    wood.cyl(x, y + 3.9, z, 0.78, 6.2, C.lacquer);
    stone.box(x, y + 7.1, z, 1.2, 0.35, 1.2, C.slab, p.yaw);
  }
  const [bx, by, bz] = at(0, 0);
  wood.box(bx, by + 6.1, bz, p.w + 1.4, 0.5, 0.7, C.lacquer, p.yaw);
  wood.box(bx, by + 5.3, bz, p.w - 0.6, 0.35, 0.35, C.woodDark, p.yaw);
  wood.box(bx, by + 7.35, bz, p.w + 3.2, 0.4, 1.5, C.woodDark, p.yaw);
  wood.box(bx, by + 7.9, bz, p.w + 2.4, 0.5, 2.0, C.tile, p.yaw);
  wood.box(bx, by + 8.5, bz, p.w * 0.55, 0.45, 1.4, C.tile, p.yaw);
  for (const sx of [-1, 1]) {
    const [x, y, z] = at(sx * (p.w / 2 + 1.5), 0);
    wood.box(x, y + 8.15, z, 0.6, 0.35, 2.0, C.tile, p.yaw, 0, sx * 0.5);
  }
}

/** Ao sen: bờ đất nhô quanh (nước nằm trong lòng chảo giả), mặt nước nhiều sắc, lá sen và hoa sen đúng hình. */
function ao(o: Out, p: Extract<ScenePiece, { k: 'ao' }>, i: number): void {
  const y = gy(p.x, p.z);
  o.ponds.push({ x: p.x, y: y + 0.22, z: p.z, r: p.r });
  const seg = 40;
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const rings = [p.r - 0.2, p.r + 0.5, p.r + 1.2, p.r + 2.2];
  const lift = [0.18, 0.4, 0.28, 0.0];
  for (let k = 0; k <= seg; k++) {
    const a = (k / seg) * Math.PI * 2;
    rings.forEach((r, ri) => {
      const x = p.x + Math.cos(a) * r;
      const z = p.z + Math.sin(a) * r;
      pos.push(x, gy(x, z) + lift[ri]! + (hash01(k, i, 3) - 0.5) * 0.06, z);
      const c = ri <= 1 ? C.earth : C.moss;
      col.push(c.r, c.g, c.b);
    });
  }
  const n = rings.length;
  for (let k = 0; k < seg; k++)
    for (let ri = 0; ri < n - 1; ri++) {
      const a = k * n + ri;
      idx.push(a, a + n, a + 1, a + 1, a + n, a + n + 1);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  o.extra.push({ geo: g, kind: 'bank' });
  for (let k = 0; k < 12; k++) {
    const a = hash01(k, i, 4) * Math.PI * 2;
    const rr = Math.sqrt(hash01(k, i, 5)) * (p.r - 1.6);
    const lx = p.x + Math.cos(a) * rr;
    const lz = p.z + Math.sin(a) * rr;
    const sz = 0.5 + hash01(k, i, 6) * 0.55;
    o.plants.put(PAD, lx, y + 0.23, lz, sz, 1, sz, C.pad, hash01(k, i, 9) * 6.28, 0, 0, C.padVein);
    if (k % 3 === 0) lotus(o, lx + sz * 0.4, y + 0.3, lz, hash01(k, i, 11));
  }
}

function lotus(o: Out, x: number, y: number, z: number, r: number): void {
  const rings = [
    { n: 6, tilt: 0.5, len: 0.34, h: 0.14 },
    { n: 5, tilt: 0.95, len: 0.3, h: 0.2 },
  ];
  for (const ring of rings)
    for (let k = 0; k < ring.n; k++) {
      const a = (k / ring.n) * Math.PI * 2 + r * 3;
      o.plants.put(
        PETAL,
        x + Math.cos(a) * 0.1,
        y + ring.h,
        z + Math.sin(a) * 0.1,
        0.16,
        0.06,
        ring.len,
        C.petal,
        -a + Math.PI / 2,
        -ring.tilt,
        0,
        C.petalTip,
      );
    }
  o.plants.put(CYL, x, y + 0.18, z, 0.12, 0.08, 0.12, C.heart);
}

/** Cầu treo gỗ: sàn ván, hai dầm dọc, hai dây lan can + dây dưới, cọc đỡ, xà ngang đầu cầu; cột đá hai đầu là prop kit. */
function cauTreo(o: Out, p: Extract<ScenePiece, { k: 'cau_treo' }>): void {
  const ya = gy(p.ax, p.az) + p.lift;
  const yb = gy(p.bx, p.bz) + p.lift;
  const len = Math.hypot(p.bx - p.ax, p.bz - p.az);
  const dx = (p.bx - p.ax) / len;
  const dz = (p.bz - p.az) / len;
  const nx = -dz;
  const nz = dx;
  const yaw = Math.atan2(dx, dz);
  const sag = 1.6;
  const deck = (t: number) => ya + (yb - ya) * t - sag * 4 * t * (1 - t);
  const N = Math.round(len / 0.9);
  const hw = 1.5;
  for (let i = 0; i < N; i++) {
    const t = (i + 0.5) / N;
    const slope = (deck((i + 1) / N) - deck(i / N)) / (len / N);
    const col = [C.wood, C.woodDark, C.woodLight][(i * 7) % 3]!;
    o.wood.put(BOX, p.ax + dx * len * t, deck(t), p.az + dz * len * t, hw * 2, 0.1, 0.78, col, yaw, -slope);
  }
  for (const side of [-0.9, 0.9])
    for (let i = 0; i < N; i += 2) {
      const t0 = i / N;
      const t1 = Math.min(1, (i + 2) / N);
      o.wood.seg(
        new THREE.Vector3(p.ax + dx * len * t0 + nx * side, deck(t0) - 0.12, p.az + dz * len * t0 + nz * side),
        new THREE.Vector3(p.ax + dx * len * t1 + nx * side, deck(t1) - 0.12, p.az + dz * len * t1 + nz * side),
        0.14,
        C.woodDark,
      );
    }
  for (const side of [-1, 1]) {
    const pt = (t: number, up: number) =>
      new THREE.Vector3(p.ax + dx * len * t + nx * hw * side, deck(t) + up, p.az + dz * len * t + nz * hw * side);
    for (let i = 0; i < N; i++) {
      o.wood.seg(pt(i / N, 1.15), pt((i + 1) / N, 1.15), 0.08, C.rope);
      o.wood.seg(pt(i / N, 0.55), pt((i + 1) / N, 0.55), 0.05, C.rope);
    }
    for (let i = 0; i <= N; i += 3) {
      const b = pt(i / N, 0);
      o.wood.box(b.x, b.y + 0.6, b.z, 0.11, 1.25, 0.11, C.woodDark);
    }
  }
  for (const e of [0, 1] as const) {
    const ex = e ? p.bx : p.ax;
    const ez = e ? p.bz : p.az;
    const ey = e ? yb : ya;
    o.wood.box(ex, ey + 3.6, ez, hw * 2 + 3.2, 0.3, 0.45, C.lacquer, yaw);
    o.wood.box(ex, ey + 4.0, ez, hw * 2 + 3.6, 0.2, 1.1, C.tile, yaw);
    for (const side of [-1, 1]) o.glow.box(ex + nx * (hw + 0.4) * side, ey + 3.0, ez + nz * (hw + 0.4) * side, 0.28, 0.42, 0.28, C.lamp);
  }
}

/** Lối men vách: phiến đá bậc thang bám sườn (đi được, theo địa hình), cọc gỗ + dây phía dốc. */
function loiVach(o: Out, pts: [number, number][]): void {
  let acc = 0;
  const posts: THREE.Vector3[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i]!;
    const [bx, bz] = pts[i + 1]!;
    const len = Math.hypot(bx - ax, bz - az);
    const dx = (bx - ax) / len;
    const dz = (bz - az) / len;
    const yaw = Math.atan2(dx, dz);
    for (let d = 0; d < len; d += 1.7) {
      const x = ax + dx * d;
      const z = az + dz * d;
      o.stone.box(
        x + (hash01(acc, 1, 8) - 0.5) * 0.3,
        gy(x, z) + 0.04,
        z,
        1.9,
        0.14,
        1.3,
        acc & 1 ? C.slab : C.slabDark,
        yaw + (hash01(acc, 2, 8) - 0.5) * 0.2,
      );
      acc++;
    }
    for (let d = 0; d <= len; d += 5) {
      const x = ax + dx * d;
      const z = az + dz * d;
      const side = gy(x - dz * 3, z + dx * 3) < gy(x + dz * 3, z - dx * 3) ? 1 : -1;
      const px = x - dz * 1.7 * side;
      const pz = z + dx * 1.7 * side;
      const y = gy(px, pz);
      o.wood.box(px, y + 0.55, pz, 0.16, 1.1, 0.16, C.woodDark);
      posts.push(new THREE.Vector3(px, y + 1.0, pz));
    }
  }
  for (let i = 0; i < posts.length - 1; i++)
    if (posts[i]!.distanceTo(posts[i + 1]!) < 8) o.wood.seg(posts[i]!, posts[i + 1]!, 0.06, C.rope);
}

/**
 * Hác: (1) áo đá phủ sườn dốc (lưới theo đúng heightmap + 0.06 m, shader bỏ chỗ phẳng nên cỏ vẫn lộ) tạo vách đá tầng; (2) suối chảy theo
 * đường thấp nhất dưới đáy; (3) sương mềm và đá tảng dọc suối. Địa hình/va chạm không đổi.
 */
function hac(o: Out, p: Extract<ScenePiece, { k: 'hac' }>): void {
  const ca = Math.cos(p.dir);
  const sa = Math.sin(p.dir);
  const step = 1.4;
  const nu = Math.round((p.len * 2) / step);
  const nv = Math.round((p.wid * 2) / step);
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const at = (u: number, v: number): [number, number] => [p.x + ca * u - sa * v, p.z + sa * u + ca * v];
  const cc = new THREE.Color();
  for (let j = 0; j <= nv; j++)
    for (let i = 0; i <= nu; i++) {
      const [x, z] = at(-p.len + i * step, -p.wid + j * step);
      const y = gy(x, z);
      const sl = Math.min(1, Math.hypot(gy(x + 1, z) - gy(x - 1, z), gy(x, z + 1) - gy(x, z - 1)) / 2);
      const bump = (hash01(Math.round(x * 1.7), Math.round(z * 1.7), 3) - 0.3) * 0.5 * sl;
      pos.push(x, y + 0.1 + Math.max(0, bump), z);
      const band = 0.5 + 0.5 * Math.sin(y * 1.9 + hash01(Math.round(x), Math.round(z), 5) * 0.8);
      cc.set('#6d6a60')
        .lerp(new THREE.Color('#8e8576'), band)
        .lerp(C.moss, Math.max(0, 0.55 - sl) * 0.5);
      col.push(cc.r, cc.g, cc.b);
    }
  const row = nu + 1;
  for (let j = 0; j < nv; j++)
    for (let i = 0; i < nu; i++) {
      const a = j * row + i;
      idx.push(a, a + row, a + 1, a + 1, a + row, a + row + 1);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  o.extra.push({ geo: g, kind: 'skin' });

  const line: [number, number][] = [];
  let lastV = 0;
  for (let u = -p.len; u <= p.len; u += 2) {
    let best = 1e9;
    let bv = lastV;
    for (let v = -p.wid * 0.6; v <= p.wid * 0.6; v += 1) {
      const [x, z] = at(u, v);
      const h = gy(x, z);
      if (h < best) {
        best = h;
        bv = v;
      }
    }
    lastV = lastV * 0.5 + bv * 0.5;
    line.push(at(u, lastV));
  }
  const sp: number[] = [];
  const su: number[] = [];
  const si: number[] = [];
  line.forEach(([x, z], k) => {
    const [x2, z2] = line[Math.min(line.length - 1, k + 1)]!;
    const [x1, z1] = line[Math.max(0, k - 1)]!;
    const tl = Math.hypot(x2 - x1, z2 - z1) || 1;
    const nx = -(z2 - z1) / tl;
    const nz = (x2 - x1) / tl;
    const w = 1.5 + 0.6 * Math.sin(k * 0.7);
    for (const sgn of [-1, 1]) {
      const px = x + nx * w * sgn;
      const pz = z + nz * w * sgn;
      sp.push(px, gy(x, z) + 0.2, pz);
      su.push(sgn < 0 ? 0 : 1, k * 0.35);
    }
    if (k < line.length - 1) {
      const a = k * 2;
      si.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  });
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
  sg.setAttribute('uv', new THREE.Float32BufferAttribute(su, 2));
  sg.setIndex(si);
  sg.computeVertexNormals();
  o.extra.push({ geo: sg, kind: 'stream' });
  const [mx, mz] = line[Math.floor(line.length / 2)]!;
  o.mist.push({ x: mx, y: gy(mx, mz) + 1.8, z: mz, r: 24 });
}

function build(): Out {
  const o: Out = {
    stone: new Mesher(),
    wood: new Mesher(),
    glow: new Mesher(),
    plants: new Mesher(),
    places: new Map(),
    ponds: [],
    mist: [],
    extra: [],
  };
  let i = 0;
  for (const sc of SCENES)
    for (const p of sc.pieces) {
      i++;
      switch (p.k) {
        case 'glb': {
          const l = o.places.get(p.id) ?? [];
          l.push({ x: p.x, z: p.z, yaw: p.yaw, h: p.h, rx: p.rx, rz: p.rz, sink: p.sink });
          o.places.set(p.id, l);
          if (p.id === 'prop_tc_den_da') o.glow.box(p.x, gy(p.x, p.z) + p.h * 0.62, p.z, 0.4, 0.3, 0.4, C.lamp);
          break;
        }
        case 'cong_bai':
          congBai(o, p);
          break;
        case 'ao':
          ao(o, p, i);
          break;
        case 'cau_treo':
          cauTreo(o, p);
          break;
        case 'loi_vach':
          loiVach(o, p.pts);
          break;
        case 'hac':
          hac(o, p);
          break;
        case 'suong':
          o.mist.push({ x: p.x, y: gy(p.x, p.z) + p.dy, z: p.z, r: p.r });
          break;
      }
    }
  return o;
}

/** Thống kê dựng (test ngân sách; không đụng GPU): tam giác phần thủ tục + số bản đặt GLB. */
export function sceneStats(): { tris: number; ponds: number; mist: number; glbPlaces: number; glbKinds: number } {
  const o = build();
  let g = 0;
  for (const l of o.places.values()) g += l.length;
  let ex = 0;
  for (const e of o.extra) ex += (e.geo.index?.count ?? 0) / 3;
  return {
    tris: o.stone.tris + o.wood.tris + o.glow.tris + o.plants.tris + ex,
    ponds: o.ponds.length,
    mist: o.mist.length,
    glbPlaces: g,
    glbKinds: o.places.size,
  };
}

/** Làm mềm mép theo độ sâu: 0 khi mặt phẳng chạm đất/vật phía sau, 1 khi cách ≥ `k` m. */
const softDepth = (k: number) =>
  clamp(
    viewportLinearDepth
      .sub(viewZToOrthographicDepth(positionView.z, cameraNear, cameraFar))
      .mul(cameraFar.sub(cameraNear))
      .div(k),
    0,
    1,
  );

export class LacKiemScenes {
  readonly group = new THREE.Group();
  private geos: THREE.BufferGeometry[] = [];
  private mats: THREE.Material[] = [];
  private scatter: GlbScatter | null = null;
  private disposed = false;
  /** Tam giác phần thủ tục (GLB tính riêng ở `scatter.tris`). */
  readonly tris: number;

  constructor() {
    this.group.name = 'lac-kiem-scenes';
    this.group.position.set(SECT.x, 0, SECT.z);
    const o = build();
    this.tris = o.stone.tris + o.wood.tris + o.glow.tris + o.plants.tris;
    void this.init(o);
  }

  private async init(o: Out): Promise<void> {
    const tex = await loadSkyTextures();
    if (this.disposed) return;
    const stoneMat = withSightFade(tex ? rockMaterial(tex) : createWorldMaterial({ vertexColors: true, roughness: 0.9 }));
    const wood = createWorldMaterial({ roughness: 0.8, side: THREE.DoubleSide }); // màu đỉnh đọc qua colorNode (không bật vertexColors để khỏi nhân đôi)
    const p = positionWorld;
    const grain = vnoise(vec2(p.x.add(p.z).mul(2.2), p.y.mul(18)))
      .mul(0.34)
      .add(0.83);
    wood.colorNode = attribute('color', 'vec3').mul(grain);
    withSightFade(wood);
    const plant = createWorldMaterial({ vertexColors: true, roughness: 0.55, side: THREE.DoubleSide });
    const glow = withSightFade(new THREE.MeshBasicNodeMaterial({ vertexColors: true, toneMapped: false }));
    this.mats.push(stoneMat, wood, plant, glow);
    const add = (m: Mesher, mat: THREE.Material, name: string, shadow: boolean) => {
      if (m.empty) return;
      const g = m.geometry();
      this.geos.push(g);
      const mesh = new THREE.Mesh(g, mat);
      mesh.name = name;
      mesh.castShadow = shadow;
      mesh.receiveShadow = true;
      this.group.add(mesh);
    };
    add(o.stone, stoneMat, 'tc-da', true);
    add(o.wood, wood, 'tc-go', true);
    add(o.plants, plant, 'tc-cay', false);
    add(o.glow, glow, 'tc-den', false);

    const skin = tex ? rockMaterial(tex) : createWorldMaterial({ vertexColors: true, roughness: 0.9 });
    skin.maskNode = normalWorld.y.lessThan(float(0.86));
    skin.polygonOffset = true;
    skin.polygonOffsetFactor = -2;
    skin.polygonOffsetUnits = -2; // chỉ phủ chỗ dốc: chỗ phẳng để cỏ lộ ra
    const bank = createWorldMaterial({ roughness: 0.95 });
    bank.colorNode = attribute('color', 'vec3').mul(vnoise(positionWorld.xz.mul(1.7)).mul(0.5).add(0.7));
    const stream = this.waterMaterial('stream');
    this.mats.push(skin, bank);
    for (const e of o.extra) {
      this.geos.push(e.geo);
      const mesh = new THREE.Mesh(e.geo, e.kind === 'skin' ? skin : e.kind === 'bank' ? bank : stream);
      mesh.name = `tc-${e.kind}`;
      mesh.receiveShadow = true;
      if (e.kind === 'stream') mesh.renderOrder = 1;
      this.group.add(mesh);
    }
    this.addDiscs(o.ponds, this.waterMaterial('pond'), 'tc-nuoc', 1);
    this.addDiscs(o.mist, this.mistMaterial(), 'tc-suong', 2);

    const scatter = new GlbScatter(assets, gy);
    this.scatter = scatter;
    this.group.add(scatter.group);
    await Promise.all([...o.places].map(([id, list]) => scatter.add(id, list)));
  }

  /** Nước: ao sâu ở giữa, nông và ngả vàng lục ven bờ, sóng gợn + vòng lan; suối chảy dọc dải có bọt. */
  private waterMaterial(kind: 'pond' | 'stream'): THREE.MeshStandardNodeMaterial {
    const mat = new THREE.MeshStandardNodeMaterial({ transparent: true, depthWrite: false, roughness: 0.3, metalness: 0.0 });
    const p = positionWorld;
    const rip = sin(p.x.mul(2.3).add(time.mul(0.9)))
      .mul(sin(p.z.mul(1.9).sub(time.mul(0.7))))
      .mul(0.5)
      .add(vnoise(p.xz.mul(1.3).add(time.mul(0.2))).mul(0.5));
    if (kind === 'pond') {
      const d = length(uv().sub(0.5)).mul(2);
      const deep = vec3(0.012, 0.055, 0.07);
      const mid = vec3(0.04, 0.15, 0.15);
      const shallow = vec3(0.2, 0.3, 0.2);
      const base = mix(mix(deep, mid, smoothstep(0.1, 0.65, d)), shallow, smoothstep(0.7, 0.98, d));
      const ring = sin(d.mul(26).sub(time.mul(1.6)))
        .mul(smoothstep(0.55, 0.0, d))
        .mul(0.5)
        .add(0.5);
      mat.colorNode = base.add(vec3(0.05, 0.09, 0.09).mul(rip.mul(0.5).add(ring.mul(0.25))));
      mat.emissiveNode = vec3(0.05, 0.08, 0.1).mul(float(0.5).add(rip.mul(0.5)));
      mat.opacityNode = float(0.93).mul(smoothstep(1.0, 0.9, d));
    } else {
      const u = uv();
      const flow = sin(
        u.y
          .mul(18)
          .sub(time.mul(3.2))
          .add(vnoise(vec2(u.x.mul(6), u.y.mul(3))).mul(5)),
      );
      const foam = smoothstep(0.55, 0.95, flow.mul(0.5).add(0.5)).mul(abs(u.x.sub(0.5)).mul(2).add(0.2));
      mat.colorNode = mix(vec3(0.07, 0.2, 0.2), vec3(0.62, 0.74, 0.74), foam.mul(0.7));
      mat.emissiveNode = vec3(0.05, 0.09, 0.1).add(vec3(0.1).mul(foam));
      mat.opacityNode = float(0.88).mul(smoothstep(0.0, 0.18, u.x).mul(smoothstep(1.0, 0.82, u.x)));
    }
    this.mats.push(mat);
    return mat;
  }

  /** Sương thấp: nhiễu trôi, mờ dần ra mép, mềm theo độ sâu (không lộ đường cắt với địa hình). */
  private mistMaterial(): THREE.MeshStandardNodeMaterial {
    const mat = new THREE.MeshStandardNodeMaterial({ transparent: true, depthWrite: false, roughness: 1, metalness: 0 });
    const d = length(uv().sub(0.5)).mul(2);
    const p = positionWorld;
    const drift = vnoise(p.xz.mul(0.16).add(vec2(time.mul(0.18), time.mul(0.07))))
      .mul(0.6)
      .add(vnoise(p.xz.mul(0.4).sub(time.mul(0.1))).mul(0.4));
    mat.colorNode = vec3(0.66, 0.74, 0.76);
    mat.emissiveNode = vec3(0.07, 0.09, 0.1);
    mat.opacityNode = smoothstep(1.0, 0.05, d).mul(drift.mul(0.8).add(0.2)).mul(softDepth(5)).mul(0.2);
    this.mats.push(mat);
    return mat;
  }

  private addDiscs(list: Disc[], mat: THREE.Material, name: string, order: number): void {
    if (!list.length) return;
    const geo = new THREE.CircleGeometry(1, 40);
    geo.rotateX(-Math.PI / 2);
    this.geos.push(geo);
    for (const w of list) {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(w.x, w.y, w.z);
      m.scale.setScalar(w.r);
      m.name = name;
      m.renderOrder = order;
      this.group.add(m);
    }
  }

  dispose(): void {
    this.disposed = true;
    this.scatter?.dispose();
    for (const g of this.geos) g.dispose();
    for (const m of this.mats) m.dispose();
  }
}
