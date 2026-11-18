import * as THREE from 'three/webgpu';
import { hash01 } from '@dtl/shared';

/**
 * Texture nhiễu liền mạch (tileable) dựng bằng CPU một lần, dùng chung cho trời, mây, nước.
 * Dùng texture thay vì nhiễu 3D trong shader: một lần lấy mẫu thay cho cả chục phép băm mỗi điểm ảnh.
 */
const N = 256;

/** Nhiễu giá trị tuần hoàn (chu kỳ `period` ô) nội suy mượt. */
function valueNoise(x: number, y: number, periodX: number, periodY: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const fx = x - xi;
  const fy = y - yi;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const wrap = (v: number, p: number) => ((v % p) + p) % p;
  const x0 = wrap(xi, periodX);
  const x1 = wrap(xi + 1, periodX);
  const y0 = wrap(yi, periodY);
  const y1 = wrap(yi + 1, periodY);
  const a = hash01(x0, y0, seed);
  const b = hash01(x1, y0, seed);
  const c = hash01(x0, y1, seed);
  const d = hash01(x1, y1, seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

/** fbm tuần hoàn trên [0,1)²; `baseY` khác `base` thì nhiễu kéo giãn theo một trục mà vẫn liền mạch. */
function fbm(u: number, v: number, base: number, octaves: number, seed: number, baseY = base): number {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  let px = base;
  let py = baseY;
  for (let o = 0; o < octaves; o++) {
    sum += valueNoise(u * px, v * py, px, py, seed + o * 17) * amp;
    norm += amp;
    amp *= 0.5;
    px *= 2;
    py *= 2;
  }
  return sum / norm;
}

let cloudTex: THREE.DataTexture | null = null;
let normalTex: THREE.DataTexture | null = null;

function finish(t: THREE.DataTexture): THREE.DataTexture {
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.colorSpace = THREE.NoColorSpace;
  t.needsUpdate = true;
  return t;
}

/** RGBA: 4 nhiễu fbm độc lập (R: khối mây lớn, G: khối vừa, B: chi tiết nhỏ, A: sợi mây dài). */
export function getCloudNoise(): THREE.DataTexture {
  if (cloudTex) return cloudTex;
  const data = new Uint8Array(N * N * 4);
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const u = i / N;
      const v = j / N;
      const k = (j * N + i) * 4;
      data[k] = fbm(u, v, 3, 5, 11) * 255;
      data[k + 1] = fbm(u, v, 6, 4, 29) * 255;
      data[k + 2] = fbm(u, v, 12, 3, 53) * 255;
      // Sợi mây: kéo giãn theo một trục (chu kỳ khác nhau theo u và v).
      data[k + 3] = fbm(u, v, 4, 5, 71, 2) * 255;
    }
  }
  cloudTex = finish(new THREE.DataTexture(data, N, N, THREE.RGBAFormat));
  return cloudTex;
}

/** Bản đồ pháp tuyến sóng nước: RG = độ nghiêng x/z (0,5 = phẳng), B = độ cao, A = 1. */
export function getWaterNormals(): THREE.DataTexture {
  if (normalTex) return normalTex;
  const h = new Float32Array(N * N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) h[j * N + i] = fbm(i / N, j / N, 8, 4, 97);
  const data = new Uint8Array(N * N * 4);
  const at = (i: number, j: number) => h[((j + N) % N) * N + ((i + N) % N)]!;
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const dx = (at(i + 1, j) - at(i - 1, j)) * 6;
      const dz = (at(i, j + 1) - at(i, j - 1)) * 6;
      const k = (j * N + i) * 4;
      data[k] = Math.max(0, Math.min(255, 128 + dx * 127));
      data[k + 1] = Math.max(0, Math.min(255, 128 + dz * 127));
      data[k + 2] = h[j * N + i]! * 255;
      data[k + 3] = 255;
    }
  }
  normalTex = finish(new THREE.DataTexture(data, N, N, THREE.RGBAFormat));
  return normalTex;
}
