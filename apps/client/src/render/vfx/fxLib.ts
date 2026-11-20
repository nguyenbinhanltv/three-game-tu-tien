import * as THREE from 'three/webgpu';
import type { FxLibShape } from '@dtl/shared';

/**
 * Thư viện hình mesh VFX (VS-1): 25 hình có KHỐI (độ dày, sống lưng, mảnh vỡ) thay cho các tấm phẳng kite/spike/ripple.
 * Dựng thủ tục bằng code (không file GLB: không cần nạp, gộp instance như mọi hình `FxShape`, thử trong test node). UV theo quy ước của shader
 * `render/vfx/stylized.ts`:
 *   - kiểu `toon`: `u` dọc hình (chiều quét/lộ dần), `v` từ mép trong (0) ra mép ngoài (1).
 *   - kiểu `crystal`: `u` ngang mặt/quanh thân (0..1), `v` từ gốc (0) tới mũi (1) → tông sáng dần về mũi, gân vàng ở mép.
 * Quy ước cục bộ như `fxShapes.ts`: +Z tiến, +Y lên, +X phải; thanh dài có mũi ở +Z (xoay bằng `rot` của sự kiện).
 * Mỗi hình dựng một lần (memo ở `fxShapes.shapeGeometry`); ngân sách tam giác kiểm ở `fxLib.test.ts`.
 */

function build(pos: number[], uvs: number[], idx: number[]): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  g.computeBoundingBox();
  return g;
}

/** Gộp các khối (giữ UV) thành một lưới có chỉ mục tuần tự (lưới không chỉ mục giữ sai số instance ở WebGPU, xem `crystalGeometry`). */
function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const pos: number[] = [];
  const uvs: number[] = [];
  const idx: number[] = [];
  for (const p of parts) {
    const g = p.index ? p.toNonIndexed() : p;
    const a = g.getAttribute('position');
    const t = g.getAttribute('uv');
    const base = pos.length / 3;
    for (let i = 0; i < a.count; i++) {
      pos.push(a.getX(i), a.getY(i), a.getZ(i));
      uvs.push(t ? t.getX(i) : 0, t ? t.getY(i) : 0);
      idx.push(base + i);
    }
  }
  return build(pos, uvs, idx);
}

function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DEG = Math.PI / 180;

// ---------------------------------------------------------------------------------------------------------------
// Vết chém có độ dày: lưỡi liềm nằm ngang (mặt XZ), lồi về +Z, đỉnh ở gốc, bán kính ngoài 1. Mép NGOÀI sắc (dày 0), mép TRONG dày
// `thick` như sống lưng; hai mặt trên/dưới phình ra (dạng thấu kính) nên nhìn nghiêng vẫn có khối.
// ---------------------------------------------------------------------------------------------------------------
function arcBlade(arcDeg: number, width: number, thick: number, segs = 40, rows = 5): THREE.BufferGeometry {
  const arc = arcDeg * DEG;
  const pos: number[] = [];
  const uvs: number[] = [];
  const idx: number[] = [];
  for (const side of [1, -1]) {
    const base = pos.length / 3;
    for (let i = 0; i <= segs; i++) {
      const u = i / segs;
      const th = -arc / 2 + arc * u;
      const prof = Math.pow(Math.sin(Math.PI * u), 0.85);
      for (let j = 0; j < rows; j++) {
        const v = j / (rows - 1);
        const rad = 1 - width * prof * (1 - v);
        const h = thick * prof * Math.pow(1 - v, 0.7) * side;
        pos.push(rad * Math.sin(th), h, rad * Math.cos(th) - 1);
        uvs.push(u, v);
      }
    }
    for (let i = 0; i < segs; i++)
      for (let j = 0; j < rows - 1; j++) {
        const a = base + i * rows + j;
        const b = a + rows;
        if (side > 0) idx.push(a, b, a + 1, a + 1, b, b + 1);
        else idx.push(a, a + 1, b, a + 1, b + 1, b);
      }
  }
  return build(pos, uvs, idx);
}

const rollArc = (g: THREE.BufferGeometry, deg: number, scale = 1): THREE.BufferGeometry => g.scale(scale, scale, scale).rotateZ(deg * DEG);

const slashThick = () => arcBlade(170, 0.55, 0.12);
const slashThin = () => arcBlade(190, 0.18, 0.03, 48, 4);
const slashCross = () => merge([rollArc(arcBlade(150, 0.4, 0.08), 35), rollArc(arcBlade(150, 0.4, 0.08), -35)]);
const slashFan = () =>
  merge([-2, -1, 0, 1, 2].map((k) => rollArc(arcBlade(130 - Math.abs(k) * 12, 0.16, 0.025, 20, 3), k * 14, 1 - Math.abs(k) * 0.07)));

// ---------------------------------------------------------------------------------------------------------------
// Lưỡi kiếm có khối: tiết diện thoi dọc +Z (mũi ở +Z), gân giữa nổi, mũi vát. `kind crystal`: u quanh thân, v 0 chuôi → 1 mũi.
// ---------------------------------------------------------------------------------------------------------------
interface BladeSpec {
  /** Dài lưỡi, nửa rộng gốc, nửa dày gốc, tỉ lệ rộng ở giữa (thon dần), chiều cao mũi vát. */
  len: number;
  w: number;
  t: number;
  waist?: number;
  tip?: number;
  /** Số trạm dọc (độ mịn). */
  n?: number;
  /** Có gân giữa nổi (tiết diện 6 điểm) hay thoi 4 điểm. */
  ridge?: boolean;
  z0?: number;
}

function bladeBody(s: BladeSpec): THREE.BufferGeometry {
  const n = s.n ?? 6;
  const ridge = s.ridge ?? false;
  const ring = ridge ? 6 : 4;
  const pos: number[] = [];
  const uvs: number[] = [];
  const idx: number[] = [];
  const z0 = s.z0 ?? 0;
  const section = (k: number): [number, number][] => {
    const w = s.w * k;
    const t = s.t * k;
    return ridge
      ? [
          [0, t * 1.4],
          [w * 0.55, t * 0.35],
          [w, 0],
          [0, -t * 1.4],
          [-w, 0],
          [-w * 0.55, t * 0.35],
        ]
      : [
          [w, 0],
          [0, t],
          [-w, 0],
          [0, -t],
        ];
  };
  const stations = n + 1;
  for (let i = 0; i < stations; i++) {
    const f = i / n;
    const k = 1 - f * (1 - (s.waist ?? 0.55)) * 1.1;
    const kk = Math.max(0.06, k) * (i === stations - 1 ? 0.05 : 1);
    const pts = section(kk);
    for (let j = 0; j < ring; j++) {
      pos.push(pts[j]![0], pts[j]![1], z0 + f * s.len);
      uvs.push(j / ring, f);
    }
  }
  for (let i = 0; i < stations - 1; i++)
    for (let j = 0; j < ring; j++) {
      const a = i * ring + j;
      const b = i * ring + ((j + 1) % ring);
      idx.push(a, b, a + ring, b, b + ring, a + ring);
    }
  // Mũi vát: một đỉnh phía trước đỉnh trạm cuối.
  const tipZ = z0 + s.len + (s.tip ?? s.len * 0.08);
  const tipI = pos.length / 3;
  pos.push(0, 0, tipZ);
  uvs.push(0.5, 1);
  const last = (stations - 1) * ring;
  for (let j = 0; j < ring; j++) idx.push(last + j, last + ((j + 1) % ring), tipI);
  return build(pos, uvs, idx);
}

/** Thanh kiếm trọn bộ dài ~`len`: lưỡi + chắn + chuôi + đầu chuôi, dài từ z=0 (đầu chuôi) tới mũi ở +Z. */
function sword(len: number, ridge = true, w = 0.055): THREE.BufferGeometry {
  const hilt = len * 0.2;
  const guard = len * 0.04;
  const blade = bladeBody({ len: len - hilt - guard, w, t: w * 0.32, ridge, n: 7, waist: 0.5, z0: hilt + guard });
  const g = new THREE.BoxGeometry(w * 3.2, w * 0.45, guard * 1.2).translate(0, 0, hilt + guard * 0.5);
  const h = new THREE.CylinderGeometry(w * 0.22, w * 0.22, hilt, 6).rotateX(Math.PI / 2).translate(0, 0, hilt * 0.5);
  const p = new THREE.SphereGeometry(w * 0.34, 6, 4).translate(0, 0, 0);
  // Chuẩn hóa v theo z để tông sáng dần về mũi.
  const m = merge([blade, g, h, p]);
  const a = m.getAttribute('position');
  const uv = m.getAttribute('uv') as THREE.BufferAttribute;
  const top = len + len * 0.02;
  for (let i = 0; i < a.count; i++) uv.setY(i, Math.min(1, Math.max(0, a.getZ(i) / top)));
  uv.needsUpdate = true;
  return m;
}

const bladeFlying = () => sword(1, true, 0.06);
const bladeGhost = () => bladeBody({ len: 1.6, w: 0.045, t: 0.01, waist: 0.35, n: 5, tip: 0.2 });

/** Kiếm cắm đất: kiếm dài 1 mũi ở +Z (xoay xuống bằng `rot`) kèm vòng đá vỡ ở gần chắn (rãnh nứt quanh chỗ cắm), thêm ở z ≈ 0,9 cho tiện đặt. */
function bladeStuck(): THREE.BufferGeometry {
  const r = rng(11);
  const parts: THREE.BufferGeometry[] = [sword(1.15, true, 0.07)];
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + r() * 0.5;
    const d = 0.1 + r() * 0.08;
    const sz = 0.05 + r() * 0.05;
    const rock = new THREE.TetrahedronGeometry(sz, 0).scale(1, 0.7, 1).rotateY(r() * 6);
    rock.translate(Math.cos(a) * d, Math.sin(a) * d, 0.94 + r() * 0.04);
    parts.push(rock.toNonIndexed());
  }
  const m = merge(parts);
  return m;
}

/** Kiếm khổng lồ: lưỡi dài 1 (scale lên ~8 m), gân giữa, rãnh, mũi vát gãy khúc; chắn hình cánh, chuôi dài. */
function bladeGiant(): THREE.BufferGeometry {
  const hilt = 0.16;
  const guard = 0.05;
  const lower = bladeBody({ len: 0.55, w: 0.07, t: 0.022, ridge: true, n: 8, waist: 0.85, z0: hilt + guard });
  const upper = bladeBody({ len: 0.24, w: 0.0595, t: 0.0187, ridge: true, n: 6, waist: 0.4, z0: hilt + guard + 0.55, tip: 0.05 });
  const wing = (s: number) => {
    const g = new THREE.BoxGeometry(0.13, 0.016, 0.03).translate(s * 0.115, 0, hilt + guard * 0.4).rotateZ(s * 0.18);
    return g;
  };
  const grip = new THREE.CylinderGeometry(0.014, 0.014, hilt, 8).rotateX(Math.PI / 2).translate(0, 0, hilt / 2);
  const pommel = new THREE.OctahedronGeometry(0.03, 0).translate(0, 0, 0);
  const m = merge([lower, upper, wing(1), wing(-1), grip, pommel]);
  const a = m.getAttribute('position');
  const uv = m.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < a.count; i++) uv.setY(i, Math.min(1, Math.max(0, a.getZ(i) / 0.99)));
  uv.needsUpdate = true;
  return m;
}

// ---------------------------------------------------------------------------------------------------------------
// Mặt đất / sóng xung / khe nứt (kiểu toon)
// ---------------------------------------------------------------------------------------------------------------
/** Vòng sóng xung hình nón cụt mở (vành loe lên): bán kính 0,15 → 1, cao 0 → 0,45. `u` quanh vòng, `v` đáy (0) → vành (1). */
function shockCone(segs = 56, rows = 5): THREE.BufferGeometry {
  const pos: number[] = [];
  const uvs: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= segs; i++) {
    const u = i / segs;
    const a = u * Math.PI * 2;
    const jag = 1 + 0.06 * Math.sin(a * 11) + 0.04 * Math.sin(a * 23 + 1);
    for (let j = 0; j < rows; j++) {
      const v = j / (rows - 1);
      const r = (0.55 + 0.45 * v) * jag;
      const y = 0.45 * Math.pow(v, 1.6) * (0.85 + 0.15 * Math.sin(a * 7));
      pos.push(Math.cos(a) * r, y, Math.sin(a) * r);
      uvs.push(u, v);
    }
  }
  for (let i = 0; i < segs; i++)
    for (let j = 0; j < rows - 1; j++) {
      const a = i * rows + j;
      const b = a + rows;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  return build(pos, uvs, idx);
}

/** Vết nứt tỏa từ tâm: 9 nhánh răng cưa trên mặt XZ (cao y=0), bán kính ngoài 1. `u` dọc nhánh (tâm 0 → mũi 1), `v` ngang nhánh. */
function crackRadial(): THREE.BufferGeometry {
  const r = rng(5);
  const pos: number[] = [];
  const uvs: number[] = [];
  const idx: number[] = [];
  const arms = 9;
  const segs = 12;
  for (let k = 0; k < arms; k++) {
    const a0 = (k / arms) * Math.PI * 2 + (r() - 0.5) * 0.35;
    const len = 0.7 + r() * 0.3;
    const base = pos.length / 3;
    let ang = a0;
    let rad = 0;
    for (let i = 0; i <= segs; i++) {
      const u = i / segs;
      rad = len * u;
      ang += (r() - 0.5) * 0.22;
      const w = 0.05 * (1 - u) ** 0.8 + 0.004;
      const cx = Math.cos(ang) * rad;
      const cz = Math.sin(ang) * rad;
      const nx = -Math.sin(ang) * w;
      const nz = Math.cos(ang) * w;
      pos.push(cx + nx, 0, cz + nz, cx - nx, 0, cz - nz);
      uvs.push(u, 0, u, 1);
      if (i < segs) {
        const q = base + i * 2;
        idx.push(q, q + 1, q + 2, q + 1, q + 3, q + 2);
      }
    }
  }
  return build(pos, uvs, idx);
}

/** Khe nứt thẳng dọc +Z (0 → 1), rộng giữa, răng cưa hai mép. `u` dọc khe, `v` 0 ở giữa → 1 ở mép. */
function riftLine(): THREE.BufferGeometry {
  const r = rng(9);
  const segs = 40;
  const pos: number[] = [];
  const uvs: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= segs; i++) {
    const u = i / segs;
    const w = 0.07 * Math.pow(Math.sin(Math.PI * u), 0.6) * (0.75 + r() * 0.5);
    const off = (r() - 0.5) * 0.02;
    pos.push(-w + off, 0, u, 0 + off, 0, u, w + off, 0, u);
    uvs.push(u, 1, u, 0, u, 1);
    if (i < segs) {
      const q = i * 3;
      idx.push(q, q + 1, q + 3, q + 1, q + 4, q + 3, q + 1, q + 2, q + 4, q + 2, q + 5, q + 4);
    }
  }
  return build(pos, uvs, idx);
}

/** Mảnh đá vỡ: tứ diện/bát diện méo, phẳng từng mặt. `crystal`: `v` theo chiều cao. */
function rubble(seed: number, detail: 0 | 1, squash: number, stretch: number): THREE.BufferGeometry {
  const r = rng(seed);
  const ico = new THREE.IcosahedronGeometry(0.5, detail).toNonIndexed();
  const p = ico.getAttribute('position');
  const jitter = new Map<string, number>();
  const key = (x: number, y: number, z: number) => `${x.toFixed(3)},${y.toFixed(3)},${z.toFixed(3)}`;
  for (let i = 0; i < p.count; i++) {
    const k = key(p.getX(i), p.getY(i), p.getZ(i));
    let j = jitter.get(k);
    if (j === undefined) jitter.set(k, (j = 0.72 + r() * 0.5));
    p.setXYZ(i, p.getX(i) * j * stretch, p.getY(i) * j * squash, p.getZ(i) * j);
  }
  const pos: number[] = [];
  const uvs: number[] = [];
  const idx: number[] = [];
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < p.count; i++) {
    lo = Math.min(lo, p.getY(i));
    hi = Math.max(hi, p.getY(i));
  }
  for (let i = 0; i < p.count; i++) {
    pos.push(p.getX(i), p.getY(i), p.getZ(i));
    uvs.push(((i % 3) + 0.5) / 3, (p.getY(i) - lo) / Math.max(1e-6, hi - lo));
    idx.push(i);
  }
  return build(pos, uvs, idx);
}

// ---------------------------------------------------------------------------------------------------------------
// Trận phù, hào quang kiếm, rồng-kiếm
// ---------------------------------------------------------------------------------------------------------------
/** Vòng ấn đôi nằm ngang (XZ): vành trong liền, vành ngoài có 24 răng. `u` quanh vòng, `v` trong → ngoài mỗi vành. */
function runeRingDouble(): THREE.BufferGeometry {
  const pos: number[] = [];
  const uvs: number[] = [];
  const idx: number[] = [];
  const ring = (r0: number, r1: number, segs: number, teeth: number) => {
    const base = pos.length / 3;
    for (let i = 0; i <= segs; i++) {
      const u = i / segs;
      const a = u * Math.PI * 2;
      const tooth = teeth > 0 ? (Math.floor(u * teeth * 2) % 2 === 0 ? 0.045 : 0) : 0;
      pos.push(Math.cos(a) * r0, 0, Math.sin(a) * r0, Math.cos(a) * (r1 + tooth), 0, Math.sin(a) * (r1 + tooth));
      uvs.push(u, 0, u, 1);
      if (i < segs) {
        const q = base + i * 2;
        idx.push(q, q + 1, q + 2, q + 1, q + 3, q + 2);
      }
    }
  };
  ring(0.6, 0.67, 72, 0);
  ring(0.9, 0.96, 96, 24);
  return build(pos, uvs, idx);
}

/** Đặt một thanh kiếm quanh vòng: gốc ở (cos a·r, y, sin a·r), mũi hướng `up` (lên) hoặc ra ngoài; giữ UV. */
function placed(g: THREE.BufferGeometry, m: THREE.Matrix4): THREE.BufferGeometry {
  return g.clone().applyMatrix4(m);
}

/** Trận kiếm: 8 thanh kiếm dựng đứng (mũi lên) xếp vòng bán kính 1, nghiêng nhẹ vào trong. */
function runeSwordArray(): THREE.BufferGeometry {
  const base = sword(0.7, false, 0.05);
  const parts: THREE.BufferGeometry[] = [];
  const mat = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    e.set(-Math.PI / 2 + 0.12, -a + Math.PI / 2, 0, 'YXZ');
    q.setFromEuler(e);
    mat.compose(new THREE.Vector3(Math.cos(a), 0, Math.sin(a)), q, new THREE.Vector3(1, 1, 1));
    parts.push(placed(base, mat));
  }
  return merge(parts);
}

/** Vầng kiếm sau lưng: 13 thanh kiếm tỏa như vầng hào quang trong mặt XY (mũi hướng ra ngoài), cung 220° mở lên trên. */
function swordHalo(): THREE.BufferGeometry {
  const base = sword(0.9, false, 0.05);
  const parts: THREE.BufferGeometry[] = [];
  const mat = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const n = 13;
  for (let i = 0; i < n; i++) {
    const a = (-110 + (220 * i) / (n - 1)) * DEG + Math.PI / 2;
    // Quay +Z (mũi) về hướng (cos a, sin a, 0) trong mặt XY.
    q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(Math.cos(a), Math.sin(a), 0));
    const s = 0.8 + 0.2 * Math.cos(((i / (n - 1)) * 2 - 1) * Math.PI * 0.5);
    mat.compose(new THREE.Vector3(Math.cos(a) * 0.35, Math.sin(a) * 0.35, 0), q, new THREE.Vector3(s, s, s));
    parts.push(placed(base, mat));
  }
  return merge(parts);
}

/** Ống thon quanh đường cong (đầu ở điểm cuối), cho thân rồng. `u` quanh ống, `v` đuôi (0) → đầu (1). */
function tube(points: THREE.Vector3[], radius: (t: number) => number, sides = 6): THREE.BufferGeometry {
  const pos: number[] = [];
  const uvs: number[] = [];
  const idx: number[] = [];
  const n = points.length;
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const p = points[i]!;
    const tan = points[Math.min(n - 1, i + 1)]!.clone()
      .sub(points[Math.max(0, i - 1)]!)
      .normalize();
    const nx = new THREE.Vector3().crossVectors(tan, up);
    if (nx.lengthSq() < 1e-6) nx.set(1, 0, 0);
    nx.normalize();
    const ny = new THREE.Vector3().crossVectors(nx, tan).normalize();
    const rr = radius(t);
    for (let j = 0; j < sides; j++) {
      const a = (j / sides) * Math.PI * 2;
      pos.push(
        p.x + (nx.x * Math.cos(a) + ny.x * Math.sin(a)) * rr,
        p.y + (nx.y * Math.cos(a) + ny.y * Math.sin(a)) * rr,
        p.z + (nx.z * Math.cos(a) + ny.z * Math.sin(a)) * rr,
      );
      uvs.push(j / sides, t);
    }
  }
  for (let i = 0; i < n - 1; i++)
    for (let j = 0; j < sides; j++) {
      const a = i * sides + j;
      const b = i * sides + ((j + 1) % sides);
      idx.push(a, b, a + sides, b, b + sides, a + sides);
    }
  return build(pos, uvs, idx);
}

/** Rồng quấn kiếm: kiếm dựng đứng (mũi lên, cao 2 ở scale 1) + thân rồng cuộn 2,5 vòng quanh kiếm, đầu ở đỉnh, vây lưng. Trục đứng +Y. */
function dragonSwordCoil(): THREE.BufferGeometry {
  const blade = sword(2, true, 0.09)
    .rotateX(-Math.PI / 2)
    .translate(0, 0, 0);
  const pts: THREE.Vector3[] = [];
  const turns = 2.6;
  const n = 56;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const a = t * turns * Math.PI * 2;
    const r = 0.34 * (1 - 0.35 * t) + 0.06 * Math.sin(t * 20);
    pts.push(new THREE.Vector3(Math.cos(a) * r, 0.12 + t * 1.75, Math.sin(a) * r));
  }
  const body = tube(pts, (t) => 0.02 + 0.075 * Math.pow(Math.sin(Math.PI * Math.min(1, t * 0.8 + 0.1)), 0.7) * (t > 0.92 ? 1.5 : 1), 6);
  const head = pts[n - 1]!;
  const jaw = new THREE.ConeGeometry(0.09, 0.26, 5).rotateX(Math.PI / 2).translate(head.x, head.y + 0.03, head.z + 0.12);
  const spines: THREE.BufferGeometry[] = [];
  for (let i = 4; i < n - 4; i += 4) {
    const p = pts[i]!;
    const out = new THREE.Vector3(p.x, 0, p.z).normalize();
    const sp = new THREE.ConeGeometry(0.025, 0.12, 4);
    sp.translate(0, 0.06, 0);
    sp.rotateZ(-out.x * 0.9);
    sp.rotateX(out.z * 0.9);
    sp.translate(p.x + out.x * 0.07, p.y, p.z + out.z * 0.07);
    spines.push(sp);
  }
  return merge([blade, body, jaw, ...spines]);
}

/** Tia lửa có đuôi: hai tấm thoi vuông góc dọc +Z (0 → 1), thon hai đầu; nhìn từ mọi hướng đều có hình. `u` dọc, `v` ngang. */
function sparkStreak(): THREE.BufferGeometry {
  const pos: number[] = [];
  const uvs: number[] = [];
  const idx: number[] = [];
  for (const axis of ['x', 'y'] as const) {
    const base = pos.length / 3;
    const segs = 8;
    for (let i = 0; i <= segs; i++) {
      const u = i / segs;
      const w = 0.045 * Math.pow(Math.sin(Math.PI * Math.pow(u, 0.6)), 0.9);
      if (axis === 'x') pos.push(-w, 0, u, w, 0, u);
      else pos.push(0, -w, u, 0, w, u);
      uvs.push(u, 0, u, 1);
      if (i < segs) {
        const q = base + i * 2;
        idx.push(q, q + 1, q + 2, q + 1, q + 3, q + 2);
      }
    }
  }
  return build(pos, uvs, idx);
}

/** Lá kiếm cong (cánh hoa mảnh): dọc +Z (0 → 1), phình giữa, cong lên theo `u²`. `u` dọc, `v` từ sống lá (0) ra mép (1) (đối xứng hai nửa). */
function petalBlade(): THREE.BufferGeometry {
  const segs = 12;
  const pos: number[] = [];
  const uvs: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= segs; i++) {
    const u = i / segs;
    const w = 0.12 * Math.pow(Math.sin(Math.PI * Math.pow(u, 0.75)), 0.9);
    const y = 0.18 * u * u;
    const rib = 0.02 * Math.sin(Math.PI * u);
    pos.push(-w, y, u, 0, y + rib, u, w, y, u);
    uvs.push(u, 1, u, 0, u, 1);
    if (i < segs) {
      const q = i * 3;
      idx.push(q, q + 1, q + 3, q + 1, q + 4, q + 3, q + 1, q + 2, q + 4, q + 2, q + 5, q + 4);
    }
  }
  return build(pos, uvs, idx);
}

// ---------------------------------------------------------------------------------------------------------------
// Hộ pháp (VS-1): ấn, chuông, trụ đá, thuẫn, khung kim cương. Đều kiểu `crystal`, ĐỨNG theo +Y (đáy ở y = 0), mặt phẳng từng mặt.
// `u` chạy 0 → 1 ngang mỗi mặt/thanh nên shader tô gân vàng ở cạnh (viền đồng); đá dùng `u` giữa mặt để không có gân.
// Chuông và kim cương là KHUNG (gọng + đai) chứ không phải vỏ kín: úp quanh người mà vẫn thấy nhân vật bên trong.
// ---------------------------------------------------------------------------------------------------------------
type V5 = [number, number, number, number, number];

/** Gom tam giác rời (mỗi mặt một pháp tuyến); tự lật chiều để mặt hướng ra xa điểm `o` (tâm khối). */
class Faces {
  pos: number[] = [];
  uvs: number[] = [];
  o: [number, number, number] = [0, 0, 0];
  tri(a: V5, b: V5, c: V5): void {
    const ux = b[0] - a[0];
    const uy = b[1] - a[1];
    const uz = b[2] - a[2];
    const vx = c[0] - a[0];
    const vy = c[1] - a[1];
    const vz = c[2] - a[2];
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    const mx = (a[0] + b[0] + c[0]) / 3 - this.o[0];
    const my = (a[1] + b[1] + c[1]) / 3 - this.o[1];
    const mz = (a[2] + b[2] + c[2]) / 3 - this.o[2];
    const out = nx * mx + ny * my + nz * mz >= 0;
    for (const p of out ? [a, b, c] : [a, c, b]) {
      this.pos.push(p[0], p[1], p[2]);
      this.uvs.push(p[3], p[4]);
    }
  }
  quad(a: V5, b: V5, c: V5, d: V5): void {
    this.tri(a, b, c);
    this.tri(a, c, d);
  }
  /** Thanh bốn mặt (tiết diện hình thoi, nửa rộng `w`) nối P → Q; `v` lấy theo `vOf(y)`. */
  beam(p: THREE.Vector3, q: THREE.Vector3, w: number, vOf: (y: number) => number): void {
    const d = new THREE.Vector3().subVectors(q, p).normalize();
    const n1 = new THREE.Vector3()
      .crossVectors(d, Math.abs(d.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0))
      .normalize();
    const n2 = new THREE.Vector3().crossVectors(d, n1).normalize();
    const mid = new THREE.Vector3().addVectors(p, q).multiplyScalar(0.5);
    this.o = [mid.x, mid.y, mid.z];
    const ring = (c: THREE.Vector3): THREE.Vector3[] => [
      c.clone().addScaledVector(n1, w),
      c.clone().addScaledVector(n2, w),
      c.clone().addScaledVector(n1, -w),
      c.clone().addScaledVector(n2, -w),
    ];
    const a = ring(p);
    const b = ring(q);
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      this.quad(
        [a[i]!.x, a[i]!.y, a[i]!.z, 0, vOf(a[i]!.y)],
        [a[j]!.x, a[j]!.y, a[j]!.z, 1, vOf(a[j]!.y)],
        [b[j]!.x, b[j]!.y, b[j]!.z, 1, vOf(b[j]!.y)],
        [b[i]!.x, b[i]!.y, b[i]!.z, 0, vOf(b[i]!.y)],
      );
    }
  }
  /** Khối chóp cụt đáy đa giác đều `n` cạnh quanh trục Y: (r0, y0) → (r1, y1), xoay `rot` rad; mỗi mặt `u` 0 → 1. */
  frustum(n: number, r0: number, y0: number, r1: number, y1: number, vOf: (y: number) => number, rot = 0): void {
    this.o = [0, (y0 + y1) / 2, 0];
    for (let i = 0; i < n; i++) {
      const a0 = rot + (i / n) * Math.PI * 2;
      const a1 = rot + ((i + 1) / n) * Math.PI * 2;
      this.quad(
        [Math.cos(a0) * r0, y0, Math.sin(a0) * r0, 0, vOf(y0)],
        [Math.cos(a1) * r0, y0, Math.sin(a1) * r0, 1, vOf(y0)],
        [Math.cos(a1) * r1, y1, Math.sin(a1) * r1, 1, vOf(y1)],
        [Math.cos(a0) * r1, y1, Math.sin(a0) * r1, 0, vOf(y1)],
      );
    }
  }
  /** Nắp đa giác đều `n` cạnh ở độ cao `y` (mặt hướng ra xa `o` hiện tại). */
  cap(n: number, r: number, y: number, v: number, rot = 0): void {
    for (let i = 0; i < n; i++) {
      const a0 = rot + (i / n) * Math.PI * 2;
      const a1 = rot + ((i + 1) / n) * Math.PI * 2;
      this.tri([0, y, 0, 0.5, v], [Math.cos(a0) * r, y, Math.sin(a0) * r, 0.5, v], [Math.cos(a1) * r, y, Math.sin(a1) * r, 0.5, v]);
    }
  }
  done(): THREE.BufferGeometry {
    return build(
      this.pos,
      this.uvs,
      Array.from({ length: this.pos.length / 3 }, (_, i) => i),
    );
  }
}

/** Ấn (Trấn Sơn Ấn): đế vuông vát mép 1 × 1, hai bậc thu dần, núm cầm ở đỉnh; cao 1. Đáy (mặt khắc) ở y = 0. */
function sealBlock(): THREE.BufferGeometry {
  const f = new Faces();
  const v = (y: number) => y;
  const q = Math.SQRT2; // bán kính đa giác 4 cạnh = nửa cạnh × √2
  const r4 = Math.PI / 4;
  const tiers: [number, number][] = [
    [0.46, 0],
    [0.5, 0.06],
    [0.5, 0.4],
    [0.42, 0.48],
    [0.3, 0.5],
    [0.3, 0.62],
    [0.2, 0.68],
    [0.12, 0.7],
    [0.17, 0.86],
    [0.1, 1],
  ];
  for (let i = 0; i < tiers.length - 1; i++) f.frustum(4, tiers[i]![0] * q, tiers[i]![1], tiers[i + 1]![0] * q, tiers[i + 1]![1], v, r4);
  f.o = [0, 0.5, 0];
  f.cap(4, 0.46 * q, 0, 0, r4);
  f.cap(4, 0.1 * q, 1, 1, r4);
  return f.done();
}

/** Hồ sơ chuông (bán kính, độ cao): vành loe ở đáy, thân thon, vai tròn. */
const BELL_PROFILE: [number, number][] = [
  [1.0, 0],
  [0.9, 0.14],
  [0.79, 0.5],
  [0.73, 0.95],
  [0.67, 1.3],
  [0.52, 1.56],
  [0.4, 1.64],
];

/**
 * Chuông khung (Kim Chung Tráo): 8 gọng dọc theo hồ sơ chuông + 3 đai ngang (vành miệng dày, đai thân, đai vai) + chỏm kín và quai.
 * Bán kính miệng 1, cao 2; giữa các gọng để trống nên nhân vật bên trong không bị che.
 */
function bellCage(): THREE.BufferGeometry {
  const f = new Faces();
  const H = 2;
  const v = (y: number) => Math.min(1, Math.max(0, y / H));
  const at = (a: number, r: number, y: number) => new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r);
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    for (let i = 0; i < BELL_PROFILE.length - 1; i++)
      f.beam(at(a, BELL_PROFILE[i]![0], BELL_PROFILE[i]![1]), at(a, BELL_PROFILE[i + 1]![0], BELL_PROFILE[i + 1]![1]), 0.055, v);
  }
  const band = (r: number, y: number, w: number, segs: number) => {
    for (let i = 0; i < segs; i++) f.beam(at((i / segs) * Math.PI * 2, r, y), at(((i + 1) / segs) * Math.PI * 2, r, y), w, v);
  };
  band(1.0, 0.05, 0.08, 24);
  band(0.76, 0.72, 0.045, 16);
  band(0.6, 1.44, 0.045, 16);
  // Chỏm kín (vai → đỉnh) + quai.
  f.frustum(8, 0.4, 1.64, 0.26, 1.78, v);
  f.frustum(8, 0.26, 1.78, 0.1, 1.84, v);
  f.o = [0, 1.7, 0];
  f.cap(8, 0.1, 1.84, v(1.84));
  f.beam(new THREE.Vector3(-0.09, 1.82, 0), new THREE.Vector3(-0.09, 1.97, 0), 0.03, v);
  f.beam(new THREE.Vector3(0.09, 1.82, 0), new THREE.Vector3(0.09, 1.97, 0), 0.03, v);
  f.beam(new THREE.Vector3(-0.12, 1.97, 0), new THREE.Vector3(0.12, 1.97, 0), 0.03, v);
  return f.done();
}

/** Trụ đá (Sơn Nhạc Hóa Thân): cụm ba tảng lăng trụ 5 mặt gồ ghề, đỉnh vát lệch; tảng chính cao 1, hai tảng phụ ngả ra ngoài. */
function rockSpire(): THREE.BufferGeometry {
  const r = rng(17);
  const f = new Faces();
  const prism = (cx: number, cz: number, h: number, rad: number, lx: number, lz: number) => {
    const n = 5;
    const a0 = r() * 6.28;
    const levels = [0, 0.42, 0.78].map((t) => {
      const sc = t === 0 ? 1.08 : t < 0.5 ? 0.95 : 0.7;
      return Array.from({ length: n }, (_, i) => {
        const a = a0 + (i / n) * Math.PI * 2 + (r() - 0.5) * 0.3;
        const rr = rad * sc * (0.8 + r() * 0.4);
        return [cx + lx * t * h + Math.cos(a) * rr, t * h * (0.94 + r() * 0.12), cz + lz * t * h + Math.sin(a) * rr] as const;
      });
    });
    for (const p of levels[0]!) (p as unknown as number[])[1] = 0;
    const tip = [cx + lx * h + (r() - 0.5) * rad * 0.5, h, cz + lz * h + (r() - 0.5) * rad * 0.5] as const;
    const us = [0.2, 0.5, 0.8];
    const P = (p: readonly [number, number, number], k: number): V5 => [p[0], p[1], p[2], us[k % 3]!, Math.min(1, p[1])];
    for (let l = 0; l < levels.length - 1; l++) {
      f.o = [cx + lx * h * 0.4, (levels[l]![0]![1] + levels[l + 1]![0]![1]) / 2, cz + lz * h * 0.4];
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        f.tri(P(levels[l]![i]!, 0), P(levels[l]![j]!, 1), P(levels[l + 1]![j]!, 2));
        f.tri(P(levels[l]![i]!, 0), P(levels[l + 1]![j]!, 1), P(levels[l + 1]![i]!, 2));
      }
    }
    f.o = [cx + lx * h * 0.7, h * 0.7, cz + lz * h * 0.7];
    for (let i = 0; i < n; i++) f.tri(P(levels[2]![i]!, 0), P(levels[2]![(i + 1) % n]!, 1), P(tip, 2));
  };
  prism(0, 0, 1, 0.27, 0.05, -0.04);
  prism(0.26, 0.1, 0.62, 0.19, 0.3, 0.12);
  prism(-0.22, 0.16, 0.44, 0.17, -0.34, 0.2);
  return f.done();
}

/** Thuẫn (Kim Cương Bất Hoại, Thiên Kim Pháp Tướng): tấm chắn sáu cạnh thuôn dài rộng 1, cao 1,6, dày; mặt trước (+Z) hai bậc nổi và núm giữa. */
function shieldPlate(): THREE.BufferGeometry {
  const f = new Faces();
  const H = 1.6;
  const out: [number, number][] = [
    [0, 0],
    [0.5, 0.22],
    [0.5, 1.28],
    [0, 1.6],
    [-0.5, 1.28],
    [-0.5, 0.22],
  ];
  const cy = 0.8;
  const inner = out.map(([x, y]) => [x * 0.62, cy + (y - cy) * 0.66] as [number, number]);
  const n = out.length;
  f.o = [0, cy, -0.4];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    // Vành ngoài (gân vàng ở mép: `u` = 1 tại mép ngoài) → bậc trong → núm.
    f.quad(
      [out[i]![0], out[i]![1], 0.05, 1, out[i]![1] / H],
      [out[j]![0], out[j]![1], 0.05, 1, out[j]![1] / H],
      [inner[j]![0], inner[j]![1], 0.12, 0.5, inner[j]![1] / H],
      [inner[i]![0], inner[i]![1], 0.12, 0.5, inner[i]![1] / H],
    );
    f.tri(
      [inner[i]![0], inner[i]![1], 0.12, 0.3, inner[i]![1] / H],
      [inner[j]![0], inner[j]![1], 0.12, 0.7, inner[j]![1] / H],
      [0, cy, 0.24, 0.5, 0.5],
    );
  }
  f.o = [0, cy, 0];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    f.quad(
      [out[i]![0], out[i]![1], 0.05, 0, out[i]![1] / H],
      [out[j]![0], out[j]![1], 0.05, 1, out[j]![1] / H],
      [out[j]![0], out[j]![1], -0.07, 1, out[j]![1] / H],
      [out[i]![0], out[i]![1], -0.07, 0, out[i]![1] / H],
    );
    f.tri(
      [out[i]![0], out[i]![1], -0.07, 0.3, out[i]![1] / H],
      [out[j]![0], out[j]![1], -0.07, 0.7, out[j]![1] / H],
      [0, cy, -0.07, 0.5, 0.5],
    );
  }
  return f.done();
}

/** Khung kim cương (Kim Cương Bất Hoại): 12 cạnh của khối bát diện thuôn (đỉnh dưới y = 0, đai vuông bán kính 0,9 ở y = 1, đỉnh trên y = 2,2) + hạt ở 6 đỉnh. */
function diamondCage(): THREE.BufferGeometry {
  const f = new Faces();
  const H = 2.2;
  const v = (y: number) => Math.min(1, Math.max(0, y / H));
  const top = new THREE.Vector3(0, H, 0);
  const bot = new THREE.Vector3(0, 0, 0);
  const eq = [0, 1, 2, 3].map((i) => new THREE.Vector3(Math.cos((i / 4) * Math.PI * 2) * 0.9, 1, Math.sin((i / 4) * Math.PI * 2) * 0.9));
  for (let i = 0; i < 4; i++) {
    f.beam(eq[i]!, eq[(i + 1) % 4]!, 0.04, v);
    f.beam(eq[i]!, top, 0.04, v);
    f.beam(bot, eq[i]!, 0.04, v);
  }
  const gem = (c: THREE.Vector3, s: number) => {
    f.o = [c.x, c.y, c.z];
    const ax: [number, number, number][] = [
      [s, 0, 0],
      [0, 0, s],
      [-s, 0, 0],
      [0, 0, -s],
    ];
    for (let i = 0; i < 4; i++) {
      const a = ax[i]!;
      const b = ax[(i + 1) % 4]!;
      for (const sy of [s * 1.4, -s * 1.4])
        f.tri(
          [c.x + a[0], c.y, c.z + a[2], 0.2, v(c.y)],
          [c.x + b[0], c.y, c.z + b[2], 0.8, v(c.y)],
          [c.x, c.y + sy, c.z, 0.5, v(c.y + sy)],
        );
    }
  };
  for (const c of [...eq, top]) gem(c, 0.1);
  return f.done();
}

const BUILDERS: Record<FxLibShape, () => THREE.BufferGeometry> = {
  slash_thick: slashThick,
  slash_thin: slashThin,
  slash_cross: slashCross,
  slash_fan: slashFan,
  blade_flying: bladeFlying,
  blade_stuck: bladeStuck,
  blade_giant: bladeGiant,
  blade_ghost: bladeGhost,
  shock_cone: () => shockCone(),
  crack_radial: crackRadial,
  rift_line: riftLine,
  rubble_a: () => rubble(1, 0, 0.7, 1),
  rubble_b: () => rubble(2, 1, 0.9, 0.8),
  rubble_c: () => rubble(3, 0, 0.45, 1.25),
  rune_ring2: runeRingDouble,
  rune_array: runeSwordArray,
  dragon_sword: dragonSwordCoil,
  sword_halo: swordHalo,
  spark_streak: sparkStreak,
  petal_blade: petalBlade,
  seal_block: sealBlock,
  bell_cage: bellCage,
  rock_spire: rockSpire,
  shield_plate: shieldPlate,
  diamond_cage: diamondCage,
};

const cache = new Map<FxLibShape, THREE.BufferGeometry>();

/** Lưới của một hình trong thư viện (dùng chung, dựng một lần). */
export function libGeometry(s: FxLibShape): THREE.BufferGeometry {
  let g = cache.get(s);
  if (!g) cache.set(s, (g = BUILDERS[s]()));
  return g;
}
