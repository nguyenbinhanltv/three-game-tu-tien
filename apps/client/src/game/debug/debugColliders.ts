import * as THREE from 'three/webgpu';
import { type CircleCollider, shapeMaxTop, type Shape } from '@dtl/shared';
import { groundAt, levelId, levelTerrain } from '../../base/levelCtx';

/** Loại hiển thị, mỗi loại một màu (và một `LineSegments`): vòng tròn cũ hồng; hộp/trụ chặn cyan; mặt đi được lục; xuyên được khi ngự kiếm (tán lá, đồ nhỏ) vàng. (`vertexColors` không chạy trên WebGPU nên tách theo màu.) */
export type VizKind = 'circle' | 'block' | 'walk' | 'pass';
const KIND_COLOR: Record<VizKind, number> = { circle: 0xff5ad1, block: 0x33e6ff, walk: 0x59ff66, pass: 0xffe64d };
const KINDS = Object.keys(KIND_COLOR) as VizKind[];
/** Số hình 3D tối đa vẽ cùng lúc (cấp bộ đệm một lần). */
const MAX_SHAPES = 1200;
const SHAPE_VERTS = 24 + 16 * 4; // hộp: 12 cạnh; trụ: hai vòng 16 đoạn + 4 gân (đủ chỗ cho cả hai)

/** Hình 3D nằm trong tầm vẽ quanh (x, z), tính cả cỡ. */
export function shapesNear(list: readonly Shape[], x: number, z: number, range = RANGE): Shape[] {
  return list.filter((s) => Math.hypot(s.x - x, s.z - z) - (s.k === 'cyl' ? s.r : Math.hypot(s.hx, s.hz)) <= range);
}

export function shapeKind(s: Shape): VizKind {
  if (s.fly === 'pass') return 'pass';
  if (s.k === 'box' && s.walk !== false) return 'walk';
  return 'block';
}

/** Ghi khung dây của một hình 3D (hộp xoay: 12 cạnh; trụ: hai vòng + 4 gân) vào `out`, trả vị trí kế tiếp (đơn vị float). */
export function writeShape(out: Float32Array, at: number, s: Shape): number {
  let i = at;
  const put = (x: number, y: number, z: number): void => {
    out[i] = x;
    out[i + 1] = y;
    out[i + 2] = z;
    i += 3;
  };
  const top = shapeMaxTop(s);
  if (s.k === 'cyl') {
    const N = 16;
    for (const y of [s.y0, top])
      for (let k = 0; k < N; k++) {
        const a = (k / N) * Math.PI * 2;
        const b = ((k + 1) / N) * Math.PI * 2;
        put(s.x + Math.cos(a) * s.r, y, s.z + Math.sin(a) * s.r);
        put(s.x + Math.cos(b) * s.r, y, s.z + Math.sin(b) * s.r);
      }
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2;
      put(s.x + Math.cos(a) * s.r, s.y0, s.z + Math.sin(a) * s.r);
      put(s.x + Math.cos(a) * s.r, top, s.z + Math.sin(a) * s.r);
    }
    return i;
  }
  const cs = Math.cos(s.yaw);
  const sn = Math.sin(s.yaw);
  // Góc cục bộ (-,-), (+,-), (+,+), (-,+) → thế giới (cùng phép quay với `CollisionSet`).
  const corner = (k: number): [number, number] => {
    const lx = k === 1 || k === 2 ? s.hx : -s.hx;
    const lz = k >= 2 ? s.hz : -s.hz;
    return [s.x + cs * lx + sn * lz, s.z - sn * lx + cs * lz];
  };
  const yTop = (k: number): number => (s.y1b !== undefined && k >= 2 ? s.y1b : s.y1);
  for (let k = 0; k < 4; k++) {
    const [ax, az] = corner(k);
    const [bx, bz] = corner((k + 1) % 4);
    put(ax, s.y0, az);
    put(bx, s.y0, bz);
    put(ax, yTop(k), az);
    put(bx, yTop((k + 1) % 4), bz);
    put(ax, s.y0, az);
    put(ax, yTop(k), az);
  }
  return i;
}

/**
 * Khung va chạm cho bảng gỡ lỗi F3: vẽ các hình tròn collider tĩnh mà `stepMove` (dùng chung client/server) đang chặn,
 * ngay trên mặt đất, kèm một cọc đứng ở tâm để thấy từ xa. Chỉ là lớp hiển thị: không đổi va chạm, không gửi gì lên server.
 *
 * Một `LineSegments` (1 draw call) cho mọi collider (vòng tròn cũ + hộp xoay/trụ/mặt đi được của `Terrain.collision`, COL-1) trong `RANGE` mét quanh người chơi; dựng lại khi đi quá `REBUILD` mét.
 * Bộ đệm cấp một lần theo sức chứa, vẽ bằng `setDrawRange` (không thay buffer sau khi đã vẽ; chỉ `needsUpdate` + update range).
 */
const RANGE = 220;
const REBUILD = 60;
const SEGMENTS = 28;
const LIFT = 0.25;
const POST = 3;
/** Số đỉnh mỗi collider: vòng tròn (2 đỉnh/đoạn) + cọc đứng (2 đỉnh). */
const VERTS_PER = SEGMENTS * 2 + 2;
/** Số collider vòng tròn tối đa vẽ cùng lúc. */
const MAX_CIRCLES = 600;

/** Collider nằm trong tầm vẽ quanh (x, z), tính cả bán kính. */
export function collidersNear(list: readonly CircleCollider[], x: number, z: number, range = RANGE): CircleCollider[] {
  return list.filter((c) => Math.hypot(c.x - x, c.z - z) - c.r <= range);
}

/** Ghi đỉnh của một collider vào `out` từ vị trí `at` (số float), trả vị trí kế tiếp. */
export function writeCollider(out: Float32Array, at: number, c: CircleCollider, heightAt: (x: number, z: number) => number): number {
  let i = at;
  const put = (a: number): void => {
    const x = c.x + Math.cos(a) * c.r;
    const z = c.z + Math.sin(a) * c.r;
    out[i++] = x;
    out[i++] = heightAt(x, z) + LIFT;
    out[i++] = z;
  };
  for (let k = 0; k < SEGMENTS; k++) {
    put((k / SEGMENTS) * Math.PI * 2);
    put(((k + 1) / SEGMENTS) * Math.PI * 2);
  }
  const y = heightAt(c.x, c.z);
  out[i++] = c.x;
  out[i++] = y + LIFT;
  out[i++] = c.z;
  out[i++] = c.x;
  out[i++] = y + LIFT + POST;
  out[i++] = c.z;
  return i;
}

export class ColliderViz {
  readonly group = new THREE.Group();
  private readonly layers = {} as Record<VizKind, { lines: THREE.LineSegments; pos: THREE.BufferAttribute }>;
  private cx = Infinity;
  private cz = Infinity;
  private lv = '';
  /** Số hình (vòng + 3D) đang vẽ. */
  circles = 0;
  shapes = 0;

  constructor() {
    for (const kind of KINDS) {
      const geo = new THREE.BufferGeometry();
      const cap = kind === 'circle' ? MAX_CIRCLES * VERTS_PER : MAX_SHAPES * SHAPE_VERTS;
      const pos = new THREE.BufferAttribute(new Float32Array(cap * 3), 3);
      geo.setAttribute('position', pos);
      geo.setDrawRange(0, 0);
      const mat = new THREE.LineBasicMaterial({ color: KIND_COLOR[kind], transparent: true, opacity: 0.95, depthTest: false, fog: false, toneMapped: false });
      const lines = new THREE.LineSegments(geo, mat);
      lines.frustumCulled = false;
      lines.renderOrder = 9;
      lines.name = 'debug-colliders-' + kind;
      lines.raycast = () => {};
      this.group.add(lines);
      this.layers[kind] = { lines, pos };
    }
  }

  /** Số hình đang vẽ (vòng tròn + hình 3D). */
  get count(): number {
    return this.circles + this.shapes;
  }

  update(x: number, z: number): void {
    const lv = levelId();
    if (lv === this.lv && Math.hypot(x - this.cx, z - this.cz) < REBUILD) return;
    this.lv = lv;
    this.cx = x;
    this.cz = z;
    const terrain = levelTerrain();
    const at: Record<VizKind, number> = { circle: 0, block: 0, walk: 0, pass: 0 };
    const circles = collidersNear(terrain.colliders, x, z).slice(0, MAX_CIRCLES);
    const cArr = this.layers.circle.pos.array as Float32Array;
    for (const c of circles) at.circle = writeCollider(cArr, at.circle, c, groundAt);
    const shapes = shapesNear(terrain.collision.shapes, x, z).slice(0, MAX_SHAPES);
    const room = { block: 0, walk: 0, pass: 0 };
    for (const sh of shapes) {
      const k = shapeKind(sh) as Exclude<VizKind, 'circle'>;
      if (room[k] >= MAX_SHAPES) continue;
      room[k]++;
      at[k] = writeShape(this.layers[k].pos.array as Float32Array, at[k], sh);
    }
    this.circles = circles.length;
    this.shapes = shapes.length;
    for (const k of KINDS) {
      const l = this.layers[k];
      l.pos.clearUpdateRanges();
      l.pos.addUpdateRange(0, at[k]);
      l.pos.needsUpdate = true;
      l.lines.geometry.setDrawRange(0, at[k] / 3);
    }
  }

  dispose(): void {
    this.group.removeFromParent();
    for (const k of KINDS) {
      this.layers[k].lines.geometry.dispose();
      (this.layers[k].lines.material as THREE.Material).dispose();
    }
  }
}
