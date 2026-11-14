import type * as THREE from 'three/webgpu';
import type { PoseDef } from '@dtl/shared';
import { bakePose, IkRig, maskClip, poseClipName } from './ikpose';

/** Clip nướng từ một pose: cả người (trạng thái nền lặp) và hai nửa thân (đòn một lần chồng lên nền). */
export interface PoseClips {
  def: PoseDef;
  full: THREE.AnimationClip;
  /** Cột sống trở lên: luôn theo pose khi ra đòn, kể cả lúc đang chạy. */
  upper: THREE.AnimationClip;
  /** Hông và chân: chỉ theo pose khi đứng yên, đang chạy thì để clip chạy giữ bước chân. */
  lower: THREE.AnimationClip;
}

export type PoseLibrary = ReadonlyMap<string, PoseClips>;

/**
 * Nướng mọi pose cho một asset người (bản gốc trong AssetCache, ở tư thế nghỉ). Clip theo tên xương nên dùng chung
 * cho mọi bản sao. Trả về null nếu không phải rig người Mixamo. Rig được trả về tư thế nghỉ sau khi nướng.
 */
export function bakePoseLibrary(root: THREE.Object3D, poses: readonly PoseDef[]): PoseLibrary | null {
  const rig = IkRig.from(root);
  if (!rig) return null;
  const lib = new Map<string, PoseClips>();
  for (const def of poses) {
    const full = bakePose(def, rig);
    lib.set(def.id, { def, full, upper: maskClip(full, rig, 'upper'), lower: maskClip(full, rig, 'lower') });
  }
  return lib;
}

/** Mọi clip của thư viện (để `SkinnedCharacter` tra theo tên, vd. `pose_ngu_kiem` cho trạng thái bay). */
export function libraryClips(lib: PoseLibrary): THREE.AnimationClip[] {
  return [...lib.values()].map((c) => c.full);
}

export { poseClipName };
