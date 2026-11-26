import * as THREE from 'three/webgpu';
import { clamp, float, instanceIndex, mix, normalView, positionLocal, smoothstep, texture, time, uv, vec2, vec3 } from 'three/tsl';
import { fbm, hash01, type TerrainDef } from '@dtl/shared';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { createWorldMaterial } from '../../render/materials/world';
import { paintedProp } from '../../render/painted/props';
import { beaconParams } from '../../render/atmosphere';
import { getCloudNoise } from '../../render/noiseTex';

/**
 * Điểm nhấn Vân Hải (MAP-3), chỉ để nhìn, không va chạm, không mạng:
 *  - thuyền tiên buồm lửa lượn quanh các đảo (2 draw call cho mọi thuyền: thân + buồm, `InstancedMesh`),
 *  - cá kình băng mây khổng lồ bơi ngang trời, trên cao hơn mọi đảo (thân mây bán trong suốt, uốn đuôi trong shader; hai con: mẹ và con),
 *  - cầu vòng linh khí dựng đứng nối mép đảo thật với mõm đá (một mesh cộng sáng, dải bạc–lam chạy dọc),
 *  - vọng nguyệt lâu trên mõm đá nhô khỏi biển mây (không đặt trên đảo giả: đảo giả là bẫy) (một mesh đá, một đèn, một chùm tia xoay).
 * Vị trí suy từ `TerrainDef` (đảo thật) và danh sách mõm đá; không đụng đảo giả; hàm tư thế là hàm thuần của thời gian.
 */

// ---------- hàm thuần (có test) ----------

interface Pose {
  x: number;
  y: number;
  z: number;
  /** Hướng mũi (rad quanh trục y, 0 = +z). */
  yaw: number;
  roll: number;
  pitch: number;
}

interface ShipPlan {
  cx: number;
  cz: number;
  a: number;
  b: number;
  /** Rad/s (âm = ngược chiều kim đồng hồ). */
  w: number;
  phase: number;
  y: number;
  scale: number;
}

/** Năm thuyền tiên, mỗi thuyền lượn quanh một đảo (sát đảo, cao hơn mặt đảo ≥ 30 m để không cắm vào cây/đỉnh). */
export const SHIPS: ShipPlan[] = [
  { cx: 1024, cz: 1024, a: 175, b: 150, w: 0.05, phase: 0.2, y: 178, scale: 2.4 },
  { cx: 1420, cz: 1132, a: 250, b: 215, w: -0.04, phase: 2.4, y: 182, scale: 2.7 },
  { cx: 664, cz: 1192, a: 255, b: 225, w: 0.037, phase: 4.1, y: 177, scale: 2.5 },
  { cx: 1552, cz: 604, a: 245, b: 225, w: -0.036, phase: 1.1, y: 186, scale: 2.6 },
  { cx: 568, cz: 568, a: 250, b: 230, w: 0.04, phase: 5.2, y: 180, scale: 2.4 },
];

export function shipPose(p: ShipPlan, t: number): Pose {
  const f = p.phase + p.w * t;
  const x = p.cx + p.a * Math.cos(f);
  const z = p.cz + p.b * Math.sin(f);
  // đạo hàm theo f → hướng đi (đổi dấu khi quay ngược)
  const dx = -p.a * Math.sin(f) * Math.sign(p.w);
  const dz = p.b * Math.cos(f) * Math.sign(p.w);
  const bob = Math.sin(t * 0.55 + p.phase * 3);
  return {
    x,
    y: p.y + 5 * Math.sin(t * 0.12 + p.phase) + bob * 0.9,
    z,
    yaw: Math.atan2(dx, dz),
    roll: bob * 0.05,
    pitch: Math.sin(t * 0.4 + p.phase) * 0.025,
  };
}

interface WhalePlan {
  cx: number;
  cz: number;
  r: number;
  y: number;
  /** Rad/s. */
  w: number;
  phase: number;
  length: number;
}

/** Cá mẹ (420 m) bơi vòng lớn trên cao, bụng luôn cao hơn đỉnh cột buồm của mọi thuyền (test `vanHaiWow.test.ts`); cá con (150 m) theo sau, lệch vào trong. Một vòng ~29 phút. */
export const WHALES: WhalePlan[] = [
  { cx: 1024, cz: 1024, r: 700, y: 345, w: 0.0036, phase: 0.8, length: 420 },
  { cx: 1024, cz: 1024, r: 640, y: 305, w: 0.0036, phase: 0.8 - 0.2, length: 150 },
];

export function whalePose(p: WhalePlan, t: number): Pose {
  const f = p.phase + p.w * t;
  const x = p.cx + p.r * Math.cos(f);
  const z = p.cz + p.r * Math.sin(f);
  // bơi theo chiều tăng f: tiếp tuyến (-sin, cos)
  const yaw = Math.atan2(-Math.sin(f), Math.cos(f));
  return {
    x,
    y: p.y + 14 * Math.sin(t * 0.09 + p.phase * 2),
    z,
    yaw,
    roll: 0.06 * Math.sin(t * 0.17),
    pitch: 0.07 * Math.cos(t * 0.09 + p.phase * 2),
  };
}

/** Điểm quanh một đảo thật theo hướng tới (tx, tz), lùi `inset` vào trong mép. */
function rimToward(isl: { x: number; z: number; r: number }, tx: number, tz: number, inset: number): [number, number] {
  const dx = tx - isl.x;
  const dz = tz - isl.z;
  const d = Math.hypot(dx, dz) || 1;
  return [isl.x + (dx / d) * (isl.r - inset), isl.z + (dz / d) * (isl.r - inset)];
}

interface Arc {
  ax: number;
  ay: number;
  az: number;
  bx: number;
  by: number;
  bz: number;
  /** Độ cao đỉnh vòm so với đường thẳng nối hai đầu (m). */
  rise: number;
}

/**
 * Cầu vòng linh khí: vòm sáng dựng đứng (không có mặt ngang, không giống lối đi) từ mép đảo thật gần nhất tới đỉnh từng mõm đá.
 * Không bao giờ chạm đảo giả (đảo giả là bẫy, chỉ thần thức mới lộ). Đầu ở đảo thật cách tâm đảo `r - 6`.
 */
export function rainbowArcs(def: TerrainDef): Arc[] {
  const real = (def.islands ?? []).map((i) => ({ x: i.x, z: i.z, r: i.r, y: i.y }));
  const arcs: Arc[] = [];
  for (const s of STACKS) {
    let best = real[0];
    let bd = Infinity;
    for (const r of real) {
      const d = Math.hypot(r.x - s.x, r.z - s.z) - r.r;
      if (d < bd) {
        bd = d;
        best = r;
      }
    }
    if (!best) continue;
    const [ax, az] = rimToward(best, s.x, s.z, 6);
    arcs.push({ ax, ay: best.y + 1.5, az, bx: s.x, by: s.top + 6, bz: s.z, rise: 60 + bd * 0.14 });
  }
  return arcs;
}

interface Tower {
  x: number;
  y: number;
  z: number;
  /** Chiều cao thân (m). */
  h: number;
  /** Có đá nhô (mõm đá) dưới chân hay đứng thẳng trên đảo giả. */
  stack: boolean;
}

/** Mõm đá nhô khỏi biển mây: cách mọi đảo thật > 150 m và cách mép bản đồ ≥ 260 m (vách mép cao 210 m, dốc xuống sàn mây trong ~200 m). */
export const STACKS: { x: number; z: number; top: number }[] = [
  { x: 300, z: 300, top: 168 },
  { x: 1790, z: 300, top: 176 },
  { x: 1760, z: 1560, top: 160 },
  { x: 300, z: 1790, top: 172 },
  { x: 1030, z: 330, top: 180 },
  { x: 1560, z: 1790, top: 176 },
  // hai mõm đá gần giữa bản đồ (nhìn thấy từ Phù Đảo Các), vẫn cách mọi đảo thật > 150 m
  { x: 1000, z: 560, top: 176 },
  { x: 420, z: 920, top: 172 },
];

export function towersOf(def: TerrainDef): Tower[] {
  // Chỉ đặt trên mõm đá (không đặt trên đảo giả: đảo giả là bẫy, tháp đứng đó sẽ lộ ra và không mờ theo thần thức).
  void def;
  return STACKS.map((s) => ({ x: s.x, y: s.top, z: s.z, h: 30, stack: true }));
}

// ---------- dựng lưới ----------

const C = (hex: number) => new THREE.Color(hex);

function paint(g: THREE.BufferGeometry, pick: (x: number, y: number, z: number) => THREE.Color): THREE.BufferGeometry {
  const pos = g.getAttribute('position');
  const col: number[] = [];
  for (let i = 0; i < pos.count; i++) {
    const c = pick(pos.getX(i), pos.getY(i), pos.getZ(i));
    col.push(c.r, c.g, c.b);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}

/** Gộp các lưới (bỏ uv/normal khác nhau) về một lưới có position, normal, color. */
function mergeColored(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const clean = parts.map((p) => {
    const g = p.index ? p.toNonIndexed() : p;
    g.deleteAttribute('uv');
    return g;
  });
  const m = mergeGeometries(clean, false);
  for (const p of parts) p.dispose();
  return m;
}

/** Dựng ống/khối theo mặt cắt: `rings[i]` là chuỗi điểm (x, y) quanh trục tại cao độ/chiều dài z[i]; nối kín các vòng cạnh nhau. */
function loft(zs: number[], rings: [number, number][][], closeEnds: boolean): THREE.BufferGeometry {
  const pos: number[] = [];
  const idx: number[] = [];
  const k = rings[0]!.length;
  for (let i = 0; i < zs.length; i++) for (const [x, y] of rings[i]!) pos.push(x, y, zs[i]!);
  for (let i = 0; i < zs.length - 1; i++) {
    for (let j = 0; j < k - 1; j++) {
      const a = i * k + j;
      const b = a + 1;
      const c = a + k;
      const d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  if (closeEnds) {
    for (const end of [0, zs.length - 1]) {
      const c = pos.length / 3;
      let sx = 0;
      let sy = 0;
      for (const [x, y] of rings[end]!) {
        sx += x;
        sy += y;
      }
      pos.push(sx / k, sy / k, zs[end]!);
      for (let j = 0; j < k - 1; j++) {
        const a = end * k + j;
        if (end === 0) idx.push(c, a + 1, a);
        else idx.push(c, a, a + 1);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// --- thuyền tiên: thân cong đầu rồng, lầu ba tầng mái cong, buồm cánh đôi phát sáng, đèn lồng (mũi +z, dài ~14 trước khi nhân tỉ lệ) ---

const HULL_L = 14;
const GOLD = 0xd8c48a;
const SILVER = 0xdde7f0;
const GLAZE = 0x2a6bb4;
const LACQ = 0x1b3a68;
const WHITE = 0xeef3f8;

/** Mái đình cong: tám cạnh, lõm ở giữa rồi hất đầu đao ở mép. `r` bán kính mép, `h` cao. Đáy y = 0. */
function pagodaRoof(r: number, h: number, sides = 8): THREE.BufferGeometry {
  const prof = [
    new THREE.Vector2(0.01, h),
    new THREE.Vector2(r * 0.22, h * 0.84),
    new THREE.Vector2(r * 0.5, h * 0.48),
    new THREE.Vector2(r * 0.8, h * 0.17),
    new THREE.Vector2(r * 1.0, h * 0.06),
    new THREE.Vector2(r * 1.14, h * 0.4),
    new THREE.Vector2(r * 1.08, h * 0.02),
    new THREE.Vector2(r * 0.7, 0),
    new THREE.Vector2(0.01, 0),
  ];
  const g = new THREE.LatheGeometry(prof, sides);
  paint(g, (x, y, z) => (Math.hypot(x, z) > r * 0.97 || y < h * 0.03 ? C(SILVER) : y > h * 0.9 ? C(GOLD) : C(GLAZE)));
  return g.toNonIndexed();
}

function railY(z: number): number {
  const t = z / HULL_L;
  return 0.5 + 2.6 * Math.pow(Math.max(0, 2 * t), 2.2) + 1.9 * Math.pow(Math.max(0, -2 * t), 2.2);
}

function shipHull(): { hull: THREE.BufferGeometry; lanterns: THREE.BufferGeometry } {
  const N = 26;
  const K = 13;
  const zs: number[] = [];
  const rings: [number, number][][] = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const z = (t - 0.5) * HULL_L;
    const hw = 2.3 * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.8)), 0.6) + 0.02;
    // mũi và đuôi hất cao như thuyền rồng
    const deckY = railY(z);
    const depth = 1.9 * Math.pow(Math.sin(Math.PI * Math.min(1, t * 0.96 + 0.03)), 0.7);
    const ring: [number, number][] = [];
    for (let j = 0; j < K; j++) {
      const th = -Math.PI / 2 + (j / (K - 1)) * Math.PI;
      ring.push([Math.sin(th) * hw, deckY - depth * Math.cos(th) * (0.25 + 0.75 * Math.cos(th * 0.5) ** 0.5)]);
    }
    rings.push(ring);
    zs.push(z);
  }
  const body = loft(zs, rings, true);
  paint(body, (_x, y, z) => {
    const rail = railY(z);
    if (y > rail - 0.16) return C(GOLD);
    if (y > rail - 0.9) return C(SILVER);
    return y > -0.2 ? C(0x2c5a96) : C(LACQ);
  });
  const parts: THREE.BufferGeometry[] = [body];
  const lan: THREE.BufferGeometry[] = [];
  const deck = new THREE.BoxGeometry(3.3, 0.12, 10.6);
  deck.translate(0, 0.54, -0.3);
  parts.push(paint(deck, () => C(0xd9c9a6)));
  // lầu ba tầng: thân tám cạnh trắng, cột lam, mái cong; đèn lồng treo ở đầu đao
  const tiers: [number, number, number, number][] = [
    [0.55, 1.6, 2.3, 1.15],
    [2.55, 1.35, 1.75, 0.95],
    [4.3, 1.1, 1.2, 0.8],
  ];
  const cz = -1.6;
  for (const [y0, bh, br, rh] of tiers) {
    const bodyG = new THREE.CylinderGeometry(br, br * 1.04, bh, 8, 1);
    bodyG.rotateY(Math.PI / 8);
    bodyG.translate(0, y0 + bh / 2, cz);
    parts.push(paint(bodyG, () => C(WHITE)));
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2 + Math.PI / 8;
      const pil = new THREE.CylinderGeometry(0.1, 0.1, bh, 6);
      pil.translate(Math.cos(a) * br * 1.02, y0 + bh / 2, cz + Math.sin(a) * br * 1.02);
      parts.push(paint(pil, () => C(0x2d5da0)));
    }
    const roof = pagodaRoof(br * 1.55, rh);
    roof.translate(0, y0 + bh, cz);
    parts.push(roof);
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2 + Math.PI / 8;
      const s = new THREE.SphereGeometry(0.2, 6, 5);
      s.translate(Math.cos(a) * br * 1.55 * 1.12, y0 + bh - 0.35, cz + Math.sin(a) * br * 1.55 * 1.12);
      lan.push(s);
    }
  }
  const fin = new THREE.ConeGeometry(0.16, 1.5, 6);
  fin.translate(0, 4.3 + 1.1 + 0.8 + 0.5, cz);
  parts.push(paint(fin, () => C(GOLD)));
  // cột buồm ở mũi + cổ rồng cong và đầu rồng
  const mast = new THREE.CylinderGeometry(0.1, 0.17, 11.5, 8);
  mast.translate(0, 6.2, 3.1);
  parts.push(paint(mast, () => C(SILVER)));
  const neck = new THREE.TubeGeometry(
    new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 2.2, 6.6),
      new THREE.Vector3(0, 3.4, 7.7),
      new THREE.Vector3(0, 5.0, 8.1),
      new THREE.Vector3(0, 6.1, 7.4),
      new THREE.Vector3(0, 6.3, 6.5),
    ]),
    16,
    0.3,
    8,
  );
  parts.push(paint(neck, (_x, y) => (y > 5 ? C(GOLD) : C(SILVER))));
  const head = new THREE.ConeGeometry(0.42, 1.5, 8);
  head.rotateX(-Math.PI / 2.6);
  head.translate(0, 6.0, 6.0);
  parts.push(paint(head, () => C(GOLD)));
  for (const s of [-1, 1]) {
    const horn = new THREE.ConeGeometry(0.1, 1.5, 5);
    horn.rotateX(-Math.PI / 3);
    horn.rotateZ(s * 0.35);
    horn.translate(s * 0.35, 6.8, 6.3);
    parts.push(paint(horn, () => C(SILVER)));
    // đèn lồng treo dọc mạn thuyền
    for (let k = 0; k < 5; k++) {
      const z = -4.2 + k * 2.3;
      const l = new THREE.SphereGeometry(0.22, 6, 5);
      l.translate(s * 2.2 * Math.pow(Math.sin(Math.PI * Math.pow(z / HULL_L + 0.5, 0.8)), 0.6), railY(z) - 0.15, z);
      lan.push(l);
    }
  }
  const lanterns = mergeColored(lan.map((g) => paint(g, () => C(0xffffff))));
  return { hull: mergeColored(parts), lanterns };
}

/** Hai cặp cánh buồm phát sáng như cánh phượng: quạt xòe ra hai bên và lên cao. uv.x ngang quạt, uv.y từ gốc (0) tới mút (1). */
function shipSails(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (const [side, px, py, pz, len, a0, a1] of [
    [-1, 0, 3.2, 3.1, 9.2, -0.1, 1.15],
    [1, 0, 3.2, 3.1, 9.2, -0.1, 1.15],
    [-1, 0, 2.4, -3.6, 5.2, 0.05, 1.0],
    [1, 0, 2.4, -3.6, 5.2, 0.05, 1.0],
  ] as const) {
    const U = 8;
    const V = 14;
    const pos: number[] = [];
    const uvs: number[] = [];
    const idx: number[] = [];
    for (let j = 0; j <= V; j++) {
      const v = j / V;
      const a = a0 + (a1 - a0) * v;
      // mép ngoài lượn sóng (răng cưa mềm kiểu cánh)
      const tipLen = len * (0.82 + 0.18 * Math.abs(Math.cos(v * Math.PI * 3.5)));
      for (let i = 0; i <= U; i++) {
        const u = i / U;
        const r = u * tipLen;
        pos.push(px + side * Math.cos(a) * r * 0.78, py + Math.sin(a) * r, pz - 0.9 * Math.sin(Math.PI * u) * Math.sin(Math.PI * v));
        uvs.push(v, u);
      }
    }
    for (let j = 0; j < V; j++)
      for (let i = 0; i < U; i++) {
        const a = j * (U + 1) + i;
        idx.push(a, a + 1, a + U + 1, a + 1, a + U + 2, a + U + 1);
      }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    g.setIndex(idx);
    parts.push(g);
  }
  return mergeGeometries(parts, false);
}

function sailMaterial(): THREE.MeshBasicNodeMaterial {
  const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide });
  const noise = getCloudNoise();
  const u = uv();
  const flame = texture(noise, vec2(u.x.mul(1.4), u.y.mul(1.6).sub(time.mul(0.25)))).g;
  const ribs = u.x.mul(14).sin().mul(0.5).add(0.5).pow(3).mul(0.35);
  const edge = smoothstep(0.0, 0.08, u.x).mul(smoothstep(0.0, 0.08, u.x.oneMinus()));
  const tip = smoothstep(0.0, 0.25, u.y.oneMinus().add(flame.sub(0.5).mul(0.6)));
  // gốc vàng lửa → mút lam bạc; gân cánh sáng hơn
  const col = mix(vec3(1.9, 1.15, 0.45), vec3(0.55, 1.15, 1.9), u.y.pow(1.1)).mul(float(0.8).add(flame.mul(0.4)).add(ribs));
  mat.colorNode = col;
  mat.opacityNode = clamp(edge.mul(tip).mul(float(0.5).add(flame.mul(0.4)).add(ribs)), 0, 0.9);
  return mat;
}

// --- cá kình băng mây (mũi +z, thân dài 1 đơn vị = `length`) ---

function whaleGeometry(): THREE.BufferGeometry {
  const N = 64;
  const K = 22;
  const zs: number[] = [];
  const rings: [number, number][][] = [];
  const R = 0.105;
  for (let i = 0; i <= N; i++) {
    const t = i / N; // 0 đầu → 1 đuôi
    let r: number;
    if (t < 0.22) r = R * Math.pow(Math.sin((t / 0.22) * Math.PI * 0.5), 0.42);
    else if (t < 0.5) r = R * (1 - 0.1 * ((t - 0.22) / 0.28));
    else r = R * 0.9 * Math.pow(1 - (t - 0.5) / 0.5, 1.35) + 0.01;
    const ring: [number, number][] = [];
    for (let j = 0; j < K; j++) {
      const a = (j / (K - 1)) * Math.PI * 2;
      const belly = Math.sin(a) < 0 ? 1.12 : 0.92;
      ring.push([Math.cos(a) * r * 1.05, Math.sin(a) * r * 0.82 * belly]);
    }
    rings.push(ring);
    zs.push(0.5 - t);
  }
  const body = loft(zs, rings, true);
  const parts: THREE.BufferGeometry[] = [body];
  // vây đuôi nằm ngang hai thùy rộng
  const fl = new THREE.Shape();
  fl.moveTo(0, 0.03);
  fl.bezierCurveTo(0.08, 0.03, 0.2, 0.0, 0.27, -0.1);
  fl.bezierCurveTo(0.19, -0.03, 0.09, -0.08, 0, -0.06);
  fl.bezierCurveTo(-0.09, -0.08, -0.19, -0.03, -0.27, -0.1);
  fl.bezierCurveTo(-0.2, 0.0, -0.08, 0.03, 0, 0.03);
  const fluke = new THREE.ShapeGeometry(fl, 12);
  fluke.rotateX(Math.PI / 2);
  fluke.translate(0, 0, -0.5 + 0.03);
  parts.push(fluke);
  // vây lưng
  const dor = new THREE.Shape();
  dor.moveTo(0, 0);
  dor.quadraticCurveTo(0.012, 0.06, 0.07, 0.085);
  dor.quadraticCurveTo(0.02, 0.04, 0.045, 0);
  const dorsal = new THREE.ShapeGeometry(dor, 8);
  dorsal.rotateY(Math.PI / 2);
  dorsal.translate(0, R * 0.7, -0.12);
  parts.push(dorsal);
  // hai vây ngực dài
  for (const s of [-1, 1]) {
    const fin = new THREE.SphereGeometry(1, 12, 8);
    fin.scale(0.012, 0.045, 0.17);
    fin.rotateZ(s * 0.95);
    fin.rotateY(s * 0.35);
    fin.translate(s * 0.115, -0.075, 0.27);
    parts.push(fin);
  }
  const m = mergeColored(parts);
  m.computeVertexNormals();
  return m;
}

function whaleMaterial(): THREE.MeshBasicNodeMaterial {
  const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide });
  const noise = getCloudNoise();
  const p = positionLocal;
  // uốn thân: biên độ tăng về đuôi (z âm), sóng chạy từ đầu về đuôi
  const tail = smoothstep(0.15, -0.5, p.z);
  const wave = p.z.mul(11).add(time.mul(1.1)).sin().mul(tail).mul(0.05);
  mat.positionNode = vec3(p.x.add(wave.mul(0.25)), p.y.add(wave), p.z);
  const belly = smoothstep(0.5, -0.9, p.y.mul(9));
  const swirl = texture(noise, vec2(p.x.mul(6).add(p.z.mul(3.4)).add(time.mul(0.02)), p.y.mul(6).add(p.z.mul(2.2)))).a;
  const fres = float(1).sub(normalView.z.abs());
  // nếp bụng (sọc dọc) và mạch linh quang chạy dọc thân
  const pleats = p.x
    .mul(190)
    .sin()
    .mul(0.5)
    .add(0.5)
    .mul(belly)
    .mul(smoothstep(0.34, 0.12, p.z.abs()))
    .mul(0.12);
  const veins = p.z.mul(70).sub(time.mul(0.8)).add(p.y.mul(40)).sin().abs().oneMinus().pow(14).mul(0.9);
  const base = mix(vec3(0.16, 0.38, 0.7), vec3(0.85, 0.94, 1.0), belly.mul(0.8).add(swirl.mul(0.25)));
  mat.colorNode = base
    .add(vec3(0.5, 0.7, 0.9).mul(fres.pow(2.0)).mul(0.9))
    .sub(vec3(pleats))
    .add(vec3(0.5, 1.1, 1.6).mul(veins));
  mat.opacityNode = clamp(float(0.42).add(swirl.mul(0.3)).add(fres.pow(1.6).mul(0.45)).add(veins.mul(0.3)), 0, 0.9);
  return mat;
}

/** Bụi linh quang lấp lánh quanh thân cá (con của lưới cá, nên theo tỉ lệ thân dài 1). */
function whaleDust(count: number): THREE.InstancedMesh {
  const g = new THREE.TetrahedronGeometry(0.0034, 0);
  const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const tw = time.mul(1.7).add(instanceIndex.toFloat().mul(2.37)).sin().mul(0.5).add(0.5).pow(2);
  mat.colorNode = vec3(1.3, 1.7, 2.2);
  mat.opacityNode = tw.mul(0.9);
  const m = new THREE.InstancedMesh(g, mat, count);
  const mtx = new THREE.Matrix4();
  for (let i = 0; i < count; i++) {
    const t = hash01(i, 3, 901);
    const z = 0.52 - t * 1.25; // dài hơn thân: vệt bụi kéo ra sau đuôi
    const a = hash01(i, 5, 903) * Math.PI * 2;
    const rr = (0.05 + 0.13 * hash01(i, 7, 905)) * (t < 0.8 ? 1 : 1.6);
    mtx.makeTranslation(Math.cos(a) * rr, Math.sin(a) * rr * 0.8, z);
    m.setMatrixAt(i, mtx);
  }
  m.frustumCulled = false;
  return m;
}

// --- cầu vòng linh khí ---

function rainbowGeometry(arcs: Arc[]): THREE.BufferGeometry {
  const pos: number[] = [];
  const uvs: number[] = [];
  const idx: number[] = [];
  const SEG = 48;
  for (const a of arcs) {
    const len = Math.hypot(a.bx - a.ax, a.bz - a.az) || 1;
    const sx = -(a.bz - a.az) / len; // ngang
    const sz = (a.bx - a.ax) / len;
    for (const mode of [1]) {
      // chỉ dải đứng (không có mặt ngang để không trông như cầu đi được)
      const base = pos.length / 3;
      for (let i = 0; i <= SEG; i++) {
        const t = i / SEG;
        const x = a.ax + (a.bx - a.ax) * t;
        const z = a.az + (a.bz - a.az) * t;
        const y = a.ay + (a.by - a.ay) * t + a.rise * Math.sin(Math.PI * t);
        const taper = 0.35 + 0.65 * Math.sin(Math.PI * t) ** 0.5;
        const w = 2.6 * taper;
        if (mode === 0) {
          pos.push(x - sx * w, y, z - sz * w, x + sx * w, y, z + sz * w);
        } else {
          pos.push(x, y - w, z, x, y + w, z);
        }
        uvs.push(t * len * 0.05, 0, t * len * 0.05, 1);
        if (i < SEG) {
          const k = base + i * 2;
          idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
        }
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  return g;
}

function rainbowMaterial(): THREE.MeshBasicNodeMaterial {
  const mat = new THREE.MeshBasicNodeMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });
  const u = uv();
  const across = float(1).sub(u.y.sub(0.5).abs().mul(2)).pow(0.9);
  const flow = u.x.sub(time.mul(0.5)).mul(0.9).sin().mul(0.5).add(0.5);
  const spark = u.x.mul(2.3).sub(time.mul(1.3)).sin().mul(0.5).add(0.5).pow(6);
  // dải bạc ở lõi, lam ở rìa
  const col = mix(vec3(0.2, 0.55, 1.0), vec3(0.85, 0.95, 1.0), across.pow(2));
  mat.colorNode = col.mul(float(0.5).add(flow.mul(0.5)).add(spark.mul(0.8)));
  mat.opacityNode = across.mul(float(0.16).add(flow.mul(0.12)).add(spark.mul(0.25)));
  return mat;
}

// --- đá nhô, hải đăng / tháp canh ---

function spireGeometry(s: { x: number; z: number; top: number }, seed: number): THREE.BufferGeometry {
  const rings = 14;
  const sides = 18;
  const baseY = 40;
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const cTop = C(0x9fb4c8);
  const cMid = C(0x62799a);
  const cLow = C(0x3a4d6c);
  const cMoss = C(0x6a9c8c);
  for (let i = 0; i <= rings; i++) {
    const t = i / rings;
    const y = baseY + (s.top - baseY) * t;
    // thân thon, phình ở chân, đỉnh bằng để đặt tháp
    const rad = 7 + 30 * Math.pow(1 - t, 1.5) + 4 * Math.sin(t * 9 + seed) * (1 - t);
    for (let j = 0; j < sides; j++) {
      const a = (j / sides) * Math.PI * 2;
      const n = 0.7 + 0.6 * fbm(Math.cos(a) * 2 + s.x * 0.01, Math.sin(a) * 2 + y * 0.05, 3, seed);
      const r = rad * n;
      pos.push(s.x + Math.cos(a) * r, y, s.z + Math.sin(a) * r);
      const strata = 0.9 + 0.1 * Math.sin(y * 0.9 + a * 2);
      const c = t < 0.4 ? cLow.clone().lerp(cMid, t / 0.4) : cMid.clone().lerp(cTop, (t - 0.4) / 0.6);
      if (t > 0.9 && hash01(j, i, seed) > 0.45) c.lerp(cMoss, 0.5);
      col.push(c.r * strata, c.g * strata, c.b * strata);
    }
  }
  for (let i = 0; i < rings; i++) {
    for (let j = 0; j < sides; j++) {
      const a = i * sides + j;
      const b = i * sides + ((j + 1) % sides);
      idx.push(a, a + sides, b, b, a + sides, b + sides);
    }
  }
  // nắp đỉnh
  const topC = pos.length / 3;
  pos.push(s.x, s.top + 0.2, s.z);
  col.push(cTop.r, cTop.g, cTop.b);
  for (let j = 0; j < sides; j++) idx.push(topC, rings * sides + ((j + 1) % sides), rings * sides + j);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Vọng nguyệt lâu: đài tám cạnh ba bậc, năm tầng thu nhỏ dần, mỗi tầng mái cong đầu đao; đèn linh quang đặt trên đỉnh (`lamp`). */
function towerGeometry(t: Tower): { stone: THREE.BufferGeometry; lamp: THREE.Vector3 } {
  const parts: THREE.BufferGeometry[] = [];
  let y = 0;
  for (const [r, h] of [
    [7.2, 0.9],
    [6.2, 0.9],
    [5.2, 0.9],
  ] as const) {
    const g = new THREE.CylinderGeometry(r, r * 1.05, h, 8);
    g.rotateY(Math.PI / 8);
    g.translate(0, y + h / 2, 0);
    parts.push(paint(g, () => C(SILVER)));
    y += h;
  }
  const tiers = 5;
  const th = (t.h - y - 3) / tiers;
  for (let i = 0; i < tiers; i++) {
    const R = 3.6 * (1 - i * 0.12);
    const bh = th * 0.62;
    const body = new THREE.CylinderGeometry(R, R * 1.03, bh, 8);
    body.rotateY(Math.PI / 8);
    body.translate(0, y + bh / 2, 0);
    parts.push(paint(body, () => C(WHITE)));
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2 + Math.PI / 8;
      const pil = new THREE.CylinderGeometry(0.18, 0.18, bh, 6);
      pil.translate(Math.cos(a) * R * 1.02, y + bh / 2, Math.sin(a) * R * 1.02);
      parts.push(paint(pil, () => C(0x2d5da0)));
    }
    const roof = pagodaRoof(R * 1.6, th * 0.5);
    roof.translate(0, y + bh, 0);
    parts.push(roof);
    y += th;
  }
  // đỉnh: đài đèn tám cạnh + nón vàng
  const cage = new THREE.CylinderGeometry(1.5, 1.8, 2.2, 8, 1, true);
  cage.translate(0, y + 1.1, 0);
  parts.push(paint(cage, () => C(SILVER)));
  const cap = pagodaRoof(2.8, 1.8);
  cap.translate(0, y + 2.2, 0);
  parts.push(cap);
  const fin = new THREE.ConeGeometry(0.22, 2.4, 6);
  fin.translate(0, y + 4.2 + 1.0, 0);
  parts.push(paint(fin, () => C(GOLD)));
  const stone = mergeColored(parts);
  stone.translate(t.x, t.y, t.z);
  return { stone, lamp: new THREE.Vector3(t.x, t.y + y + 1.1, t.z) };
}

function beamGeometry(): THREE.BufferGeometry {
  // hai chùm đối nhau theo ±x, mỗi chùm: dải ngang + dải đứng, loe dần; u dọc chùm (0 gốc → 1 đầu), v ngang
  const pos: number[] = [];
  const uvs: number[] = [];
  const idx: number[] = [];
  const L = 150;
  for (const dir of [-1, 1]) {
    for (const mode of [0, 1]) {
      const base = pos.length / 3;
      for (let i = 0; i <= 6; i++) {
        const u = i / 6;
        const x = dir * L * u;
        const w = 0.8 + 8 * u;
        if (mode === 0) pos.push(x, 0, -w, x, 0, w);
        else pos.push(x, -w, 0, x, w, 0);
        uvs.push(u, 0, u, 1);
        if (i < 6) {
          const k = base + i * 2;
          idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
        }
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  return g;
}

function beamMaterial(): THREE.MeshBasicNodeMaterial {
  const mat = new THREE.MeshBasicNodeMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });
  const u = uv();
  const across = float(1).sub(u.y.sub(0.5).abs().mul(2)).pow(1.4);
  const along = smoothstep(0.0, 0.08, u.x).mul(float(1).sub(u.x).pow(1.3));
  mat.colorNode = vec3(0.7, 0.88, 1.0).mul(float(0.7).add(beaconParams.intensity.mul(1.4)));
  mat.opacityNode = across.mul(along).mul(beaconParams.intensity.mul(0.5).add(0.05));
  return mat;
}

// ---------- cảnh ----------

export class VanHaiWow {
  readonly group = new THREE.Group();
  private disposables: { dispose(): void }[] = [];
  private hulls: THREE.InstancedMesh;
  private sails: THREE.InstancedMesh;
  private lanterns: THREE.InstancedMesh;
  private whales: THREE.Mesh[] = [];
  private beams: THREE.InstancedMesh | null = null;
  private lamps: THREE.Vector3[] = [];
  private t = 0;
  /** Chụp ảnh: giữ đồng hồ đứng yên ở giây này (null = chạy theo thời gian). */
  private frozen: number | null = null;
  private readonly m4 = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly e = new THREE.Euler();
  private readonly p = new THREE.Vector3();
  private readonly s = new THREE.Vector3();

  constructor(def: TerrainDef) {
    this.group.name = 'vanHaiWow';
    const track = <T extends { dispose(): void }>(o: T): T => {
      this.disposables.push(o);
      return o;
    };

    // Thuyền tiên
    const parts = shipHull();
    const hullGeo = track(parts.hull);
    const hullMat = track(paintedProp(createWorldMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.15 })));
    this.hulls = new THREE.InstancedMesh(hullGeo, hullMat, SHIPS.length);
    this.hulls.name = 'van-hai-ships';
    this.hulls.castShadow = true;
    this.hulls.frustumCulled = false;
    const sailGeo = track(shipSails());
    const sailMat = track(sailMaterial());
    this.sails = new THREE.InstancedMesh(sailGeo, sailMat, SHIPS.length);
    this.sails.name = 'van-hai-sails';
    this.sails.frustumCulled = false;
    this.sails.renderOrder = 4;
    this.group.add(this.hulls, this.sails);
    const lanGeo = track(parts.lanterns);
    const lanMat = track(new THREE.MeshBasicNodeMaterial());
    lanMat.colorNode = vec3(2.0, 1.25, 0.55);
    this.lanterns = new THREE.InstancedMesh(lanGeo, lanMat, SHIPS.length);
    this.lanterns.name = 'van-hai-ship-lanterns';
    this.lanterns.frustumCulled = false;
    this.group.add(this.lanterns);

    // Cá kình băng mây
    const wg = track(whaleGeometry());
    for (const w of WHALES) {
      const m = new THREE.Mesh(wg, track(whaleMaterial()));
      m.name = 'van-hai-whale';
      m.frustumCulled = false;
      m.renderOrder = 3;
      m.scale.setScalar(w.length);
      // bụi sáng: geometry, material và buffer instance đều qua `track` để dispose khi rời level
      const dust = whaleDust(w.length > 300 ? 700 : 260);
      track(dust.geometry);
      track(dust.material as THREE.Material);
      track(dust);
      m.add(dust);
      this.whales.push(m);
      this.group.add(m);
    }

    // Cầu vòng linh khí
    const arcs = rainbowArcs(def);
    if (arcs.length) {
      const g = track(rainbowGeometry(arcs));
      const mesh = new THREE.Mesh(g, track(rainbowMaterial()));
      mesh.name = 'van-hai-rainbow';
      mesh.frustumCulled = false;
      mesh.renderOrder = 4;
      this.group.add(mesh);
    }

    // Mõm đá, hải đăng, tháp canh
    const towers = towersOf(def);
    const stones: THREE.BufferGeometry[] = [];
    STACKS.forEach((s, i) => stones.push(spireGeometry(s, 31 + i * 17).toNonIndexed()));
    for (const t of towers) {
      const { stone, lamp } = towerGeometry(t);
      stones.push(stone);
      this.lamps.push(lamp);
    }
    const stoneGeo = track(mergeGeometries(stones, false));
    for (const g of stones) g.dispose();
    const stoneMesh = new THREE.Mesh(
      stoneGeo,
      track(paintedProp(createWorldMaterial({ vertexColors: true, roughness: 0.78, metalness: 0.02 }))),
    );
    stoneMesh.name = 'van-hai-towers';
    stoneMesh.castShadow = true;
    stoneMesh.receiveShadow = true;
    stoneMesh.frustumCulled = false;
    this.group.add(stoneMesh);
    const lampGeo = track(new THREE.SphereGeometry(1.5, 10, 8));
    const lampMat = track(new THREE.MeshBasicNodeMaterial({ toneMapped: false }));
    lampMat.colorNode = vec3(1.0, 0.92, 0.72).mul(float(1.1).add(beaconParams.intensity.mul(1.2)));
    const lampMesh = new THREE.InstancedMesh(lampGeo, lampMat, this.lamps.length);
    this.lamps.forEach((l, i) => lampMesh.setMatrixAt(i, new THREE.Matrix4().makeTranslation(l.x, l.y, l.z)));
    lampMesh.instanceMatrix.needsUpdate = true;
    lampMesh.frustumCulled = false;
    lampMesh.name = 'van-hai-lamps';
    this.group.add(lampMesh);
    this.beams = new THREE.InstancedMesh(track(beamGeometry()), track(beamMaterial()), this.lamps.length);
    this.beams.frustumCulled = false;
    this.beams.renderOrder = 5;
    this.beams.name = 'van-hai-beams';
    this.group.add(this.beams);
    this.apply();
  }

  /** Chụp ảnh: đặt đồng hồ cố định (giây); `null` thả cho chạy tiếp. */
  freeze(t: number | null): void {
    this.frozen = t;
    if (t !== null) {
      this.t = t;
      this.apply();
    }
  }

  update(dt: number): void {
    if (this.frozen === null) this.t += dt;
    this.apply();
  }

  private place(mesh: THREE.Object3D | null, i: number, pose: Pose, scale: number): void {
    if (!mesh) return;
    this.e.set(pose.pitch, pose.yaw, pose.roll, 'YXZ');
    this.q.setFromEuler(this.e);
    this.p.set(pose.x, pose.y, pose.z);
    this.s.setScalar(scale);
    this.m4.compose(this.p, this.q, this.s);
    (mesh as THREE.InstancedMesh).setMatrixAt(i, this.m4);
  }

  private apply(): void {
    const t = this.t;
    SHIPS.forEach((p, i) => {
      const pose = shipPose(p, t);
      this.place(this.hulls, i, pose, p.scale);
      this.place(this.sails, i, pose, p.scale);
      this.place(this.lanterns, i, pose, p.scale);
    });
    this.lanterns.instanceMatrix.needsUpdate = true;
    this.hulls.instanceMatrix.needsUpdate = true;
    this.sails.instanceMatrix.needsUpdate = true;
    WHALES.forEach((p, i) => {
      const m = this.whales[i];
      if (!m) return;
      const pose = whalePose(p, t);
      m.position.set(pose.x, pose.y, pose.z);
      m.rotation.set(pose.pitch, pose.yaw, pose.roll, 'YXZ');
    });
    if (this.beams) {
      this.lamps.forEach((l, i) => {
        this.e.set(0, t * 0.35 + i * 1.3, 0);
        this.q.setFromEuler(this.e);
        this.s.setScalar(1);
        this.m4.compose(l, this.q, this.s);
        this.beams!.setMatrixAt(i, this.m4);
      });
      this.beams.instanceMatrix.needsUpdate = true;
    }
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
  }
}
