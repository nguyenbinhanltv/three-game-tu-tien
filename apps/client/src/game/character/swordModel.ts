// Kiếm riêng theo trang bị (5 model Tripo web: prop_kiem_*). Nhân vật người chơi có kiếm cũ nướng vào lưới (chuôi + lưỡi
// 100% trọng số xương `dtl_sword`, M3-2). Khi asset kiếm mới nạp xong ta (1) cắt tam giác kiếm cũ khỏi lưới nhân vật,
// một lần cho mỗi mẫu, (2) gắn mesh kiếm mới (không xương, 1 draw call) vào đúng xương đó: đổi cha lưng ↔ tay phải theo
// `SwordSocket` nên rút/tra kiếm, ra chiêu và vỏ sáng cường hóa chạy y như cũ.
//
// Quy ước model kiếm (tools/blender/orient_sword.py): mũi hướng +Y, cạnh lưỡi dọc X, pháp tuyến mặt lưỡi dọc Z, cầu chuôi
// ở Y = 0; extras `dtl.blade` = { len, grip, guard, bladeStart } (mét, theo Y).
import * as THREE from 'three/webgpu';
import type { SwordExtras } from './sword';

/** Số đo kiếm mới (extras `dtl.blade`, mét theo trục mũi). */
export interface BladeInfo {
  len: number;
  grip: number;
  guard: number;
  bladeStart: number;
}

/** Đoạn kiếm cũ dọc trục mũi, tính từ tâm chuôi (m): đầu chuôi (âm) tới mũi. */
export interface OldSwordSpan {
  minS: number;
  maxS: number;
}

/** Mẫu kiếm đã nạp: mesh gốc (đã adopt material) và số đo. */
export interface SwordTemplate {
  mesh: THREE.Mesh;
  info: BladeInfo;
  /** Trả handle asset (AssetCache). */
  release: () => void;
}

/** Kiếm gắn cho một bản sao nhân vật. */
export interface BladeMount {
  mesh: THREE.Mesh;
  info: BladeInfo;
  old: OldSwordSpan;
}

const SCALE_MIN = 0.75;
const SCALE_MAX = 1.3;

/** Hệ số phóng để kiếm mới dài bằng kiếm cũ (kẹp để tỉ lệ không lệch quá nhiều so với bao kiếm). */
export function bladeScale(info: BladeInfo, old: OldSwordSpan): number {
  return Math.min(SCALE_MAX, Math.max(SCALE_MIN, (old.maxS - old.minS) / info.len));
}

/**
 * Ma trận đưa hệ model kiếm (Y mũi, X lưỡi, Z mặt lưỡi, tâm chuôi `grip` ở Y) vào hệ xương kiếm: tâm chuôi trùng tâm chuôi cũ
 * (chỗ bàn tay nắm), mũi theo hướng mũi cũ, lưỡi theo hướng lưỡi cũ. `glowLocal`: khung chuôi (X lưỡi, Z mũi) trong hệ xương.
 */
export function bladeLocal(glowLocal: THREE.Matrix4, info: BladeInfo, old: OldSwordSpan, target = new THREE.Matrix4()): THREE.Matrix4 {
  const k = bladeScale(info, old);
  // Khung chuôi G: X = lưỡi, Z = mũi, Y = Z × X. Model: X lưỡi, Y mũi, Z = X × Y ⇒ Z model = -Y của G.
  const basis = new THREE.Matrix4().makeBasis(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, -1, 0));
  const fit = new THREE.Matrix4().makeScale(k, k, k).multiply(new THREE.Matrix4().makeTranslation(0, -info.grip, 0));
  return target.copy(glowLocal).multiply(basis).multiply(fit);
}

/** Số đo vỏ sáng cường hóa (m, từ tâm chuôi dọc mũi) của kiếm mới sau phóng: gốc lưỡi và chiều dài lưỡi. */
export function glowDims(info: BladeInfo, old: OldSwordSpan): { start: number; len: number } {
  const k = bladeScale(info, old);
  return { start: (info.bladeStart - info.grip) * k, len: (info.len - info.bladeStart) * k };
}

/** Số đo kiếm trong extras `dtl` của mesh LOD0 (chuỗi JSON do pipeline ghi); undefined nếu thiếu hoặc không hợp lệ. */
export function bladeInfoOf(raw: unknown): BladeInfo | undefined {
  const b = (raw as { blade?: Partial<BladeInfo> } | undefined)?.blade;
  if (!b || ![b.len, b.grip, b.guard, b.bladeStart].every((v) => typeof v === 'number' && Number.isFinite(v)) || b.len! <= 0) return undefined;
  return { len: b.len!, grip: b.grip!, guard: b.guard!, bladeStart: b.bladeStart! };
}

/** Mesh đầu tiên của asset kiếm và số đo của nó; null nếu asset không đúng quy ước. */
export function swordTemplateOf(scene: THREE.Object3D, extras: unknown, release: () => void): SwordTemplate | null {
  let mesh: THREE.Mesh | null = null;
  scene.traverse((o) => {
    if (!mesh && (o as THREE.Mesh).isMesh) mesh = o as THREE.Mesh;
  });
  const info = bladeInfoOf(extras);
  return mesh && info ? { mesh, info, release } : null;
}

/**
 * Cắt kiếm cũ khỏi mọi LOD của mẫu: bỏ mọi tam giác có cả ba đỉnh chịu 100% trọng số xương kiếm (đỉnh nối thân giữ nguyên).
 * Trả về đoạn kiếm cũ dọc trục mũi tính từ tâm chuôi (đo ở LOD0), hoặc null nếu không tìm thấy lưới kiếm (không cắt gì).
 * Gọi một lần cho mỗi mẫu, khi mẫu còn ở tư thế nghỉ.
 */
export function cutOldSword(scene: THREE.Object3D, ex: SwordExtras): OldSwordSpan | null {
  scene.updateMatrixWorld(true);
  const toScene = scene.matrixWorld.clone().invert();
  const grip = new THREE.Vector3().fromArray(ex.grip);
  const tip = new THREE.Vector3().fromArray(ex.tip).normalize();
  let minS = Infinity;
  let maxS = -Infinity;
  const cuts: { geo: THREE.BufferGeometry; index: THREE.TypedArray }[] = [];
  scene.traverse((o) => {
    const mesh = o as THREE.SkinnedMesh;
    if (!mesh.isSkinnedMesh || !mesh.geometry.index) return;
    const joint = mesh.skeleton.bones.findIndex((b) => b.name === ex.bone);
    if (joint < 0) return;
    const g = mesh.geometry;
    const si = g.getAttribute('skinIndex');
    const sw = g.getAttribute('skinWeight');
    const pos = g.getAttribute('position');
    if (!si || !sw) return;
    const lod0 = !(o.userData.lod > 0);
    const m = toScene.clone().multiply(mesh.matrixWorld);
    const v = new THREE.Vector3();
    const on = new Uint8Array(pos.count);
    for (let i = 0; i < pos.count; i++) {
      let w = 0;
      for (let c = 0; c < 4; c++) if (si.getComponent(i, c) === joint) w += sw.getComponent(i, c);
      if (w <= 0.99) continue;
      on[i] = 1;
      if (lod0) {
        const s = v.fromBufferAttribute(pos, i).applyMatrix4(m).sub(grip).dot(tip);
        if (s < minS) minS = s;
        if (s > maxS) maxS = s;
      }
    }
    const idx = g.index!.array;
    const keep: number[] = [];
    for (let t = 0; t < idx.length; t += 3) {
      if (on[idx[t]] && on[idx[t + 1]] && on[idx[t + 2]]) continue;
      keep.push(idx[t], idx[t + 1], idx[t + 2]);
    }
    if (keep.length === idx.length) return;
    cuts.push({ geo: g, index: idx instanceof Uint32Array ? Uint32Array.from(keep) : Uint16Array.from(keep) });
  });
  if (!cuts.length || !Number.isFinite(minS) || !Number.isFinite(maxS)) return null;
  for (const c of cuts) {
    c.geo.setIndex(new THREE.BufferAttribute(c.index, 1));
    c.geo.clearGroups();
  }
  return { minS, maxS };
}
