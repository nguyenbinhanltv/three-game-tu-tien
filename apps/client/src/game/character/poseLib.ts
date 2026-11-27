import type * as THREE from 'three/webgpu';
import { POSE_CAST, POSE_FLY, POSE_SKY, POSE_SWORD_DRAW, POSE_SWORD_SHEATHE, type PoseDef } from '@dtl/shared';
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
  /** Chỉ cánh tay phải: động tác phụ chồng lên mọi trạng thái nền (rút/tra kiếm, `SWORD_GESTURES`). */
  arm?: THREE.AnimationClip;
}

export type PoseLibrary = ReadonlyMap<string, PoseClips>;

/** Pose động tác phụ chỉ dùng cánh tay phải (M3-2). */
const SWORD_GESTURES = new Set([POSE_SWORD_DRAW, POSE_SWORD_SHEATHE]);

/**
 * Nướng mọi pose cho một asset người (bản gốc trong AssetCache, ở tư thế nghỉ). Clip theo tên xương nên dùng chung
 * cho mọi bản sao. Trả về null nếu không phải rig người Mixamo. Rig được trả về tư thế nghỉ sau khi nướng.
 */
export function bakePoseLibrary(root: THREE.Object3D, poses: readonly PoseDef[]): PoseLibrary | null {
  const rig = IkRig.from(root);
  if (!rig) return null;
  return new LazyPoseLibrary(rig, poses);
}

/** Mọi thư viện pose còn sống (tham chiếu yếu): để nạp lại tức thì ở bản dev tìm được chỗ quên clip cũ. */
const LIBS = new Set<WeakRef<LazyPoseLibrary>>();

/**
 * Nạp lại pose tức thì (Diễn Võ Trường V3, chỉ bản dev): dữ liệu của pose `def.id` vừa đổi tại chỗ, quên clip đã nướng ở mọi thư viện.
 * Chỉ có tác dụng với pose CHIÊU (lấy clip qua `get` mỗi lần ra đòn); pose nền đã nối vào bảng clip lúc dựng nhân vật thì phải tải lại trang.
 * Trả số thư viện đã quên.
 */
export function forgetPoseBake(def: PoseDef): number {
  let n = 0;
  for (const ref of LIBS) {
    const lib = ref.deref();
    if (!lib) LIBS.delete(ref);
    else if (lib.forget(def)) n++;
  }
  return n;
}

/**
 * Thư viện pose nướng lười: pose nền/phụ (không có khung vung) nướng ngay vì được nối vào bảng clip; pose chiêu (có `hit`,
 * ~30 pose sau K-5, mỗi pose ba clip dày khung) chỉ nướng lần đầu `get`. Nướng hết lúc nạp làm tăng bộ nhớ ngoài heap và
 * nhịp GC (CPU p95 +1 ms ở bench); chiêu thật sự dùng chỉ vài pose. `has` đúng cho cả pose chưa nướng; duyệt (`values`)
 * chỉ gồm pose đã nướng.
 */
class LazyPoseLibrary extends Map<string, PoseClips> {
  private pending = new Map<string, PoseDef>();
  constructor(
    private rig: IkRig,
    poses: readonly PoseDef[],
  ) {
    super();
    LIBS.add(new WeakRef(this));
    for (const def of poses) {
      if (def.hit) this.pending.set(def.id, def);
      else this.bake(def);
    }
  }
  private bake(def: PoseDef): PoseClips {
    const full = bakePose(def, this.rig);
    const arm = SWORD_GESTURES.has(def.id) ? maskClip(full, this.rig, 'armR') : undefined;
    const c: PoseClips = { def, full, upper: maskClip(full, this.rig, 'upper'), lower: maskClip(full, this.rig, 'lower'), arm };
    super.set(def.id, c);
    this.pending.delete(def.id);
    return c;
  }
  override get(id: string): PoseClips | undefined {
    const c = super.get(id);
    if (c) return c;
    const def = this.pending.get(id);
    return def ? this.bake(def) : undefined;
  }
  /** Quên clip đã nướng của pose `def.id` (dữ liệu pose vừa đổi): lần `get` kế nướng lại từ `def`. Trả true nếu thư viện có pose này. */
  forget(def: PoseDef): boolean {
    if (!this.has(def.id)) return false;
    super.delete(def.id);
    this.pending.set(def.id, def);
    return true;
  }
  /** Số pose có trong thư viện (cả pose chưa nướng). */
  override get size(): number {
    return super.size + this.pending.size;
  }
  override has(id: string): boolean {
    return super.has(id) || this.pending.has(id);
  }
}

/** Mọi clip của thư viện (để `SkinnedCharacter` tra theo tên, vd. `pose_ngu_kiem` cho trạng thái bay). */
export function libraryClips(lib: PoseLibrary): THREE.AnimationClip[] {
  return [...lib.values()].map((c) => c.full);
}

export { poseClipName };

/** Clip nền nướng từ pose: bay đứng trên kiếm, niệm chú (asset người không có clip riêng cho hai trạng thái này). */
export const POSE_BASE_CLIPS: ClipMap = { fly: poseClipName(POSE_FLY), sky: poseClipName(POSE_SKY), cast: poseClipName(POSE_CAST) };

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
export function withPoses(
  template: THREE.Object3D,
  clipMap: ClipMap,
  poses: readonly PoseDef[] = POSES,
): { poses?: PoseLibrary; clipMap: ClipMap } {
  const lib = bakePoseLibrary(template, poses);
  if (!lib) return { clipMap };
  return { poses: lib, clipMap: { ...POSE_BASE_CLIPS, ...clipMap } };
}
