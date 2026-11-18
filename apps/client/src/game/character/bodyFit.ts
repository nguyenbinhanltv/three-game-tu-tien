import * as THREE from 'three/webgpu';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { boneKey } from './ikpose';

/**
 * Đo thân người chơi ở tư thế idle để đặt phụ kiện đồ bộ (setAccessories.ts) ôm sát mà không xuyên mesh, cho cả nam lẫn
 * nữ (hai model khác tỉ lệ). Một lần cho mỗi asset: dựng bản sao, phát clip idle ở t = 0, rồi đọc vị trí xương và đỉnh
 * đã skin. Mọi tọa độ ở hệ `scene` của asset (mét, +Y lên, +Z phía trước, trái nhân vật = +X).
 */

/** Xương cần cho phụ kiện (tên đã chuẩn hóa bằng `boneKey`). */
export const FIT_BONES = [
  'hips',
  'spine',
  'spine1',
  'spine2',
  'neck',
  'head',
  'leftshoulder',
  'leftarm',
  'leftforearm',
  'lefthand',
  'leftupleg',
  'leftleg',
  'leftfoot',
  'rightshoulder',
  'rightarm',
  'rightforearm',
  'righthand',
  'rightupleg',
  'rightleg',
  'rightfoot',
] as const;
export type FitBone = (typeof FIT_BONES)[number];

export interface BoneFit {
  /** Ma trận thế giới (hệ scene) lúc nghỉ (T-pose) và lúc idle. */
  rest: THREE.Matrix4;
  posed: THREE.Matrix4;
  /** Vị trí khớp lúc idle. */
  pos: THREE.Vector3;
}

/** Ống quanh một đoạn xương (cẳng tay, ống chân): đường trục và bán kính lớn nhất của đỉnh thuộc xương đó. */
export interface TubeFit {
  center: THREE.Vector3;
  /** Hướng trục từ gần thân ra xa. */
  axis: THREE.Vector3;
  radius: number;
}

export interface BodyFit {
  /** Tỉ lệ chiều cao so với người chuẩn 1,75 m. */
  h: number;
  bones: Record<FitBone, BoneFit>;
  /** Eo (chỗ thắt đai): cao độ, tâm, nửa rộng ngang, nửa sâu phía trước và phía sau. */
  waist: { y: number; cx: number; cz: number; rx: number; zFront: number; zBack: number };
  /** Ngực (chỗ treo ngọc bội). */
  chest: { y: number; cx: number; rx: number; zFront: number; zBack: number };
  /** Vạt áo ở độ cao hông dưới đai (chỗ treo tua, dải lụa). */
  skirt: { y: number; cx: number; cz: number; rx: number; zFront: number; zBack: number };
  /** Điểm sau cùng của thân và vạt áo trong khoảng hông tới lưng (dải lụa phải nằm sau điểm này). */
  backZ: number;
  /** Vai (trái +1, phải −1). */
  /** Cánh tay trên (từ khớp vai, trục hướng xuống khuỷu): `center` là khớp vai. */
  shoulder: Record<1 | -1, TubeFit>;
  forearm: Record<1 | -1, TubeFit>;
  shin: Record<1 | -1, TubeFit>;
  /** Ma trận (hệ scene) của mesh LOD0 lúc nghỉ: đỉnh phụ kiện đổi về hệ cục bộ của mesh trước khi gắn xương. */
  meshToScene: THREE.Matrix4;
}

interface Vert {
  p: THREE.Vector3;
  /** Xương chủ đạo (theo trọng số skin). */
  b: string;
}

const TORSO = new Set(['hips', 'spine', 'spine1', 'spine2']);
const LEG = new Set(['leftupleg', 'leftleg', 'rightupleg', 'rightleg']);

/** Phân vị `q` của danh sách (bỏ đỉnh lạc, ví dụ đầu mũi vạt áo). */
function pct(a: number[], q: number): number {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.max(0, Math.round(q * (s.length - 1))))];
}

function tubeFit(verts: Vert[], bone: string, from: THREE.Vector3, to: THREE.Vector3, t0: number, t1: number): TubeFit {
  const axis = to.clone().sub(from);
  const len = axis.length();
  axis.divideScalar(len || 1);
  const d: number[] = [];
  for (const v of verts) {
    if (v.b !== bone) continue;
    const rel = v.p.clone().sub(from);
    const t = rel.dot(axis) / (len || 1);
    if (t < t0 || t > t1) continue;
    d.push(rel.addScaledVector(axis, -rel.dot(axis)).length());
  }
  const mid = from.clone().lerp(to, (t0 + t1) / 2);
  return { center: mid, axis, radius: d.length ? pct(d, 0.97) : 0.045 };
}

/**
 * `scene`: asset người chơi đã nạp (không bị sửa); `idle`: clip idle của nó (đã retarget). Trả null nếu thiếu xương
 * Mixamo hoặc mesh có xương LOD0 (rig lạ: không dựng phụ kiện).
 */
export function fitBody(scene: THREE.Object3D, idle: THREE.AnimationClip | undefined, height: number): BodyFit | null {
  const root = cloneSkinned(scene);
  let mesh: THREE.SkinnedMesh | null = null;
  root.traverse((o) => {
    const m = o as THREE.SkinnedMesh;
    if (m.isSkinnedMesh && !mesh && !(o.userData.lod > 0)) mesh = m;
  });
  const sm = mesh as THREE.SkinnedMesh | null;
  if (!sm) return null;
  root.updateMatrixWorld(true);
  const toScene = root.matrixWorld.clone().invert();
  const named = new Map<string, THREE.Object3D>();
  root.traverse((o) => {
    if ((o as THREE.Bone).isBone) named.set(boneKey(o.name), o);
  });
  if (FIT_BONES.some((k) => !named.has(k))) return null;
  const rest = new Map<string, THREE.Matrix4>();
  for (const k of FIT_BONES) rest.set(k, toScene.clone().multiply(named.get(k)!.matrixWorld));
  const meshToScene = toScene.clone().multiply(sm.matrixWorld);

  if (idle) {
    const mixer = new THREE.AnimationMixer(root);
    mixer.clipAction(idle).play();
    mixer.update(0);
    root.updateMatrixWorld(true);
  }
  sm.skeleton.update();
  const bones: Partial<Record<FitBone, BoneFit>> = {};
  for (const k of FIT_BONES) {
    const posed = toScene.clone().multiply(named.get(k)!.matrixWorld);
    bones[k] = { rest: rest.get(k)!, posed, pos: new THREE.Vector3().setFromMatrixPosition(posed) };
  }
  const B = bones as Record<FitBone, BoneFit>;

  // Đỉnh đã skin ở tư thế idle, kèm xương chủ đạo.
  const names = sm.skeleton.bones.map((b) => boneKey(b.name));
  const idx = sm.geometry.getAttribute('skinIndex');
  const wgt = sm.geometry.getAttribute('skinWeight');
  const n = sm.geometry.getAttribute('position').count;
  const verts: Vert[] = [];
  const tmp = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    let best = 0;
    let bw = -1;
    for (let c = 0; c < 4; c++) {
      const w = wgt.getComponent(i, c);
      if (w > bw) {
        bw = w;
        best = idx.getComponent(i, c);
      }
    }
    sm.getVertexPosition(i, tmp);
    verts.push({ p: tmp.clone().applyMatrix4(sm.matrixWorld).applyMatrix4(toScene), b: names[best] ?? '' });
  }

  const slab = (y: number, half: number, pred: (v: Vert) => boolean) => verts.filter((v) => Math.abs(v.p.y - y) < half && pred(v));

  // Eo: giữa hông và cột sống dưới.
  const wy = B.hips.pos.y + (B.spine.pos.y - B.hips.pos.y) * 0.5;
  const w = slab(wy, 0.03, (v) => TORSO.has(v.b));
  const wx = w.map((v) => v.p.x);
  const wcx = (pct(wx, 0.98) + pct(wx, 0.02)) / 2;
  const waist = {
    y: wy,
    cx: wcx,
    cz: 0,
    rx: (pct(wx, 0.98) - pct(wx, 0.02)) / 2,
    zFront: pct(
      w.map((v) => v.p.z),
      0.98,
    ),
    zBack: pct(
      w.map((v) => v.p.z),
      0.02,
    ),
  };
  waist.cz = (waist.zFront + waist.zBack) / 2;

  // Ngực.
  const cy = B.spine2.pos.y - 0.02;
  const c = slab(cy, 0.03, (v) => TORSO.has(v.b));
  const cx = c.map((v) => v.p.x);
  const chest = {
    y: cy,
    cx: (pct(cx, 0.98) + pct(cx, 0.02)) / 2,
    rx: (pct(cx, 0.98) - pct(cx, 0.02)) / 2,
    zFront: pct(
      c.map((v) => v.p.z),
      0.98,
    ),
    zBack: pct(
      c.map((v) => v.p.z),
      0.02,
    ),
  };

  // Phía sau cùng của thân và vạt áo từ đùi tới lưng (không tính tay, đầu; vạt áo bám xương `dtl_hem_*`).
  const backs = verts.filter(
    (v) =>
      v.p.y > 0.62 &&
      v.p.y < B.spine2.pos.y + 0.05 &&
      Math.abs(v.p.x - waist.cx) < 0.3 &&
      (TORSO.has(v.b) || LEG.has(v.b) || v.b.startsWith('dtl_hem')),
  );
  const backZ = pct(
    backs.map((v) => v.p.z),
    0.03,
  );

  const sy = waist.y - 0.075;
  const sk = slab(sy, 0.03, (v) => TORSO.has(v.b) || LEG.has(v.b) || v.b.startsWith('dtl_hem'));
  const skx = sk.map((v) => v.p.x);
  const skirt = {
    y: sy,
    cx: (pct(skx, 0.98) + pct(skx, 0.02)) / 2,
    rx: (pct(skx, 0.98) - pct(skx, 0.02)) / 2,
    zFront: pct(
      sk.map((v) => v.p.z),
      0.98,
    ),
    zBack: pct(
      sk.map((v) => v.p.z),
      0.02,
    ),
    cz: 0,
  };
  skirt.cz = (skirt.zFront + skirt.zBack) / 2;

  const shoulder = {} as Record<1 | -1, TubeFit>;
  const forearm = {} as Record<1 | -1, TubeFit>;
  const shin = {} as Record<1 | -1, TubeFit>;
  for (const s of [1, -1] as const) {
    const side = s === 1 ? 'left' : 'right';
    const arm = B[`${side}arm` as FitBone].pos;
    const t = tubeFit(verts, `${side}arm`, arm, B[`${side}forearm` as FitBone].pos, 0.15, 0.55);
    shoulder[s] = { ...t, center: arm.clone() };
    forearm[s] = tubeFit(verts, `${side}forearm`, B[`${side}forearm` as FitBone].pos, B[`${side}hand` as FitBone].pos, 0.5, 0.8);
    shin[s] = tubeFit(verts, `${side}leg`, B[`${side}leg` as FitBone].pos, B[`${side}foot` as FitBone].pos, 0.6, 0.9);
  }

  return { h: height / 1.75, bones: B, waist, chest, skirt, backZ, shoulder, forearm, shin, meshToScene };
}
