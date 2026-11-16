import * as THREE from 'three';
import { createLanternHalos } from '../render/atmosphere';

/**
 * Vỏ hang cho phó bản (E2-C): nửa quả cầu úp, vẽ mặt trong, che đường chân trời và bầu trời bằng vách đá + trần tối.
 * Một lưới, một draw call, màu theo đỉnh (không texture); bề mặt gồ ghề do nhiễu dịch đỉnh để vách và trần có nhấp nhô như thạch nhũ.
 * Hàm sinh tất định theo (x, z) nên mọi máy cho cùng một hang.
 */
export interface CaveDef {
  x: number;
  z: number;
  /** Bán kính vách (m). */
  r: number;
  /** Độ cao trần ở giữa (m so với đất). */
  h: number;
}

const hash = (a: number, b: number): number => {
  const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return s - Math.floor(s);
};
/** Nhiễu giá trị 2D mượt (0–1). */
function vnoise(x: number, y: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi);
  const b = hash(xi + 1, yi);
  const c = hash(xi, yi + 1);
  const d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const fbm = (x: number, y: number): number => vnoise(x, y) * 0.55 + vnoise(x * 2.1, y * 2.1) * 0.3 + vnoise(x * 4.3, y * 4.3) * 0.15;

export function buildCaveShell(def: CaveDef, groundY: number): THREE.Mesh {
  const geo = new THREE.SphereGeometry(1, 144, 40, 0, Math.PI * 2, 0, Math.PI / 2);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const col = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  const wall = new THREE.Color(0x8a6c4e);
  const wallHi = new THREE.Color(0x2a2119);
  const roof = new THREE.Color(0x07090c);
  for (let i = 0; i < pos.count; i++) {
    const nx = pos.getX(i);
    const ny = pos.getY(i); // 0 (chân vách) .. 1 (đỉnh trần)
    const nz = pos.getZ(i);
    const ang = Math.atan2(nz, nx);
    const n = fbm(Math.cos(ang) * 3.2 + ny * 4, Math.sin(ang) * 3.2 + ny * 4);
    // Vách gồ: dịch ngang theo nhiễu; trần sa xuống thành nhũ ở vùng cao.
    const rib = Math.abs(Math.sin(ang * 11 + n * 3));
    const bump = 1 + (n - 0.5) * 0.3 - rib * 0.05;
    const x = def.x + nx * def.r * bump;
    const z = def.z + nz * def.r * bump;
    const drop = ny > 0.55 ? (fbm(nx * 6.1, nz * 6.1) - 0.5) * 9 * ((ny - 0.55) / 0.45) : 0;
    const y = groundY + ny * def.h + drop;
    pos.setXYZ(i, x, y, z);
    // Màu: chỉ phần chân vách được đèn rọi sáng (nâu ấm, vân tầng đá); lên cao tắt dần thành đen như trần hang.
    const band = 0.5 + 0.5 * Math.sin(ny * 70 + n * 9);
    const lit = Math.exp(-ny * 5.2);
    c.copy(wall).multiplyScalar((0.35 + 0.95 * n) * (0.4 + 0.6 * band) * (0.5 + 0.7 * rib) * lit);
    c.lerp(roof, 1 - lit * 0.9).multiplyScalar(1);
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeBoundingSphere();
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false }));
  mesh.name = 'cave-shell';
  mesh.frustumCulled = false;
  mesh.renderOrder = -1;
  return mesh;
}

/** Quầng sáng lam lục quanh tinh thể mạch (một draw call cho mọi điểm); cùng khuôn quầng đèn nhưng đổi màu. */
export function buildCrystalGlow(points: readonly { x: number; y: number; z: number }[]): THREE.Mesh {
  const m = createLanternHalos(points, 5.5, 0x3fd1c0);
  m.name = 'crystal-glow';
  return m;
}
