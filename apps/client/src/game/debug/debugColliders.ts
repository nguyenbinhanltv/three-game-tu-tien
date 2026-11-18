import * as THREE from 'three/webgpu';
import { COLLIDERS, type CircleCollider } from '@dtl/shared';
import { groundAt } from '../../base/levelCtx';

/**
 * Khung va chạm cho bảng gỡ lỗi F3: vẽ các hình tròn collider tĩnh mà `stepMove` (dùng chung client/server) đang chặn,
 * ngay trên mặt đất, kèm một cọc đứng ở tâm để thấy từ xa. Chỉ là lớp hiển thị: không đổi va chạm, không gửi gì lên server.
 *
 * Một `LineSegments` (1 draw call) cho mọi collider trong `RANGE` mét quanh người chơi; dựng lại khi đi quá `REBUILD` mét.
 * Bộ đệm cấp một lần theo sức chứa, vẽ bằng `setDrawRange` (không thay buffer sau khi đã vẽ; chỉ `needsUpdate` + update range).
 */
const RANGE = 220;
const REBUILD = 60;
const SEGMENTS = 28;
const LIFT = 0.25;
const POST = 3;
/** Số đỉnh mỗi collider: vòng tròn (2 đỉnh/đoạn) + cọc đứng (2 đỉnh). */
const VERTS_PER = SEGMENTS * 2 + 2;

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
  private readonly lines: THREE.LineSegments;
  private readonly pos: THREE.BufferAttribute;
  private cx = Infinity;
  private cz = Infinity;

  constructor(private readonly list: readonly CircleCollider[] = COLLIDERS) {
    const geo = new THREE.BufferGeometry();
    this.pos = new THREE.BufferAttribute(new Float32Array(Math.max(1, list.length) * VERTS_PER * 3), 3);
    geo.setAttribute('position', this.pos);
    geo.setDrawRange(0, 0);
    const mat = new THREE.LineBasicMaterial({ color: 0xff5ad1, transparent: true, opacity: 0.95, depthTest: false, fog: false, toneMapped: false });
    this.lines = new THREE.LineSegments(geo, mat);
    this.lines.frustumCulled = false;
    this.lines.renderOrder = 9;
    this.lines.name = 'debug-colliders';
    this.lines.raycast = () => {};
    this.group.add(this.lines);
  }

  /** Số collider đang vẽ. */
  get count(): number {
    return this.lines.geometry.drawRange.count / VERTS_PER;
  }

  update(x: number, z: number): void {
    if (Math.hypot(x - this.cx, z - this.cz) < REBUILD) return;
    this.cx = x;
    this.cz = z;
    const arr = this.pos.array as Float32Array;
    let at = 0;
    for (const c of collidersNear(this.list, x, z)) at = writeCollider(arr, at, c, groundAt);
    this.pos.clearUpdateRanges();
    this.pos.addUpdateRange(0, at);
    this.pos.needsUpdate = true;
    this.lines.geometry.setDrawRange(0, at / 3);
  }

  dispose(): void {
    this.group.removeFromParent();
    this.lines.geometry.dispose();
    (this.lines.material as THREE.Material).dispose();
  }
}
