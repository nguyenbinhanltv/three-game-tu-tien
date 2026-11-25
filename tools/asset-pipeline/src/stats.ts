// Số đo một Document glTF: tam giác, texture, xương, hộp bao theo tư thế.
// Hộp bao tính theo đúng spec glTF: mesh có skin bỏ qua transform của node mesh,
// đỉnh = Σ w·(jointWorld · inverseBind)·p. Nhờ vậy bắt được lỗi quantize nhân vật có xương
// (dời phần giải lượng tử lên node mesh, thứ bị bỏ qua khi có skin → nhân vật co lại).

import { listTextureSlots } from '@gltf-transform/functions';
import { Document, ImageUtils, Node, Primitive, type mat4, type vec3, type vec4 } from '@gltf-transform/core';
import { at as checkedAt } from '@dtl/shared';

export interface Dims {
  width: number;
  height: number;
  depth: number;
  minY: number;
}

export interface TextureInfo {
  name: string;
  mimeType: string;
  width: number;
  height: number;
  slots: string[];
}

export function primitiveTriangles(prim: Primitive): number {
  const indices = prim.getIndices();
  const position = prim.getAttribute('POSITION');
  const count = indices ? indices.getCount() : position ? position.getCount() : 0;
  switch (prim.getMode()) {
    case Primitive.Mode.TRIANGLES:
      return Math.floor(count / 3);
    case Primitive.Mode.TRIANGLE_STRIP:
    case Primitive.Mode.TRIANGLE_FAN:
      return Math.max(0, count - 2);
    default:
      return 0;
  }
}

function sceneNodes(doc: Document): Node[] {
  const root = doc.getRoot();
  const scene = root.getDefaultScene() ?? root.listScenes()[0];
  const out: Node[] = [];
  if (!scene) return out;
  scene.traverse((n) => out.push(n));
  return out;
}

/** Mức LOD của node: extras.lod do optimize.ts gắn, mặc định 0. */
export function lodLevel(node: Node): number {
  const v = (node.getExtras() as { lod?: unknown }).lod;
  return typeof v === 'number' ? v : 0;
}

/**
 * Tổng tam giác được vẽ trong cảnh mặc định (mesh dùng lại ở nhiều node được tính nhiều lần).
 * `level`: chỉ đếm node thuộc mức LOD đó; bỏ trống thì đếm tất cả.
 */
export function countTriangles(doc: Document, level?: number): number {
  let total = 0;
  for (const node of sceneNodes(doc)) {
    const mesh = node.getMesh();
    if (!mesh || (level !== undefined && lodLevel(node) !== level)) continue;
    for (const prim of mesh.listPrimitives()) total += primitiveTriangles(prim);
  }
  return total;
}

/** Số mức LOD có trong file (1 = chỉ LOD0). */
export function lodCount(doc: Document): number {
  let max = 0;
  for (const node of sceneNodes(doc)) if (node.getMesh()) max = Math.max(max, lodLevel(node));
  return max + 1;
}

export function isSkinned(doc: Document): boolean {
  return (
    doc.getRoot().listSkins().length > 0 &&
    doc
      .getRoot()
      .listMeshes()
      .some((m) => m.listPrimitives().some((p) => !!p.getAttribute('JOINTS_0')))
  );
}

export function maxBones(doc: Document): number {
  return Math.max(
    0,
    ...doc
      .getRoot()
      .listSkins()
      .map((s) => s.listJoints().length),
  );
}

/** Đọc kích thước ảnh; KTX2 đọc thẳng header (pixelWidth @20, pixelHeight @24). */
export function imageSize(data: Uint8Array, mimeType: string): [number, number] | null {
  if (mimeType === 'image/ktx2') {
    if (data.byteLength < 28) return null;
    const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
    return [dv.getUint32(20, true), dv.getUint32(24, true)];
  }
  try {
    const size = ImageUtils.getSize(data, mimeType);
    return size ? [size[0], size[1]] : null;
  } catch {
    return null;
  }
}

export function listTextures(doc: Document): TextureInfo[] {
  const root = doc.getRoot();
  return root.listTextures().map((tex, i) => {
    const data = tex.getImage();
    const size = data ? imageSize(data, tex.getMimeType()) : null;
    return {
      name: tex.getName() || tex.getURI() || `texture_${i}`,
      mimeType: tex.getMimeType(),
      width: size?.[0] ?? 0,
      height: size?.[1] ?? 0,
      slots: listTextureSlots(tex).sort(),
    };
  });
}

// ---------- toán ma trận nhỏ (cột chính, như glTF) ----------

function mul(a: ArrayLike<number>, b: ArrayLike<number>): number[] {
  const o = new Array<number>(16).fill(0);
  for (let c = 0; c < 4; c++)
    for (let r = 0; r < 4; r++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += checkedAt(a, k * 4 + r, 'a') * checkedAt(b, c * 4 + k, 'b');
      o[c * 4 + r] = s;
    }
  return o;
}

function apply(m: ArrayLike<number>, p: ArrayLike<number>): [number, number, number] {
  return [
    checkedAt(m, 0, 'm') * checkedAt(p, 0, 'p') +
      checkedAt(m, 4, 'm') * checkedAt(p, 1, 'p') +
      checkedAt(m, 8, 'm') * checkedAt(p, 2, 'p') +
      checkedAt(m, 12, 'm'),
    checkedAt(m, 1, 'm') * checkedAt(p, 0, 'p') +
      checkedAt(m, 5, 'm') * checkedAt(p, 1, 'p') +
      checkedAt(m, 9, 'm') * checkedAt(p, 2, 'p') +
      checkedAt(m, 13, 'm'),
    checkedAt(m, 2, 'm') * checkedAt(p, 0, 'p') +
      checkedAt(m, 6, 'm') * checkedAt(p, 1, 'p') +
      checkedAt(m, 10, 'm') * checkedAt(p, 2, 'p') +
      checkedAt(m, 14, 'm'),
  ];
}

// ---------- tư thế theo animation ----------

type TRS = { t: vec3; r: vec4; s: vec3 };

function sample(times: ArrayLike<number>, values: Float32Array | number[], stride: number, t: number, interp: string): number[] {
  const n = times.length;
  const cubic = interp === 'CUBICSPLINE';
  const at = (i: number) => {
    const base = cubic ? (i * 3 + 1) * stride : i * stride;
    return Array.from({ length: stride }, (_, k) => checkedAt(values, base + k, 'values'));
  };
  if (n === 0) return [];
  if (t <= checkedAt(times, 0, 'times')) return at(0);
  if (t >= checkedAt(times, n - 1, 'times')) return at(n - 1);
  let i = 0;
  while (i < n - 2 && checkedAt(times, i + 1, 'times') < t) i++;
  if (interp === 'STEP') return at(i);
  const a = at(i);
  const b = at(i + 1);
  const f = (t - checkedAt(times, i, 'times')) / (checkedAt(times, i + 1, 'times') - checkedAt(times, i, 'times') || 1);
  const out = a.map((v, k) => v + (checkedAt(b, k, 'b') - v) * f);
  if (stride === 4) {
    const len = Math.hypot(...out) || 1;
    return out.map((v) => v / len);
  }
  return out;
}

/** Đặt TRS các node theo animation tại thời điểm t (giây). Trả về hàm khôi phục. */
function poseAt(doc: Document, animIndex: number, t: number): () => void {
  const anim = checkedAt(doc.getRoot().listAnimations(), animIndex, 'animations');
  const saved = new Map<Node, TRS>();
  for (const ch of anim.listChannels()) {
    const node = ch.getTargetNode();
    const sampler = ch.getSampler();
    const path = ch.getTargetPath();
    if (!node || !sampler || (path !== 'translation' && path !== 'rotation' && path !== 'scale')) continue;
    const input = sampler.getInput();
    const output = sampler.getOutput();
    if (!input || !output) continue;
    if (!saved.has(node)) saved.set(node, { t: node.getTranslation(), r: node.getRotation(), s: node.getScale() });
    const times = Array.from({ length: input.getCount() }, (_, i) => input.getScalar(i));
    const stride = output.getElementSize();
    const flat: number[] = [];
    const el: number[] = [];
    for (let i = 0; i < output.getCount(); i++) flat.push(...output.getElement(i, el));
    const v = sample(times, flat, stride, t, sampler.getInterpolation());
    if (path === 'translation') node.setTranslation(v as vec3);
    else if (path === 'rotation') node.setRotation(v as vec4);
    else node.setScale(v as vec3);
  }
  return () => {
    for (const [node, trs] of saved) node.setTranslation(trs.t).setRotation(trs.r).setScale(trs.s);
  };
}

function animRange(doc: Document, animIndex: number): [number, number] {
  let lo = Infinity;
  let hi = -Infinity;
  for (const s of checkedAt(doc.getRoot().listAnimations(), animIndex, 'bảng').listSamplers()) {
    const input = s.getInput();
    if (!input || input.getCount() === 0) continue;
    lo = Math.min(lo, input.getScalar(0));
    hi = Math.max(hi, input.getScalar(input.getCount() - 1));
  }
  return Number.isFinite(lo) ? [lo, hi] : [0, 0];
}

/** Hộp bao mọi đỉnh của mức LOD `level` (mặc định LOD0) ở tư thế hiện tại của các node. */
export function measureCurrentPose(doc: Document, level = 0): Dims | null {
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  const p: number[] = [];
  const j: number[] = [];
  const w: number[] = [];
  const grow = (v: ArrayLike<number>) => {
    for (let k = 0; k < 3; k++) {
      if (checkedAt(v, k, 'v') < checkedAt(lo, k, 'lo')) lo[k] = checkedAt(v, k, 'v');
      if (checkedAt(v, k, 'v') > checkedAt(hi, k, 'hi')) hi[k] = checkedAt(v, k, 'v');
    }
  };
  for (const node of sceneNodes(doc)) {
    const mesh = node.getMesh();
    if (!mesh || lodLevel(node) !== level) continue;
    const skin = node.getSkin();
    let jointMats: number[][] | null = null;
    if (skin) {
      const ibm = skin.getInverseBindMatrices();
      const el: number[] = [];
      jointMats = skin.listJoints().map((joint, i) => {
        const inv = ibm ? ibm.getElement(i, el).slice() : [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
        return mul(joint.getWorldMatrix() as mat4, inv);
      });
    }
    const world = node.getWorldMatrix();
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute('POSITION');
      if (!pos) continue;
      const joints = prim.getAttribute('JOINTS_0');
      const weights = prim.getAttribute('WEIGHTS_0');
      for (let i = 0; i < pos.getCount(); i++) {
        pos.getElement(i, p);
        if (jointMats && joints && weights) {
          joints.getElement(i, j);
          weights.getElement(i, w);
          const acc: [number, number, number] = [0, 0, 0];
          let wsum = 0;
          for (let k = 0; k < 4; k++) {
            if (!w[k]) continue;
            const q = apply(checkedAt(jointMats, checkedAt(j, k, 'j'), 'jointMats'), p);
            acc[0] += q[0] * checkedAt(w, k, 'w');
            acc[1] += q[1] * checkedAt(w, k, 'w');
            acc[2] += q[2] * checkedAt(w, k, 'w');
            wsum += checkedAt(w, k, 'w');
          }
          grow(wsum > 0 ? acc.map((v) => v / wsum) : apply(world, p));
        } else {
          grow(apply(world, p));
        }
      }
    }
  }
  if (!Number.isFinite(lo[0])) return null;
  const r = (x: number) => Math.round(x * 1e4) / 1e4;
  return {
    width: r(checkedAt(hi, 0, 'hi') - checkedAt(lo, 0, 'lo')),
    height: r(checkedAt(hi, 1, 'hi') - checkedAt(lo, 1, 'lo')),
    depth: r(checkedAt(hi, 2, 'hi') - checkedAt(lo, 2, 'lo')),
    minY: r(checkedAt(lo, 1, 'lo')),
  };
}

/**
 * Số đo ở tư thế nghỉ và ở đầu/giữa/cuối mỗi clip. Khóa: "rest", "<clip>@start|mid|end".
 * Không đổi Document (khôi phục TRS sau khi đo).
 */
export function measurePoses(doc: Document): Record<string, Dims> {
  const out: Record<string, Dims> = {};
  const rest = measureCurrentPose(doc);
  if (!rest) return out;
  out.rest = rest;
  doc
    .getRoot()
    .listAnimations()
    .forEach((anim, i) => {
      const [a, b] = animRange(doc, i);
      const name = anim.getName() || `anim_${i}`;
      for (const [label, t] of [
        ['start', a],
        ['mid', (a + b) / 2],
        ['end', b],
      ] as const) {
        const restore = poseAt(doc, i, t);
        const d = measureCurrentPose(doc);
        restore();
        if (d) out[`${name}@${label}`] = d;
      }
    });
  return out;
}
