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
function crescentGeometry(arcDeg = 165, width = 0.5, segs = 48): THREE.BufferGeometry {
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

/**
 * Gai/mũi tinh thể: lăng trụ đáy `sides` cạnh nhọn về +Z (hai đầu nếu `back` > 0). Không chỉ mục: mỗi mặt UV riêng
 * (`u` ngang mặt 0..1, `v` 0 đáy → 1 đỉnh) để shader vẽ gân vàng ở mép mặt.
 * Trục dài là +Z; gai trồi từ đất xoay trục này lên +Y bằng `rot` của sự kiện.
 */
function crystalGeometry(sides: number, radius: number, front: number, back: number): THREE.BufferGeometry {
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
  return build(
    pos,
    uvs,
    Array.from({ length: pos.length / 3 }, (_, i) => i),
  );
}

/** Vòng/đĩa nằm ngang (XZ): `u` quanh vòng, `v` từ trong (0) ra ngoài (1); lỗ giữa `inner`. */
function rippleGeometry(inner = 0.55, segs = 56): THREE.BufferGeometry {
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
const QUAD_XY = new THREE.PlaneGeometry(2, 2);
export const QUAD_XZ = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2);

/**
 * Dải xoắn quanh trục +Z dài 1 (u 0 → 1 từ đuôi tới đầu): ruy băng rộng `w` quay `turns` vòng, bán kính thon về hai đầu.
 * Vòng xoắn của phi kiếm (kéo theo sau kiếm). Mặt dải hướng theo bán kính nên nhìn ngang thấy rõ hình sin.
 */
function helixGeometry(turns = 2.2, radius = 0.22, w = 0.09, segs = 72): THREE.BufferGeometry {
  const pos: number[] = [];
  const uvs: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= segs; i++) {
    const u = i / segs;
    const a = u * turns * Math.PI * 2;
    const r = radius * Math.sin(Math.PI * Math.min(1, u * 1.15));
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

/**
 * Pháp tướng rồng: thân ống thon (đuôi mảnh → đầu to) chạy theo đường xoắn quanh trục đứng, kèm vây lưng, đầu có sọ + mõm dẹt,
 * hai sừng cong ra sau (gân vàng), hai râu dài. Cao `height` m ở scale 1, bán kính xoắn `rad`.
 * UV: `u` quanh ống (sừng u=0,95 để shader vẽ gân vàng), `v` dọc thân 0 (đuôi) → 1 (đầu): shader `crystal` mọc theo v.
 */
function dragonGeometry(turns = 1.35, height = 8.5, rad = 3.4, segs = 200, sides = 10): THREE.BufferGeometry {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 48; i++) {
    const u = i / 48;
    const a = u * turns * Math.PI * 2;
    const r = rad * (1 - 0.3 * u);
    pts.push(new THREE.Vector3(Math.sin(a) * r, u * height + Math.sin(u * 9) * 0.5, Math.cos(a) * r));
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  const frames = curve.computeFrenetFrames(segs, false);
  const pos: number[] = [];
  const uvs: number[] = [];
  const idx: number[] = [];
  const radius = (v: number) => 0.12 + 0.75 * Math.pow(Math.sin(Math.min(1, v * 1.05) * Math.PI * 0.5), 1.4);
  const ring = (c: THREE.Vector3, n: THREE.Vector3, b: THREE.Vector3, rr: number, flat: number, v: number) => {
    for (let j = 0; j <= sides; j++) {
      const a = (j / sides) * Math.PI * 2;
      const ca = Math.cos(a) * rr * flat;
      const sa = Math.sin(a) * rr;
      pos.push(c.x + n.x * ca + b.x * sa, c.y + n.y * ca + b.y * sa, c.z + n.z * ca + b.z * sa);
      uvs.push(j / sides, v);
    }
  };
  let rings = 0;
  const joinRings = (from: number, count: number) => {
    for (let i = 0; i < count - 1; i++)
      for (let j = 0; j < sides; j++) {
        const a = (from + i) * (sides + 1) + j;
        const b = a + sides + 1;
        idx.push(a, b, a + 1, a + 1, b, b + 1);
      }
  };
  for (let i = 0; i <= segs; i++) {
    const v = i / segs;
    ring(curve.getPointAt(v), frames.normals[i]!, frames.binormals[i]!, radius(v), 1, v);
    rings++;
  }
  joinRings(0, segs + 1);
  // Đầu: sọ phình rồi mõm dẹt thuôn (kéo dài theo tiếp tuyến cuối).
  const tEnd = curve.getTangentAt(1).normalize();
  const nEnd = frames.normals[segs]!;
  const bEnd = frames.binormals[segs]!;
  const cEnd = curve.getPointAt(1);
  const headRings: [number, number, number][] = [
    [0.5, 1.35, 0.9],
    [1.1, 1.25, 0.75],
    [1.8, 0.8, 0.5],
    [2.5, 0.55, 0.42],
    [2.9, 0.3, 0.35],
  ];
  const rEnd = radius(1);
  for (const [d, k, flat] of headRings) {
    ring(cEnd.clone().addScaledVector(tEnd, d), nEnd, bEnd, rEnd * k, flat, 1);
    rings++;
  }
  joinRings(segs, headRings.length + 1);
  // Vây lưng: tam giác dựng ra phía pháp tuyến, cứ 5 vòng một cái, to dần về đầu.
  const tri = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, va: number[], vb: number[], vc: number[]) => {
    const base = pos.length / 3;
    pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    uvs.push(...va, ...vb, ...vc);
    idx.push(base, base + 1, base + 2, base, base + 2, base + 1);
  };
  const dir = (n: THREE.Vector3, b: THREE.Vector3, k: number) => n.clone().multiplyScalar(Math.cos(k)).addScaledVector(b, Math.sin(k));
  for (let i = 6; i < segs - 4; i += 5) {
    const v = i / segs;
    const c = curve.getPointAt(v);
    const out = dir(frames.normals[i]!, frames.binormals[i]!, 0);
    const rr = radius(v);
    const along = curve.getTangentAt(v).normalize();
    tri(
      c
        .clone()
        .addScaledVector(out, rr * 0.9)
        .addScaledVector(along, -rr * 0.5),
      c
        .clone()
        .addScaledVector(out, rr * 0.9)
        .addScaledVector(along, rr * 0.5),
      c
        .clone()
        .addScaledVector(out, rr * 2.1)
        .addScaledVector(along, -rr * 0.9),
      [0.5, v],
      [0.5, v],
      [0.95, v],
    );
  }
  // Sừng: hai nón cong ra sau và lên, gân vàng.
  for (const side of [1, -1]) {
    const root = cEnd
      .clone()
      .addScaledVector(tEnd, 0.7)
      .addScaledVector(nEnd, rEnd * 1.0)
      .addScaledVector(bEnd, side * rEnd * 0.75);
    const tip = root
      .clone()
      .addScaledVector(tEnd, -3.2)
      .addScaledVector(nEnd, 2.4)
      .addScaledVector(bEnd, side * 1.0);
    const w = rEnd * 0.42;
    tri(root.clone().addScaledVector(bEnd, -w), root.clone().addScaledVector(bEnd, w), tip, [0.95, 1], [0.95, 1], [0.95, 1]);
    tri(root.clone().addScaledVector(nEnd, -w), root.clone().addScaledVector(nEnd, w), tip, [0.95, 1], [0.95, 1], [0.95, 1]);
  }
  // Râu: hai dải mảnh cong dài từ mõm ra hai bên rồi rủ về sau.
  for (const side of [1, -1]) {
    const start = cEnd
      .clone()
      .addScaledVector(tEnd, 2.4)
      .addScaledVector(nEnd, -rEnd * 0.1);
    let prev: [THREE.Vector3, THREE.Vector3] | null = null;
    for (let k = 0; k <= 10; k++) {
      const f = k / 10;
      const c = start
        .clone()
        .addScaledVector(bEnd, side * (1.2 + 2.8 * Math.sin(f * 2.2)))
        .addScaledVector(tEnd, 1.5 - 5 * f)
        .addScaledVector(nEnd, -1.8 * f * f - 0.3 * Math.sin(f * 6));
      const wd = 0.16 * (1 - f * 0.7);
      const pair: [THREE.Vector3, THREE.Vector3] = [c.clone().addScaledVector(nEnd, wd), c.clone().addScaledVector(nEnd, -wd)];
      if (prev) {
        tri(prev[0], prev[1], pair[0], [0.95, 1], [0.95, 1], [0.95, 1]);
        tri(prev[1], pair[1], pair[0], [0.95, 1], [0.95, 1], [0.95, 1]);
      }
      prev = pair;
    }
  }
  void rings;
  return build(pos, uvs, idx);
}

/** Pháp tướng tượng ngồi: tròn xoay theo hồ sơ (bán kính, độ cao) từ đài sen tới đỉnh đầu; UV `v` theo độ cao để mọc từ dưới lên. */
function statueGeometry(): THREE.BufferGeometry {
  const prof: [number, number][] = [
    [0, 0],
    [1.6, 0],
    [1.8, 0.35],
    [1.2, 0.8],
    [0.95, 1.5],
    [1.2, 2.1],
    [1.6, 2.7],
    [1.25, 3.05],
    [0.55, 3.2],
    [0.6, 3.4],
    [0.8, 3.75],
    [0.55, 4.1],
    [0, 4.25],
  ];
  const seg = 28;
  const pos: number[] = [];
  const uvs: number[] = [];
  const idx: number[] = [];
  const top = prof[prof.length - 1]![1];
  prof.forEach(([r, y], i) => {
    for (let j = 0; j <= seg; j++) {
      const a = (j / seg) * Math.PI * 2;
      pos.push(Math.cos(a) * r, y, Math.sin(a) * r);
      uvs.push(j / seg, y / top);
    }
    void i;
  });
  for (let i = 0; i < prof.length - 1; i++)
    for (let j = 0; j < seg; j++) {
      const a = i * (seg + 1) + j;
      const b = a + seg + 1;
      idx.push(a, a + 1, b, a + 1, b + 1, b);
    }
  return build(pos, uvs, idx);
}

/** Số vệt của một chùm gió. */
export const GUST_STREAKS = 7;

/**
 * Chùm đường gió (kỹ thuật `line` của Storm & Wind, viết lại): `GUST_STREAKS` dải mảnh cuộn quanh trục +Z (dài 1, từ -0,5 tới +0,5),
 * mỗi dải một bán kính, góc xuất phát và độ xoắn riêng, mặt dải tiếp tuyến với mặt trụ nên nhìn ngang vẫn thấy.
 * UV: `u` dọc đường 0 → 1; `v` = chỉ số vệt (phần nguyên) + ngang dải 0..0,98 (phần lẻ); shader `wind` tách pha theo chỉ số.
 */
function gustGeometry(radius = 0.5, w = 0.045, segs = 16): THREE.BufferGeometry {
  const pos: number[] = [];
  const uvs: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i < GUST_STREAKS; i++) {
    const h1 = Math.abs(Math.sin(i * 12.9898 + 1.7));
    const h2 = Math.abs(Math.sin(i * 78.233 + 4.1));
    const a0 = (i / GUST_STREAKS) * Math.PI * 2 + h1 * 0.5;
    const turns = (0.35 + h2 * 0.5) * (i % 2 ? 1 : -1);
    const r0 = radius * (0.55 + 0.45 * h1);
    const base = pos.length / 3;
    for (let j = 0; j <= segs; j++) {
      const u = j / segs;
      const a = a0 + u * turns * Math.PI * 2;
      const r = r0 * (0.75 + 0.25 * Math.sin(u * Math.PI));
      const cx = Math.cos(a) * r;
      const cy = Math.sin(a) * r;
      // Tiếp tuyến quanh trục (rộng của dải); thon ở hai đầu.
      const tw = w * (0.4 + 0.6 * Math.sin(u * Math.PI));
      const tx = -Math.sin(a) * tw;
      const ty = Math.cos(a) * tw;
      pos.push(cx - tx, cy - ty, u - 0.5, cx + tx, cy + ty, u - 0.5);
      uvs.push(u, i, u, i + 0.98);
      if (j < segs) {
        const k = base + j * 2;
        idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
      }
    }
  }
  return build(pos, uvs, idx);
}

/** Gom các khối (đã đặt đúng chỗ) thành một lưới có chỉ mục tuần tự, UV `u` theo khối, `v` = vị trí dọc trục `axis` chuẩn hóa 0 → 1. */
function mergedParts(parts: THREE.BufferGeometry[], axis: 'y' | 'z', smooth = false): THREE.BufferGeometry {
  const pos: number[] = [];
  const uvs: number[] = [];
  const nor: number[] = [];
  let lo = Infinity;
  let hi = -Infinity;
  const flat = parts.map((p) => (p.index ? p.toNonIndexed() : p));
  for (const g of flat) {
    const a = g.getAttribute('position');
    for (let i = 0; i < a.count; i++) {
      const c = axis === 'y' ? a.getY(i) : a.getZ(i);
      lo = Math.min(lo, c);
      hi = Math.max(hi, c);
    }
  }
  for (const g of flat) {
    const a = g.getAttribute('position');
    const t = g.getAttribute('uv');
    for (let i = 0; i < a.count; i++) {
      pos.push(a.getX(i), a.getY(i), a.getZ(i));
      const nn = g.getAttribute('normal');
      if (nn) nor.push(nn.getX(i), nn.getY(i), nn.getZ(i));
      const c = axis === 'y' ? a.getY(i) : a.getZ(i);
      uvs.push(t ? t.getX(i) : 0, (c - lo) / Math.max(1e-6, hi - lo));
    }
  }
  const g = build(
    pos,
    uvs,
    Array.from({ length: pos.length / 3 }, (_, i) => i),
  );
  // Giữ pháp tuyến mịn của từng khối gốc (bóng mềm cho hình người); mặc định phẳng từng mặt (kiếm).
  if (smooth && nor.length === pos.length) g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  return g;
}

/**
 * Thanh kiếm thật dài 1 dọc +Z (mũi ở +Z): lưỡi dẹt nhọn mũi, chắn kiếm, chuôi, đầu chuôi. UV `v` từ chuôi (0) tới mũi (1) để shader `crystal`
 * ra tông sáng dần về mũi, gân vàng ở mép; mỗi mặt phẳng (không dùng chung đỉnh).
 */
function swordGeometry(): THREE.BufferGeometry {
  const blade = new THREE.CylinderGeometry(0.008, 0.065, 0.74, 4, 1, false).rotateX(Math.PI / 2).rotateZ(Math.PI / 4);
  blade.scale(0.5, 1, 1);
  blade.translate(0, 0, 0.27 + 0.37);
  const guard = new THREE.BoxGeometry(0.2, 0.026, 0.034).translate(0, 0, 0.27);
  const hilt = new THREE.CylinderGeometry(0.014, 0.014, 0.22, 6).rotateX(Math.PI / 2).translate(0, 0, 0.14);
  const pommel = new THREE.SphereGeometry(0.03, 6, 4).translate(0, 0, 0.02);
  return mergedParts([blade, guard, hilt, pommel], 'z');
}

const cache = new Map<string, THREE.BufferGeometry>();
const memo = (k: string, f: () => THREE.BufferGeometry) => {
  let g = cache.get(k);
  if (!g) cache.set(k, (g = f()));
  return g;
};

/** Hình riêng của hào quang cảnh giới (RFX-1): thanh kiếm thật (dựng một lần, dùng chung). */
export const swordFxGeometry = (): THREE.BufferGeometry => memo('sword', swordGeometry);

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
    case 'dragon':
      return memo('dragon', () => dragonGeometry());
    case 'statue':
      return memo('statue', () => statueGeometry());
    case 'card':
      return QUAD_XY;
    case 'ribbon':
      return memo('ribbon', () => helixGeometry(2.6, 0.22, 0.03, 96));
    case 'gust':
      return memo('gust', () => gustGeometry());
  }
}

/** Kiểu material của một hình (theo lớp). */
export function shapeKind(s: ShapeKey): 'toon' | 'crystal' | 'burst' | 'decal' | 'card' | 'wind' {
  if (s === 'card') return 'card';
  if (s === 'gust') return 'wind';
  if (s === 'spike' || s === 'shard' || s === 'kite' || s === 'dragon' || s === 'statue') return 'crystal';
  if (s === 'burst') return 'burst';
  if (s === 'smoke') return 'decal';
  return 'toon';
}
