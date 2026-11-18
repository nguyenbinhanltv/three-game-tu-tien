import * as THREE from 'three/webgpu';
import { POSE_REF, type PoseDef, type PoseEase, type PoseKey, type PoseVec } from '@dtl/shared';

/**
 * Công cụ tư thế IK hai đốt (M3-3). Key pose viết bằng dữ liệu (`packages/content/data/poses/*.json`): vị trí cổ tay,
 * cổ chân, hướng kiếm, xoay hông/cột sống trong không gian nhân vật; ở đây giải IK cho từng khung rồi nướng thành
 * `AnimationClip` quaternion để trộn bằng `AnimationMixer` như clip thường (crossfade, mask thân trên, additive).
 *
 * Không gian nhân vật = hệ cục bộ của `root` (thường là `gltf.scene`): +Y lên, +Z trước mặt, tay phải ở -X.
 * Bộ giải làm việc trong không gian thế giới nên không phụ thuộc trục cục bộ của xương hay scale của Armature
 * (GLB Mixamo hay có Armature scale 0,01).
 */

type Joint =
  | 'hips'
  | 'spine'
  | 'spine1'
  | 'spine2'
  | 'neck'
  | 'head'
  | 'armR'
  | 'foreArmR'
  | 'handR'
  | 'armL'
  | 'foreArmL'
  | 'handL'
  | 'upLegR'
  | 'legR'
  | 'footR'
  | 'upLegL'
  | 'legL'
  | 'footL';

/** Tên xương Mixamo (bỏ tiền tố `mixamorig`). */
const MIXAMO: Record<Joint, string> = {
  hips: 'hips',
  spine: 'spine',
  spine1: 'spine1',
  spine2: 'spine2',
  neck: 'neck',
  head: 'head',
  armR: 'rightarm',
  foreArmR: 'rightforearm',
  handR: 'righthand',
  armL: 'leftarm',
  foreArmL: 'leftforearm',
  handL: 'lefthand',
  upLegR: 'rightupleg',
  legR: 'rightleg',
  footR: 'rightfoot',
  upLegL: 'leftupleg',
  legL: 'leftleg',
  footL: 'leftfoot',
};
const OPTIONAL = new Set<Joint>(['spine1', 'spine2', 'neck']);

/** Tên xương rig Tripo (Thạch Viên, Kiếm Khôi, Thủ Mộ Thạch Tướng…) khi không có tên Mixamo. */
const TRIPO: Record<Joint, string> = {
  hips: 'pelvis',
  spine: 'waist',
  spine1: 'spine01',
  spine2: 'spine02',
  neck: 'necktwist01',
  head: 'head',
  armR: 'r_upperarm',
  foreArmR: 'r_forearm',
  handR: 'r_hand',
  armL: 'l_upperarm',
  foreArmL: 'l_forearm',
  handL: 'l_hand',
  upLegR: 'r_thigh',
  legR: 'r_calf',
  footR: 'r_foot',
  upLegL: 'l_thigh',
  legL: 'l_calf',
  footL: 'l_foot',
};

/** Chuẩn hóa tên xương: bỏ `mixamorig`, `mixamorig1:`, `mixamorig_`…, chữ thường. */
export function boneKey(name: string): string {
  return name.replace(/^mixamorig\d*[:_]?/i, '').toLowerCase();
}

const DEFAULT_POLE = {
  elbowR: [-0.5, -0.7, -0.4] as PoseVec,
  elbowL: [0.5, -0.7, -0.4] as PoseVec,
  kneeR: [-0.1, 0, 1] as PoseVec,
  kneeL: [0.1, 0, 1] as PoseVec,
};

/** Giá trị của một khung sau khi đã nội suy (đơn vị tham chiếu, không gian nhân vật). */
export interface PoseSample {
  hipsPos: PoseVec;
  hipsRot: PoseVec;
  spine: PoseVec;
  head: PoseVec;
  handR?: PoseVec;
  handL?: PoseVec;
  elbowR: PoseVec;
  elbowL: PoseVec;
  sword?: PoseVec;
  edge?: PoseVec;
  footR?: PoseVec;
  footL?: PoseVec;
  kneeR: PoseVec;
  kneeL: PoseVec;
}

/** Kết quả đầu dò: đơn vị m thật (vai) hoặc đơn vị tham chiếu như JSON (hông, chân) để so trực tiếp với dữ liệu. */
interface PoseProbe {
  /** Cổ tay so với khớp vai cùng bên (m, không gian nhân vật). z > 0: tay trước vai. */
  handRFromShoulder: PoseVec;
  handLFromShoulder: PoseVec;
  /** Cổ tay so với hông lúc nghỉ (đơn vị tham chiếu, cùng hệ với `handR` trong JSON). */
  handR: PoseVec;
  handL: PoseVec;
  /** Cổ chân [x, nhấc, z] cùng hệ với `footR` trong JSON; nhấc ≈ 0 là chạm đất. */
  footR: PoseVec;
  footL: PoseVec;
  /** Hướng mũi và lưỡi kiếm tay phải (đã chuẩn hóa). */
  sword: PoseVec;
  edge: PoseVec;
}

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _tgt = new THREE.Vector3();
const _q1 = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _m1 = new THREE.Matrix4();
const _m2 = new THREE.Matrix4();
const DEG = Math.PI / 180;

const vec = (v: PoseVec) => new THREE.Vector3(v[0], v[1], v[2]);
const arr = (v: THREE.Vector3): PoseVec => [v.x, v.y, v.z];

/** Xoay [cúi X, xoay Y, nghiêng Z] (độ) theo thứ tự YXZ, nhân hệ số `f` (để chia cho nhiều đốt). */
function eulerQ(r: PoseVec, f = 1, out = new THREE.Quaternion()): THREE.Quaternion {
  return out.setFromEuler(new THREE.Euler(r[0] * DEG * f, r[1] * DEG * f, r[2] * DEG * f, 'YXZ'));
}

/** Quaternion biến cặp (a1, b1) thành (a2, b2); b được chỉnh vuông góc với a. */
function quatFromBasis(a1: THREE.Vector3, b1: THREE.Vector3, a2: THREE.Vector3, b2: THREE.Vector3, out: THREE.Quaternion): THREE.Quaternion {
  const basis = (a: THREE.Vector3, b: THREE.Vector3, m: THREE.Matrix4) => {
    const x = a.clone().normalize();
    const y = b.clone().addScaledVector(x, -b.dot(x));
    // b song song a: lấy một trục bất kỳ vuông góc với a.
    if (y.lengthSq() < 1e-8) y.set(x.y, -x.x, 0);
    if (y.lengthSq() < 1e-8) y.set(0, x.z, -x.y);
    y.normalize();
    const z = new THREE.Vector3().crossVectors(x, y);
    return m.makeBasis(x, y, z);
  };
  basis(a1, b1, _m1);
  basis(a2, b2, _m2);
  return out.setFromRotationMatrix(_m2.multiply(_m1.transpose()));
}

interface Rest {
  bone: THREE.Bone;
  p: THREE.Vector3;
  q: THREE.Quaternion;
  s: THREE.Vector3;
}

/**
 * Rig người cho IK: giữ tư thế nghỉ (bind/T-pose) và số đo, đặt tư thế từ `PoseSample`, đọc đầu dò.
 * Đặt tư thế ghi thẳng vào xương; dùng xong thì `reset()`.
 */
export class IkRig {
  readonly bones: Record<Joint, THREE.Bone | null>;
  /** Tỉ lệ rig / người tham chiếu (theo chiều cao hông). */
  readonly scale: number;
  /** Xương được nướng vào clip (theo thứ tự cha trước con). */
  readonly tracked: THREE.Bone[];
  private rest: Rest[] = [];
  private hipsRest: THREE.Vector3;
  private ankleRestY: { R: number; L: number };
  private footRestQ: { R: THREE.Quaternion; L: THREE.Quaternion };
  /** Hướng mũi / lưỡi kiếm trong hệ cục bộ xương tay phải. */
  readonly bladeLocal: THREE.Vector3;
  readonly edgeLocal: THREE.Vector3;
  private rootQ = new THREE.Quaternion();
  /** Nhóm đỡ trên cùng của cây xương (con trực tiếp của `root`): dịch nó để hạ/nâng hông mà không đụng track của mixer. */
  private holder: THREE.Object3D | null = null;
  private holderY0 = 0;
  private feetQ = { R: new THREE.Quaternion(), L: new THREE.Quaternion() };
  private feetP = { R: new THREE.Vector3(), L: new THREE.Vector3() };
  private feetKnee = { R: new THREE.Vector3(), L: new THREE.Vector3() };
  /**
   * Xương chân trước/sau khi IK bám đất. Clip không có track cho xương nào thì mixer không ghi đè nó, IK sẽ cộng dồn
   * qua từng khung; nên đầu mỗi lượt, xương còn nguyên giá trị sau IK (mixer không đụng tới) được trả về giá trị trước IK.
   */
  private legBones: THREE.Bone[] = [];
  private legPre: THREE.Quaternion[] = [];
  private legPost: THREE.Quaternion[] = [];
  private legIk = false;

  private constructor(
    readonly root: THREE.Object3D,
    bones: Record<Joint, THREE.Bone | null>,
  ) {
    this.bones = bones;
    root.traverse((o) => {
      const b = o as THREE.Bone;
      if (b.isBone) this.rest.push({ bone: b, p: b.position.clone(), q: b.quaternion.clone(), s: b.scale.clone() });
    });
    this.tracked = (Object.keys(MIXAMO) as Joint[]).map((j) => bones[j]).filter((b): b is THREE.Bone => !!b);
    root.updateMatrixWorld(true);
    this.hipsRest = this.charPos(bones.hips!);
    this.scale = this.hipsRest.y / POSE_REF.hipHeight;
    this.ankleRestY = { R: this.charPos(bones.footR!).y, L: this.charPos(bones.footL!).y };
    this.footRestQ = { R: this.charQuat(bones.footR!), L: this.charQuat(bones.footL!) };
    // Lúc T-pose: nắm kiếm thì mũi chỉ về trước (+Z), lưỡi theo hướng các ngón (ra ngoài, -X với tay phải).
    const handQ = bones.handR!.getWorldQuaternion(new THREE.Quaternion()).invert();
    for (let o: THREE.Object3D | null = bones.hips; o; o = o.parent) {
      if (o.parent === root) {
        this.holder = o;
        this.holderY0 = o.position.y;
        break;
      }
    }
    this.legBones = (['upLegR', 'legR', 'footR', 'upLegL', 'legL', 'footL'] as const).map((j) => bones[j]!);
    this.legPre = this.legBones.map(() => new THREE.Quaternion());
    this.legPost = this.legBones.map(() => new THREE.Quaternion());
    this.bladeLocal = this.worldDir([0, 0, 1]).applyQuaternion(handQ).normalize();
    this.edgeLocal = this.worldDir([-1, 0, 0]).applyQuaternion(handQ).normalize();
  }

  /** Tìm xương người (tên Mixamo) dưới `root`; null nếu thiếu xương bắt buộc. */
  static from(root: THREE.Object3D): IkRig | null {
    const byKey = new Map<string, THREE.Bone>();
    root.traverse((o) => {
      const b = o as THREE.Bone;
      if (b.isBone && !byKey.has(boneKey(b.name))) byKey.set(boneKey(b.name), b);
    });
    const bones = {} as Record<Joint, THREE.Bone | null>;
    for (const j of Object.keys(MIXAMO) as Joint[]) {
      bones[j] = byKey.get(MIXAMO[j]) ?? byKey.get(TRIPO[j]) ?? null;
      if (!bones[j] && !OPTIONAL.has(j)) return null;
    }
    return new IkRig(root, bones);
  }

  /**
   * Gốc để mixer tìm xương theo tên: tổ tiên trên cùng của xương hông. Thường là `root`; với nhân vật đã tách cây
   * xương khỏi cảnh (`SkinnedCharacter.rig`, M3-9) thì là nhóm rig đó.
   */
  get mixerRoot(): THREE.Object3D {
    let r: THREE.Object3D = this.bones.hips!;
    while (r.parent) r = r.parent;
    return r;
  }

  /** Về tư thế nghỉ. */
  reset(): void {
    for (const r of this.rest) {
      r.bone.position.copy(r.p);
      r.bone.quaternion.copy(r.q);
      r.bone.scale.copy(r.s);
    }
    this.root.updateMatrixWorld(true);
  }

  /** Đặt tư thế cho một khung (ghi vào xương). */
  apply(s: PoseSample): void {
    this.reset();
    this.root.getWorldQuaternion(this.rootQ);
    const b = this.bones;
    const k = this.scale;

    // Hông: dời rồi xoay.
    const hips = b.hips!;
    const hp = this.worldPoint(arr(this.hipsRest.clone().addScaledVector(vec(s.hipsPos), k)));
    hips.position.copy(hips.parent ? hips.parent.worldToLocal(hp) : hp);
    hips.updateMatrixWorld(true);
    this.rotateChar(hips, eulerQ(s.hipsRot));

    // Cột sống và đầu: chia đều góc cho các đốt có mặt.
    const spine = [b.spine, b.spine1, b.spine2].filter((x): x is THREE.Bone => !!x);
    for (const x of spine) this.rotateChar(x, eulerQ(s.spine, 1 / spine.length));
    const head = [b.neck, b.head].filter((x): x is THREE.Bone => !!x);
    for (const x of head) this.rotateChar(x, eulerQ(s.head, 1 / head.length));

    // Chân: cổ chân tới điểm đích, bàn chân giữ phẳng như lúc nghỉ.
    for (const side of ['R', 'L'] as const) {
      const f = s[`foot${side}`];
      if (!f) continue;
      const t = new THREE.Vector3(this.hipsRest.x + f[0] * k, this.ankleRestY[side] + f[1] * k, this.hipsRest.z + f[2] * k);
      const foot = b[`foot${side}`]!;
      this.twoBone(b[`upLeg${side}`]!, b[`leg${side}`]!, foot, this.worldPoint(arr(t)), this.worldDir(s[`knee${side}`]));
      this.setWorldQuat(foot, this.footRestQ[side].clone().premultiply(this.rootQ));
    }

    // Tay.
    for (const side of ['R', 'L'] as const) {
      const h = s[`hand${side}`];
      if (!h) continue;
      const t = this.hipsRest.clone().addScaledVector(vec(h), k);
      this.twoBone(b[`arm${side}`]!, b[`foreArm${side}`]!, b[`hand${side}`]!, this.worldPoint(arr(t)), this.worldDir(s[`elbow${side}`]));
    }

    // Cổ tay phải xoay cho kiếm đúng hướng mũi (và lưỡi nếu có).
    if (s.sword) {
      const hand = b.handR!;
      const blade = this.worldDir(s.sword).normalize();
      const q = hand.getWorldQuaternion(new THREE.Quaternion());
      if (s.edge) quatFromBasis(this.bladeLocal, this.edgeLocal, blade, this.worldDir(s.edge), q);
      else q.premultiply(_q1.setFromUnitVectors(this.bladeLocal.clone().applyQuaternion(q).normalize(), blade));
      this.setWorldQuat(hand, q);
    }
  }

  /** Đọc đầu dò ở tư thế hiện tại của xương (sau `apply`, hoặc sau khi mixer đã chạy và cập nhật ma trận). */
  probe(): PoseProbe {
    this.root.updateMatrixWorld(true);
    const b = this.bones;
    const k = this.scale;
    const rel = (p: THREE.Vector3): PoseVec => arr(p.sub(this.hipsRest).divideScalar(k));
    const foot = (side: 'R' | 'L'): PoseVec => {
      const p = this.charPos(b[`foot${side}`]!);
      return [(p.x - this.hipsRest.x) / k, (p.y - this.ankleRestY[side]) / k, (p.z - this.hipsRest.z) / k];
    };
    const hq = this.charQuat(b.handR!);
    return {
      handRFromShoulder: arr(this.charPos(b.handR!).sub(this.charPos(b.armR!))),
      handLFromShoulder: arr(this.charPos(b.handL!).sub(this.charPos(b.armL!))),
      handR: rel(this.charPos(b.handR!)),
      handL: rel(this.charPos(b.handL!)),
      footR: foot('R'),
      footL: foot('L'),
      sword: arr(this.bladeLocal.clone().applyQuaternion(hq).normalize()),
      edge: arr(this.edgeLocal.clone().applyQuaternion(hq).normalize()),
    };
  }

  /**
   * Chân bám đất, bước 1 (P2-E3): sau khi mixer đặt tư thế, trả vị trí hai cổ chân (không gian nhân vật, chưa chỉnh) để
   * nơi gọi lấy độ cao mặt đất dưới từng chân. Đồng thời về lại vị trí gốc của nhóm đỡ hông. false nếu rig không có
   * chuỗi hông → đùi → cẳng → bàn chân liền nhau hoặc thiếu nhóm đỡ.
   */
  measureFeet(outR: THREE.Vector3, outL: THREE.Vector3): boolean {
    const h = this.holder;
    if (!h || !this.legChain()) return false;
    h.position.y = this.holderY0;
    this.undoLegIk();
    this.bones.hips!.updateWorldMatrix(true, false);
    for (const side of ['R', 'L'] as const) {
      const b = this.bones;
      const up = b[`upLeg${side}`]!;
      const mid = b[`leg${side}`]!;
      const foot = b[`foot${side}`]!;
      refreshWorld(up);
      refreshWorld(mid);
      refreshWorld(foot);
      foot.matrixWorld.decompose(this.feetP[side], this.feetQ[side], _v1);
      // Hướng gập gối hiện tại: gối − hông (thế giới), để IK giữ nguyên chiều gập.
      this.feetKnee[side].setFromMatrixPosition(mid.matrixWorld).sub(_v1.setFromMatrixPosition(up.matrixWorld));
    }
    outR.copy(this.feetP.R);
    outL.copy(this.feetP.L);
    return true;
  }

  private chainOk: boolean | null = null;
  private legChain(): boolean {
    if (this.chainOk === null) {
      const b = this.bones;
      this.chainOk = (['R', 'L'] as const).every((s) => b[`upLeg${s}`]!.parent === b.hips && b[`leg${s}`]!.parent === b[`upLeg${s}`] && b[`foot${s}`]!.parent === b[`leg${s}`]);
    }
    return this.chainOk;
  }

  /**
   * Chân bám đất, bước 2: hạ (hoặc nâng) hông `hipsDy` rồi đưa mỗi cổ chân lên thêm `dyR`/`dyL` so với lúc đo (đơn vị
   * không gian nhân vật, +Y lên); bàn chân giữ hướng của clip. Gọi sau `measureFeet`, trước khi cập nhật ma trận cả cây.
   */
  groundFeet(hipsDy: number, dyR: number, dyL: number): void {
    const h = this.holder;
    if (!h) return;
    h.position.y = this.holderY0 + hipsDy;
    h.updateWorldMatrix(true, false);
    const b = this.bones;
    b.hips!.updateWorldMatrix(true, false);
    for (let i = 0; i < 6; i++) this.legPre[i].copy(this.legBones[i].quaternion);
    const dy = { R: dyR, L: dyL };
    for (const side of ['R', 'L'] as const) {
      const up = b[`upLeg${side}`]!;
      const mid = b[`leg${side}`]!;
      const foot = b[`foot${side}`]!;
      refreshWorld(up);
      refreshWorld(mid);
      refreshWorld(foot);
      _tgt.copy(this.feetP[side]);
      _tgt.y += dy[side];
      solveLeg(up, mid, foot, _tgt, this.feetKnee[side], this.feetQ[side]);
    }
    for (let i = 0; i < 6; i++) this.legPost[i].copy(this.legBones[i].quaternion);
    this.legIk = true;
  }

  /** Thôi bám đất: trả nhóm đỡ hông và xương chân về chỗ cũ. */
  releaseFeet(): void {
    if (this.holder) this.holder.position.y = this.holderY0;
    this.undoLegIk();
  }

  private undoLegIk(): void {
    if (!this.legIk) return;
    this.legIk = false;
    for (let i = 0; i < 6; i++) if (this.legBones[i].quaternion.equals(this.legPost[i])) this.legBones[i].quaternion.copy(this.legPre[i]);
  }

  /** Chỗ gắn kiếm trong hệ cục bộ xương tay phải: model kiếm mũi +Z, lưỡi ±X, gốc ở giữa chuôi (lòng bàn tay). */
  swordMount(): { position: THREE.Vector3; quaternion: THREE.Quaternion } {
    const hand = this.bones.handR!;
    const ws = hand.getWorldScale(new THREE.Vector3()).x || 1;
    const q = quatFromBasis(new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0), this.bladeLocal, this.edgeLocal, new THREE.Quaternion());
    // Lòng bàn tay cách cổ tay ~0,08m theo hướng ngón (= hướng lưỡi lúc nghỉ).
    const position = this.edgeLocal.clone().multiplyScalar((0.08 * this.scale) / ws);
    return { position, quaternion: q };
  }

  // ---- IK ----

  /** IK hai đốt: đặt đầu chi (`end`) vào `target` (thế giới), khuỷu/gối nằm về phía `pole`. */
  private twoBone(upper: THREE.Bone, mid: THREE.Bone, end: THREE.Bone, target: THREE.Vector3, pole: THREE.Vector3): void {
    const a = upper.getWorldPosition(new THREE.Vector3());
    const bPos = mid.getWorldPosition(new THREE.Vector3());
    const c = end.getWorldPosition(new THREE.Vector3());
    const l1 = a.distanceTo(bPos);
    const l2 = bPos.distanceTo(c);
    const tv = target.clone().sub(a);
    const d = THREE.MathUtils.clamp(tv.length(), Math.abs(l1 - l2) + 1e-5, l1 + l2 - 1e-5);
    const dir = tv.lengthSq() > 1e-12 ? tv.normalize() : bPos.clone().sub(a).normalize();
    const cosA = THREE.MathUtils.clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1);
    // Hướng gập: thành phần của pole vuông góc với trục vai→đích; pole song song trục thì giữ hướng khuỷu hiện tại.
    const perp = pole.clone().addScaledVector(dir, -pole.dot(dir));
    if (perp.lengthSq() < 1e-8) perp.copy(bPos).sub(a).addScaledVector(dir, -_v1.copy(bPos).sub(a).dot(dir));
    if (perp.lengthSq() < 1e-8) perp.set(0, -1, 0).addScaledVector(dir, dir.y);
    perp.normalize();
    const elbow = a.clone().addScaledVector(dir, l1 * cosA).addScaledVector(perp, l1 * Math.sqrt(1 - cosA * cosA));

    const q = upper.getWorldQuaternion(new THREE.Quaternion());
    q.premultiply(_q1.setFromUnitVectors(_v1.copy(bPos).sub(a).normalize(), _v2.copy(elbow).sub(a).normalize()));
    this.setWorldQuat(upper, q);

    const b2 = mid.getWorldPosition(new THREE.Vector3());
    const c2 = end.getWorldPosition(new THREE.Vector3());
    const goal = a.clone().addScaledVector(dir, d);
    const q2 = mid.getWorldQuaternion(new THREE.Quaternion());
    q2.premultiply(_q2.setFromUnitVectors(_v1.copy(c2).sub(b2).normalize(), _v3.copy(goal).sub(b2).normalize()));
    this.setWorldQuat(mid, q2);
  }

  private setWorldQuat(bone: THREE.Bone, q: THREE.Quaternion): void {
    const pq = bone.parent ? bone.parent.getWorldQuaternion(new THREE.Quaternion()) : new THREE.Quaternion();
    bone.quaternion.copy(pq.invert().multiply(q));
    bone.updateMatrixWorld(true);
  }

  /** Xoay xương quanh khớp của nó một góc cho trong không gian nhân vật. */
  private rotateChar(bone: THREE.Bone, qChar: THREE.Quaternion): void {
    const qw = this.rootQ.clone().multiply(qChar).multiply(this.rootQ.clone().invert());
    this.setWorldQuat(bone, bone.getWorldQuaternion(new THREE.Quaternion()).premultiply(qw));
  }

  private charPos(o: THREE.Object3D): THREE.Vector3 {
    return this.root.worldToLocal(o.getWorldPosition(new THREE.Vector3()));
  }

  private charQuat(o: THREE.Object3D): THREE.Quaternion {
    return o.getWorldQuaternion(new THREE.Quaternion()).premultiply(this.root.getWorldQuaternion(new THREE.Quaternion()).invert());
  }

  private worldPoint(v: PoseVec): THREE.Vector3 {
    return this.root.localToWorld(vec(v));
  }

  private worldDir(v: PoseVec): THREE.Vector3 {
    return vec(v).applyQuaternion(this.root.getWorldQuaternion(new THREE.Quaternion()));
  }
}

/** Tính lại ma trận thế giới của một xương từ ma trận cục bộ, giả định cha đã đúng. */
function refreshWorld(o: THREE.Object3D): void {
  o.updateMatrix();
  o.matrixWorld.multiplyMatrices(o.parent!.matrixWorld, o.matrix);
}

const _sa = new THREE.Vector3();
const _sb = new THREE.Vector3();
const _sc = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _perp = new THREE.Vector3();
const _elb = new THREE.Vector3();
const _w1 = new THREE.Vector3();
const _w2 = new THREE.Vector3();
const _sq = new THREE.Quaternion();
const _sq2 = new THREE.Quaternion();
const _pq = new THREE.Quaternion();
const _ss = new THREE.Vector3();

/** Đặt quaternion thế giới của xương (cha đã đúng), cập nhật ma trận xương đó. */
function setWorldQ(bone: THREE.Object3D, q: THREE.Quaternion): void {
  bone.parent!.matrixWorld.decompose(_w1, _pq, _ss);
  bone.quaternion.copy(_pq.invert().multiply(q));
  refreshWorld(bone);
}

/**
 * IK hai đốt không cấp phát cho chân (bám đất mỗi khung): đưa `end` tới `target`, gối về phía `pole`; bàn chân giữ hướng
 * `endQ`. Dùng thẳng `matrixWorld` (đã làm mới), không gọi lại chuỗi cha như `getWorldPosition`.
 */
function solveLeg(upper: THREE.Bone, mid: THREE.Bone, end: THREE.Bone, target: THREE.Vector3, pole: THREE.Vector3, endQ: THREE.Quaternion): void {
  const a = _sa.setFromMatrixPosition(upper.matrixWorld);
  const bp = _sb.setFromMatrixPosition(mid.matrixWorld);
  const c = _sc.setFromMatrixPosition(end.matrixWorld);
  const l1 = a.distanceTo(bp);
  const l2 = bp.distanceTo(c);
  _dir.copy(target).sub(a);
  const d = THREE.MathUtils.clamp(_dir.length(), Math.abs(l1 - l2) + 1e-5, l1 + l2 - 1e-5);
  if (_dir.lengthSq() > 1e-12) _dir.normalize();
  else _dir.copy(bp).sub(a).normalize();
  const cosA = THREE.MathUtils.clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1);
  _perp.copy(pole).addScaledVector(_dir, -pole.dot(_dir));
  if (_perp.lengthSq() < 1e-8) _perp.set(0, 0, 1).addScaledVector(_dir, -_dir.z);
  _perp.normalize();
  _elb.copy(a).addScaledVector(_dir, l1 * cosA).addScaledVector(_perp, l1 * Math.sqrt(1 - cosA * cosA));

  // Đùi: xoay đưa gối tới vị trí mới.
  upper.matrixWorld.decompose(_w1, _sq, _ss);
  _w1.copy(bp).sub(a).normalize();
  _w2.copy(_elb).sub(a).normalize();
  _sq.premultiply(_sq2.setFromUnitVectors(_w1, _w2));
  setWorldQ(upper, _sq);
  refreshWorld(mid);

  // Cẳng: xoay đưa cổ chân tới đích đã kẹp tầm với.
  refreshWorld(end);
  const b2 = _sb.setFromMatrixPosition(mid.matrixWorld);
  const c2 = _sc.setFromMatrixPosition(end.matrixWorld);
  _w1.copy(c2).sub(b2).normalize();
  _w2.copy(a).addScaledVector(_dir, d).sub(b2).normalize();
  mid.matrixWorld.decompose(_perp, _sq, _ss);
  _sq.premultiply(_sq2.setFromUnitVectors(_w1, _w2));
  setWorldQ(mid, _sq);
  refreshWorld(end);
  setWorldQ(end, endQ);
}

// ---- Nội suy key pose ----

function ease(kind: PoseEase, u: number): number {
  switch (kind) {
    case 'linear':
      return u;
    case 'in':
      return u * u;
    case 'out':
      return 1 - (1 - u) * (1 - u);
    case 'quartOut':
      return 1 - (1 - u) ** 4;
    case 'step':
      return u >= 1 ? 1 : 0;
    default:
      return u * u * (3 - 2 * u);
  }
}

type Field = Exclude<keyof PoseSample, never>;
type Resolved = PoseSample & { t: number; ease: PoseEase };

/** Điền trường thiếu của từng key: giữ giá trị key trước; trước lần xuất hiện đầu thì lấy lần xuất hiện đầu. */
export function resolveKeys(def: PoseDef): Resolved[] {
  const pick = (k: PoseKey): Partial<Record<Field, PoseVec>> => ({
    hipsPos: k.hips?.pos,
    hipsRot: k.hips?.rot,
    spine: k.spine,
    head: k.head,
    handR: k.handR,
    handL: k.handL,
    elbowR: k.elbowR,
    elbowL: k.elbowL,
    sword: k.sword,
    edge: k.edge,
    footR: k.footR,
    footL: k.footL,
    kneeR: k.kneeR,
    kneeL: k.kneeL,
  });
  const raw = def.keys.map(pick);
  const fields = Object.keys(raw[0]) as Field[];
  const first: Partial<Record<Field, PoseVec>> = {};
  for (const r of raw) for (const f of fields) first[f] ??= r[f];
  const defaults: Partial<Record<Field, PoseVec>> = { hipsPos: [0, 0, 0], hipsRot: [0, 0, 0], spine: [0, 0, 0], head: [0, 0, 0], ...DEFAULT_POLE };
  const cur: Partial<Record<Field, PoseVec>> = {};
  for (const f of fields) cur[f] = first[f] ?? defaults[f];
  return def.keys.map((k, i) => {
    for (const f of fields) if (raw[i][f]) cur[f] = raw[i][f];
    return { ...(cur as PoseSample), t: k.t, ease: k.ease ?? 'inOut' };
  });
}

const lerp = (a: PoseVec, b: PoseVec, u: number): PoseVec => [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u];

/**
 * Nội suy hướng theo cung (vector đơn vị). Hai hướng gần ngược nhau thì trục quay không xác định: quay quanh
 * `axisHint` (chiếu cho vuông góc với `a`), không có thì quanh một trục vuông góc bất kỳ, để vẫn quét đủ nửa vòng
 * thay vì đi qua vector 0.
 */
export function slerpDir(a: PoseVec, b: PoseVec, u: number, axisHint?: THREE.Vector3): PoseVec {
  const va = vec(a).normalize();
  const vb = vec(b).normalize();
  if (u <= 0) return arr(va);
  if (u >= 1) return arr(vb);
  const d = va.dot(vb);
  if (d > -0.999) {
    const q = new THREE.Quaternion().setFromUnitVectors(va, vb);
    return arr(va.applyQuaternion(new THREE.Quaternion().slerp(q, u)));
  }
  const axis = axisHint ? axisHint.clone().addScaledVector(va, -axisHint.dot(va)) : new THREE.Vector3();
  if (axis.lengthSq() < 1e-8) axis.set(va.y, -va.x, 0);
  if (axis.lengthSq() < 1e-8) axis.set(0, va.z, -va.y);
  axis.normalize();
  return arr(va.applyAxisAngle(axis, Math.acos(Math.max(-1, d)) * u));
}

/** Cổ tay đi theo cung quanh vai (hướng slerp, khoảng cách lerp) để đòn chém có đường vòng thay vì đường thẳng. */
function arcHand(a: PoseVec, b: PoseVec, u: number, side: 1 | -1): PoseVec {
  const s = vec([POSE_REF.shoulder[0] * side, POSE_REF.shoulder[1], POSE_REF.shoulder[2]]);
  const ra = vec(a).sub(s);
  const rb = vec(b).sub(s);
  const la = ra.length();
  const lb = rb.length();
  if (la < 1e-4 || lb < 1e-4) return lerp(a, b, u);
  const d = slerpDir(arr(ra), arr(rb), u);
  return arr(vec(d).multiplyScalar(la + (lb - la) * u).add(s));
}

/** Giá trị nội suy ở thời điểm t (giây). */
export function samplePose(def: PoseDef, keys: Resolved[], t: number): PoseSample {
  let i = 0;
  while (i + 1 < keys.length && keys[i + 1].t <= t) i++;
  const a = keys[i];
  let b: Resolved | undefined = keys[i + 1];
  let span = b ? b.t - a.t : 0;
  // Clip lặp: đoạn cuối nối về key đầu ở t = duration.
  if (!b && def.loop && def.duration > a.t + 1e-6) {
    b = { ...keys[0], t: def.duration, ease: 'inOut' };
    span = def.duration - a.t;
  }
  if (!b || span <= 0) return a;
  const u = ease(b.ease, THREE.MathUtils.clamp((t - a.t) / span, 0, 1));
  const opt = (f: 'sword' | 'edge' | 'footR' | 'footL', fn: (x: PoseVec, y: PoseVec, u: number) => PoseVec) =>
    a[f] && b[f] ? fn(a[f], b[f], u) : (a[f] ?? b[f]);
  const swingAxis = a.sword && a.edge ? new THREE.Vector3().crossVectors(vec(a.sword), vec(a.edge)) : undefined;
  return {
    hipsPos: lerp(a.hipsPos, b.hipsPos, u),
    hipsRot: lerp(a.hipsRot, b.hipsRot, u),
    spine: lerp(a.spine, b.spine, u),
    head: lerp(a.head, b.head, u),
    handR: a.handR && b.handR ? arcHand(a.handR, b.handR, u, -1) : (a.handR ?? b.handR),
    handL: a.handL && b.handL ? arcHand(a.handL, b.handL, u, 1) : (a.handL ?? b.handL),
    elbowR: lerp(a.elbowR, b.elbowR, u),
    elbowL: lerp(a.elbowL, b.elbowL, u),
    // Mũi và lưỡi quay quanh cùng một trục (mũi × lưỡi của key trước = trục chém, lưỡi đi trước) khi hướng đảo 180°.
    sword: opt('sword', (x, y, w) => slerpDir(x, y, w, swingAxis)),
    edge: opt('edge', (x, y, w) => slerpDir(x, y, w, swingAxis)),
    footR: opt('footR', lerp),
    footL: opt('footL', lerp),
    kneeR: lerp(a.kneeR, b.kneeR, u),
    kneeL: lerp(a.kneeL, b.kneeL, u),
  };
}

// ---- Nướng clip ----

interface BakeOpts {
  /** Số khung lấy mẫu mỗi giây (mặc định 30). Thời điểm của key luôn được lấy mẫu chính xác. */
  fps?: number;
  /** Tên clip (mặc định `pose_<id>`). */
  name?: string;
}

/** Tên clip nướng từ pose. */
export const poseClipName = (id: string) => `pose_${id}`;

/**
 * Nướng pose thành `AnimationClip`: quaternion cho mọi xương người + vị trí hông. Clip dùng tên xương nên áp được
 * lên mọi bản sao của cùng asset (vd. nhiều `SkinnedCharacter`). Rig được trả về tư thế nghỉ sau khi nướng.
 */
export function bakePose(def: PoseDef, rig: IkRig, o: BakeOpts = {}): THREE.AnimationClip {
  const fps = o.fps ?? 30;
  const keys = resolveKeys(def);
  const times: number[] = [];
  const n = Math.max(1, Math.ceil(def.duration * fps));
  for (let i = 0; i <= n; i++) times.push(Math.min(def.duration, i / fps));
  for (const k of keys) times.push(k.t);
  times.sort((x, y) => x - y);
  const uniq = times.filter((t, i) => i === 0 || t - times[i - 1] > 1e-4);

  const bones = rig.tracked;
  const quats = bones.map(() => [] as number[]);
  const hipsPos: number[] = [];
  for (const t of uniq) {
    rig.apply(samplePose(def, keys, t));
    bones.forEach((b, j) => {
      const q = b.quaternion;
      const out = quats[j];
      // Giữ dấu liên tục để nội suy và phép additive không đi đường vòng.
      const L = out.length;
      const flip = L >= 4 && out[L - 4] * q.x + out[L - 3] * q.y + out[L - 2] * q.z + out[L - 1] * q.w < 0 ? -1 : 1;
      out.push(q.x * flip, q.y * flip, q.z * flip, q.w * flip);
    });
    const hp = rig.bones.hips!.position;
    hipsPos.push(hp.x, hp.y, hp.z);
  }
  rig.reset();

  const tracks: THREE.KeyframeTrack[] = bones.map((b, j) => new THREE.QuaternionKeyframeTrack(`${b.name}.quaternion`, uniq, quats[j]));
  tracks.push(new THREE.VectorKeyframeTrack(`${rig.bones.hips!.name}.position`, uniq, hipsPos));
  return new THREE.AnimationClip(o.name ?? poseClipName(def.id), def.duration, tracks);
}

// ---- Trộn với clip khác ----

/**
 * Thân trên = cột sống trở lên (cột sống, cổ, đầu, vai, tay, ngón). Hông và chân là thân dưới. `armR`: chỉ cánh tay
 * phải (cánh tay, cẳng tay, bàn tay, ngón), cho động tác chồng lên cả lúc chạy mà không đè thân/tay trái (rút/tra kiếm).
 */
type BodyPart = 'upper' | 'lower' | 'armR';

/**
 * Lọc track theo phần thân. Dùng để đè thân trên: phát clip nền (vd. chạy của Tripo) đã lọc `lower` cùng clip
 * pose đã lọc `upper`; hai action không chung xương nên không bị trung bình trọng số.
 */
export function maskClip(clip: THREE.AnimationClip, rig: IkRig, part: BodyPart, name = `${clip.name}_${part}`): THREE.AnimationClip {
  const top = part === 'armR' ? rig.bones.armR! : rig.bones.spine!;
  const under = (nodeName: string) => {
    let o: THREE.Object3D | null | undefined = rig.mixerRoot.getObjectByName(nodeName);
    for (; o; o = o.parent) if (o === top) return true;
    return false;
  };
  const tracks = clip.tracks.filter((t) => under(THREE.PropertyBinding.parseTrackName(t.name).nodeName) === (part !== 'lower')).map((t) => t.clone());
  return new THREE.AnimationClip(name, clip.duration, tracks, clip.blendMode);
}

/**
 * Bản additive của clip so với tư thế nghỉ: phát chồng (`blendMode` additive) lên clip nền để cộng độ lệch của
 * pose (vd. thêm đà vai/cổ tay lên clip đi của Tripo). Clip gốc không bị sửa.
 */
export function makeAdditive(clip: THREE.AnimationClip, rig: IkRig, name = `${clip.name}_add`): THREE.AnimationClip {
  rig.reset();
  const ref: THREE.KeyframeTrack[] = [];
  for (const t of clip.tracks) {
    const { nodeName, propertyName } = THREE.PropertyBinding.parseTrackName(t.name);
    const node = rig.mixerRoot.getObjectByName(nodeName);
    if (!node) continue;
    if (propertyName === 'quaternion') ref.push(new THREE.QuaternionKeyframeTrack(t.name, [0], node.quaternion.toArray()));
    else if (propertyName === 'position') ref.push(new THREE.VectorKeyframeTrack(t.name, [0], node.position.toArray()));
    else if (propertyName === 'scale') ref.push(new THREE.VectorKeyframeTrack(t.name, [0], node.scale.toArray()));
  }
  const out = clip.clone();
  out.name = name;
  return THREE.AnimationUtils.makeClipAdditive(out, 0, new THREE.AnimationClip('rest', 0, ref));
}

// ---- Đầu dò cho test và gỡ lỗi ----

/** Đặt rig theo clip ở thời điểm t (qua `AnimationMixer`), đọc đầu dò rồi trả rig về tư thế nghỉ. */
export function probeClip(rig: IkRig, clip: THREE.AnimationClip, t: number): PoseProbe {
  const mixer = new THREE.AnimationMixer(rig.mixerRoot);
  const act = mixer.clipAction(clip);
  act.setLoop(THREE.LoopOnce, 1);
  act.clampWhenFinished = true;
  act.play();
  mixer.update(Math.min(t, clip.duration - 1e-6));
  const p = rig.probe();
  mixer.stopAllAction();
  mixer.uncacheRoot(rig.mixerRoot);
  rig.reset();
  return p;
}

const f2 = (v: PoseVec) => v.map((x) => (x >= 0 ? '+' : '') + x.toFixed(3)).join(' ');

/** In đầu dò dễ đọc (một dòng mỗi chi). */
export function formatProbe(p: PoseProbe): string {
  const before = (v: PoseVec) => (v[2] > 0 ? 'trước vai' : 'sau vai');
  return [
    `tay phải − vai: ${f2(p.handRFromShoulder)} (${before(p.handRFromShoulder)} ${Math.abs(p.handRFromShoulder[2]).toFixed(2)}m)`,
    `tay trái − vai: ${f2(p.handLFromShoulder)} (${before(p.handLFromShoulder)} ${Math.abs(p.handLFromShoulder[2]).toFixed(2)}m)`,
    `chân phải [x nhấc z]: ${f2(p.footR)}${Math.abs(p.footR[1]) < 0.01 ? ' (chạm đất)' : ''}`,
    `chân trái [x nhấc z]: ${f2(p.footL)}${Math.abs(p.footL[1]) < 0.01 ? ' (chạm đất)' : ''}`,
    `mũi kiếm: ${f2(p.sword)}  lưỡi: ${f2(p.edge)}`,
  ].join('\n');
}
