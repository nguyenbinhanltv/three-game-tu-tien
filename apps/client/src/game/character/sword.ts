import * as THREE from 'three/webgpu';
import { IkRig } from './ikpose';

/** Kiếm tách sang xương riêng (tools/blender/biped_parts.py `sword_socket`); tọa độ glTF lúc nghỉ, hệ của asset. */
export interface SwordExtras {
  bone: string;
  /** Tâm chuôi (chỗ lòng bàn tay nắm). */
  grip: number[];
  /** Hướng từ chuôi tới mũi. */
  tip: number[];
  /** Hướng lưỡi (cạnh sắc), vuông góc gần đúng với `tip`. */
  edge: number[];
}

/** Xương lò xo (biped_parts.py `skirt_springs`): đuôi xương lúc nghỉ, tọa độ glTF hệ của asset. */
export interface SpringExtras {
  bone: string;
  tail: number[];
}

export interface PartExtras {
  sword?: SwordExtras;
  /** Model kiếm riêng (prop_kiem_*, `swordModel.ts`): số đo theo trục mũi. */
  blade?: Record<string, number>;
  springs?: SpringExtras[];
}

/** Extras `dtl` (chuỗi JSON) của mesh LOD0 trong asset; rỗng nếu không có hoặc lỗi. */
export function partExtras(scene: THREE.Object3D): PartExtras {
  let raw: unknown;
  scene.traverse((o) => {
    if (raw === undefined && (o as THREE.Mesh).isMesh && !(o.userData.lod > 0) && typeof o.userData.dtl === 'string') raw = o.userData.dtl;
  });
  if (typeof raw !== 'string') return {};
  try {
    return JSON.parse(raw) as PartExtras;
  } catch (err) {
    console.warn('[models] extras dtl không đọc được', err);
    return {};
  }
}

/** Hai chỗ gắn của xương kiếm (ma trận cục bộ so với xương cha), tính một lần từ bản gốc ở tư thế nghỉ. */
export interface SwordSocketDef {
  bone: string;
  /** Xương lưng (cha lúc tra kiếm). */
  back: string;
  /** Xương bàn tay phải (cha lúc cầm kiếm). */
  hand: string;
  backLocal: THREE.Matrix4;
  handLocal: THREE.Matrix4;
  /** Khung chuôi (X lưỡi, Z mũi, gốc tâm chuôi) trong hệ xương kiếm: chỗ đặt vỏ sáng cường hóa (`swordGlow.ts`). */
  glowLocal: THREE.Matrix4;
}

const v3 = (a: number[]) => new THREE.Vector3(a[0], a[1], a[2]);

/**
 * Lúc cầm: khung chuôi G (X = lưỡi, Z = mũi, gốc ở tâm chuôi) trùng chỗ gắn kiếm của bàn tay phải (`IkRig.swordMount`,
 * cùng quy ước với pose đòn: mũi theo `sword`, lưỡi theo `edge`). Xương kiếm so với bàn tay = mount · G⁻¹ · xươngKiếm,
 * với G và xươngKiếm lấy ở tư thế nghỉ (lúc kiếm còn trên lưng). Null nếu asset không có xương kiếm hoặc không phải
 * rig người Mixamo.
 */
export function swordSocketDef(template: THREE.Object3D, ex: SwordExtras): SwordSocketDef | null {
  const bone = template.getObjectByName(ex.bone) as THREE.Bone | undefined;
  if (!bone?.isBone || !(bone.parent as THREE.Bone | null)?.isBone) return null;
  const rig = IkRig.from(template);
  if (!rig) return null;
  const hand = rig.bones.handR!;
  template.updateMatrixWorld(true);
  const toScene = template.matrixWorld.clone().invert();
  const boneW = toScene.clone().multiply(bone.matrixWorld);
  const tip = v3(ex.tip).normalize();
  const edge = v3(ex.edge);
  edge.addScaledVector(tip, -edge.dot(tip)).normalize();
  const g = new THREE.Matrix4().makeBasis(edge, new THREE.Vector3().crossVectors(tip, edge), tip).setPosition(v3(ex.grip));
  const glowLocal = boneW.clone().invert().multiply(g);
  const mount = rig.swordMount();
  // Bỏ scale của bàn tay (Mixamo có thể mang scale 0,01 ở Armature) để kiếm giữ đúng cỡ.
  const ws = 1 / (toScene.clone().multiply(hand.matrixWorld).getMaxScaleOnAxis() || 1);
  const handLocal = new THREE.Matrix4().compose(mount.position, mount.quaternion, new THREE.Vector3(ws, ws, ws)).multiply(g.invert()).multiply(boneW);
  return { bone: bone.name, back: bone.parent!.name, hand: hand.name, backLocal: bone.matrix.clone(), handLocal, glowLocal };
}

/** Chỗ gắn kiếm của một bản sao: đổi cha xương kiếm giữa lưng và tay phải. Không thêm mesh, mọi LOD đi theo. */
export class SwordSocket {
  private bone: THREE.Bone;
  private back: THREE.Object3D;
  private hand: THREE.Object3D;
  private inHand = false;

  /** `rig`: cây xương của bản sao (đã tách khỏi cảnh, xem `SkinnedCharacter.rig`). Null nếu thiếu xương. */
  /** `onChange`: gọi sau khi đổi socket (ma trận xương kiếm đổi ngoài mixer, xem `SkinnedCharacter.rigChanged`). */
  static create(rig: THREE.Object3D, def: SwordSocketDef, onChange: () => void = () => {}): SwordSocket | null {
    const bone = rig.getObjectByName(def.bone) as THREE.Bone | undefined;
    const back = rig.getObjectByName(def.back);
    const hand = rig.getObjectByName(def.hand);
    return bone?.isBone && back && hand ? new SwordSocket(bone, back, hand, def, onChange) : null;
  }

  private constructor(
    bone: THREE.Bone,
    back: THREE.Object3D,
    hand: THREE.Object3D,
    private def: SwordSocketDef,
    private onChange: () => void,
  ) {
    this.bone = bone;
    this.back = back;
    this.hand = hand;
  }

  get drawn(): boolean {
    return this.inHand;
  }

  /** Ma trận thế giới (hệ model) của xương kiếm, dùng để đặt vỏ sáng. */
  get boneWorld(): THREE.Matrix4 {
    return this.bone.matrixWorld;
  }

  get glowLocal(): THREE.Matrix4 {
    return this.def.glowLocal;
  }

  set(inHand: boolean): void {
    if (inHand === this.inHand) return;
    this.inHand = inHand;
    (inHand ? this.hand : this.back).add(this.bone);
    (inHand ? this.def.handLocal : this.def.backLocal).decompose(this.bone.position, this.bone.quaternion, this.bone.scale);
    this.bone.updateMatrixWorld(true);
    this.onChange();
  }

  /** Vị trí tâm chuôi trong hệ của rig (cho test). */
  gripPosition(target = new THREE.Vector3()): THREE.Vector3 {
    return target.setFromMatrixPosition(this.bone.matrixWorld);
  }
}

/** Bỏ kênh của xương phụ do pipeline thêm (`dtl_*`: kiếm, lò xo): exporter Blender lấy mẫu cả chúng ở tư thế nghỉ. */
export function stripPartTracks(clip: THREE.AnimationClip): THREE.AnimationClip {
  const keep = clip.tracks.filter((t) => !THREE.PropertyBinding.parseTrackName(t.name).nodeName.startsWith('dtl_'));
  if (keep.length === clip.tracks.length) return clip;
  return new THREE.AnimationClip(clip.name, clip.duration, keep, clip.blendMode);
}
