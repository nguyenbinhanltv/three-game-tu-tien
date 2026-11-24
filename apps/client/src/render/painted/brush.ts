import * as THREE from 'three/webgpu';

/**
 * Họa Cảnh P2: texture nét cọ liền mạch, sinh bằng CPU một lần (không cần asset, không nhị phân).
 *   R = chấm tròn và nét mảnh theo phương x (0,5 = không đổi, > 0,5 sáng hơn nền, < 0,5 tối hơn); shader xoay hệ tọa độ để nét chạy theo dốc.
 *   G = mảng mềm lớn (0,5 trung tính), phá độ phẳng của mảng xanh khi nhìn gần.
 * Ý tưởng dựa trên painted-valley/src/valley/strokes.js (MIT, © 2026 Patch; xem assets/LICENSES.md), viết lại: số lượng, kích thước,
 * hạt giống và công thức đều là của dự án.
 */

export const BRUSH_SIZE = 512;

function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Vẽ một hình elip xoay `turn`, hòa `alpha` vào kênh `ch`; lặp quanh mép để liền mạch. */
function mark(
  data: Uint8Array,
  size: number,
  ch: number,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  turn: number,
  tone: number,
  alpha: number,
  soft: number,
): void {
  const reach = Math.ceil(Math.max(rx, ry)) + 1;
  const c = Math.cos(turn);
  const s = Math.sin(turn);
  for (let dy = -reach; dy <= reach; dy++) {
    for (let dx = -reach; dx <= reach; dx++) {
      const u = (dx * c + dy * s) / rx;
      const v = (-dx * s + dy * c) / ry;
      const d = Math.sqrt(u * u + v * v);
      if (d >= 1) continue;
      // mép: cứng (cọ) với `soft` = độ mềm 0..1 của vành
      const cover = soft <= 0 ? 1 : Math.min(1, (1 - d) / soft);
      const a = alpha * cover;
      const x = (((Math.round(cx) + dx) % size) + size) % size;
      const y = (((Math.round(cy) + dy) % size) + size) % size;
      const k = (y * size + x) * 4 + ch;
      data[k] = Math.round(data[k]! * (1 - a) + tone * 255 * a);
    }
  }
}

/** Dữ liệu RGBA 8 bit của texture nét cọ (thuần, kiểm thử được ở node). */
export function makeBrushData(size = BRUSH_SIZE, seed = 4242): Uint8Array {
  const data = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    data[i * 4] = 128;
    data[i * 4 + 1] = 128;
    data[i * 4 + 2] = 128;
    data[i * 4 + 3] = 255;
  }
  const rnd = mulberry(seed);
  const k = size / 512;
  // G: mảng mềm lớn
  for (let i = 0; i < 46; i++) {
    mark(
      data,
      size,
      1,
      rnd() * size,
      rnd() * size,
      (34 + rnd() * 52) * k,
      (22 + rnd() * 30) * k,
      rnd() * Math.PI,
      rnd() < 0.5 ? 0.3 : 0.7,
      0.45,
      0.9,
    );
  }
  // R: nét mảnh dài theo x (xoay nhẹ ±0,3 rad, thêm chút tròn), rồi chấm tròn nhỏ
  for (let i = 0; i < 380; i++) {
    const long = 10 + rnd() * 26;
    const tone = rnd() < 0.5 ? 0.12 + rnd() * 0.25 : 0.62 + rnd() * 0.3;
    mark(data, size, 0, rnd() * size, rnd() * size, long * k, (1.6 + rnd() * 3.2) * k, (rnd() - 0.5) * 0.6, tone, 0.85, 0.15);
  }
  for (let i = 0; i < 160; i++) {
    const r = (3 + rnd() * 6) * k;
    const tone = rnd() < 0.5 ? 0.2 + rnd() * 0.2 : 0.65 + rnd() * 0.25;
    mark(data, size, 0, rnd() * size, rnd() * size, r, r * (0.75 + rnd() * 0.4), rnd() * Math.PI, tone, 0.8, 0.2);
  }
  return data;
}

let brushTex: THREE.DataTexture | null = null;

/** Texture nét cọ dùng chung (tạo lười, một bản cho cả đất và cỏ). */
export function getBrushTexture(): THREE.DataTexture {
  if (brushTex) return brushTex;
  const t = new THREE.DataTexture(makeBrushData(), BRUSH_SIZE, BRUSH_SIZE, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.colorSpace = THREE.NoColorSpace;
  t.needsUpdate = true;
  brushTex = t;
  return t;
}
