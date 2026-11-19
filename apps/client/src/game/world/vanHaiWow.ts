import * as THREE from 'three/webgpu';
import { clamp, float, mix, normalView, positionLocal, smoothstep, texture, time, uv, vec2, vec3 } from 'three/tsl';
import { fbm, hash01, type TerrainDef } from '@dtl/shared';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { createWorldMaterial } from '../../render/materials/world';
import { beaconParams } from '../../render/atmosphere';
import { getCloudNoise } from '../../render/noiseTex';

/**
 * Điểm nhấn Vân Hải (MAP-3), chỉ để nhìn, không va chạm, không mạng:
 *  - thuyền tiên buồm lửa lượn quanh các đảo (2 draw call cho mọi thuyền: thân + buồm, `InstancedMesh`),
 *  - cá kình băng mây khổng lồ bơi ngang trời, trên cao hơn mọi đảo (thân mây bán trong suốt, uốn đuôi trong shader; hai con: mẹ và con),
 *  - cầu vòng linh khí nối Phù Đảo Các với các đảo giả (một mesh cộng sáng, dải bạc–lam chạy dọc),
 *  - hải đăng trên đảo giả và tháp canh trên mõm đá nhô khỏi biển mây (một mesh đá, một đèn, một chùm tia xoay).
 * Mọi vị trí suy từ `TerrainDef` (đảo thật, đảo giả) nên không cần dữ liệu riêng; hàm tư thế là hàm thuần của thời gian.
 */

// ---------- hàm thuần (có test) ----------

export interface Pose {
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

/** Bốn thuyền, quỹ đạo elip lệch tâm quanh Phù Đảo Các; cao hơn mặt đảo ≥ 30 m để không cắm vào cây/đỉnh. */
export const SHIPS: ShipPlan[] = [
  { cx: 1024, cz: 1024, a: 360, b: 250, w: 0.026, phase: 0.2, y: 182, scale: 1.7 },
  { cx: 900, cz: 900, a: 520, b: 330, w: -0.02, phase: 2.4, y: 198, scale: 2.1 },
  { cx: 1200, cz: 1180, a: 300, b: 420, w: 0.017, phase: 4.1, y: 174, scale: 1.5 },
  { cx: 760, cz: 1300, a: 250, b: 190, w: -0.03, phase: 5.2, y: 188, scale: 1.3 },
];

export function shipPose(p: ShipPlan, t: number): Pose {
  const f = p.phase + p.w * t;
  const x = p.cx + p.a * Math.cos(f);
  const z = p.cz + p.b * Math.sin(f);
  // đạo hàm theo f → hướng đi (đổi dấu khi quay ngược)
  const dx = -p.a * Math.sin(f) * Math.sign(p.w);
  const dz = p.b * Math.cos(f) * Math.sign(p.w);
  const bob = Math.sin(t * 0.55 + p.phase * 3);
  return { x, y: p.y + 5 * Math.sin(t * 0.12 + p.phase) + bob * 0.9, z, yaw: Math.atan2(dx, dz), roll: bob * 0.05, pitch: Math.sin(t * 0.4 + p.phase) * 0.025 };
}

export interface WhalePlan {
  cx: number;
  cz: number;
  r: number;
  y: number;
  /** Rad/s. */
  w: number;
  phase: number;
  length: number;
}

/** Cá mẹ bơi vòng lớn trên cao, cao hơn thuyền và mọi đảo (chu vi ~3,9 km, một vòng ~29 phút); cá con theo sau, lệch vào trong. */
export const WHALES: WhalePlan[] = [
  { cx: 1024, cz: 1024, r: 620, y: 260, w: 0.0036, phase: 0.8, length: 150 },
  { cx: 1024, cz: 1024, r: 580, y: 240, w: 0.0036, phase: 0.8 - 0.19, length: 54 },
];

export function whalePose(p: WhalePlan, t: number): Pose {
  const f = p.phase + p.w * t;
  const x = p.cx + p.r * Math.cos(f);
  const z = p.cz + p.r * Math.sin(f);
  // bơi theo chiều tăng f: tiếp tuyến (-sin, cos)
  const yaw = Math.atan2(-Math.sin(f), Math.cos(f));
  return { x, y: p.y + 14 * Math.sin(t * 0.09 + p.phase * 2), z, yaw, roll: 0.06 * Math.sin(t * 0.17), pitch: 0.07 * Math.cos(t * 0.09 + p.phase * 2) };
}

/** Điểm quanh một đảo thật theo hướng tới (tx, tz), lùi `inset` vào trong mép. */
function rimToward(isl: { x: number; z: number; r: number }, tx: number, tz: number, inset: number): [number, number] {
  const dx = tx - isl.x;
  const dz = tz - isl.z;
  const d = Math.hypot(dx, dz) || 1;
  return [isl.x + (dx / d) * (isl.r - inset), isl.z + (dz / d) * (isl.r - inset)];
}

export interface Arc {
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
 * Cầu vòng linh khí: từ Phù Đảo Các tới các đảo giả, và từ đảo thật gần mỗi đảo giả xa (chưa được nối) tới nó.
 * Đầu nào ở đảo thật cách tâm đảo `r - 6` (trong mép), đầu ở đảo giả đặt trên mặt đảo.
 */
export function rainbowArcs(def: TerrainDef): Arc[] {
  const real = (def.islands ?? []).map((i) => ({ x: i.x, z: i.z, r: i.r, y: i.y }));
  const fakes = def.fakeIslands ?? [];
  const arcs: Arc[] = [];
  for (const f of fakes) {
    // đảo thật gần nhất
    let best = real[0];
    let bd = Infinity;
    for (const r of real) {
      const d = Math.hypot(r.x - f.x, r.z - f.z) - r.r;
      if (d < bd) {
        bd = d;
        best = r;
      }
    }
    if (!best) continue;
    const [ax, az] = rimToward(best, f.x, f.z, 6);
    const [bx, bz] = rimToward({ x: f.x, z: f.z, r: f.r }, best.x, best.z, 6);
    arcs.push({ ax, ay: best.y + 1.5, az, bx, by: f.y + 1.5, bz, rise: 26 + bd * 0.12 });
  }
  return arcs;
}

export interface Tower {
  x: number;
  y: number;
  z: number;
  /** Chiều cao thân (m). */
  h: number;
  /** Có đá nhô (mõm đá) dưới chân hay đứng thẳng trên đảo giả. */
  stack: boolean;
}

/** Mõm đá nhô khỏi biển mây, cách mọi đảo thật > 300 m (người chơi trên sàn mây không đụng vào chân). */
export const STACKS: { x: number; z: number; top: number }[] = [
  { x: 160, z: 160, top: 168 },
  { x: 1950, z: 200, top: 176 },
  { x: 1900, z: 1560, top: 160 },
  { x: 300, z: 1900, top: 172 },
];

export function towersOf(def: TerrainDef): Tower[] {
  const out: Tower[] = (def.fakeIslands ?? []).map((f) => ({ x: f.x, y: f.y, z: f.z, h: 24, stack: false }));
  for (const s of STACKS) out.push({ x: s.x, y: s.top, z: s.z, h: 16, stack: true });
  return out;
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

// --- thuyền tiên (mũi +z, dài ~14, hệ trục cục bộ trước khi nhân tỉ lệ) ---

const HULL_L = 14;

function shipHull(): THREE.BufferGeometry {
  const N = 22;
  const K = 11;
  const zs: number[] = [];
  const rings: [number, number][][] = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const z = (t - 0.5) * HULL_L;
    // bề ngang: nhọn ở mũi, bầu ở giữa, vuông hơn ở đuôi; mũi/đuôi hất cao (sheer)
    const hw = 2.1 * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.78)), 0.62) + 0.02;
    const deckY = 0.5 + 1.5 * Math.pow(Math.abs(2 * t - 1), 2.4) * (t > 0.5 ? 1.15 : 0.8);
    const depth = 1.7 * Math.pow(Math.sin(Math.PI * Math.min(1, t * 0.95 + 0.04)), 0.7);
    const ring: [number, number][] = [];
    for (let j = 0; j < K; j++) {
      const th = -Math.PI / 2 + (j / (K - 1)) * Math.PI;
      ring.push([Math.sin(th) * hw, deckY - depth * Math.cos(th) * (0.25 + 0.75 * Math.cos(th * 0.5) ** 0.5)]);
    }
    // vành thân cao hơn boong một chút (be thuyền)
    rings.push(ring);
    zs.push(z);
  }
  const hull = loft(zs, rings, true);
  paint(hull, (_x, y) => (y > 0.5 ? C(0xcfe0ee) : y > 0.05 ? C(0x3a6aa0) : C(0x1c3556)));
  const parts: THREE.BufferGeometry[] = [hull];
  // boong lót ván nhạt
  const deck = new THREE.BoxGeometry(2.9, 0.1, 9.4);
  deck.translate(0, 0.52, -0.2);
  parts.push(paint(deck, () => C(0xd9c9a6)));
  // lầu đuôi và mái cong
  const cabin = new THREE.BoxGeometry(2.3, 1.3, 2.8);
  cabin.translate(0, 1.15, -4.7);
  parts.push(paint(cabin, () => C(0xe7eef4)));
  const roof = new THREE.ConeGeometry(1.95, 0.85, 4);
  roof.rotateY(Math.PI / 4);
  roof.translate(0, 2.2, -4.7);
  parts.push(paint(roof, () => C(0x2c5f8e)));
  // cột buồm, xà ngang
  for (const mz of [1.8, -1.2]) {
    const mast = new THREE.CylinderGeometry(0.09, 0.14, 12.4, 8);
    mast.translate(0, 6.7, mz);
    parts.push(paint(mast, () => C(0x6b7c8c)));
    const yard = new THREE.CylinderGeometry(0.06, 0.06, 7.2, 6);
    yard.rotateZ(Math.PI / 2);
    yard.translate(0, 12.4, mz);
    parts.push(paint(yard, () => C(0xaebdcb)));
  }
  // mũi: đầu rồng cách điệu bằng một nón bạc nhỏ
  const prow = new THREE.ConeGeometry(0.28, 1.2, 7);
  prow.rotateX(Math.PI / 2);
  prow.translate(0, 2.0, HULL_L / 2 + 0.3);
  parts.push(paint(prow, () => C(0xe8f0f6)));
  return mergeColored(parts);
}

/** Hai tấm buồm cong phồng gió; uv.x ngang, uv.y từ chân (0) lên đỉnh (1). */
function shipSails(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (const [mz, w, h] of [
    [1.8, 6.6, 9.4],
    [-1.2, 5.6, 8],
  ] as const) {
    const g = new THREE.PlaneGeometry(w, h, 8, 10);
    const pos = g.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      const u = pos.getX(i) / w + 0.5;
      const v = pos.getY(i) / h + 0.5;
      pos.setZ(i, mz + 0.9 * Math.sin(Math.PI * u) * Math.sin(Math.PI * (0.15 + v * 0.8)));
      pos.setY(i, 2.9 + v * h);
    }
    g.computeVertexNormals();
    parts.push(g);
  }
  return mergeGeometries(parts, false);
}

function sailMaterial(): THREE.MeshBasicNodeMaterial {
  const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide });
  const noise = getCloudNoise();
  const u = uv();
  const flame = texture(noise, vec2(u.x.mul(1.5), u.y.mul(1.2).sub(time.mul(0.22)))).g;
  const edge = smoothstep(0.0, 0.1, u.x).mul(smoothstep(0.0, 0.1, u.x.oneMinus()));
  const top = smoothstep(0.0, 0.2, u.y.oneMinus().add(flame.sub(0.5).mul(0.5)));
  // sắc lửa: gốc cam đỏ, giữa vàng, mép trên trắng ấm (HDR vừa phải, dưới ngưỡng chói của bloom)
  const col = mix(vec3(1.5, 0.52, 0.16), vec3(1.7, 1.15, 0.5), u.y.pow(0.8)).mul(float(0.82).add(flame.mul(0.4)));
  mat.colorNode = col;
  mat.opacityNode = clamp(edge.mul(top).mul(float(0.55).add(flame.mul(0.45))), 0, 0.92);
  return mat;
}

// --- cá kình băng mây (mũi +z, thân dài 1 đơn vị = `length`) ---

function whaleGeometry(): THREE.BufferGeometry {
  const N = 40;
  const K = 16;
  const zs: number[] = [];
  const rings: [number, number][][] = [];
  const R = 0.12;
  for (let i = 0; i <= N; i++) {
    const t = i / N; // 0 đầu → 1 đuôi
    let r: number;
    if (t < 0.28) r = R * Math.pow(Math.sin((t / 0.28) * Math.PI * 0.5), 0.5);
    else r = R * Math.pow(1 - (t - 0.28) / 0.72, 1.25) + 0.012;
    const ring: [number, number][] = [];
    for (let j = 0; j < K; j++) {
      const a = (j / (K - 1)) * Math.PI * 2;
      // ngang rộng hơn cao; bụng nở hơn lưng
      const belly = Math.sin(a) < 0 ? 1.1 : 0.9;
      ring.push([Math.cos(a) * r, Math.sin(a) * r * 0.86 * belly]);
    }
    rings.push(ring);
    zs.push(0.5 - t);
  }
  const body = loft(zs, rings, true);
  const parts: THREE.BufferGeometry[] = [body];
  // vây đuôi nằm ngang: hai thùy
  const fl = new THREE.Shape();
  fl.moveTo(0, 0.02);
  fl.bezierCurveTo(0.05, 0.02, 0.13, 0.0, 0.17, -0.06);
  fl.bezierCurveTo(0.12, -0.02, 0.06, -0.06, 0, -0.045);
  fl.bezierCurveTo(-0.06, -0.06, -0.12, -0.02, -0.17, -0.06);
  fl.bezierCurveTo(-0.13, 0.0, -0.05, 0.02, 0, 0.02);
  const fluke = new THREE.ShapeGeometry(fl, 10);
  fluke.rotateX(Math.PI / 2); // đưa từ mặt xy sang xz, thùy hướng ra sau (-z)
  fluke.translate(0, 0, -0.5 + 0.02);
  parts.push(fluke);
  // hai vây ngực
  for (const s of [-1, 1]) {
    const fin = new THREE.SphereGeometry(1, 10, 8);
    fin.scale(0.012, 0.05, 0.09);
    fin.rotateZ(s * 0.9);
    fin.rotateY(s * 0.25);
    fin.translate(s * 0.1, -0.075, 0.27);
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
  const wave = p.z.mul(14).add(time.mul(1.4)).sin().mul(tail).mul(0.045);
  mat.positionNode = vec3(p.x.add(wave.mul(0.25)), p.y.add(wave), p.z);
  const belly = smoothstep(0.7, -0.7, p.y.mul(9));
  const swirl = texture(noise, vec2(p.x.mul(5).add(p.z.mul(3.2)).add(time.mul(0.02)), p.y.mul(5).add(p.z.mul(2)))).a;
  const fres = float(1).sub(normalView.z.abs());
  // lưng lam thẫm → bụng bạc; vân mây xoáy trên thân; mép sáng bạc
  const base = mix(vec3(0.2, 0.42, 0.7), vec3(0.82, 0.92, 1.0), belly.mul(0.8).add(swirl.mul(0.25)));
  mat.colorNode = base.add(vec3(0.5, 0.65, 0.8).mul(fres.pow(2.2)).mul(0.7));
  mat.opacityNode = clamp(float(0.34).add(swirl.mul(0.3)).add(fres.pow(1.8).mul(0.5)), 0, 0.82);
  return mat;
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
    for (const mode of [0, 1]) {
      // mode 0: dải nằm ngang như mặt cầu; mode 1: dải đứng (nhìn ngang thấy mặt)
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
  const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
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

function towerGeometry(t: Tower): { stone: THREE.BufferGeometry; lamp: THREE.Vector3 } {
  const h = t.h;
  const pts: THREE.Vector2[] = [
    new THREE.Vector2(0.01, 0),
    new THREE.Vector2(4.6, 0),
    new THREE.Vector2(4.2, 0.9),
    new THREE.Vector2(3.4, 1.6),
    new THREE.Vector2(3.0, 3),
    new THREE.Vector2(2.2, h * 0.9),
    new THREE.Vector2(2.9, h * 0.9 + 0.5),
    new THREE.Vector2(2.9, h),
    new THREE.Vector2(2.3, h + 0.5),
    new THREE.Vector2(2.2, h + 2.6),
    new THREE.Vector2(3.1, h + 3.0),
    new THREE.Vector2(2.1, h + 3.7),
    new THREE.Vector2(0.9, h + 5.6),
    new THREE.Vector2(0.01, h + 6.6),
  ];
  const body = new THREE.LatheGeometry(pts, 12);
  const bands = Math.max(3, Math.round(h / 5));
  paint(body, (_x, y) => {
    if (y > h + 3.0) return C(0x2c5f8e);
    if (y > h + 0.5) return C(0xe8f0f6);
    if (y > h) return C(0xa8bccd);
    const k = Math.floor((y / h) * bands * 2);
    return k % 2 === 0 ? C(0xe3ecf2) : C(0x4a7fb0);
  });
  const stone = mergeColored([body]);
  stone.translate(t.x, t.y, t.z);
  return { stone, lamp: new THREE.Vector3(t.x, t.y + h + 1.7, t.z) };
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
  const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
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
    const hullGeo = track(shipHull());
    const hullMat = track(createWorldMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.15 }));
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

    // Cá kình băng mây
    const wg = track(whaleGeometry());
    for (const w of WHALES) {
      const m = new THREE.Mesh(wg, track(whaleMaterial()));
      m.name = 'van-hai-whale';
      m.frustumCulled = false;
      m.renderOrder = 3;
      m.scale.setScalar(w.length);
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
    const stoneMesh = new THREE.Mesh(stoneGeo, track(createWorldMaterial({ vertexColors: true, roughness: 0.78, metalness: 0.02 })));
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
    });
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
