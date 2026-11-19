// Chân bám đất và bước chân khi xoay tại chỗ cho nhân vật v3 (bộ xương UE5 Mannequin; NV3-A2). Chạy SAU mixer:
//  - Bám dốc/bậc: đo cổ chân của clip, lấy chênh lệch độ cao mặt đất dưới từng chân so với dưới thân, hạ hông theo chân thấp
//    rồi IK hai đốt đưa mỗi cổ chân tới mặt đất (cùng cách của `SkinnedCharacter.groundFeet` trên xương Mixamo).
//  - Xoay tại chỗ: khi đứng yên, mỗi bàn chân bị khóa trong thế giới (vị trí + hướng); thân xoay quá ~40° so với chỗ khóa
//    thì chân đó nhấc lên bước (cung 7 cm) tới tư thế mới của clip, rồi khóa lại. Không bake clip: chân đứng yên trong thế giới
//    nên trượt chân bằng 0 theo cách dựng, khác bước tại chỗ dựng từ Walk (chân trụ trượt gấp nhiều lần).
// Hàm thuần ở đầu file để test.
import * as THREE from 'three/webgpu';
import { groundAt as terrainGround } from '../../base/levelCtx';
import { refreshWorld, solveLeg } from './ikpose';

export const FEET = {
  /** Góc thân lệch so với chỗ khóa (rad) thì chân bước (~40°). */
  stepAngle: 0.7,
  /** Hoặc khoảng cách ngang (m) giữa chỗ khóa và chỗ clip muốn. */
  stepDist: 0.3,
  stepTime: 0.26,
  /** Độ nhấc bàn chân giữa bước (m). */
  lift: 0.07,
  /** Nghỉ giữa hai bước (s). */
  gap: 0.1,
  /** Hạ hông tối đa theo chiều cao nhân vật; nâng tối đa 40% mức đó. */
  hipLim: 0.25,
  rate: 14,
};

export const wrapAngle = (a: number): number => {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
};

/** Chân có cần bước không: thân xoay lệch chỗ khóa quá ngưỡng hoặc chỗ khóa xa chỗ clip muốn. */
export const needStep = (angErr: number, dist: number): boolean => Math.abs(angErr) > FEET.stepAngle || dist > FEET.stepDist;

/** Độ nhấc bàn chân tại tiến độ bước u ∈ [0,1]. */
export const stepArc = (u: number, lift = FEET.lift): number => Math.sin(Math.PI * Math.min(1, Math.max(0, u))) * lift;

const ease = (u: number): number => u * u * (3 - 2 * u);

/** Độ dịch hông (m, âm = hạ) theo chân thấp hơn; nâng tối đa 40% mức hạ tối đa để chân thấp không duỗi quá tầm. */
export const hipDrop = (dR: number, dL: number, lim: number): number => Math.max(-lim, Math.min(lim * 0.4, Math.min(dR, dL)));

interface Leg {
  up: THREE.Bone;
  mid: THREE.Bone;
  foot: THREE.Bone;
  knee: THREE.Vector3;
  pos: THREE.Vector3;
  quat: THREE.Quaternion;
  /** Chỗ khóa trong thế giới; `has` false khi đang đi. */
  plant: { has: boolean; p: THREE.Vector3; q: THREE.Quaternion; yaw: number; ankle: number };
  step: { t: number; from: THREE.Vector3; fromQ: THREE.Quaternion } | null;
  tgt: THREE.Vector3;
  endQ: THREE.Quaternion;
}

const _v = new THREE.Vector3();
const _m3 = new THREE.Matrix3();
const _s = new THREE.Vector3();

export interface FeetState {
  /** Đứng trên đất, không chết/ngồi/bay/thiền: bật bám đất. */
  active: boolean;
  /** Đứng yên (khóa chân khi xoay). */
  standing: boolean;
}

export class MqFeet {
  private legs: Leg[];
  private pelvis: THREE.Bone;
  private bones: THREE.Bone[];
  private pre: THREE.Quaternion[];
  private post: THREE.Quaternion[];
  private pelPre = new THREE.Vector3();
  private pelPost = new THREE.Vector3();
  private ik = false;
  private w = 0;
  private pin = 0;
  private hip = 0;
  private cool = 0;
  private ds = [0, 0];
  /** Số lần bước chân từ lúc tạo (đo/kiểm). */
  steps = 0;

  private constructor(
    private root: THREE.Object3D,
    pelvis: THREE.Bone,
    legs: Leg[],
    private lim: number,
  ) {
    this.pelvis = pelvis;
    this.legs = legs;
    this.bones = legs.flatMap((l) => [l.up, l.mid, l.foot]);
    this.pre = this.bones.map(() => new THREE.Quaternion());
    this.post = this.bones.map(() => new THREE.Quaternion());
  }

  /** null nếu thiếu xương hoặc chuỗi chân không là pelvis → thigh → calf → foot. */
  static from(rig: THREE.Object3D, root: THREE.Object3D, height: number): MqFeet | null {
    const get = (n: string) => rig.getObjectByName(n) as THREE.Bone | undefined;
    const pelvis = get('pelvis');
    if (!pelvis) return null;
    const legs: Leg[] = [];
    for (const s of ['l', 'r']) {
      const up = get(`thigh_${s}`);
      const mid = get(`calf_${s}`);
      const foot = get(`foot_${s}`);
      if (!up || !mid || !foot || up.parent !== pelvis || mid.parent !== up || foot.parent !== mid) return null;
      legs.push({
        up,
        mid,
        foot,
        knee: new THREE.Vector3(),
        pos: new THREE.Vector3(),
        quat: new THREE.Quaternion(),
        plant: { has: false, p: new THREE.Vector3(), q: new THREE.Quaternion(), yaw: 0, ankle: 0 },
        step: null,
        tgt: new THREE.Vector3(),
        endQ: new THREE.Quaternion(),
      });
    }
    return new MqFeet(root, pelvis, legs, FEET.hipLim * height);
  }

  /** Số chân đang bước (cho test). */
  get stepping(): number {
    return this.legs.filter((l) => l.step).length;
  }

  /** Mọi chân đang khóa (cho test). */
  get planted(): boolean {
    return this.legs.every((l) => l.plant.has);
  }

  private undo(): void {
    if (!this.ik) return;
    this.ik = false;
    for (let i = 0; i < this.bones.length; i++)
      if (this.bones[i]!.quaternion.equals(this.post[i]!)) this.bones[i]!.quaternion.copy(this.pre[i]!);
    if (this.pelvis.position.equals(this.pelPost)) this.pelvis.position.copy(this.pelPre);
  }

  /** Thôi bám đất (trả hông và xương chân về chỗ cũ, quên chỗ khóa). */
  release(): void {
    this.undo();
    this.hip = 0;
    for (const l of this.legs) {
      l.plant.has = false;
      l.step = null;
    }
  }

  /**
   * Gọi ngay sau `mixer.update` (và lớp phụ), trước lò xo. `ground` mặc định là địa hình của level; sau này đổi sang mặt đi được hiệu dụng
   * (bậc thang, sàn kiến trúc của COL-1) mà không cần sửa chỗ khác.
   */
  update(dt: number, st: FeetState, ground: (x: number, z: number) => number = terrainGround): void {
    const want = st.active ? 1 : 0;
    this.w += Math.sign(want - this.w) * Math.min(Math.abs(want - this.w), dt * 6);
    if (this.w <= 0.001) {
      if (this.ik || this.legs[0]!.plant.has) this.release();
      this.pin = 0;
      return;
    }
    this.undo();
    this.root.updateMatrixWorld(true);
    const wantPin = st.standing && st.active ? 1 : 0;
    const oldPin = this.pin;
    this.pin += Math.sign(wantPin - this.pin) * Math.min(Math.abs(wantPin - this.pin), dt * 8);
    const yaw = this.root.rotation.y;
    const rp = this.root.position;
    const base = ground(rp.x, rp.z);
    this.cool -= dt;

    // 1. Đo cổ chân của clip (thế giới).
    for (const l of this.legs) {
      refreshWorld(l.up);
      refreshWorld(l.mid);
      refreshWorld(l.foot);
      l.foot.matrixWorld.decompose(l.pos, l.quat, _s);
      l.knee.setFromMatrixPosition(l.mid.matrixWorld).sub(_v.setFromMatrixPosition(l.up.matrixWorld));
    }
    // 2. Khóa/mở khóa chân theo trạng thái đứng yên.
    if (wantPin && !this.legs[0]!.plant.has && oldPin <= 0.001) {
      for (const l of this.legs) this.plantAt(l, l.pos, l.quat, yaw, base);
    }
    if (!wantPin && this.pin <= 0.001) {
      for (const l of this.legs) {
        l.plant.has = false;
        l.step = null;
      }
    }
    // 3. Bước chân: chân lệch nhiều nhất bước trước, mỗi lúc một chân.
    if (this.pin > 0.5 && this.planted && this.stepping === 0 && this.cool <= 0) {
      let best: Leg | null = null;
      let be = 0;
      for (const l of this.legs) {
        const ang = wrapAngle(yaw - l.plant.yaw);
        const dist = Math.hypot(l.plant.p.x - l.pos.x, l.plant.p.z - l.pos.z);
        if (needStep(ang, dist)) {
          const e = Math.abs(ang) + dist;
          if (e > be) {
            best = l;
            be = e;
          }
        }
      }
      if (best) {
        best.step = { t: 0, from: best.plant.p.clone(), fromQ: best.plant.q.clone() };
        this.steps++;
      }
    }
    // 4. Hông theo chân thấp, đích của từng chân.
    const lim = this.lim;
    this.legs.forEach((l, i) => (this.ds[i] = ground(l.pos.x, l.pos.z) - base));
    const h = hipDrop(this.ds[0]!, this.ds[1]!, lim) * this.w;
    this.hip += (h - this.hip) * Math.min(1, dt * FEET.rate);
    this.pelPre.copy(this.pelvis.position);
    if (Math.abs(this.hip) > 1e-5) this.pelvisShift(this.hip);
    this.legs.forEach((l, i) => {
      const dy = Math.max(-lim, Math.min(lim, this.ds[i]!)) * this.w;
      l.tgt.copy(l.pos);
      l.tgt.y += dy;
      l.endQ.copy(l.quat);
      if (l.step) {
        const s = l.step;
        s.t += dt / FEET.stepTime;
        const u = Math.min(1, s.t);
        const e = ease(u);
        l.tgt.x = s.from.x + (l.pos.x - s.from.x) * e;
        l.tgt.z = s.from.z + (l.pos.z - s.from.z) * e;
        l.tgt.y = ground(l.tgt.x, l.tgt.z) + l.plant.ankle + stepArc(u);
        l.endQ.copy(s.fromQ).slerp(l.quat, e);
        if (u >= 1) {
          l.step = null;
          this.plantAt(l, l.pos, l.quat, yaw, base);
          this.cool = FEET.gap;
        }
      } else if (l.plant.has && this.pin > 0.001) {
        const p = l.plant;
        _v.set(p.p.x, ground(p.p.x, p.p.z) + p.ankle, p.p.z);
        l.tgt.lerp(_v, this.pin);
        l.endQ.slerp(p.q, this.pin);
      }
    });
    // 5. IK.
    this.pelvis.updateWorldMatrix(true, false);
    for (let i = 0; i < this.bones.length; i++) this.pre[i]!.copy(this.bones[i]!.quaternion);
    for (const l of this.legs) {
      refreshWorld(l.up);
      refreshWorld(l.mid);
      refreshWorld(l.foot);
      solveLeg(l.up, l.mid, l.foot, l.tgt, l.knee, l.endQ);
    }
    for (let i = 0; i < this.bones.length; i++) this.post[i]!.copy(this.bones[i]!.quaternion);
    this.pelPost.copy(this.pelvis.position);
    this.ik = true;
  }

  /** Khóa chân tại `p`; `ankle` = độ cao cổ chân của clip so với mặt đất dưới THÂN (không phải dưới chân, để dốc không bị tính hai lần). */
  private plantAt(l: Leg, p: THREE.Vector3, q: THREE.Quaternion, yaw: number, base: number): void {
    l.plant.has = true;
    l.plant.p.copy(p);
    l.plant.q.copy(q);
    l.plant.yaw = yaw;
    l.plant.ankle = p.y - base;
  }

  /** Dịch hông `dy` mét (thế giới, theo trục đứng) bằng cách sửa vị trí cục bộ của xương pelvis. */
  private pelvisShift(dy: number): void {
    const par = this.pelvis.parent!;
    par.updateWorldMatrix(true, false);
    _m3.setFromMatrix4(par.matrixWorld).invert();
    this.pelvis.position.add(_v.set(0, dy, 0).applyMatrix3(_m3));
    this.pelvis.updateWorldMatrix(false, false);
  }
}
