import * as THREE from 'three/webgpu';
import {
  abs,
  cameraFar,
  cameraNear,
  clamp,
  float,
  length,
  mix,
  positionView,
  positionWorld,
  sin,
  smoothstep,
  time,
  uv,
  vec3,
  viewportLinearDepth,
  viewZToOrthographicDepth,
} from 'three/tsl';
import { hash01, SECT } from '@dtl/shared';
import { heightAt } from '../../base/levelCtx';
import { withSightFade } from './occlusion';

/**
 * Tiểu cảnh Lạc Kiếm Tông (Chân Cảnh M1+M2, pilot): mỗi khung ~20 × 12 m của camera chéo có một điểm nhấn, một lớp tiền cảnh tự mờ khi che
 * người (`withSightFade`) và một lớp "đáy" (nước, sương dưới hác). Toàn bộ là hình thủ tục chỉ để nhìn, KHÔNG va chạm, tất định, không
 * ảnh hưởng server. Bản đồ tiểu cảnh và lý do chọn chỗ: `docs/map/lac-kiem-tieu-canh.md`.
 *
 * Draw call: đá + gỗ/vải + đèn phát sáng + nước + sương = 5 mesh gộp cho cả bản đồ (không theo số tiểu cảnh).
 * Tọa độ trong `SCENES` tương đối tâm tông môn (SECT); độ cao lấy từ địa hình hiện có (không đổi heightmap/va chạm).
 */

export type ScenePiece =
  | { k: 'cong_bai'; x: number; z: number; yaw: number; w: number }
  | { k: 'den_da'; x: number; z: number }
  | { k: 'bia'; x: number; z: number; h: number; yaw: number }
  | { k: 'kiem_da'; x: number; z: number; h: number; tilt: number; yaw: number }
  | { k: 'da'; x: number; z: number; r: number }
  | { k: 'ao'; x: number; z: number; r: number }
  | { k: 'cau_treo'; ax: number; az: number; bx: number; bz: number; lift: number }
  | { k: 'loi_vach'; pts: [number, number][] }
  | { k: 'suong'; x: number; z: number; r: number; dy: number };

export interface TieuCanh {
  id: string;
  /** Điểm quan sát đề xuất (người đứng) để chụp/kiểm; tương đối tâm tông môn. */
  at: [number, number];
  pieces: ScenePiece[];
}

/** Hướng cầu treo: tâm và góc đo được từ heightmap (hác sâu ~11 m, rộng 44 m: đủ cao để thấy cầu trong khung camera chéo); hai đầu cầu là đỉnh hai bờ. */
const BR = { cx: -146, cz: 91, dir: (105 * Math.PI) / 180, half: 22 };
export const BRIDGE_A: [number, number] = [BR.cx - Math.cos(BR.dir) * BR.half, BR.cz - Math.sin(BR.dir) * BR.half];
export const BRIDGE_B: [number, number] = [BR.cx + Math.cos(BR.dir) * BR.half, BR.cz + Math.sin(BR.dir) * BR.half];

const lanternRow = (x: number, z0: number, z1: number, n: number): ScenePiece[] =>
  Array.from({ length: n }, (_, i) => ({ k: 'den_da' as const, x, z: z0 + ((z1 - z0) * i) / (n - 1) }));

export const SCENES: TieuCanh[] = [
  {
    id: 'cong_bai',
    at: [0, 112],
    pieces: [
      { k: 'cong_bai', x: 0, z: 120, yaw: 0, w: 9 },
      ...lanternRow(-6.5, 96, 140, 5),
      ...lanternRow(6.5, 96, 140, 5),
      { k: 'da', x: -14, z: 124, r: 1.0 },
      { k: 'da', x: 15, z: 118, r: 1.2 },
      { k: 'da', x: 13, z: 128, r: 0.8 },
    ],
  },
  {
    id: 'ao_sen',
    at: [-62, 52],
    pieces: [
      { k: 'ao', x: -62, z: 66, r: 8.5 },
      { k: 'da', x: -70, z: 58, r: 1.0 },
      { k: 'da', x: -52, z: 72, r: 0.8 },
      { k: 'den_da', x: -53, z: 60 },
      { k: 'bia', x: -74, z: 72, h: 2.2, yaw: 0.5 },
    ],
  },
  {
    id: 'kiem_bia',
    at: [66, 52],
    pieces: [
      { k: 'bia', x: 66, z: 64, h: 3.4, yaw: -0.4 },
      { k: 'kiem_da', x: 60.5, z: 62, h: 4.2, tilt: 0.12, yaw: 0.3 },
      { k: 'kiem_da', x: 62, z: 69, h: 3.4, tilt: -0.1, yaw: -0.5 },
      { k: 'kiem_da', x: 71, z: 68, h: 4.6, tilt: 0.16, yaw: 1.2 },
      { k: 'kiem_da', x: 72, z: 60, h: 3.0, tilt: -0.14, yaw: 2.4 },
      { k: 'kiem_da', x: 66, z: 56, h: 3.8, tilt: 0.1, yaw: 3.0 },
      { k: 'den_da', x: 58, z: 70 },
      { k: 'den_da', x: 74, z: 55 },
      { k: 'da', x: 76, z: 66, r: 1.3 },
    ],
  },
  {
    id: 'loi_vach',
    at: [-116, 62],
    pieces: [
      {
        k: 'loi_vach',
        pts: [[-92, 54], [-104, 56], [-116, 60], [-128, 64], BRIDGE_A],
      },
      { k: 'da', x: -108, z: 50, r: 0.9 },
      { k: 'da', x: -122, z: 70, r: 1.0 },
      { k: 'da', x: -112, z: 66, r: 0.6 },
      { k: 'den_da', x: -98, z: 60 },
    ],
  },
  {
    id: 'cau_treo',
    at: [BR.cx, BR.cz + 8],
    pieces: [
      { k: 'cau_treo', ax: BRIDGE_A[0], az: BRIDGE_A[1], bx: BRIDGE_B[0], bz: BRIDGE_B[1], lift: 0.35 },
      { k: 'suong', x: BR.cx, z: BR.cz, r: 30, dy: 3.2 },
      { k: 'den_da', x: BRIDGE_B[0] + 3, z: BRIDGE_B[1] + 1 },
      { k: 'da', x: BRIDGE_B[0] - 4, z: BRIDGE_B[1] + 3, r: 1.8 },
    ],
  },
  {
    id: 'thach_lam',
    at: [96, -6],
    pieces: [
      { k: 'da', x: 96, z: -12, r: 1.8 },
      { k: 'da', x: 101, z: -6, r: 1.1 },
      { k: 'da', x: 92, z: -4, r: 1.2 },
      { k: 'bia', x: 99, z: -2, h: 2.6, yaw: 2.6 },
      { k: 'den_da', x: 90, z: -14 },
    ],
  },
];

// ---------- hình thủ tục ----------

const BOX = new THREE.BoxGeometry(1, 1, 1);
const CYL = new THREE.CylinderGeometry(0.5, 0.5, 1, 7);
const CONE = new THREE.ConeGeometry(0.5, 1, 6);
const ROCK = (() => {
  // Đá tảng: nhị thập diện chia một lần, đỉnh xô lệch tất định để không giống khối pha lê đều cạnh.
  const g = new THREE.IcosahedronGeometry(1, 1);
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const k = 0.78 + hash01(Math.round(p.getX(i) * 40), Math.round(p.getY(i) * 40), Math.round(p.getZ(i) * 40)) * 0.38;
    p.setXYZ(i, p.getX(i) * k, p.getY(i) * k, p.getZ(i) * k);
  }
  return g;
})();
const DISC = new THREE.CylinderGeometry(1, 1, 1, 10);

/** Bảng màu bán tả thực, hơi lạnh (sương sớm): đá xám lục, sơn son, gỗ, ngọc. */
const C = {
  stone: new THREE.Color('#7d8884'),
  stoneDark: new THREE.Color('#566260'),
  jade: new THREE.Color('#6f9a88'),
  lacquer: new THREE.Color('#8b2a22'),
  wood: new THREE.Color('#6a4b32'),
  woodDark: new THREE.Color('#4a3524'),
  rope: new THREE.Color('#a48a62'),
  tile: new THREE.Color('#3f5a5c'),
  moss: new THREE.Color('#58724a'),
  lotus: new THREE.Color('#e8b4c0'),
  pad: new THREE.Color('#4d7a45'),
  sword: new THREE.Color('#aab6bf'),
};

/** Gộp nhiều hình có màu đỉnh vào một BufferGeometry không chỉ mục (pháp tuyến phẳng, kiểu cách điệu). */
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

  private push(g: THREE.BufferGeometry, color: THREE.Color, seed: number): void {
    const ng = g.index ? g.toNonIndexed() : g;
    const p = ng.attributes.position as THREE.BufferAttribute;
    const k = 0.9 + hash01(seed, 7, 3) * 0.2;
    this.tmp.copy(color).multiplyScalar(k);
    const v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(this.m);
      this.pos.push(v.x, v.y, v.z);
      this.col.push(this.tmp.r, this.tmp.g, this.tmp.b);
    }
    this.tris += p.count / 3;
    if (ng !== g) ng.dispose();
  }

  /** Đặt hình `g` tại (x, y, z) với kích thước (sx, sy, sz), xoay yaw quanh Y (sau nghiêng rx quanh X, rz quanh Z). */
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
    seed = 0,
  ): void {
    this.e.set(rx, yaw, rz, 'YXZ');
    this.q.setFromEuler(this.e);
    this.m.compose(this.v.set(x, y, z), this.q, this.s.set(sx, sy, sz));
    this.push(g, color, seed + Math.floor(x * 7 + z * 13));
  }

  box(x: number, y: number, z: number, sx: number, sy: number, sz: number, color: THREE.Color, yaw = 0, rx = 0, rz = 0): void {
    this.put(BOX, x, y, z, sx, sy, sz, color, yaw, rx, rz);
  }
  cyl(x: number, y: number, z: number, d: number, h: number, color: THREE.Color): void {
    this.put(CYL, x, y, z, d, h, d, color);
  }
  cone(x: number, y: number, z: number, d: number, h: number, color: THREE.Color, yaw = 0): void {
    this.put(CONE, x, y, z, d, h, d, color, yaw);
  }
  rock(x: number, y: number, z: number, r: number, color: THREE.Color, seed: number): void {
    this.put(
      ROCK,
      x,
      y,
      z,
      r * (0.9 + hash01(seed, 1, 5) * 0.4),
      r * (0.55 + hash01(seed, 2, 5) * 0.3),
      r * (0.9 + hash01(seed, 3, 5) * 0.4),
      color,
      hash01(seed, 4, 5) * 6.28,
      0,
      0,
      seed,
    );
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
/** Điểm thế giới → cục bộ nhóm (nhóm đặt tại SECT, nên tọa độ tương đối tông môn). */
const P = (x: number, z: number, dy = 0): THREE.Vector3 => new THREE.Vector3(x, gy(x, z) + dy, z);

interface Out {
  stone: Mesher;
  wood: Mesher;
  glow: Mesher;
  /** Mảnh nước/sương: dựng riêng (đĩa phẳng). */
  water: { x: number; y: number; z: number; r: number }[];
  mist: { x: number; y: number; z: number; r: number }[];
}

function congBai(o: Out, p: Extract<ScenePiece, { k: 'cong_bai' }>): void {
  const { wood, stone } = o;
  const s = Math.sin(p.yaw);
  const c = Math.cos(p.yaw);
  const at = (lx: number, ly: number) => [p.x + c * lx, gy(p.x, p.z) + ly, p.z - s * lx] as const;
  const half = p.w / 2;
  for (const sx of [-1, 1]) {
    const [x, y, z] = at(sx * half, 0);
    stone.box(x, y + 0.35, z, 1.5, 0.7, 1.5, C.stoneDark, p.yaw);
    wood.cyl(x, y + 3.6, z, 0.75, 6.2, C.lacquer);
    stone.box(x, y + 6.9, z, 1.1, 0.35, 1.1, C.stone, p.yaw);
  }
  const [bx, by, bz] = at(0, 0);
  wood.box(bx, by + 6.0, bz, p.w + 1.4, 0.5, 0.7, C.lacquer, p.yaw);
  wood.box(bx, by + 7.15, bz, p.w + 3.0, 0.4, 1.4, C.woodDark, p.yaw);
  // mái ngói hai tầng, đỉnh nhọn nhẹ
  wood.box(bx, by + 7.7, bz, p.w + 2.2, 0.5, 1.9, C.tile, p.yaw, 0, 0);
  wood.box(bx, by + 8.25, bz, p.w * 0.55, 0.45, 1.3, C.tile, p.yaw);
  wood.box(bx, by + 6.6, bz, p.w - 0.6, 0.5, 0.35, C.woodDark, p.yaw);
}

function denDa(o: Out, x: number, z: number): void {
  const y = gy(x, z);
  const { stone, glow } = o;
  stone.box(x, y + 0.25, z, 0.9, 0.5, 0.9, C.stoneDark);
  stone.cyl(x, y + 1.0, z, 0.38, 1.0, C.stone);
  stone.box(x, y + 1.75, z, 0.95, 0.5, 0.95, C.stone);
  glow.box(x, y + 1.75, z, 0.55, 0.34, 0.55, new THREE.Color('#ffc874'));
  stone.cone(x, y + 2.3, z, 1.5, 0.55, C.tile, Math.PI / 6);
  stone.cyl(x, y + 2.7, z, 0.2, 0.25, C.jade);
}

function bia(o: Out, p: Extract<ScenePiece, { k: 'bia' }>): void {
  const y = gy(p.x, p.z);
  const { stone } = o;
  stone.box(p.x, y + 0.25, p.z, 1.4, 0.5, 0.8, C.stoneDark, p.yaw);
  stone.box(p.x, y + 0.5 + p.h / 2, p.z, 0.95, p.h, 0.28, C.stone, p.yaw);
  stone.box(p.x, y + 0.5 + p.h + 0.12, p.z, 1.12, 0.26, 0.4, C.stoneDark, p.yaw);
  // vệt phù văn ngọc trên mặt bia
  stone.box(p.x - Math.sin(p.yaw) * 0.16, y + 0.5 + p.h * 0.55, p.z - Math.cos(p.yaw) * 0.16, 0.5, p.h * 0.5, 0.04, C.jade, p.yaw);
}

function kiemDa(o: Out, p: Extract<ScenePiece, { k: 'kiem_da' }>): void {
  const y = gy(p.x, p.z);
  const { stone } = o;
  // thân kiếm đá cắm xuống đất, nghiêng nhẹ; mũi chôn nên chỉ thấy phần trên
  stone.put(BOX, p.x, y + p.h * 0.5, p.z, 0.34, p.h, 0.09, C.sword, p.yaw, 0, p.tilt);
  const tx = p.x - Math.sin(p.tilt) * p.h * 0.46 * Math.cos(p.yaw);
  stone.put(BOX, tx, y + p.h * 0.96, p.z, 0.9, 0.14, 0.2, C.stoneDark, p.yaw, 0, p.tilt);
  stone.put(BOX, tx, y + p.h * 1.06, p.z, 0.16, 0.5, 0.16, C.woodDark, p.yaw, 0, p.tilt);
  stone.rock(p.x, y + 0.12, p.z, 0.55, C.stoneDark, Math.floor(p.x * 5 + p.z));
}

function da(o: Out, x: number, z: number, r: number, i: number): void {
  const y = gy(x, z);
  o.stone.rock(x, y + r * 0.2, z, r, C.stone, i);
  if (r > 1) o.stone.rock(x + r * 0.7, y + r * 0.1, z - r * 0.4, r * 0.5, C.stoneDark, i + 11);
  // rêu phủ đỉnh
  o.stone.put(ROCK, x, y + r * 0.62, z, r * 0.7, r * 0.18, r * 0.7, C.moss, 0, 0, 0, i);
}

function ao(o: Out, p: Extract<ScenePiece, { k: 'ao' }>, i: number): void {
  const y = gy(p.x, p.z);
  // đáy = nước: mặt nước thấp hơn đất quanh ao 0,35 m nên nhìn như hõm; đáy ao tối do không có lưới đất hạ, nên mặt nước hơi nổi + viền đá.
  o.water.push({ x: p.x, y: y + 0.1, z: p.z, r: p.r });
  const n = 16;
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2;
    const rr = p.r + 0.4 + hash01(k, i, 2) * 0.5;
    o.stone.rock(
      p.x + Math.cos(a) * rr,
      gy(p.x + Math.cos(a) * rr, p.z + Math.sin(a) * rr) + 0.1,
      p.z + Math.sin(a) * rr,
      0.4 + hash01(k, i, 3) * 0.4,
      k % 3 ? C.stone : C.stoneDark,
      k + i * 31,
    );
  }
  for (let k = 0; k < 9; k++) {
    const a = hash01(k, i, 4) * Math.PI * 2;
    const rr = Math.sqrt(hash01(k, i, 5)) * (p.r - 1.4);
    const lx = p.x + Math.cos(a) * rr;
    const lz = p.z + Math.sin(a) * rr;
    o.stone.put(DISC, lx, y + 0.16, lz, 0.55 + hash01(k, i, 6) * 0.35, 0.04, 0.55 + hash01(k, i, 6) * 0.35, C.pad);
    if (k % 3 === 0) o.stone.put(CONE, lx, y + 0.34, lz, 0.26, 0.3, 0.26, C.lotus);
  }
}

/** Cầu treo cao nối hai bờ hác: sàn ván võng, hai dây lan can, cọc, tháp đầu cầu. Người đi dưới hác (cầu cao ≥ 7 m so với đáy). */
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
  const N = Math.round(len / 1.2);
  const hw = 1.5;
  const rail = (side: number): THREE.Vector3[] =>
    Array.from({ length: N + 1 }, (_, i) => {
      const t = i / N;
      return new THREE.Vector3(p.ax + dx * len * t + nx * hw * side, deck(t) + 1.15, p.az + dz * len * t + nz * hw * side);
    });
  for (let i = 0; i < N; i++) {
    const t = (i + 0.5) / N;
    const x = p.ax + dx * len * t;
    const z = p.az + dz * len * t;
    o.wood.put(BOX, x, deck(t), z, hw * 2, 0.12, 1.0, i % 2 ? C.wood : C.woodDark, yaw, ((deck((i + 1) / N) - deck(i / N)) / 1.2) * -1);
  }
  for (const side of [-1, 1]) {
    const r = rail(side);
    for (let i = 0; i < r.length - 1; i++) {
      o.wood.seg(r[i]!, r[i + 1]!, 0.07, C.rope);
      o.wood.seg(r[i]!.clone().setY(r[i]!.y - 0.7), r[i + 1]!.clone().setY(r[i + 1]!.y - 0.7), 0.05, C.rope);
    }
    for (let i = 0; i < r.length; i += 3) {
      const b = r[i]!;
      o.wood.box(b.x, b.y - 0.55, b.z, 0.12, 1.2, 0.12, C.woodDark);
    }
  }
  // tháp đầu cầu: hai trụ son + xà ngang
  for (const e of [0, 1] as const) {
    const ex = e ? p.bx : p.ax;
    const ez = e ? p.bz : p.az;
    const ey = e ? yb : ya;
    for (const side of [-1, 1]) {
      o.wood.cyl(ex + nx * (hw + 0.2) * side, ey + 1.7, ez + nz * (hw + 0.2) * side, 0.4, 3.4, C.lacquer);
      o.stone.box(ex + nx * (hw + 0.2) * side, ey + 0.2, ez + nz * (hw + 0.2) * side, 0.95, 0.4, 0.95, C.stoneDark, yaw);
    }
    o.wood.box(ex, ey + 3.5, ez, hw * 2 + 1.6, 0.3, 0.5, C.lacquer, yaw);
    o.wood.box(ex, ey + 3.85, ez, hw * 2 + 2.4, 0.22, 1.1, C.tile, yaw);
    o.glow.box(ex + nx * (hw + 0.2), ey + 3.0, ez + nz * (hw + 0.2), 0.3, 0.45, 0.3, new THREE.Color('#ffc874'));
    o.glow.box(ex - nx * (hw + 0.2), ey + 3.0, ez - nz * (hw + 0.2), 0.3, 0.45, 0.3, new THREE.Color('#ffc874'));
  }
}

/** Lối men vách: đường phiến đá bậc thang bám sườn (theo địa hình, đi được), cọc gỗ + dây bên mép dốc. */
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
      const y = gy(x, z);
      const jx = (hash01(Math.floor(acc), 1, 8) - 0.5) * 0.3;
      o.stone.box(
        x + jx,
        y + 0.05,
        z,
        1.9,
        0.14,
        1.3,
        Math.floor(acc) & 1 ? C.stone : C.stoneDark,
        yaw + (hash01(Math.floor(acc), 2, 8) - 0.5) * 0.2,
      );
      acc++;
    }
    // cọc bên mép dốc phía thấp hơn
    for (let d = 0; d <= len; d += 5) {
      const x = ax + dx * d;
      const z = az + dz * d;
      const side = gy(x + -dz * 3, z + dx * 3) < gy(x + dz * 3, z - dx * 3) ? 1 : -1;
      const px = x - dz * 1.7 * side;
      const pz = z + dx * 1.7 * side;
      const base = P(px, pz);
      o.wood.box(base.x, base.y + 0.55, base.z, 0.16, 1.1, 0.16, C.woodDark);
      posts.push(new THREE.Vector3(base.x, base.y + 1.0, base.z));
    }
  }
  for (let i = 0; i < posts.length - 1; i++) {
    if (posts[i]!.distanceTo(posts[i + 1]!) < 8) o.wood.seg(posts[i]!, posts[i + 1]!, 0.06, C.rope);
  }
}

function build(): Out & { meshes: THREE.Mesh[] } {
  const o: Out & { meshes: THREE.Mesh[] } = {
    stone: new Mesher(),
    wood: new Mesher(),
    glow: new Mesher(),
    water: [],
    mist: [],
    meshes: [],
  };
  let i = 0;
  for (const sc of SCENES) {
    for (const p of sc.pieces) {
      i++;
      switch (p.k) {
        case 'cong_bai':
          congBai(o, p);
          break;
        case 'den_da':
          denDa(o, p.x, p.z);
          break;
        case 'bia':
          bia(o, p);
          break;
        case 'kiem_da':
          kiemDa(o, p);
          break;
        case 'da':
          da(o, p.x, p.z, p.r, i);
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
        case 'suong':
          o.mist.push({ x: p.x, y: gy(p.x, p.z) + p.dy, z: p.z, r: p.r });
          break;
      }
    }
  }
  return o;
}

/** Số tam giác các lưới gộp + số đĩa nước/sương (cho test ngân sách; dựng lại từ đầu, không đụng GPU). */
export function sceneStats(): { tris: number; water: number; mist: number } {
  const o = build();
  return { tris: o.stone.tris + o.wood.tris + o.glow.tris, water: o.water.length, mist: o.mist.length };
}

export class LacKiemScenes {
  readonly group = new THREE.Group();
  private geos: THREE.BufferGeometry[] = [];
  private mats: THREE.Material[] = [];
  /** Tam giác của lưới gộp (kiểm ngân sách trong test/bench). */
  readonly tris: number;

  constructor() {
    this.group.name = 'lac-kiem-scenes';
    this.group.position.set(SECT.x, 0, SECT.z);
    const o = build();
    this.tris = o.stone.tris + o.wood.tris + o.glow.tris;
    const solid = (side: THREE.Side = THREE.FrontSide) =>
      withSightFade(new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.88, metalness: 0.02, side }));
    const add = (m: Mesher, mat: THREE.Material, name: string, shadow: boolean) => {
      if (m.empty) return;
      const g = m.geometry();
      this.geos.push(g);
      this.mats.push(mat);
      const mesh = new THREE.Mesh(g, mat);
      mesh.name = name;
      mesh.castShadow = shadow;
      mesh.receiveShadow = true;
      mesh.frustumCulled = true;
      this.group.add(mesh);
    };
    add(o.stone, solid(), 'tc-da', true);
    add(o.wood, solid(THREE.DoubleSide), 'tc-go', true);
    const glowMat = withSightFade(new THREE.MeshBasicNodeMaterial({ vertexColors: true, toneMapped: false }));
    add(o.glow, glowMat, 'tc-den', false);
    this.addDiscs(o.water, true);
    this.addDiscs(o.mist, false);
  }

  /** Đĩa phẳng: nước ao (trong, gợn sóng chậm) hoặc sương hác (mờ dần ra mép, cắt bởi địa hình nên chỉ thấy trong hác). */
  private addDiscs(list: { x: number; y: number; z: number; r: number }[], water: boolean): void {
    if (!list.length) return;
    const mat = new THREE.MeshStandardNodeMaterial({ transparent: true, depthWrite: false, roughness: water ? 0.12 : 1, metalness: 0 });
    const d = length(uv().sub(0.5)).mul(2);
    const rip = sin(positionWorld.x.mul(1.7).add(time.mul(0.8))).mul(sin(positionWorld.z.mul(1.3).sub(time.mul(0.6))));
    if (water) {
      mat.colorNode = mix(vec3(0.1, 0.27, 0.3), vec3(0.34, 0.6, 0.62), rip.mul(0.5).add(0.5).mul(0.35));
      mat.opacityNode = float(0.88).mul(smoothstep(1.0, 0.94, d));
      mat.emissiveNode = vec3(0.02, 0.06, 0.07);
    } else {
      const drift = sin(positionWorld.x.mul(0.11).add(time.mul(0.12)))
        .mul(sin(positionWorld.z.mul(0.09).sub(time.mul(0.1))))
        .mul(0.5)
        .add(0.5);
      mat.colorNode = vec3(0.62, 0.72, 0.74);
      mat.emissiveNode = vec3(0.05, 0.07, 0.08);
      // Mềm mép theo độ sâu: sương mờ dần về 0 khi sát mặt đất (không lộ đường cắt phẳng với địa hình).
      const soft = clamp(
        viewportLinearDepth
          .sub(viewZToOrthographicDepth(positionView.z, cameraNear, cameraFar))
          .mul(cameraFar.sub(cameraNear))
          .div(3.0),
        0,
        1,
      );
      mat.opacityNode = smoothstep(1.0, 0.05, d).mul(abs(drift).mul(0.5).add(0.25)).mul(0.5).mul(soft);
    }
    this.mats.push(mat);
    const geo = new THREE.CircleGeometry(1, water ? 28 : 36);
    geo.rotateX(-Math.PI / 2);
    this.geos.push(geo);
    for (const w of list) {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(w.x, w.y, w.z);
      m.scale.setScalar(w.r);
      m.name = water ? 'tc-nuoc' : 'tc-suong';
      m.renderOrder = water ? 1 : 2;
      this.group.add(m);
    }
  }

  dispose(): void {
    for (const g of this.geos) g.dispose();
    for (const m of this.mats) m.dispose();
  }
}
