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

export function buildCaveShell(def: CaveDef, groundY: number, palace = false): THREE.Mesh {
  if (palace) return buildPalaceShell(def, groundY);
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

/**
 * Cung gương (E3-M): cùng nửa quả cầu úp nhưng vách nhẵn có hàng cột sáng bạc, trần xanh đen có lỗ trăng nhỏ ở đỉnh. Màu theo đỉnh (một draw call),
 * sáng ở chân vách rồi tắt dần lên cao; cường độ giữ thấp (art bible v3: tông trầm, không lóa che nhân vật).
 */
function buildPalaceShell(def: CaveDef, groundY: number): THREE.Mesh {
  const geo = new THREE.SphereGeometry(1, 144, 40, 0, Math.PI * 2, 0, Math.PI / 2);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const col = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  const wall = new THREE.Color(0x6f86a8);
  const pillar = new THREE.Color(0xb8cdea);
  const roof = new THREE.Color(0x070b16);
  const moon = new THREE.Color(0x9fb8e0);
  for (let i = 0; i < pos.count; i++) {
    const nx = pos.getX(i);
    const ny = pos.getY(i);
    const nz = pos.getZ(i);
    const ang = Math.atan2(nz, nx);
    pos.setXYZ(i, def.x + nx * def.r, groundY + ny * def.h, def.z + nz * def.r);
    // Hàng cột: dải sáng hẹp mỗi 15°; giữa hai cột là tấm gương tối với vân dọc nhẹ.
    const rib = Math.pow(Math.abs(Math.cos(ang * 12)), 18);
    const panel = 0.55 + 0.25 * Math.sin(ang * 36 + ny * 6) * Math.sin(ny * 9);
    const lit = Math.exp(-ny * 3.6);
    c.copy(wall).multiplyScalar(panel * (0.22 + 0.3 * lit));
    c.lerp(pillar, rib * 0.3 * lit);
    c.lerp(roof, Math.min(1, ny * 1.25 + (1 - lit) * 0.35));
    // Lỗ trăng ở đỉnh: quầng bạc nhạt, không chói.
    const cap = Math.max(0, (ny - 0.9) / 0.1);
    c.lerp(moon, cap * cap * 0.4);
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeBoundingSphere();
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false }));
  mesh.name = 'palace-shell';
  mesh.frustumCulled = false;
  mesh.renderOrder = -1;
  return mesh;
}

/**
 * Sàn gương giả (E3-M): đĩa phẳng nằm sát mặt đất, vẽ sẵn lên một ảnh canvas: mặt đá đen bóng, vân vòng và tấm ghép tỏa tia, vệt phản chiếu
 * của hàng cột và một quầng trăng mờ lệch tâm. KHÔNG phản chiếu thật (không render lần hai, không SSR), nên một draw call và một texture 1024².
 */
export function buildMirrorFloor(def: CaveDef, groundAt: (x: number, z: number) => number): THREE.Mesh {
  const N = 1024;
  const cv = document.createElement('canvas');
  cv.width = N;
  cv.height = N;
  const g = cv.getContext('2d')!;
  const h = N / 2;
  const base = g.createRadialGradient(h, h, 0, h, h, h);
  base.addColorStop(0, '#1b2a42');
  base.addColorStop(0.6, '#111a2c');
  base.addColorStop(1, '#0a101c');
  g.fillStyle = base;
  g.fillRect(0, 0, N, N);
  // Tấm ghép tỏa tia và vân vòng (đá lát gương).
  g.strokeStyle = 'rgba(150,185,230,0.14)';
  g.lineWidth = 2;
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    g.beginPath();
    g.moveTo(h + Math.cos(a) * 40, h + Math.sin(a) * 40);
    g.lineTo(h + Math.cos(a) * h, h + Math.sin(a) * h);
    g.stroke();
  }
  for (let r = 70; r < h; r += 62) {
    g.beginPath();
    g.arc(h, h, r, 0, Math.PI * 2);
    g.stroke();
  }
  // Vệt phản chiếu của hàng cột vách: dải sáng mảnh chạy từ mép vào, mờ dần.
  for (let i = 0; i < 12; i++) {
    const a = ((i + 0.5) / 12) * Math.PI * 2;
    const x0 = h + Math.cos(a) * h;
    const y0 = h + Math.sin(a) * h;
    const x1 = h + Math.cos(a) * h * 0.45;
    const y1 = h + Math.sin(a) * h * 0.45;
    const gr = g.createLinearGradient(x0, y0, x1, y1);
    gr.addColorStop(0, 'rgba(184,205,234,0.26)');
    gr.addColorStop(1, 'rgba(184,205,234,0)');
    g.strokeStyle = gr;
    g.lineWidth = 14;
    g.beginPath();
    g.moveTo(x0, y0);
    g.lineTo(x1, y1);
    g.stroke();
  }
  // Quầng trăng phản chiếu, lệch tâm.
  const mg = g.createRadialGradient(h + 90, h - 70, 0, h + 90, h - 70, 150);
  mg.addColorStop(0, 'rgba(207,224,255,0.38)');
  mg.addColorStop(1, 'rgba(207,224,255,0)');
  g.fillStyle = mg;
  g.fillRect(0, 0, N, N);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  // Lưới vòng bám sát địa hình (cao hơn mặt đất 0,08 m): sàn không bị mặt đất gồ ghề đâm thủng.
  const geo = new THREE.RingGeometry(0.01, def.r, 96, 40).rotateX(-Math.PI / 2);
  const p = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) p.setY(i, groundAt(def.x + p.getX(i), def.z + p.getZ(i)) + 0.08);
  geo.computeBoundingSphere();
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, fog: false }));
  mesh.position.set(def.x, 0, def.z);
  mesh.name = 'mirror-floor';
  mesh.frustumCulled = false;
  mesh.renderOrder = -1;
  return mesh;
}

/**
 * Khung cung gương (E3-M): hàng cột đá lam bạc quanh sảnh (đế, thân, đầu cột), gờ ngang trên đầu cột, gương lớn treo giữa các cột (khung bạc + mặt
 * gương ngả lam, sáng ở chân tối dần lên trần) và gờ sàn bạc. TẤT CẢ gộp một lưới màu theo đỉnh (một draw call, vài nghìn tam giác), tất định.
 * Không đèn, không texture: sáng tối vẽ sẵn vào màu đỉnh, tông trầm để không lóa che nhân vật.
 */
export function buildPalaceHall(def: CaveDef, groundAt: (x: number, z: number) => number): THREE.Mesh {
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const V = (x: number, y: number, z: number, c: THREE.Color): number => {
    pos.push(x, y, z);
    // Hệ số 0,5: màu đỉnh cung gương đã gần trắng sau tông màu, giữ tối để không cháy sáng.
    col.push(c.r * 0.5, c.g * 0.5, c.b * 0.5);
    return pos.length / 3 - 1;
  };
  const quad = (a: number, b: number, c: number, d: number) => idx.push(a, b, c, a, c, d);
  const C = (r: number, g: number, b: number) => new THREE.Color(r, g, b);
  const stone0 = C(0.3, 0.38, 0.52);
  const stone1 = C(0.09, 0.12, 0.2);
  const silver = C(0.42, 0.52, 0.7);
  const silverDim = C(0.3, 0.38, 0.52);
  /** Khối chữ nhật quay theo hướng ngoài (yaw), đáy y0 màu c0 → đỉnh y1 màu c1. */
  const box = (cx: number, cz: number, ang: number, w: number, d: number, y0: number, y1: number, c0: THREE.Color, c1: THREE.Color) => {
    const tx = -Math.sin(ang);
    const tz = Math.cos(ang);
    const nx = Math.cos(ang);
    const nz = Math.sin(ang);
    const corner = (sx: number, sz: number) => [cx + tx * w * 0.5 * sx + nx * d * 0.5 * sz, cz + tz * w * 0.5 * sx + nz * d * 0.5 * sz] as const;
    const cs = [corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1)];
    const lo = cs.map(([x, z]) => V(x, y0, z, c0));
    const hi = cs.map(([x, z]) => V(x, y1, z, c1));
    for (let i = 0; i < 4; i++) quad(lo[i], lo[(i + 1) % 4], hi[(i + 1) % 4], hi[i]);
    quad(hi[0], hi[1], hi[2], hi[3]);
  };
  const N = 20;
  const R = def.r - 6;
  const H = 34;
  const gapAng = (Math.PI * 2) / N;
  for (let i = 0; i < N; i++) {
    const a = i * gapAng;
    const cx = def.x + Math.cos(a) * R;
    const cz = def.z + Math.sin(a) * R;
    const y = groundAt(cx, cz);
    // Cột: đế, thân, đầu cột.
    box(cx, cz, a, 3.4, 3.4, y - 1, y + 1.2, silverDim, silver);
    box(cx, cz, a, 2.2, 2, y + 1.2, y + H, stone0, stone1);
    box(cx, cz, a, 3.2, 3.2, y + H, y + H + 1.2, silver, silverDim);
    // Gờ ngang nối sang cột kế.
    const am = a + gapAng / 2;
    const mx = def.x + Math.cos(am) * R;
    const mz = def.z + Math.sin(am) * R;
    const len = 2 * R * Math.sin(gapAng / 2) - 3;
    box(mx, mz, am, len, 1.6, y + H - 1.6, y + H, silverDim, silver);
    // Gương lớn treo giữa hai cột (chừa cửa phía nam, +z, nơi vào/ra).
    const toSouth = Math.abs(Math.atan2(Math.sin(am - Math.PI / 2), Math.cos(am - Math.PI / 2)));
    if (toSouth < 0.2) continue;
    const gy = groundAt(mx, mz);
    const ring = (rx: number, ry: number, cy: number, off: number, cInner: (t: number, k: number) => THREE.Color) => {
      const inx = -Math.cos(am);
      const inz = -Math.sin(am);
      const tx = -Math.sin(am);
      const tz = Math.cos(am);
      const px = mx + inx * off;
      const pz = mz + inz * off;
      const center = V(px, gy + cy, pz, cInner(0, 0));
      const SEG = 20;
      const rim: number[] = [];
      for (let k = 0; k < SEG; k++) {
        const t = (k / SEG) * Math.PI * 2;
        const u = Math.cos(t) * rx;
        const v = Math.sin(t) * ry;
        rim.push(V(px + tx * u, gy + cy + v, pz + tz * u, cInner(1, v / ry)));
      }
      for (let k = 0; k < SEG; k++) idx.push(center, rim[k], rim[(k + 1) % SEG], center, rim[(k + 1) % SEG], rim[k]);
    };
    ring(5.6, 14, 17, 0.4, () => silver); // khung bạc
    // Mặt gương: sáng ở chân (phản sàn), tối dần lên trần; một dải sáng chéo bằng cách lệch màu theo cạnh.
    ring(4.8, 13.2, 17, 0.7, (k, v) => C(0.12 + 0.3 * (0.5 - v * 0.5) + 0.06 * k, 0.2 + 0.4 * (0.5 - v * 0.5), 0.34 + 0.5 * (0.5 - v * 0.5)));
  }
  // Gờ sàn bạc: vành mỏng bám địa hình quanh ranh sàn gương, và vành trong sáng hơn.
  const band = (r0: number, r1: number, c: THREE.Color) => {
    const SEG = 120;
    const a0: number[] = [];
    const a1: number[] = [];
    for (let k = 0; k < SEG; k++) {
      const t = (k / SEG) * Math.PI * 2;
      const x0 = def.x + Math.cos(t) * r0;
      const z0 = def.z + Math.sin(t) * r0;
      const x1 = def.x + Math.cos(t) * r1;
      const z1 = def.z + Math.sin(t) * r1;
      a0.push(V(x0, groundAt(x0, z0) + 0.16, z0, c));
      a1.push(V(x1, groundAt(x1, z1) + 0.16, z1, c));
    }
    for (let k = 0; k < SEG; k++) quad(a0[k], a1[k], a1[(k + 1) % SEG], a0[(k + 1) % SEG]);
  };
  band(76, 78.4, silver);
  band(40, 40.7, silverDim);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeBoundingSphere();
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, fog: false }));
  mesh.name = 'palace-hall';
  mesh.frustumCulled = false;
  return mesh;
}

/** Quầng sáng lam lục quanh tinh thể mạch (một draw call cho mọi điểm); cùng khuôn quầng đèn nhưng đổi màu. */
export function buildCrystalGlow(points: readonly { x: number; y: number; z: number }[]): THREE.Mesh {
  const m = createLanternHalos(points, 5.5, 0x3fd1c0);
  m.name = 'crystal-glow';
  return m;
}
