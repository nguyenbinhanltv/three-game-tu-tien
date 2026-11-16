import * as THREE from 'three/webgpu';
import { boneKey } from './ikpose';

/**
 * Áo bộ trang bị mặc thật (retarget): lưới áo `set_<bộ>_<giới>` là SkinnedMesh dùng cùng bộ xương người chơi (script
 * `tools/blender/retarget_set.py`). Khi mặc bộ, lưới nhân vật chỉ giữ đầu, cổ, bàn tay (da, tóc, mũ); phần còn lại do áo che.
 * Hàm thuần ở đây (không đụng engine) để test được.
 */

/** Xương (theo `boneKey`) mà phần lưới nhân vật còn hiện khi mặc áo: đầu/tóc, cổ, bàn tay và ngón. */
export function bodyKeep(key: string): boolean {
  return key.startsWith('head') || key.startsWith('neck') || key.includes('hand');
}

/** Tên xương → chỉ số trong skeleton (theo tên nguyên văn, thiếu thì theo `boneKey`). */
export function jointIndex(bones: readonly { name: string }[]): { exact: Map<string, number>; key: Map<string, number> } {
  const exact = new Map<string, number>();
  const key = new Map<string, number>();
  bones.forEach((b, i) => {
    exact.set(b.name, i);
    key.set(boneKey(b.name), i);
  });
  return { exact, key };
}

/**
 * Chỉ số tam giác của lưới nhân vật sau khi bỏ phần áo che: giữ tam giác mà cả ba đỉnh có xương trội thuộc `bodyKeep`.
 * Trả null nếu lưới không có skin hoặc không bỏ được gì (khỏi tạo hình học mới).
 */
export function dressedIndex(mesh: THREE.SkinnedMesh): THREE.TypedArray | null {
  const g = mesh.geometry;
  const si = g.getAttribute('skinIndex');
  const sw = g.getAttribute('skinWeight');
  const idx = g.index?.array;
  if (!si || !sw || !idx) return null;
  const bones = mesh.skeleton.bones;
  const keepJoint = bones.map((b) => bodyKeep(boneKey(b.name)));
  const keepVertex = new Uint8Array(si.count);
  for (let i = 0; i < si.count; i++) {
    let best = -1;
    let bw = 0;
    for (let c = 0; c < 4; c++) {
      const w = sw.getComponent(i, c);
      if (w > bw) {
        bw = w;
        best = si.getComponent(i, c);
      }
    }
    keepVertex[i] = best >= 0 && keepJoint[best] ? 1 : 0;
  }
  const out: number[] = [];
  for (let t = 0; t < idx.length; t += 3) {
    if (keepVertex[idx[t]] && keepVertex[idx[t + 1]] && keepVertex[idx[t + 2]]) out.push(idx[t], idx[t + 1], idx[t + 2]);
  }
  if (out.length === idx.length) return null;
  return idx instanceof Uint32Array ? Uint32Array.from(out) : Uint16Array.from(out);
}

/** Hình học dùng chung attribute với `src` nhưng chỉ số tam giác khác (dispose không đụng attribute dùng chung: chỉ khi gỡ mẫu). */
export function withIndex(src: THREE.BufferGeometry, index: THREE.TypedArray): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  for (const [name, attr] of Object.entries(src.attributes)) g.setAttribute(name, attr);
  g.setIndex(new THREE.BufferAttribute(index, 1));
  g.boundingSphere = src.boundingSphere?.clone() ?? null;
  g.boundingBox = src.boundingBox?.clone() ?? null;
  return g;
}

/**
 * Hình học áo với skinIndex đổi sang chỉ số xương của `target` (skeleton người chơi) theo tên xương. Xương áo không có ở
 * người chơi thì dồn trọng số sang xương đầu tiên khớp (không xảy ra với áo từ retarget_set.py, cùng bộ xương). Null nếu thiếu skin.
 */
export function remapSkin(garment: THREE.SkinnedMesh, target: readonly { name: string }[]): THREE.BufferGeometry | null {
  const g = garment.geometry;
  const si = g.getAttribute('skinIndex');
  const sw = g.getAttribute('skinWeight');
  if (!si || !sw) return null;
  const { exact, key } = jointIndex(target);
  const map = garment.skeleton.bones.map((b) => exact.get(b.name) ?? key.get(boneKey(b.name)) ?? -1);
  const out = new Uint16Array(si.count * 4);
  const weights = new Float32Array(sw.count * 4);
  for (let i = 0; i < si.count; i++) {
    for (let c = 0; c < 4; c++) {
      const w = sw.getComponent(i, c);
      const j = map[si.getComponent(i, c)] ?? -1;
      if (j < 0) continue; // trọng số mất, chuẩn hóa lại bên dưới
      out[i * 4 + c] = j;
      weights[i * 4 + c] = w;
    }
    const sum = weights[i * 4] + weights[i * 4 + 1] + weights[i * 4 + 2] + weights[i * 4 + 3];
    if (sum > 0) for (let c = 0; c < 4; c++) weights[i * 4 + c] /= sum;
  }
  const r = new THREE.BufferGeometry();
  for (const [name, attr] of Object.entries(g.attributes)) if (name !== 'skinIndex' && name !== 'skinWeight') r.setAttribute(name, attr);
  r.setAttribute('skinIndex', new THREE.BufferAttribute(out, 4));
  r.setAttribute('skinWeight', new THREE.BufferAttribute(weights, 4));
  if (g.index) r.setIndex(g.index);
  r.boundingSphere = g.boundingSphere?.clone() ?? null;
  r.boundingBox = g.boundingBox?.clone() ?? null;
  return r;
}

/** Mã asset áo của bộ theo model người chơi (`chr_kiem_tu_nam` → `<outfit>_nam`). */
export function outfitAssetId(outfit: string | undefined, modelId: string | null): string | null {
  if (!outfit || !modelId) return null;
  const g = modelId.slice(modelId.lastIndexOf('_') + 1);
  return g ? `${outfit}_${g}` : null;
}
