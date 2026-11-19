import * as THREE from 'three/webgpu';
import { attribute, float, uniform, vec3 } from 'three/tsl';
import { fbm, hash01, KIEM_TRUNG } from '@dtl/shared';
import { heightAt } from '../../base/levelCtx';
import { createWorldMaterial } from '../../render/materials/world';

/**
 * Cảnh Kiếm Trủng (DUN-1, bí cảnh đầu tiên; chỉ để nhìn, KHÔNG va chạm, không đổi vùng boss/đợt quái/cổng):
 * nghĩa địa kiếm cổ. Ngàn thanh kiếm gãy cắm đất (hai `InstancedMesh`: kiếm nguyên cắm lưỡi xuống, lưỡi gãy lởm chởm), mười tám thanh cự kiếm
 * cao 14–60 m ở rìa lòng chảo (vật liệu PBR, vân rỉ, mạch khí xanh phát sáng vào bloom), kiếm trận khắc sàn đài chiến, tất cả bám địa hình
 * theo `heightAt`, vị trí tất định theo hạt giống. Kiếm nhỏ chừa khu giữa (đánh quái/boss), đường từ cổng vào, và đệm quanh điểm đợt.
 * Draw call: 2 (kiếm nhỏ) + 1 (cự kiếm) + 1 (kiếm trận) = 4.
 */

const SEED = 20261119;
const C = KIEM_TRUNG;

function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}

// ---------- màu đất ----------

const hex = (c: number): [number, number, number] => [((c >> 16) & 255) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255];
const lerp3 = (a: [number, number, number], b: [number, number, number], t: number): [number, number, number] => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];
const KT = {
  /** Nền đá xám lam, lạnh. */
  slate: hex(0x767c86),
  /** Tro trắng xám phủ thành mảng. */
  ash: hex(0xb4bcc6),
  /** Vệt rỉ nâu đỏ chảy từ chân kiếm. */
  rust: hex(0x6a5a52),
  /** Đá nứt, vách. */
  dark: hex(0x434a54),
  /** Sàn đài chiến: đá đen bóng, hơi lam. */
  floor: hex(0x4a525e),
};

/** Màu đất Kiếm Trủng (RGB 0..1, viết vào `out`): đá xám lam, mảng tro trắng, vệt rỉ, vách tối; lòng đài chiến sẫm và mịn hơn. */
export function ktGroundColor(x: number, z: number, ny: number, out: [number, number, number]): void {
  const n = fbm(x * 0.012, z * 0.012, 2, SEED + 300);
  const m = fbm(x * 0.04, z * 0.04, 2, SEED + 331);
  const f = fbm(x * 0.15, z * 0.15, 1, SEED + 377);
  let c = lerp3(KT.slate, KT.ash, Math.min(0.7, Math.max(0, n * 1.3 + 0.15)));
  // Vệt rỉ: đám nhỏ theo nhiễu, đậm ở vành lòng chảo (nơi kiếm cắm dày).
  const d = Math.hypot(x - C.x, z - C.z);
  const rim = Math.min(1, Math.max(0, (d - 30) / 70));
  c = lerp3(c, KT.rust, Math.min(0.62, Math.max(0, m - 0.02) * 1.5 * (0.35 + rim)));
  c = lerp3(c, KT.dark, Math.min(0.45, Math.max(0, -m - 0.05) * 1.2));
  // Sàn đài chiến: đá phiến sẫm, mép vòng sáng nhạt.
  const arena = 1 - Math.min(1, Math.max(0, (d - 52) / 14));
  if (arena > 0) {
    c = lerp3(c, KT.floor, arena * 0.7);
    const ring = Math.pow(Math.max(0, 1 - Math.abs(d - 56) / 1.1), 2);
    c = lerp3(c, KT.ash, ring * 0.6);
  }
  const slope = 1 - ny;
  if (slope > 0.12) c = lerp3(c, KT.dark, Math.min(1, (slope - 0.12) * 4.2));
  const k = 0.92 + f * 0.14;
  out[0] = c[0] * k;
  out[1] = c[1] * k;
  out[2] = c[2] * k;
}

// ---------- hình học kiếm ----------

interface Part {
  pos: number[];
  col: number[];
  glow: number[];
}

/** Khối thon (đáy chữ nhật w0×t0 ở y0, đỉnh w1×t1 ở y1; có thể lệch đỉnh `tilt` theo x), màu đáy → đỉnh, có thể phát sáng. Phẳng (mỗi mặt đỉnh riêng). */
function prism(
  p: Part,
  w0: number,
  t0: number,
  w1: number,
  t1: number,
  y0: number,
  y1: number,
  c0: [number, number, number],
  c1: [number, number, number],
  glow = 0,
  tilt = 0,
  capSlant = 0,
): void {
  const lo = [
    [-w0 / 2, y0, -t0 / 2],
    [w0 / 2, y0, -t0 / 2],
    [w0 / 2, y0, t0 / 2],
    [-w0 / 2, y0, t0 / 2],
  ] as const;
  const hi = [
    [-w1 / 2 + tilt, y1, -t1 / 2],
    [w1 / 2 + tilt, y1 + capSlant, -t1 / 2],
    [w1 / 2 + tilt, y1 + capSlant, t1 / 2],
    [-w1 / 2 + tilt, y1, t1 / 2],
  ] as const;
  const tri = (a: readonly number[], ca: [number, number, number], b: readonly number[], cb: [number, number, number], c: readonly number[], cc: [number, number, number]) => {
    p.pos.push(...a, ...b, ...c);
    p.col.push(...ca, ...cb, ...cc);
    p.glow.push(glow, glow, glow);
  };
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    tri(lo[i]!, c0, lo[j]!, c0, hi[j]!, c1);
    tri(lo[i]!, c0, hi[j]!, c1, hi[i]!, c1);
  }
  tri(hi[0]!, c1, hi[2]!, c1, hi[1]!, c1);
  tri(hi[0]!, c1, hi[3]!, c1, hi[2]!, c1);
}

function toGeometry(p: Part): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(p.pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(p.col, 3));
  g.setAttribute('glow', new THREE.Float32BufferAttribute(p.glow, 1));
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

const STEEL: [number, number, number] = [0.55, 0.6, 0.68];
const STEEL_DK: [number, number, number] = [0.3, 0.33, 0.39];
const RUST: [number, number, number] = [0.46, 0.27, 0.17];
const BRONZE: [number, number, number] = [0.4, 0.31, 0.18];
const LEATHER: [number, number, number] = [0.22, 0.17, 0.15];
/** Màu nền của rãnh khí rất tối: ánh xanh đến từ `emissiveNode`, không bị nắng đẩy cháy trắng. */
const RUNE: [number, number, number] = [0.02, 0.05, 0.07];

/** Kiếm nguyên cắm lưỡi xuống đất: chỉ thấy phần lưỡi sát chuôi, tấm chắn, chuôi và đầu chuôi. Cao 1 đơn vị, gốc ở mặt đất. */
function plantedSword(): THREE.BufferGeometry {
  const p: Part = { pos: [], col: [], glow: [] };
  prism(p, 0.07, 0.018, 0.075, 0.02, -0.05, 0.42, RUST, STEEL);
  prism(p, 0.075, 0.02, 0.1, 0.026, 0.4, 0.46, STEEL, STEEL_DK); // gờ chân chắn
  prism(p, 0.3, 0.04, 0.3, 0.04, 0.44, 0.475, BRONZE, BRONZE); // tấm chắn
  prism(p, 0.04, 0.04, 0.034, 0.034, 0.475, 0.75, LEATHER, LEATHER); // chuôi
  prism(p, 0.07, 0.07, 0.05, 0.05, 0.75, 0.8, BRONZE, STEEL_DK); // đầu chuôi
  return toGeometry(p);
}

/** Lưỡi gãy: thân thon, đỉnh vát lởm chởm (hai tầng lệch), vệt rỉ ở chân. Cao 1 đơn vị. */
function brokenBlade(): THREE.BufferGeometry {
  const p: Part = { pos: [], col: [], glow: [] };
  prism(p, 0.12, 0.024, 0.1, 0.022, -0.05, 0.62, RUST, STEEL);
  prism(p, 0.1, 0.022, 0.06, 0.018, 0.62, 0.88, STEEL, STEEL_DK, 0, 0.02, 0.1);
  prism(p, 0.04, 0.016, 0.0, 0.012, 0.88, 1.0, STEEL_DK, STEEL, 0, -0.03, 0.04);
  return toGeometry(p);
}

/**
 * Cự kiếm (cao 1 đơn vị, nhân theo `s`): `broken` = lưỡi gãy chổng trời (thân thon, đỉnh vát lệch); ngược lại là kiếm cắm lưỡi xuống với tấm chắn rộng,
 * chuôi quấn và đầu chuôi nhô lên trời. Cả hai có rãnh khí xanh phát sáng chạy dọc lưỡi (thuộc tính `glow`, vào bloom) và vệt rỉ ở chân.
 */
function giantSword(broken: boolean): THREE.BufferGeometry {
  const p: Part = { pos: [], col: [], glow: [] };
  if (broken) {
    prism(p, 0.12, 0.03, 0.1, 0.028, -0.05, 0.4, RUST, STEEL_DK);
    prism(p, 0.1, 0.028, 0.096, 0.026, 0.4, 0.66, STEEL_DK, STEEL);
    prism(p, 0.096, 0.026, 0.06, 0.02, 0.66, 0.88, STEEL, STEEL_DK, 0, 0.022, 0.12);
    prism(p, 0.04, 0.016, 0.0, 0.01, 0.88, 1.0, STEEL_DK, STEEL, 0, -0.03, 0.05);
    prism(p, 0.014, 0.034, 0.012, 0.03, 0.06, 0.78, RUNE, RUNE, 1); // rãnh khí (nhô hai mặt)
  } else {
    prism(p, 0.075, 0.024, 0.08, 0.026, -0.05, 0.28, RUST, STEEL_DK);
    prism(p, 0.08, 0.026, 0.076, 0.024, 0.28, 0.44, STEEL_DK, STEEL);
    prism(p, 0.1, 0.034, 0.1, 0.034, 0.42, 0.46, STEEL, STEEL_DK); // gờ chân chắn
    prism(p, 0.34, 0.05, 0.3, 0.046, 0.44, 0.49, BRONZE, BRONZE); // tấm chắn rộng
    prism(p, 0.05, 0.05, 0.042, 0.042, 0.49, 0.78, LEATHER, LEATHER); // chuôi
    prism(p, 0.09, 0.09, 0.06, 0.06, 0.78, 0.84, BRONZE, STEEL_DK); // đầu chuôi
    prism(p, 0.016, 0.044, 0.012, 0.04, 0.05, 0.4, RUNE, RUNE, 1);
    prism(p, 0.018, 0.052, 0.018, 0.052, 0.5, 0.74, RUNE, RUNE, 1); // vạch khí trên chuôi
  }
  return toGeometry(p);
}

// ---------- rải ----------

/** Chỗ cấm cắm kiếm (đệm theo m): khu giữa đài chiến, lối từ cổng vào. Hàm thuần để test. */
export function swordKeepOut(x: number, z: number, minR: number): boolean {
  const dx = x - C.x;
  const dz = z - C.z;
  const d = Math.hypot(dx, dz);
  if (d < minR) return true;
  // Lối từ điểm vào (1520, 1352) / lối ra (1520, 1370) lên đài: dải rộng 9 m phía nam.
  if (Math.abs(dx) < 9 && dz > 0) return true;
  return false;
}

export interface KtSword {
  x: number;
  z: number;
  /** Độ cao cắm so với mặt đất (m, thân kiếm hiển thị). */
  h: number;
  yaw: number;
  tiltX: number;
  tiltZ: number;
  kind: 'whole' | 'broken';
}

/** Ngàn kiếm nhỏ cắm quanh lòng chảo: thưa ở sát đài chiến, dày dần ra vành, thành bụi theo nhiễu; tất định. */
export function planSmallSwords(countWhole = 640, countBroken = 520): KtSword[] {
  const rand = rng(SEED);
  const out: KtSword[] = [];
  const want = countWhole + countBroken;
  let tries = 0;
  while (out.length < want && tries < want * 40) {
    tries++;
    const a = rand() * Math.PI * 2;
    const r = 26 + Math.pow(rand(), 0.72) * 118;
    const x = C.x + Math.cos(a) * r;
    const z = C.z + Math.sin(a) * r;
    if (swordKeepOut(x, z, 26)) continue;
    // Bụi: kiếm tụ thành đám (nhiễu thấp tần số cao thì bỏ), dày hơn khi xa tâm.
    const cl = fbm(x * 0.03, z * 0.03, 2, SEED + 911);
    const keep = 0.2 + Math.min(0.8, (r - 26) / 80) * 0.5 + Math.max(0, cl) * 0.9;
    if (rand() > keep) continue;
    const kind = out.length < countWhole ? 'whole' : 'broken';
    const near = r < 70;
    const hs = kind === 'whole' ? 1.7 + rand() * 2.4 : 0.9 + rand() * 1.8;
    const tilt = 0.12 + rand() * 0.34;
    out.push({
      x,
      z,
      h: near ? hs * 0.82 : hs * 1.15,
      yaw: rand() * Math.PI * 2,
      tiltX: (rand() - 0.5) * 2 * tilt,
      tiltZ: (rand() - 0.5) * 2 * tilt,
      kind,
    });
  }
  return out;
}

export interface KtGiant {
  x: number;
  z: number;
  /** Chiều cao (m). */
  h: number;
  yaw: number;
  lean: number;
  leanYaw: number;
  broken: boolean;
}

/** Cự kiếm: một thanh khổng lồ ở rìa bắc (điểm nhìn từ cổng vào), còn lại rải thành vành ngoài; tất định, tránh lối vào. */
export function planGiants(): KtGiant[] {
  const rand = rng(SEED + 7);
  const out: KtGiant[] = [];
  // Cự kiếm bắc: đối diện lối vào, cao 62 m, lưỡi nguyên.
  out.push({ x: C.x - 6, z: C.z - 122, h: 62, yaw: 0.4, lean: 0.05, leanYaw: 0.5, broken: false });
  out.push({ x: C.x + 52, z: C.z - 108, h: 38, yaw: 1.1, lean: 0.1, leanYaw: 2.9, broken: true });
  out.push({ x: C.x - 64, z: C.z - 100, h: 44, yaw: 2.4, lean: 0.12, leanYaw: 0.3, broken: true });
  for (let i = 0; i < 15; i++) {
    const a = (i / 15) * Math.PI * 2 + (rand() - 0.5) * 0.3;
    const r = 96 + rand() * 40;
    const x = C.x + Math.cos(a) * r;
    const z = C.z + Math.sin(a) * r;
    if (swordKeepOut(x, z, 80)) continue;
    if (out.some((g) => Math.hypot(g.x - x, g.z - z) < 28)) continue;
    out.push({ x, z, h: 14 + rand() * 24, yaw: rand() * 6.28, lean: 0.04 + rand() * 0.16, leanYaw: rand() * 6.28, broken: rand() < 0.55 });
  }
  return out;
}

// ---------- kiếm trận ----------

/** Kiếm trận khắc sàn đài chiến: ba vòng, tám thanh kiếm tỏa ra, nét xanh nhạt (vẽ canvas, một draw call, rất nhẹ để không che vạch báo). */
function sigilTexture(): THREE.CanvasTexture {
  const N = 1024;
  const cv = document.createElement('canvas');
  cv.width = cv.height = N;
  const g = cv.getContext('2d')!;
  const h = N / 2;
  g.clearRect(0, 0, N, N);
  g.lineCap = 'round';
  const ring = (r: number, w: number, a: number) => {
    g.strokeStyle = `rgba(140,225,255,${a})`;
    g.lineWidth = w;
    g.beginPath();
    g.arc(h, h, r, 0, Math.PI * 2);
    g.stroke();
  };
  ring(h * 0.97, 5, 0.5);
  ring(h * 0.9, 2, 0.35);
  ring(h * 0.62, 3, 0.4);
  ring(h * 0.28, 2, 0.3);
  // Tám thanh kiếm tỏa ra từ vòng trong (hình thoi dài), xen tám chấm trên vòng ngoài.
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const pt = (r: number, off: number) => [h + ca * r - sa * off, h + sa * r + ca * off] as const;
    g.fillStyle = 'rgba(140,225,255,0.2)';
    g.strokeStyle = 'rgba(190,240,255,0.5)';
    g.lineWidth = 2;
    g.beginPath();
    const pts = [pt(h * 0.3, 0), pt(h * 0.42, 9), pt(h * 0.6, 0), pt(h * 0.42, -9)];
    g.moveTo(...pts[0]!);
    for (const q of pts.slice(1)) g.lineTo(...q);
    g.closePath();
    g.fill();
    g.stroke();
    const dp = pt(h * 0.76, 0);
    g.fillStyle = 'rgba(200,245,255,0.55)';
    g.beginPath();
    g.arc(dp[0], dp[1], 7, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(140,225,255,0.22)';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(...pt(h * 0.62, 0));
    g.lineTo(...pt(h * 0.9, 0));
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// ---------- lớp cảnh ----------

export class KiemTrungArt {
  readonly group = new THREE.Group();
  private readonly meshes: THREE.InstancedMesh[] = [];
  private readonly disposables: { dispose(): void }[] = [];
  private readonly pulse = uniform(1);
  private t = 0;

  constructor(opts: { reduced?: boolean } = {}) {
    this.group.name = 'kiem-trung-art';
    const small = planSmallSwords(opts.reduced ? 320 : 640, opts.reduced ? 260 : 520);
    this.addSmall(small.filter((s) => s.kind === 'whole'), plantedSword(), 'kt-swords');
    this.addSmall(small.filter((s) => s.kind === 'broken'), brokenBlade(), 'kt-blades');
    this.addGiants(planGiants());
    this.addSigil();
  }

  private addSmall(list: KtSword[], geo: THREE.BufferGeometry, name: string): void {
    const mat = createWorldMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.45 });
    const mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, list.length));
    mesh.count = list.length;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const s = new THREE.Vector3();
    const c = new THREE.Color();
    list.forEach((w, i) => {
      e.set(w.tiltX, w.yaw, w.tiltZ, 'YXZ');
      q.setFromEuler(e);
      const w3 = 0.9 + hash01(i, 3, 5501) * 0.5;
      s.set(w.h * w3, w.h, w.h * w3);
      m.compose(new THREE.Vector3(w.x, heightAt(w.x, w.z) - 0.05, w.z), q, s);
      mesh.setMatrixAt(i, m);
      // Màu theo từng thanh: sắc thép đều → rỉ đậm (nhân với màu đỉnh).
      const k = hash01(i, 9, 5501);
      c.setRGB(0.7 + k * 0.5, 0.68 + k * 0.4, 0.64 + k * 0.36);
      mesh.setColorAt(i, c);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.name = name;
    mesh.frustumCulled = false;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.group.add(mesh);
    this.meshes.push(mesh);
    this.disposables.push(geo, mat);
  }

  private addGiants(list: KtGiant[]): void {
    const whole = list.filter((g) => !g.broken);
    const broken = list.filter((g) => g.broken);
    const mat = createWorldMaterial({ vertexColors: true, roughness: 0.46, metalness: 0.5 });
    // Rãnh khí: chỉ phần `glow` phát sáng, nhịp thở chậm; vào bloom.
    mat.emissiveNode = attribute('glow', 'float').mul(vec3(0.2, 0.55, 0.85)).mul(this.pulse).mul(float(0.85));
    this.disposables.push(mat);
    for (const [geo, items] of [
      [giantSword(false), whole],
      [giantSword(true), broken],
    ] as const) {
      const mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, items.length));
      mesh.count = items.length;
      const m = new THREE.Matrix4();
      const q = new THREE.Quaternion();
      const e = new THREE.Euler();
      items.forEach((g, i) => {
        // Nghiêng theo hướng `leanYaw`: quay yaw → nghiêng quanh trục ngang.
        e.set(0, g.leanYaw, 0, 'YXZ');
        q.setFromEuler(e);
        const lean = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), g.lean);
        const spin = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), g.yaw);
        q.multiply(lean).multiply(spin);
        // Mặt thanh kiếm quay: hình học rộng theo x, mỏng theo z, cao 1 → nhân h.
        m.compose(new THREE.Vector3(g.x, heightAt(g.x, g.z) - 1.5, g.z), q, new THREE.Vector3(g.h, g.h, g.h));
        mesh.setMatrixAt(i, m);
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.name = 'kt-giants';
      mesh.frustumCulled = false;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.group.add(mesh);
      this.meshes.push(mesh);
      this.disposables.push(geo);
    }
  }

  private addSigil(): void {
    const tex = sigilTexture();
    const R = 66;
    const geo = new THREE.RingGeometry(0.01, R, 96, 36).rotateX(-Math.PI / 2);
    const p = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) p.setY(i, heightAt(C.x + p.getX(i), C.z + p.getZ(i)) + 0.09);
    const uv = geo.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, 0.5 + p.getX(i) / (2 * R), 0.5 + p.getZ(i) / (2 * R));
    geo.computeBoundingSphere();
    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      opacity: 0.16,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(C.x, 0, C.z);
    mesh.name = 'kt-sigil';
    mesh.frustumCulled = false;
    mesh.renderOrder = 1;
    this.group.add(mesh);
    this.disposables.push(geo, mat, tex);
  }

  update(dt: number): void {
    this.t += dt;
    this.pulse.value = 1.05 + 0.35 * Math.sin(this.t * 0.9);
  }

  dispose(): void {
    for (const m of this.meshes) m.dispose();
    for (const d of this.disposables) d.dispose();
    this.meshes.length = 0;
    this.disposables.length = 0;
  }
}
