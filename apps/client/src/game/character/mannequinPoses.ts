// Tư thế chiêu K-5 cho nhân vật v3 (N-7): pose IK thủ tục nướng trên một bộ xương Mixamo mẫu rồi retarget sang xương UE5 Mannequin.
//
// Pose K-5 (`packages/content/data/poses/`) là IK trên xương Mixamo (`ikpose.ts`). Thay vì viết lại IK cho Mannequin, ta nướng pose trên một
// asset Mixamo có sẵn (`chr_v2_nam`), rồi `retargetClips` (cùng thuật toán retarget K-3/UAL: trong không gian thế giới, giữ độ lệch nghỉ riêng
// của đích) với bảng đổi tên Mannequin → Mixamo. Clip che nửa thân (`upper`/`lower`) chỉ xuất kênh cho xương nguồn có kênh, nên chồng được lên
// clip chạy như ở `SkinnedCharacter`. Nướng và retarget LƯỜI theo pose, bộ nhớ đệm theo template.
import * as THREE from 'three/webgpu';
import { POSES } from '@dtl/content';
import { retargetClips } from './animLib';
import { bakePoseLibrary, poseClipName, type PoseClips, type PoseLibrary } from './poseLib';

/** Asset Mixamo dùng làm nguồn nướng pose (nhỏ nhất trong các nhân vật Mixamo của game). */
export const POSE_SOURCE_ASSET = 'chr_v2_nam';

const LIMB: Record<string, string> = {
  shoulder: 'clavicle',
  arm: 'upperarm',
  forearm: 'lowerarm',
  hand: 'hand',
  upleg: 'thigh',
  leg: 'calf',
  foot: 'foot',
  toebase: 'ball',
};
const SPINE: Record<string, string> = {
  pelvis: 'hips',
  spine_01: 'spine',
  spine_02: 'spine1',
  spine_03: 'spine2',
  neck_01: 'neck',
  Head: 'head',
};
const MIXAMO_FROM_LIMB = Object.fromEntries(Object.entries(LIMB).map(([mx, mq]) => [mq, mx]));
const FINGER = new Set(['thumb', 'index', 'middle', 'ring', 'pinky']);

/** Tên xương Mannequin → khóa Mixamo của nguồn (`mixamorig_*`); undefined nếu không có tương ứng (xương lò xo, twist, `dtl_*`, lá). */
export function mannequinToMixamo(name: string): string | undefined {
  if (SPINE[name]) return `mixamorig_${SPINE[name]}`;
  let m = /^(clavicle|upperarm|lowerarm|hand|thigh|calf|foot|ball)_([lr])$/.exec(name);
  if (m) return `mixamorig_${m[2] === 'l' ? 'left' : 'right'}${MIXAMO_FROM_LIMB[m[1]!]}`;
  m = /^(thumb|index|middle|ring|pinky)_0([123])_([lr])$/.exec(name);
  if (m && FINGER.has(m[1]!)) return `mixamorig_${m[3] === 'l' ? 'left' : 'right'}hand${m[1]}${m[2]}`;
  return undefined;
}

/**
 * Clip pose chỉ ghi xoay (và vị trí hông), nên khi clip nền UAL tắt, xương chi trở về độ dài bind (cánh tay trên +12%, cẳng tay +26% so với đo
 * ở clip UAL) và tay "dài ra" ở khung chiêu. Bù: với mỗi xương chi mà clip pose có điều khiển xoay nhưng không có vị trí, thêm track vị trí hằng lấy
 * khung đầu của clip nền `ref` (UAL `Idle_Loop`), để độ dài xương không đổi giữa chạy/idle và chiêu. Không đụng hông (`pelvis`).
 */
export function matchLimbLengths(clip: THREE.AnimationClip, ref: THREE.AnimationClip | undefined): void {
  if (!ref) return;
  const rotated = new Set<string>();
  const placed = new Set<string>();
  for (const t of clip.tracks) {
    if (t.name.endsWith('.quaternion')) rotated.add(t.name.slice(0, -'.quaternion'.length));
    else if (t.name.endsWith('.position')) placed.add(t.name.slice(0, -'.position'.length));
  }
  for (const t of ref.tracks) {
    if (!t.name.endsWith('.position')) continue;
    const bone = t.name.slice(0, -'.position'.length);
    if (bone === 'pelvis' || placed.has(bone) || !rotated.has(bone)) continue;
    clip.tracks.push(new THREE.VectorKeyframeTrack(t.name, [0], Array.from(t.values.slice(0, 3))));
  }
}

/** Nguồn nướng pose dùng chung mọi template: thư viện pose lười trên asset Mixamo ở tư thế nghỉ. */
export class PoseSource {
  readonly lib: PoseLibrary;
  constructor(readonly ref: THREE.Object3D) {
    const lib = bakePoseLibrary(ref, POSES);
    if (!lib) throw new Error('asset nguồn pose không phải rig Mixamo');
    this.lib = lib;
  }
}

/** Pose chiêu đã retarget sang một model Mannequin cụ thể. */
export interface MqPose {
  def: PoseClips['def'];
  full: THREE.AnimationClip;
  upper: THREE.AnimationClip;
  lower: THREE.AnimationClip;
}

export class MannequinPoseBank {
  private cache = new Map<string, MqPose | null>();
  private base = new Map<string, THREE.AnimationClip | null>();
  constructor(
    private src: PoseSource,
    private target: THREE.Object3D,
    /** Clip nền UAL (`Idle_Loop`) của template, để khớp độ dài xương chi (xem `matchLimbLengths`); có thể chưa có. */
    private limbRef: () => THREE.AnimationClip | undefined = () => undefined,
  ) {}

  has(id: string): boolean {
    return this.src.lib.has(id);
  }

  /** Pose chiêu (ba clip) cho model này; nướng + retarget lần đầu gọi. */
  get(id: string): MqPose | undefined {
    const hit = this.cache.get(id);
    if (hit !== undefined) return hit ?? undefined;
    const c = this.src.lib.get(id);
    if (!c) {
      this.cache.set(id, null);
      return undefined;
    }
    const [full] = retargetClips(this.src.ref, [c.full], this.target, { dstName: mannequinToMixamo });
    const [upper, lower] = retargetClips(this.src.ref, [c.upper, c.lower], this.target, { dstName: mannequinToMixamo, trackedOnly: true });
    if (!full || !upper || !lower) {
      this.cache.set(id, null);
      return undefined;
    }
    const ref = this.limbRef();
    for (const cl of [full, upper, lower]) matchLimbLengths(cl, ref);
    const out: MqPose = { def: c.def, full, upper, lower };
    this.cache.set(id, out);
    return out;
  }

  /** Clip nền toàn thân (bay, ngự không, niệm chú, đả tọa) theo id pose; tên clip `pose_<id>`. */
  baseClip(clipName: string): THREE.AnimationClip | undefined {
    const hit = this.base.get(clipName);
    if (hit !== undefined) return hit ?? undefined;
    const id = clipName.startsWith('pose_') ? clipName.slice(5) : clipName;
    const p = this.has(id) ? this.get(id) : undefined;
    this.base.set(clipName, p?.full ?? null);
    return p?.full;
  }
}

export { poseClipName };

const LOWER = /^(pelvis|thigh|calf|foot|ball)/;

/** Clip chỉ giữ kênh nửa thân dưới (hông + chân): dùng để vẫn chạy chân trong lúc nửa trên ra chiêu. Có bộ nhớ đệm theo clip. */
const lowerCache = new WeakMap<THREE.AnimationClip, THREE.AnimationClip>();
export function lowerBodyOf(clip: THREE.AnimationClip): THREE.AnimationClip {
  let c = lowerCache.get(clip);
  if (!c) {
    c = clip.clone();
    c.tracks = c.tracks.filter((t) => LOWER.test(t.name.slice(0, t.name.lastIndexOf('.'))));
    c.name = `${clip.name}|lower`;
    lowerCache.set(clip, c);
  }
  return c;
}

const UPPER_EXCLUDE = /^(pelvis|thigh|calf|foot|ball)/;
const upperCache = new WeakMap<THREE.AnimationClip, THREE.AnimationClip>();
/** Clip chỉ giữ kênh nửa thân trên (cột sống, tay, đầu, xương phụ): đòn chém khi vừa chạy, chân vẫn theo clip chạy (v3 animation). */
export function upperBodyOf(clip: THREE.AnimationClip): THREE.AnimationClip {
  let c = upperCache.get(clip);
  if (!c) {
    c = clip.clone();
    c.tracks = c.tracks.filter((t) => !UPPER_EXCLUDE.test(t.name.slice(0, t.name.lastIndexOf('.'))));
    c.name = `${clip.name}|upper`;
    upperCache.set(clip, c);
  }
  return c;
}
