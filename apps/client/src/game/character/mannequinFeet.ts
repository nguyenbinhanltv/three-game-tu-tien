// Chân bám đất và bước chân khi xoay tại chỗ cho nhân vật v3 (bộ xương UE5 Mannequin; NV3-A2). Chạy SAU mixer:
//  - Bám dốc/bậc: đo cổ chân của clip, lấy chênh lệch độ cao mặt đất dưới từng chân so với dưới thân, hạ hông theo chân thấp
//    rồi IK hai đốt đưa mỗi cổ chân tới mặt đất (cùng cách của `SkinnedCharacter.groundFeet` trên xương Mixamo).
//  - Xoay tại chỗ: khi đứng yên, mỗi bàn chân bị khóa trong thế giới (vị trí + hướng); thân xoay quá ~40° so với chỗ khóa
//    thì chân đó nhấc lên bước (cung 7 cm) tới tư thế mới của clip, rồi khóa lại. Không bake clip: chân đứng yên trong thế giới
//    nên trượt chân bằng 0 theo cách dựng, khác bước tại chỗ dựng từ Walk (chân trụ trượt gấp nhiều lần).
// Hàm thuần ở đầu file để test.
import * as THREE from 'three/webgpu';
import { collisionOf, STEP_UP } from '@dtl/shared';
import { groundAt as terrainGround, levelId } from '../../base/levelCtx';
import { refreshWorld, solveLeg } from './ikpose';

export const FEET = {
  /** Góc thân lệch so với chỗ khóa (rad) thì chân bước (~40°). */
  stepAngle: 0.7,
  /** Hoặc khoảng cách ngang (m) giữa chỗ khóa và chỗ clip muốn. */
  stepDist: 0.3,
  /** Chỗ khóa cách chân clip quá mức này (m) là thân đã nhảy xa: khóa lại, không bước. */
  jump: 1,
  stepTime: 0.26,
  /** Độ nhấc bàn chân giữa bước (m). */
  lift: 0.07,
  /** Nghỉ giữa hai bước (s). */
  gap: 0.1,
  /** Hạ hông tối đa theo chiều cao nhân vật; nâng tối đa 40% mức đó. */
  hipLim: 0.25,
  rate: 14,
  /** Góc nghiêng bàn chân tối đa theo pháp tuyến mặt đất (rad, ~20°). */
  tiltMax: 0.35,
  /** Nửa bước lấy mẫu pháp tuyến (m, cỡ nửa bàn chân). */
  tiltStep: 0.12,
  /** Mẫu chênh quá mức này (m) trên một nửa bước là mép bậc, không phải dốc: bỏ qua trục đó (bậc thang không làm bàn chân gật). */
  tiltEdge: 0.1,
  /** Tốc độ làm mượt nghiêng bàn chân (1/s). */
  tiltRate: 12,
  /** Chu kỳ lấy lại pháp tuyến (s): bốn lần dò độ cao mỗi chân là phần tốn nhất, dốc đổi chậm nên dùng lại giữa hai lần. */
  normalEvery: 0.1,
  /** Số nhân vật tối đa chạy IK chân trong một khung (bench 50 bot: 6,6 nhân vật ≈ 0,45 ms/khung, ngưỡng 0,3 ms). */
  maxPerFrame: 4,
};

/** Khoảng cách camera của người khác đã xin suất trong khung hiện tại (tăng dần, tối đa `maxPerFrame - 1` phần tử). */
let slotNear: number[] = [];
/** Ngưỡng khoảng cách của khung trước: chỉ những người gần camera hơn ngưỡng này được IK. */
let slotLimit = Infinity;
/**
 * Bắt đầu một khung: chốt ngưỡng từ những người đã xin suất ở khung trước, rồi xóa danh sách. Gọi đúng một lần ở đầu vòng cập nhật
 * nhân vật của engine (đếm khung thật, không theo thời gian nên đúng ở mọi tần số quét và khi khung nặng).
 */
export function beginFeetFrame(): void {
  slotLimit = slotNear.length >= FEET.maxPerFrame - 1 ? slotNear[FEET.maxPerFrame - 2]! : Infinity;
  slotNear = [];
}
/**
 * Xin một suất IK chân trong khung hiện tại (`dist` = khoảng cách tới camera, `self` = nhân vật của mình). Chính mình luôn được và
 * không tính vào giới hạn; người khác được nếu nằm trong `maxPerFrame - 1` người gần camera nhất của khung TRƯỚC (xếp hạng trễ
 * một khung, đủ cho IK vì cảnh đổi chậm). Bị từ chối thì nhân vật gọi `update` với `active: false` để IK tắt mượt, không giật.
 */
export function feetSlot(dist: number, self = false): boolean {
  if (self) return true;
  let i = slotNear.length;
  const cap = FEET.maxPerFrame - 1;
  if (i < cap || dist < slotNear[i - 1]!) {
    if (i >= cap) i--;
    while (i > 0 && slotNear[i - 1]! > dist) {
      slotNear[i] = slotNear[i - 1]!;
      i--;
    }
    slotNear[i] = dist;
  }
  return dist <= slotLimit;
}

/** Đặt lại bộ chọn suất (test). */
export function resetFeetSlots(): void {
  slotNear = [];
  slotLimit = Infinity;
}

/**
 * Đầu dò đo chi phí IK chân (bench công bằng bật/tắt xen kẽ trong cùng phiên): `off` tắt IK lúc chạy, `rec` bật ghi thời gian từng lần
 * `update`. Đọc qua `window.__feetProbe`. Không ảnh hưởng khi `rec`/`off` đều false (chỉ một phép so sánh).
 */
export const feetProbe = { off: false, rec: false, calls: 0, ms: 0, per: [] as number[] };
if (typeof window !== 'undefined') (window as unknown as { __feetProbe: typeof feetProbe }).__feetProbe = feetProbe;

/** Hàm độ cao mặt đứng được tại (x, z). */
export type GroundFn = (x: number, z: number) => number;

/**
 * Mặt đứng hiệu dụng của level hiện tại (COL-1): max(địa hình, mặt đi được 3D như bậc thang, cầu, mặt đá) mà đỉnh không cao
 * quá `footY + STEP_UP`, đúng công thức `stepMove` dùng cho vị trí chân nên chân không cắm xuống bậc hay lơ lửng trên cầu.
 */
export function walkableGround(footY: number, level: string = levelId(), terrain: GroundFn = terrainGround): GroundFn {
  const col = collisionOf(level);
  if (!col.size) return terrain;
  const maxTop = footY + STEP_UP;
  return (x, z) => Math.max(terrain(x, z), col.standY(x, z, maxTop));
}

/**
 * Pháp tuyến mặt đất tại (x, z) bằng sai phân trung tâm trên hai trục thế giới, góc lệch so với phương đứng kẹp ở `maxAng`.
 * Trục nào có chênh lớn bất thường (mép bậc) thì coi phẳng. Ghi vào `out` (đơn vị).
 */
export function groundNormal(
  g: GroundFn,
  x: number,
  z: number,
  out: THREE.Vector3,
  e: number = FEET.tiltStep,
  maxAng: number = FEET.tiltMax,
): THREE.Vector3 {
  const slope = (a: number, b: number): number => (Math.abs(a - b) > FEET.tiltEdge ? 0 : (a - b) / (2 * e));
  const sx = slope(g(x + e, z), g(x - e, z));
  const sz = slope(g(x, z + e), g(x, z - e));
  out.set(-sx, 1, -sz).normalize();
  const ang = Math.acos(Math.min(1, out.y));
  if (ang > maxAng) {
    const k = Math.sin(maxAng) / Math.max(1e-6, Math.sin(ang));
    out.set(out.x * k, Math.cos(maxAng), out.z * k);
  }
  return out;
}

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
  /** Nghiêng bàn chân theo pháp tuyến (quay thế giới, làm mượt). */
  tilt: THREE.Quaternion;
  /** Pháp tuyến lần lấy mẫu gần nhất (quay từ phương đứng). */
  nq: THREE.Quaternion;
}

const _v = new THREE.Vector3();
const _m3 = new THREE.Matrix3();
const _s = new THREE.Vector3();
const _n = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _tq = new THREE.Quaternion();

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
  private nT = 0;
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
        tilt: new THREE.Quaternion(),
        nq: new THREE.Quaternion(),
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
      l.tilt.identity();
      l.nq.identity();
    }
  }

  /**
   * Gọi ngay sau `mixer.update` (và lớp phụ), trước lò xo. `ground` mặc định là địa hình của level; sau này đổi sang mặt đi được hiệu dụng
   * (bậc thang, sàn kiến trúc của COL-1) mà không cần sửa chỗ khác.
   */
  update(dt: number, st: FeetState, ground?: GroundFn): void {
    if (feetProbe.off) {
      this.release();
      return;
    }
    if (!feetProbe.rec) return this.run(dt, st, ground);
    const t0 = performance.now();
    this.run(dt, st, ground);
    const d = performance.now() - t0;
    feetProbe.calls++;
    feetProbe.ms += d;
    feetProbe.per.push(d);
  }

  private run(dt: number, st: FeetState, ground?: GroundFn): void {
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
    ground ??= walkableGround(rp.y);
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
    // 2b. Thân nhảy xa khi đứng yên (tp, truyền tống, server sửa vị trí): khóa lại ngay tại chân của clip, không bước từ chỗ cũ.
    if (this.planted && this.legs.some((l) => Math.hypot(l.plant.p.x - l.pos.x, l.plant.p.z - l.pos.z) > FEET.jump)) {
      for (const l of this.legs) {
        l.step = null;
        this.plantAt(l, l.pos, l.quat, yaw, base);
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
    // 4b. Bàn chân theo pháp tuyến mặt đất tại đích (kẹp góc, mượt), nhân vào hướng clip.
    const tk = 1 - Math.exp(-dt * FEET.tiltRate);
    this.nT -= dt;
    const resample = this.nT <= 0;
    if (resample) this.nT = FEET.normalEvery;
    for (const l of this.legs) {
      if (resample) {
        groundNormal(ground, l.tgt.x, l.tgt.z, _n);
        l.nq.setFromUnitVectors(_up, _n);
      }
      l.tilt.slerp(l.nq, tk);
      _tq.identity().slerp(l.tilt, this.w);
      l.endQ.premultiply(_tq);
    }
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
