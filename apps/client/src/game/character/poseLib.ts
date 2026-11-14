import type * as THREE from 'three/webgpu';
import { POSE_CAST, POSE_FLY, type PoseDef } from '@dtl/shared';
import { POSES } from '@dtl/content';
import { bakePose, IkRig, maskClip, poseClipName } from './ikpose';
import type { ClipMap } from './states';

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

/** Clip nền nướng từ pose: bay đứng trên kiếm, niệm chú (asset người không có clip riêng cho hai trạng thái này). */
export const POSE_BASE_CLIPS: ClipMap = { fly: poseClipName(POSE_FLY), cast: poseClipName(POSE_CAST) };

/**
 * Điểm nối cho model người có xương (M3-5 dựng người chơi): nướng thư viện pose từ bản gốc của asset (tư thế nghỉ,
 * gọi một lần mỗi asset rồi dùng chung cho mọi bản sao) và trả về phần thêm vào `SkinnedOpts`:
 *
 *   const extra = withPoses(handle.scene, { idle: 'idle', run: 'run', hit: 'hit_light', death: 'death' });
 *   new SkinnedCharacter({ scene: cloneSkinned(handle.scene), clips: handle.animations, ...extra, ... });
 *
 * Có `poses` thì ra chiêu dùng động tác riêng (`perform`, engine gọi theo FX), không dùng clip `attack` của asset.
 * Clip bay/niệm chú của asset (nếu có trong `clipMap`) được giữ, chỉ thêm khi thiếu. Không phải rig người → không có pose.
 */
export function withPoses(template: THREE.Object3D, clipMap: ClipMap, poses: readonly PoseDef[] = POSES): { poses?: PoseLibrary; clipMap: ClipMap } {
  const lib = bakePoseLibrary(template, poses);
  if (!lib) return { clipMap };
  return { poses: lib, clipMap: { ...POSE_BASE_CLIPS, ...clipMap } };
}
