import * as THREE from 'three/webgpu';

/**
 * Xương lò xo đơn giản (M3-10) cho vạt áo: mỗi xương là một hạt ở đuôi, tích phân Verlet trong hệ thế giới.
 *
 * - Lò xo kéo hạt về đuôi lúc nghỉ (theo xương cha đang chuyển động), cản theo vận tốc so với không khí đứng yên nên
 *   khi chạy đều vạt áo bị gió đẩy ra sau một đoạn cố định (≈ cản · v / cứng), dừng lại thì vung tới rồi lắng.
 * - Giới hạn góc lệch so với hướng nghỉ, và hạn chế phần lệch vào trong (về phía trục thân) để vạt không xuyên chân.
 * - Chỉ chạy ở LOD0 và khi trong khung nhìn (SkinnedCharacter gọi); về LOD xa thì xương trả về tư thế nghỉ.
 * - Đơn vị theo mét thế giới; hằng số theo giây nên không phụ thuộc tốc độ khung.
 */
export interface SpringParams {
  /** Độ cứng (1/s²): tần số riêng ≈ √k / 2π. */
  stiffness: number;
  /** Cản theo vận tốc (1/s). */
  drag: number;
  /** Góc lệch tối đa so với hướng nghỉ (độ). */
  maxAngle: number;
  /** Góc lệch tối đa vào trong, về phía trục thân (độ). */
  maxInward: number;
}

export const SKIRT_SPRING: SpringParams = { stiffness: 150, drag: 6, maxAngle: 42, maxInward: 10 };

/** Viên nang va chạm (hông/đùi/cẳng): đoạn a→b theo hai node (hệ thế giới), bán kính `r` (m). Đầu lò xo bị đẩy ra ngoài. */
export interface SpringCollider {
  a: THREE.Object3D;
  b: THREE.Object3D;
  r: number;
  /** Viên nang không co giãn theo `rScale` (tay): chỉ thân/đùi/cẳng phình ra khi ngồi để vạt nằm lên trên. */
  fixed?: boolean;
}

const _ca = new THREE.Vector3();
const _cb = new THREE.Vector3();
const _cd = new THREE.Vector3();

/**
 * Đẩy điểm `p` ra ngoài viên nang a→b bán kính r (sửa trực tiếp `p`). Trả true nếu có đẩy. `fallback`: hướng đẩy khi p nằm đúng trên trục.
 */
export function pushOutCapsule(p: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3, r: number, fallback: THREE.Vector3): boolean {
  _cb.subVectors(b, a);
  const len2 = _cb.lengthSq();
  const t = len2 > 1e-12 ? Math.min(1, Math.max(0, _cd.subVectors(p, a).dot(_cb) / len2)) : 0;
  _ca.copy(a).addScaledVector(_cb, t); // điểm gần nhất trên trục
  _cd.subVectors(p, _ca);
  const d = _cd.length();
  if (d >= r) return false;
  if (d < 1e-6) _cd.copy(fallback);
  else _cd.divideScalar(d);
  p.copy(_ca).addScaledVector(_cd, r);
  return true;
}

export interface SpringDef {
  bone: string;
  /** Đuôi xương trong hệ cục bộ của xương lúc nghỉ. */
  tailLocal: THREE.Vector3;
  /** Hệ số độ cứng của riêng xương này (mặc định 1): gấu vạt cứng hơn thì ít rách khi lăn/chém xoay. */
  stiff?: number;
}

/** dt lớn hơn thế này (khung giật, tab ẩn) thì chia nhỏ, quá xa thì đặt lại. */
const MAX_STEP = 1 / 30;
/** Nhảy quá xa trong một khung (dịch chuyển tức thời, hồi sinh) thì đặt lại thay vì để vạt áo văng. */
const TELEPORT = 3;

interface Bone {
  bone: THREE.Bone;
  parent: THREE.Object3D;
  restQ: THREE.Quaternion;
  restM: THREE.Matrix4;
  tail: THREE.Vector3;
  k: number;
  p: THREE.Vector3;
  prev: THREE.Vector3;
  head: THREE.Vector3;
}

const _m = new THREE.Matrix4();
const _w = new THREE.Matrix4();
const _head = new THREE.Vector3();
const _target = new THREE.Vector3();
const _rest = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _vel = new THREE.Vector3();
const _out = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _pq = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _t = new THREE.Vector3();
const _axis = new THREE.Vector3();
const _center = new THREE.Vector3();

export class SpringBones {
  private bones: Bone[] = [];
  /** Hai đầu mỗi viên nang trong hệ thế giới, tính một lần mỗi `update` (không đổi giữa các xương và bước con). */
  private capA: THREE.Vector3[] = [];
  private capB: THREE.Vector3[] = [];
  private live = false;

  /** `rig`: cây xương của bản sao. Phía "trong" tính theo xương cha (hông) của từng xương lò xo. */
  constructor(
    rig: THREE.Object3D,
    defs: readonly SpringDef[],
    private params: SpringParams = SKIRT_SPRING,
    /** Viên nang va chạm (chỉ dùng khi xương lò xo và collider cùng hệ thế giới sau `update` của mixer). */
    private colliders: readonly SpringCollider[] = [],
  ) {
    for (let i = 0; i < colliders.length; i++) {
      this.capA.push(new THREE.Vector3());
      this.capB.push(new THREE.Vector3());
    }
    for (const d of defs) {
      const bone = rig.getObjectByName(d.bone) as THREE.Bone | undefined;
      if (!bone?.isBone || !bone.parent) continue;
      this.bones.push({
        bone,
        parent: bone.parent,
        restQ: bone.quaternion.clone(),
        restM: bone.matrix.clone(),
        tail: d.tailLocal.clone(),
        k: d.stiff ?? 1,
        p: new THREE.Vector3(),
        prev: new THREE.Vector3(),
        head: new THREE.Vector3(),
      });
    }
  }

  get count(): number {
    return this.bones.length;
  }

  /**
   * Một bước mô phỏng. `world`: ma trận hệ nhân vật → thế giới (root); xương cha đã cập nhật ma trận (sau mixer).
   * Ghi quaternion cục bộ của xương lò xo rồi cập nhật ma trận của chúng (là lá, không có con).
   */
  update(dt: number, world: THREE.Matrix4, rScale = 1): void {
    if (dt <= 0 || this.bones.length === 0) return;
    const steps = Math.min(4, Math.ceil(dt / MAX_STEP));
    const h = dt / steps;
    const { stiffness, drag, maxAngle, maxInward } = this.params;
    const keep = Math.exp(-drag * h);
    for (let i = 0; i < this.colliders.length; i++) {
      this.capA[i].setFromMatrixPosition(_m.multiplyMatrices(world, this.colliders[i].a.matrixWorld));
      this.capB[i].setFromMatrixPosition(_m.multiplyMatrices(world, this.colliders[i].b.matrixWorld));
    }
    const cosMax = Math.cos((maxAngle * Math.PI) / 180);
    const sinIn = Math.sin((maxInward * Math.PI) / 180);
    for (const b of this.bones) {
      // Xương ở tư thế nghỉ theo cha hiện tại, trong hệ thế giới.
      _w.multiplyMatrices(world, b.parent.matrixWorld).multiply(b.restM);
      _head.setFromMatrixPosition(_w);
      _target.copy(b.tail).applyMatrix4(_w);
      _rest.subVectors(_target, _head);
      const len = _rest.length();
      if (len < 1e-5) continue;
      _rest.divideScalar(len);
      if (!this.live || b.head.distanceToSquared(_head) > TELEPORT * TELEPORT) {
        b.p.copy(_target);
        b.prev.copy(_target);
      }
      b.head.copy(_head);
      // Trục thân: hướng "ra ngoài" của vạt áo = phần ngang của hướng từ trục xương cha tới đuôi lúc nghỉ.
      _center.setFromMatrixPosition(_m.multiplyMatrices(world, b.parent.matrixWorld));
      _out.subVectors(_target, _center).setY(0);
      const outLen = _out.length();
      if (outLen > 1e-5) _out.divideScalar(outLen);
      for (let i = 0; i < steps; i++) {
        _vel.subVectors(b.p, b.prev).multiplyScalar(keep);
        b.prev.copy(b.p);
        b.p.add(_vel).addScaledVector(_dir.subVectors(_target, b.p), stiffness * b.k * h * h);
        // Giữ độ dài xương, giới hạn góc và phần lệch vào trong.
        _dir.subVectors(b.p, _head).normalize();
        const c = _dir.dot(_rest);
        if (c < cosMax) {
          _axis.copy(_dir).addScaledVector(_rest, -c);
          if (_axis.lengthSq() < 1e-10) _dir.copy(_rest);
          else
            _dir
              .copy(_rest)
              .multiplyScalar(cosMax)
              .addScaledVector(_axis.normalize(), Math.sqrt(1 - cosMax * cosMax));
        }
        if (outLen > 1e-5) {
          const inward = -(_dir.dot(_out) - _rest.dot(_out));
          if (inward > sinIn) _dir.addScaledVector(_out, inward - sinIn).normalize();
        }
        b.p.copy(_head).addScaledVector(_dir, len);
        // Va chạm hông/đùi/cẳng: đẩy đầu lò xo ra ngoài viên nang rồi giữ lại độ dài xương (vạt không xuyên chân khi ngồi, bước dài).
        if (this.colliders.length) {
          let hit = false;
          for (let ci = 0; ci < this.colliders.length; ci++) {
            if (
              pushOutCapsule(
                b.p,
                this.capA[ci],
                this.capB[ci],
                this.colliders[ci].fixed ? this.colliders[ci].r : this.colliders[ci].r * rScale,
                _out,
              )
            )
              hit = true;
          }
          if (hit) {
            _dir.subVectors(b.p, _head).normalize();
            b.p.copy(_head).addScaledVector(_dir, len);
          }
        }
      }
      // Quay xương: từ hướng nghỉ sang hướng mô phỏng (thế giới), đổi về hệ cục bộ của cha.
      _dir.subVectors(b.p, _head).normalize();
      _q.setFromUnitVectors(_rest, _dir);
      _m.multiplyMatrices(world, b.parent.matrixWorld).decompose(_t, _pq, _s);
      // local = cha⁻¹ · delta · cha · nghỉ
      b.bone.quaternion.copy(_pq).invert().multiply(_q).multiply(_pq).multiply(b.restQ);
      b.bone.updateMatrixWorld();
    }
    this.live = true;
  }

  /** Về tư thế nghỉ (LOD xa, ngoài khung nhìn); lần chạy sau bắt đầu lại từ đuôi lúc nghỉ. Trả true nếu xương đã đổi. */
  reset(): boolean {
    if (!this.live) return false;
    this.live = false;
    for (const b of this.bones) {
      b.bone.quaternion.copy(b.restQ);
      b.bone.updateMatrixWorld();
    }
    return true;
  }
}

/** Đuôi xương lò xo trong hệ cục bộ của xương, từ tọa độ lúc nghỉ (hệ của asset) trong extras. */
export function springDefs(template: THREE.Object3D, springs: readonly { bone: string; tail: number[] }[]): SpringDef[] {
  template.updateMatrixWorld(true);
  const toScene = template.matrixWorld.clone().invert();
  const out: SpringDef[] = [];
  for (const s of springs) {
    const bone = template.getObjectByName(s.bone);
    if (!(bone as THREE.Bone | undefined)?.isBone) continue;
    const inv = toScene.clone().multiply(bone!.matrixWorld).invert();
    out.push({ bone: s.bone, tailLocal: new THREE.Vector3(s.tail[0], s.tail[1], s.tail[2]).applyMatrix4(inv) });
  }
  return out;
}
