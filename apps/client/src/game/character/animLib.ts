import * as THREE from 'three/webgpu';
import { type AssetCache, type AssetHandle } from '../core/assets';

/** Thư viện clip dùng chung cho nhân vật người rig Mixamo (M2-3): tools/blender/export_anim_lib.py, không mesh. */
export const HUMAN_ANIM_LIB = 'anim_human_base';

/**
 * Thư viện clip K-3 (26 clip: đi lùi/ngang, thủ thế, đỡ, né, trúng đòn theo hướng, ngã/đứng dậy...), tách riêng khỏi thư viện nền để
 * mọi phiên chơi không phải tải thêm ~1,3 MB khi chưa dùng. Trang xem (`lib=1`) và máy trạng thái K-4 nạp lười; `preload.ts` không nạp.
 */
export const HUMAN_K3_LIB = 'anim_human_k3';

/**
 * Thư viện clip UAL (Quaternius, CC0, 17 clip chọn lọc: chết, trúng đòn, ngã/dậy, lướt, nhảy, thủ thế kiếm, idle NPC), nguồn Z-up
 * nên `retargetClips` đo độ cao/độ dời hông trong không gian thế giới. Nạp lười cùng lúc với K-3; `preload.ts` không nạp.
 */
export const HUMAN_UAL_LIB = 'anim_human_ual';

/** Tần số lấy mẫu clip sau retarget (khung/giây). */
const RETARGET_FPS = 30;
const EPS = 1e-5;

interface BoneInfo {
  name: string;
  parent: number;
  /** Quay cục bộ và quay thế giới ở tư thế nghỉ. */
  local: THREE.Quaternion;
  world: THREE.Quaternion;
  pos: THREE.Vector3;
}

/** Xương theo thứ tự duyệt (cha trước con). Thư viện không mesh nên xương là Object3D thường: lấy theo tên `mixamorig_*`. */
function skeletonOf(root: THREE.Object3D, isBone: (o: THREE.Object3D) => boolean): { bones: BoneInfo[]; index: Map<string, number> } {
  root.updateMatrixWorld(true);
  const bones: BoneInfo[] = [];
  const index = new Map<string, number>();
  const owner = new Map<THREE.Object3D, number>();
  root.traverse((o) => {
    if (!o.name || !isBone(o)) return;
    let p: THREE.Object3D | null = o.parent;
    while (p && !owner.has(p)) p = p.parent;
    const name = THREE.PropertyBinding.sanitizeNodeName(o.name);
    index.set(name, bones.length);
    owner.set(o, bones.length);
    bones.push({
      name,
      parent: p ? owner.get(p)! : -1,
      local: o.quaternion.clone(),
      world: o.getWorldQuaternion(new THREE.Quaternion()),
      pos: o.position.clone(),
    });
  });
  return { bones, index };
}

/** Quay thế giới của nút cha ngoài cây xương (nút rig, thường là đơn vị) của xương gốc. */
function rootParentWorld(root: THREE.Object3D, isBone: (o: THREE.Object3D) => boolean): THREE.Quaternion {
  let top: THREE.Object3D | null = null;
  root.traverse((o) => {
    if (!top && o.name && isBone(o)) top = o;
  });
  return top && (top as THREE.Object3D).parent ? (top as THREE.Object3D).parent!.getWorldQuaternion(new THREE.Quaternion()) : new THREE.Quaternion();
}

/** `createInterpolant` có trên đối tượng track của three nhưng thiếu trong kiểu. */
function interpolantOf(tr: THREE.KeyframeTrack, size: number): THREE.Interpolant {
  return (tr as unknown as { createInterpolant(result?: Float32Array): THREE.Interpolant }).createInterpolant(new Float32Array(size));
}

const isMixamo = (o: THREE.Object3D) => (o as THREE.Bone).isBone || o.name.startsWith('mixamorig_');
const isRigBone = (o: THREE.Object3D) => (o as THREE.Bone).isBone;

/**
 * Retarget clip của thư viện sang một nhân vật đích theo tên xương, trong không gian thế giới: Tripo auto-rig đặt tư thế
 * nghỉ chữ T hơi khác nhau mỗi nhân vật (tay lệch tới ~30°, cột sống ~15°), nên áp thẳng quay cục bộ sẽ sai tư thế.
 * Với mỗi khung: Δ = quay thế giới của xương nguồn (đang diễn) · quay thế giới nghỉ của nó⁻¹; quay thế giới đích =
 * Δ · quay thế giới nghỉ của đích; quay cục bộ đích = (quay thế giới đã tính của cha đích)⁻¹ · quay thế giới đích. Hướng
 * xương theo đúng chuyển động nguồn mà giữ độ lệch nghỉ riêng của nhân vật. Chỉ hông có kênh vị trí:
 * vị trí đích = nghỉ đích + k · (vị trí nguồn − nghỉ nguồn) với k = độ cao hông đích / nguồn, nên chân dài ngắn khác nhau
 * vẫn bám đất và bước đúng tỉ lệ. Xương đích không có trong thư viện (kiếm, vạt áo) giữ tư thế nghỉ; kênh scale bỏ.
 * Lấy mẫu 30 khung/giây; xương đứng yên cả clip chỉ giữ 2 khóa.
 */
interface RetargetOpts {
  /** Đổi tên xương đích sang tên khóa của nguồn (`mixamorig_*`), vd. xương Mannequin → Mixamo; trả undefined nếu không có tương ứng. */
  dstName?: (name: string) => string | undefined;
  /** Chỉ xuất kênh cho xương đích mà clip nguồn CÓ kênh quay (clip che nửa thân `upper`/`lower`: xương còn lại để trống để chồng được lên clip khác). */
  trackedOnly?: boolean;
}

export function retargetClips(libScene: THREE.Object3D, libClips: readonly THREE.AnimationClip[], target: THREE.Object3D, opts: RetargetOpts = {}): THREE.AnimationClip[] {
  const src = skeletonOf(libScene, isMixamo);
  const dst = skeletonOf(target, isRigBone);
  const srcRootW = rootParentWorld(libScene, isMixamo);
  const dstRootW = rootParentWorld(target, isRigBone);
  const hipsS = src.index.get('mixamorig_hips');
  const dstKey = dst.bones.map((b) => (opts.dstName ? opts.dstName(b.name) : b.name) ?? '');
  const hipsDi = dstKey.indexOf('mixamorig_hips');
  const hipsD = hipsDi >= 0 ? hipsDi : undefined;
  // Độ cao hông đo trong không gian thế giới (nguồn Z-up như UAL có root xoay -90° X: trục đứng nằm ở Z cục bộ của hông).
  const parentW = (set: { bones: BoneInfo[] }, h: number, rootW: THREE.Quaternion) => {
    const p = set.bones[h].parent;
    return p >= 0 ? set.bones[p].world : rootW;
  };
  const hipHeight = (set: { bones: BoneInfo[] }, h: number, rootW: THREE.Quaternion) => set.bones[h].pos.clone().applyQuaternion(parentW(set, h, rootW)).y;
  const hS = hipsS !== undefined ? hipHeight(src, hipsS, srcRootW) : 0;
  const hD = hipsD !== undefined ? hipHeight(dst, hipsD, dstRootW) : 0;
  const k = hS > 1e-6 && hD > 0 ? hD / hS : 1;

  // Xương đích có nguồn tương ứng.
  const map = dstKey.map((k) => src.index.get(k) ?? -1);
  const srcInv = src.bones.map((b) => b.world.clone().invert());
  const qa = new THREE.Quaternion();
  const delta = new THREE.Quaternion();

  return libClips.map((clip) => {
    // Nội suy từng kênh quay/vị trí hông của nguồn.
    const rotI = new Map<number, THREE.Interpolant>();
    let posI: THREE.Interpolant | null = null;
    for (const tr of clip.tracks) {
      const dot = tr.name.lastIndexOf('.');
      const name = tr.name.slice(0, dot);
      const prop = tr.name.slice(dot + 1);
      const i = src.index.get(name);
      if (i === undefined) continue;
      if (prop === 'quaternion') rotI.set(i, interpolantOf(tr, 4));
      else if (prop === 'position' && i === hipsS) posI = interpolantOf(tr, 3);
    }
    const n = Math.max(1, Math.round(clip.duration * RETARGET_FPS));
    const times = new Float32Array(n + 1);
    for (let f = 0; f <= n; f++) times[f] = Math.min(clip.duration, f / RETARGET_FPS);
    const vals = dst.bones.map(() => new Float32Array((n + 1) * 4));
    const hipPos = new Float32Array((n + 1) * 3);
    const srcWorld = src.bones.map(() => new THREE.Quaternion());
    const dstWorld = dst.bones.map(() => new THREE.Quaternion());
    for (let f = 0; f <= n; f++) {
      const t = times[f];
      for (let i = 0; i < src.bones.length; i++) {
        const b = src.bones[i];
        const it = rotI.get(i);
        if (it) {
          const r = it.evaluate(t) as unknown as ArrayLike<number>;
          qa.set(r[0], r[1], r[2], r[3]);
        } else qa.copy(b.local);
        srcWorld[i].copy(b.parent >= 0 ? srcWorld[b.parent] : srcRootW).multiply(qa);
      }
      for (let j = 0; j < dst.bones.length; j++) {
        const b = dst.bones[j];
        const pw = b.parent >= 0 ? dstWorld[b.parent] : dstRootW;
        const si = map[j];
        if (si < 0) {
          qa.copy(b.local);
          dstWorld[j].copy(pw).multiply(qa);
        } else {
          delta.copy(srcWorld[si]).multiply(srcInv[si]);
          dstWorld[j].copy(delta).multiply(b.world);
          qa.copy(pw).invert().multiply(dstWorld[j]);
        }
        // Liên tục dấu để nội suy tuyến tính không đi đường vòng.
        const o = vals[j];
        if (f > 0 && qa.x * o[(f - 1) * 4] + qa.y * o[(f - 1) * 4 + 1] + qa.z * o[(f - 1) * 4 + 2] + qa.w * o[(f - 1) * 4 + 3] < 0) {
          qa.set(-qa.x, -qa.y, -qa.z, -qa.w);
        }
        o[f * 4] = qa.x;
        o[f * 4 + 1] = qa.y;
        o[f * 4 + 2] = qa.z;
        o[f * 4 + 3] = qa.w;
      }
      if (posI && hipsD !== undefined && hipsS !== undefined) {
        const p = posI.evaluate(t) as unknown as ArrayLike<number>;
        const sp = src.bones[hipsS].pos;
        const dp = dst.bones[hipsD].pos;
        // Độ dời hông: nguồn → thế giới (quay thế giới của cha hông nguồn, khung đang diễn) → cha hông đích.
        const pwS = src.bones[hipsS].parent >= 0 ? srcWorld[src.bones[hipsS].parent] : srcRootW;
        const pwD = dst.bones[hipsD].parent >= 0 ? dstWorld[dst.bones[hipsD].parent] : dstRootW;
        const d = new THREE.Vector3(p[0] - sp.x, p[1] - sp.y, p[2] - sp.z).applyQuaternion(pwS).multiplyScalar(k).applyQuaternion(pwD.clone().invert());
        hipPos[f * 3] = dp.x + d.x;
        hipPos[f * 3 + 1] = dp.y + d.y;
        hipPos[f * 3 + 2] = dp.z + d.z;
      }
    }
    const tracks: THREE.KeyframeTrack[] = [];
    for (let j = 0; j < dst.bones.length; j++) {
      if (map[j] < 0) continue;
      if (opts.trackedOnly && !rotI.has(map[j])) continue;
      const v = vals[j];
      let still = true;
      for (let f = 1; f <= n && still; f++) for (let c = 0; c < 4; c++) if (Math.abs(v[f * 4 + c] - v[c]) > EPS) still = false;
      const name = `${dst.bones[j].name}.quaternion`;
      tracks.push(still ? new THREE.QuaternionKeyframeTrack(name, [0, clip.duration], [...v.slice(0, 4), ...v.slice(0, 4)]) : new THREE.QuaternionKeyframeTrack(name, times, v));
    }
    if (posI && hipsD !== undefined) tracks.push(new THREE.VectorKeyframeTrack(`${dst.bones[hipsD].name}.position`, times, hipPos));
    return new THREE.AnimationClip(clip.name, clip.duration, tracks, clip.blendMode);
  });
}

/** Clip riêng của asset (nếu có) thắng clip chung cùng tên; `own` có thể rỗng (asset không còn mang clip). */
export function mergeClips(own: readonly THREE.AnimationClip[], shared: readonly THREE.AnimationClip[]): THREE.AnimationClip[] {
  const names = new Set(own.map((c) => c.name));
  return [...own, ...shared.filter((c) => !names.has(c.name))];
}

/**
 * Nạp thư viện (một lần cho cả cache nhờ AssetCache dùng chung bản gốc) cùng handle của nhân vật. Trả handle thư viện để
 * người gọi `release()` khi bỏ. Thư viện lỗi thì ném lỗi: người gọi quyết định dự phòng (model khối).
 */
async function acquireHumanLib(cache: AssetCache, priority = 1): Promise<AssetHandle> {
  return cache.acquire(HUMAN_ANIM_LIB, { priority });
}

/**
 * Nạp asset nhân vật cùng thư viện clip. Một bên lỗi thì handle bên đã nạp xong được `release()` trước khi ném lỗi,
 * nên `AssetCache` không giữ ref treo.
 */
export async function acquireWithHumanLib(cache: AssetCache, id: string, priority = 1): Promise<[AssetHandle, AssetHandle]> {
  const [a, b] = await Promise.allSettled([cache.acquire(id, { priority }), acquireHumanLib(cache, priority)]);
  if (a.status === 'fulfilled' && b.status === 'fulfilled') return [a.value, b.value];
  if (a.status === 'fulfilled') a.value.release();
  if (b.status === 'fulfilled') b.value.release();
  throw (a.status === 'rejected' ? a.reason : (b as PromiseRejectedResult).reason) as Error;
}
