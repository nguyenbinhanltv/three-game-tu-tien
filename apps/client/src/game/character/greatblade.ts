// Đao tu: đao lớn bằng mesh thủ tục (concept dao_tu_dao_lon: lưỡi một cạnh bản rộng hơi cong, mũi vát, sống dày, rãnh máu, chắn
// đĩa tròn đồng, cán quấn dây đỏ chéo, khâu vòng đồng có tua đỏ) cho đến khi có GLB dựng từ Tripo (khi đó thay file này).
// MỘT mesh gộp, MỘT vật liệu chung (1 draw call, thay đúng chỗ cây kiếm nên không tốn thêm):
//   - lưỡi: lưới chia nhỏ mặt cắt thấu kính (sống dày, cạnh mỏng), cong nhẹ về phía cạnh; màu đỉnh vẽ thép vân: sống tối,
//     rãnh máu tối, đường nhiệt luyện (hamon) lượn sóng sát cạnh, rìa lưỡi mài sáng;
//   - `roughnessMap` thủ tục (DataTexture, không cần canvas): vệt xước dọc lưỡi, rìa mài bóng, các phần khác thô vừa;
//   - phần còn lại (chắn, cán, vòng, tua) tô màu đỉnh. Quy ước như kiếm v3: mũi +Y, tâm cán ở gốc.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Loại vũ khí khai ở `paths.json` `weapons` để chọn đao lớn. */
export const GREATBLADE_WEAPON = 'greatblade';

/** Bảng màu theo concept: huyết dụ / son thẫm / vàng tàn lửa, thép và lưỡi mài, đồng. */
export const GREATBLADE_COLORS = {
  dark: 0x3a0e0c,
  red: 0x9e2b22,
  ember: 0xf2b36a,
  steel: 0x4a4e55,
  edge: 0xc9ced4,
  bronze: 0xb9772e,
} as const;

/** Chiều dài lưỡi (m) cho nhân vật cao `height` (m). */
export function greatbladeLength(height: number): number {
  return 0.78 * (height / 1.7) * 1.25;
}

const BLADE_NY = 28; // số ô dọc lưỡi
const BLADE_NX = 10; // số ô ngang lưỡi (mỗi mặt)
/** Vùng u ∈ [0, U0) của `roughnessMap` dành cho phần không phải lưỡi (độ nhám vừa); lưỡi dùng u ∈ [U0, 1]. */
const U0 = 0.15;

/** Màu thép vân theo (s: 0 sống → 1 cạnh, v: 0 chân → 1 mũi). */
export function bladeSteelColor(s: number, v: number): THREE.Color {
  const c = new THREE.Color(GREATBLADE_COLORS.steel);
  const bright = new THREE.Color(GREATBLADE_COLORS.edge);
  // thép nền sáng dần từ sống sang cạnh
  c.lerp(bright, 0.35 + 0.4 * s);
  // vân thép: sọc dọc mảnh thay đổi nhẹ độ sáng
  c.multiplyScalar(0.92 + 0.08 * Math.sin(s * 52 + v * 9));
  // rãnh máu: dải tối dọc sống trong khoảng 8–72% chiều dài
  if (v > 0.08 && v < 0.72 && s > 0.2 && s < 0.36) c.lerp(new THREE.Color(GREATBLADE_COLORS.dark), 0.75);
  // đường nhiệt luyện lượn sóng sát cạnh (hamon): dải sáng ngà
  const hamon = 0.7 + 0.035 * Math.sin(v * 38) + 0.02 * Math.sin(v * 91 + 1.3);
  const d = Math.abs(s - hamon);
  if (d < 0.025 && v > 0.04) c.lerp(new THREE.Color(0xeef1f4), 0.7 * (1 - d / 0.025));
  // rìa lưỡi mài: trắng sáng
  if (s > 0.93) c.lerp(new THREE.Color(0xffffff), (s - 0.93) / 0.07);
  // sống lưng tối hơn
  if (s < 0.1) c.lerp(new THREE.Color(GREATBLADE_COLORS.dark), 0.55 * (1 - s / 0.1));
  return c;
}

/** Lưỡi đao: lưới chia nhỏ, mặt cắt thấu kính, cong nhẹ về phía cạnh, mũi vát về phía sống. Có màu đỉnh + uv. */
export function bladeGeometry(L: number, w: number, t: number, y0: number, bend: number): THREE.BufferGeometry {
  const pos: number[] = [];
  const col: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const side = (sign: 1 | -1): void => {
    const base = pos.length / 3;
    for (let j = 0; j <= BLADE_NY; j++) {
      const v = j / BLADE_NY;
      const xe = v < 0.82 ? w : w - (2 * w * (v - 0.82)) / 0.18; // mũi vát: cạnh co về phía sống
      const y = y0 + v * L;
      const curve = bend * v * v; // cong về phía cạnh (+x)
      for (let i = 0; i <= BLADE_NX; i++) {
        const s = i / BLADE_NX;
        const x = -w + s * (xe + w) + curve;
        // dày: sống dày nhất, mỏng dần về cạnh; mũi mỏng dần
        const th = t * (1 - Math.pow(s, 0.85)) * (v > 0.9 ? 1 - (v - 0.9) / 0.1 : 1) + t * 0.08;
        pos.push(x, y, sign * th * 0.5);
        const c = bladeSteelColor(s, v);
        col.push(c.r, c.g, c.b);
        uv.push(U0 + (1 - U0) * s, v);
      }
    }
    const row = BLADE_NX + 1;
    for (let j = 0; j < BLADE_NY; j++)
      for (let i = 0; i < BLADE_NX; i++) {
        const a = base + j * row + i;
        const b = a + 1;
        const c = a + row;
        const d = c + 1;
        if (sign > 0) idx.push(a, b, c, b, d, c);
        else idx.push(a, c, b, b, c, d);
      }
  };
  side(1);
  side(-1);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g.toNonIndexed();
}

/** Tô một màu cho phần không phải lưỡi; uv trỏ vào vùng nhám cố định của `roughnessMap`. */
function tinted(g: THREE.BufferGeometry, color: number): THREE.BufferGeometry {
  const out = g.index ? g.toNonIndexed() : g;
  const c = new THREE.Color(color);
  const n = out.getAttribute('position').count;
  const arr = new Float32Array(n * 3);
  const uvs = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    c.toArray(arr, i * 3);
    uvs[i * 2] = U0 * 0.5;
    uvs[i * 2 + 1] = 0.5;
  }
  out.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  return out;
}

/** Hình học đao lớn: gốc ở tâm cán, mũi ở y = greatbladeLength(height) + 0.17·k. */
export function greatbladeGeometry(height: number): THREE.BufferGeometry {
  const k = height / 1.7;
  const L = greatbladeLength(height);
  const w = 0.058 * k; // nửa bản rộng
  const t = 0.02 * k; // dày ở sống
  const y0 = 0.14 * k; // chân lưỡi (trên chắn)
  const parts: THREE.BufferGeometry[] = [];
  parts.push(bladeGeometry(L, w, t, y0, 0.05 * k));
  // chắn đĩa tròn đồng viền vàng tàn lửa, có vòng khắc
  const guard = new THREE.CylinderGeometry(0.07 * k, 0.07 * k, 0.016 * k, 20);
  guard.translate(0, y0 - 0.005 * k, 0);
  parts.push(tinted(guard, GREATBLADE_COLORS.bronze));
  const rim = new THREE.TorusGeometry(0.07 * k, 0.006 * k, 6, 22);
  rim.rotateX(Math.PI / 2);
  rim.translate(0, y0 - 0.005 * k, 0);
  parts.push(tinted(rim, GREATBLADE_COLORS.ember));
  const inner = new THREE.TorusGeometry(0.045 * k, 0.0035 * k, 5, 18);
  inner.rotateX(Math.PI / 2);
  inner.translate(0, y0 + 0.004 * k, 0);
  parts.push(tinted(inner, GREATBLADE_COLORS.dark));
  // cổ chắn (habaki): khối đồng ngắn ôm chân lưỡi
  const collar = new THREE.BoxGeometry(2 * w * 1.05, 0.03 * k, t * 1.8);
  collar.translate(0, y0 + 0.014 * k, 0);
  parts.push(tinted(collar, GREATBLADE_COLORS.bronze));
  // cán huyết dụ, quấn dây đỏ chéo (các vòng nghiêng dày dần), khâu vòng đồng + tua đỏ ba sợi
  const gripLen = 0.3 * k;
  const gripTop = y0 - 0.02 * k;
  const grip = new THREE.CylinderGeometry(0.017 * k, 0.017 * k, gripLen, 10);
  grip.translate(0, gripTop - gripLen / 2, 0);
  parts.push(tinted(grip, GREATBLADE_COLORS.dark));
  const wraps = 11;
  for (let i = 0; i < wraps; i++) {
    const wrap = new THREE.TorusGeometry(0.0185 * k, 0.0032 * k, 4, 10);
    wrap.rotateX(Math.PI / 2 + 0.55); // vòng nghiêng → quấn chéo
    wrap.translate(0, gripTop - (0.012 + (i / (wraps - 1)) * 0.27) * k, 0);
    parts.push(tinted(wrap, GREATBLADE_COLORS.red));
  }
  const pommelY = gripTop - gripLen - 0.006 * k;
  const pommel = new THREE.CylinderGeometry(0.021 * k, 0.019 * k, 0.014 * k, 10);
  pommel.translate(0, pommelY, 0);
  parts.push(tinted(pommel, GREATBLADE_COLORS.bronze));
  const ring = new THREE.TorusGeometry(0.024 * k, 0.0055 * k, 6, 14);
  ring.translate(0, pommelY - 0.03 * k, 0);
  parts.push(tinted(ring, GREATBLADE_COLORS.bronze));
  const knot = new THREE.SphereGeometry(0.009 * k, 6, 4);
  knot.translate(0, pommelY - 0.058 * k, 0);
  parts.push(tinted(knot, GREATBLADE_COLORS.red));
  for (const [dx, len] of [
    [-0.007, 0.13],
    [0, 0.17],
    [0.007, 0.11],
  ] as const) {
    const strand = new THREE.BoxGeometry(0.005 * k, len * k, 0.004 * k);
    strand.translate(dx * k, pommelY - 0.065 * k - (len * k) / 2, 0);
    parts.push(tinted(strand, GREATBLADE_COLORS.red));
  }
  const g = mergeGeometries(parts, false)!;
  for (const p of parts) p.dispose();
  // dời để tâm cán (chỗ tay nắm) nằm ở gốc
  g.translate(0, -(gripTop - gripLen / 2), 0);
  return g;
}

/** Bản đồ độ nhám thủ tục (kênh G dùng cho `roughnessMap`): vệt xước dọc lưỡi, rìa mài bóng; vùng u < U0 nhám vừa. */
export function roughnessData(w = 32, h = 64): Uint8Array {
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const u = (x + 0.5) / w;
      const v = (y + 0.5) / h;
      let r = 0.45; // vùng ngoài lưỡi
      if (u >= U0) {
        const s = (u - U0) / (1 - U0);
        // xước dọc: nhiễu theo u (sọc), chậm theo v
        const streak = 0.5 + 0.5 * Math.sin(s * 131 + Math.sin(v * 6) * 1.6) * Math.sin(s * 47 + 2.1);
        r = 0.3 + 0.25 * streak;
        if (s > 0.9) r = 0.12; // rìa mài bóng
        if (s < 0.1) r = 0.55; // sống lưng nhám hơn
      }
      const o = (y * w + x) * 4;
      data[o] = 255;
      data[o + 1] = Math.round(Math.min(1, Math.max(0, r)) * 255);
      data[o + 2] = 255;
      data[o + 3] = 255;
    }
  return data;
}

let sharedMat: THREE.MeshStandardMaterial | null = null;
function material(): THREE.MeshStandardMaterial {
  if (!sharedMat) {
    const tex = new THREE.DataTexture(roughnessData(), 32, 64, THREE.RGBAFormat);
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.magFilter = tex.minFilter = THREE.LinearFilter;
    tex.needsUpdate = true;
    sharedMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 1, // nhân với kênh G của roughnessMap
      roughnessMap: tex,
      metalness: 0.82,
      side: THREE.DoubleSide,
    });
  }
  return sharedMat;
}

/** Mesh đao lớn mới (dùng chung vật liệu + bản đồ độ nhám; hình học riêng mỗi nhân vật, `dispose` khi bỏ). */
export function greatbladeMesh(height: number): { mesh: THREE.Mesh; len: number } {
  const mesh = new THREE.Mesh(greatbladeGeometry(height), material());
  mesh.name = 'dtl_greatblade';
  mesh.frustumCulled = false;
  return { mesh, len: greatbladeLength(height) + 0.3 * (height / 1.7) };
}
