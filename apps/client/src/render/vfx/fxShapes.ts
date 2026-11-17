import * as THREE from 'three/webgpu';
import type { FxShape } from '@dtl/shared';

/**
 * Lưới nền của hiệu ứng vẽ tay (VFX-V0). Quy ước cục bộ: +Z tiến, +Y lên, +X phải.
 * UV khớp shader `render/vfx/stylized.ts`: `u` dọc hình (chiều quét), `v` từ mép trong (0) ra mép ngoài (1).
 * Mỗi hình dựng một lần, dùng chung cho mọi chiêu (cùng hình thì gộp một draw call).
 */

function build(pos: number[], uvs: number[], idx?: number[]): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  if (idx) g.setIndex(idx);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

/**
 * Lưỡi liềm nằm ngang (mặt XZ), mặt lồi hướng +Z, đỉnh ở gốc, bán kính ngoài 1; `u` quét từ mũi này sang mũi kia.
 * Lớn hơn và nhọn hơn `slashGeometry` cũ: dày giữa (0,5 bán kính), hai đầu vuốt như nét bút.
 */
export function crescentGeometry(arcDeg = 165, width = 0.5, segs = 48): THREE.BufferGeometry {
  const arc = (arcDeg * Math.PI) / 180;
  const rows = 4;
  const pos: number[] = [];
  const uvs: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= segs; i++) {
    const u = i / segs;
    const th = -arc / 2 + arc * u;
    const prof = Math.pow(Math.sin(Math.PI * u), 0.85);
    for (let j = 0; j < rows; j++) {
      const v = j / (rows - 1);
      const rad = 1 - width * prof * (1 - v);
      pos.push(rad * Math.sin(th), 0, rad * Math.cos(th) - 1);
      uvs.push(u, v);
    }
  }
  for (let i = 0; i < segs; i++) {
    for (let j = 0; j < rows - 1; j++) {
      const a = i * rows + j;
      const b = a + rows;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  return build(pos, uvs, idx);
}

/** Tâm hình tròn của lưỡi liềm (đặt tâm cung vào điểm chém): (0, 0, −1) × bán kính. */
export const CRESCENT_CENTER = new THREE.Vector3(0, 0, -1);

/**
 * Gai/mũi tinh thể: lăng trụ đáy `sides` cạnh nhọn về +Z (hai đầu nếu `back` > 0). Không chỉ mục: mỗi mặt UV riêng
 * (`u` ngang mặt 0..1, `v` 0 đáy → 1 đỉnh) để shader vẽ gân vàng ở mép mặt.
 * Trục dài là +Z; gai trồi từ đất xoay trục này lên +Y bằng `rot` của sự kiện.
 */
export function crystalGeometry(sides: number, radius: number, front: number, back: number): THREE.BufferGeometry {
  const pos: number[] = [];
  const uvs: number[] = [];
  const ring = (i: number): [number, number] => {
    const a = (i / sides) * Math.PI * 2;
    return [Math.cos(a) * radius, Math.sin(a) * radius];
  };
  const tri = (a: number[], b: number[], c: number[], uva: number[], uvb: number[], uvc: number[]) => {
    pos.push(...a, ...b, ...c);
    uvs.push(...uva, ...uvb, ...uvc);
  };
  for (let i = 0; i < sides; i++) {
    const [x0, y0] = ring(i);
    const [x1, y1] = ring(i + 1);
    // Mặt trước: từ vòng giữa (z=0) lên đỉnh trước.
    tri([x0, y0, 0], [x1, y1, 0], [0, 0, front], [0, 0], [1, 0], [0.5, 1]);
    // Mặt sau: từ vòng giữa xuống đỉnh sau (nếu có); không thì đáy kín.
    if (back > 0) tri([x1, y1, 0], [x0, y0, 0], [0, 0, -back], [0, 0], [1, 0], [0.5, 0.35]);
    else tri([x1, y1, 0], [x0, y0, 0], [0, 0, 0], [0, 0], [1, 0], [0.5, 0]);
  }
  // Có chỉ mục tuần tự: lưới không chỉ mục trong InstancedMesh (WebGPU) giữ số instance của lần vẽ đầu, nên gộp draw call
  // mà số gai tăng dần theo thời gian thì chỉ thấy lần đầu (lưới có chỉ mục thì `count` đổi mỗi khung đúng).
  // Đỉnh không dùng chung giữa các mặt nên pháp tuyến phẳng giữ nguyên.
  return build(pos, uvs, Array.from({ length: pos.length / 3 }, (_, i) => i));
}

/** Vòng/đĩa nằm ngang (XZ): `u` quanh vòng, `v` từ trong (0) ra ngoài (1); lỗ giữa `inner`. */
export function rippleGeometry(inner = 0.55, segs = 56): THREE.BufferGeometry {
  const rows = 3;
  const pos: number[] = [];
  const uvs: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= segs; i++) {
    const u = i / segs;
    const a = u * Math.PI * 2;
    for (let j = 0; j < rows; j++) {
      const v = j / (rows - 1);
      const r = inner + (1 - inner) * v;
      pos.push(Math.cos(a) * r, 0, Math.sin(a) * r);
      uvs.push(u, v);
    }
  }
  for (let i = 0; i < segs; i++) {
    for (let j = 0; j < rows - 1; j++) {
      const a = i * rows + j;
      const b = a + rows;
      idx.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }
  return build(pos, uvs, idx);
}

/** Tấm vuông 2×2 tâm ở gốc, UV 0..1: đứng (XY, quay mặt về camera) hoặc nằm (XZ, trên đất). */
export const QUAD_XY = new THREE.PlaneGeometry(2, 2);
export const QUAD_XZ = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2);

/**
 * Dải xoắn quanh trục +Z dài 1 (u 0 → 1 từ đuôi tới đầu): ruy băng rộng `w` quay `turns` vòng, bán kính thon về hai đầu.
 * Vòng xoắn của phi kiếm (kéo theo sau kiếm). Mặt dải hướng theo bán kính nên nhìn ngang thấy rõ hình sin.
 */
export function helixGeometry(turns = 2.2, radius = 0.22, w = 0.09, segs = 72): THREE.BufferGeometry {
  const pos: number[] = [];
  const uvs: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= segs; i++) {
    const u = i / segs;
    const a = u * turns * Math.PI * 2;
    const r = radius * Math.sin(Math.PI * Math.min(1, u * 1.15)) ;
    const cx = Math.cos(a) * r;
    const cy = Math.sin(a) * r;
    const nx = Math.cos(a);
    const ny = Math.sin(a);
    // Hai mép dải: dọc bán kính (trong, ngoài).
    pos.push(cx - nx * w * 0.5, cy - ny * w * 0.5, u, cx + nx * w * 0.5, cy + ny * w * 0.5, u);
    uvs.push(u, 0, u, 1);
  }
  for (let i = 0; i < segs; i++) {
    const a = i * 2;
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  return build(pos, uvs, idx);
}

const cache = new Map<string, THREE.BufferGeometry>();
const memo = (k: string, f: () => THREE.BufferGeometry) => {
  let g = cache.get(k);
  if (!g) cache.set(k, (g = f()));
  return g;
};

export type ShapeKey = FxShape | 'shard';

/** Lưới của một hình (dùng chung). */
export function shapeGeometry(s: ShapeKey): THREE.BufferGeometry {
  switch (s) {
    case 'crescent':
      return memo('crescent', () => crescentGeometry());
    case 'spike':
      return memo('spike', () => crystalGeometry(6, 0.5, 3, 0));
    case 'shard':
      return memo('shard', () => crystalGeometry(3, 0.35, 1.6, 0));
    case 'kite':
      return memo('kite', () => crystalGeometry(4, 0.16, 1, 0.38));
    case 'ripple':
      return memo('ripple', () => rippleGeometry());
    case 'burst':
      return QUAD_XY;
    case 'smoke':
      return QUAD_XZ;
    case 'helix':
      return memo('helix', () => helixGeometry());
  }
}

/** Kiểu material của một hình (theo lớp). */
export function shapeKind(s: ShapeKey): 'toon' | 'crystal' | 'burst' | 'decal' {
  if (s === 'spike' || s === 'shard' || s === 'kite') return 'crystal';
  if (s === 'burst') return 'burst';
  if (s === 'smoke') return 'decal';
  return 'toon';
}
