import * as THREE from 'three/webgpu';
import {
  atan,
  attribute,
  clamp,
  float,
  floor,
  fract,
  length,
  max,
  mix,
  positionWorld,
  sin,
  smoothstep,
  time,
  uv,
  vec2,
  vec3,
} from 'three/tsl';
import { BRIDGE_A, hash01, SECT, TC_GATE, TC_POND } from '@dtl/shared';
import { heightAt } from '../../base/levelCtx';
import { vnoise } from '../../render/materials/isoDetail';

/**
 * Mặt đất "kể chuyện" Lạc Kiếm Tông (Chân Cảnh M3): decal bám địa hình, thứ người chơi nhìn 90% thời gian.
 * Vết chân + vệt mòn dọc lối, vũng nước phản chiếu, gạch vỡ + đá vụn trên sân, ấn trận mờ phát sáng, rễ cây trồi.
 * Client-only, tất định, không va chạm. Mỗi loại gộp MỘT mesh (≤ 5 draw call), thủ tục hoàn toàn (không texture mới).
 * Dẹt sát đất (≤ 0,15 m) nên không bao giờ che người/mục tiêu của camera chéo; không cần sight fade.
 * Bố cục (tọa độ tương đối tâm tông môn): `groundLayout()`; lý do chọn chỗ: `docs/map/lac-kiem-tieu-canh.md` (M3).
 */

export type DecalKind = 'foot' | 'puddle' | 'crack' | 'seal' | 'root';

/** Dải theo đường gấp khúc (vệt chân/vệt mòn). */
export interface TrailDef {
  pts: [number, number][];
  /** Nửa bề rộng (m). */
  hw: number;
}
/** Mảnh vuông/tròn quay `yaw`, nửa cạnh (hx, hz). */
export interface PatchDef {
  kind: Exclude<DecalKind, 'foot'>;
  x: number;
  z: number;
  hx: number;
  hz: number;
  yaw: number;
  /** Mặt sân lát (cao hơn đất một chút) thay vì đất. */
  plaza?: boolean;
}
export interface GroundLayout {
  trails: TrailDef[];
  patches: PatchDef[];
}

/** Dốc lớn nhất (rad tan) cho vũng nước: vũng chỉ nằm chỗ gần phẳng. */
const PUDDLE_MAX_TAN = 0.09;
const gy = (x: number, z: number): number => heightAt(SECT.x + x, SECT.z + z);
const slopeAt = (x: number, z: number): number => Math.hypot(gy(x + 1.5, z) - gy(x - 1.5, z), gy(x, z + 1.5) - gy(x, z - 1.5)) / 3;

/** Đặt vũng nước quanh một điểm: thử vài góc, bỏ chỗ dốc. */
function puddles(cx: number, cz: number, r: number, n: number, seed: number, size = 1): PatchDef[] {
  const out: PatchDef[] = [];
  for (let i = 0; i < n * 3 && out.length < n; i++) {
    const a = hash01(seed, i, 1) * Math.PI * 2;
    const d = Math.sqrt(hash01(seed, i, 2)) * r;
    const x = cx + Math.cos(a) * d;
    const z = cz + Math.sin(a) * d;
    if (slopeAt(x, z) > PUDDLE_MAX_TAN) continue;
    if (Math.hypot(x - TC_POND.x, z - TC_POND.z) < TC_POND.r + 3.2) continue; // không đè lên mặt ao
    const s = (0.55 + hash01(seed, i, 3) * 0.85) * size;
    out.push({ kind: 'puddle', x, z, hx: s * 1.35, hz: s, yaw: hash01(seed, i, 4) * Math.PI, plaza: false });
  }
  return out;
}

/** Bố cục tất định. Chỗ đặt khớp tiểu cảnh (docs/map/lac-kiem-tieu-canh.md). */
export function groundLayout(): GroundLayout {
  const trails: TrailDef[] = [
    // đường từ đại lộ ra kiếm bia và thạch lâm
    { pts: [[22, 66], [40, 63], [56, 60]], hw: 1.5 },
    { pts: [[60, 52], [78, 30], [92, 8], [96, -4]], hw: 1.5 },
    // từ sân tới đầu lối men vách (phần sau đã lát phiến đá)
    { pts: [[-36, 58], [-62, 50], [-92, 54]], hw: 1.5 },
  ];
  const patches: PatchDef[] = [];
  // vũng nước: bờ ao, trước cổng, quanh kiếm bia, thạch lâm, bờ hác
  patches.push(
    ...puddles(TC_POND.x, TC_POND.z, TC_POND.r + 6, 5, 11, 0.9),
    ...puddles(0, 108, 9, 3, 12),
    ...puddles(66, 62, 9, 3, 13),
    ...puddles(96, -6, 8, 3, 14),
    ...puddles(-30, 56, 9, 2, 15, 0.9),
  );
  // gạch vỡ + đá vụn trên sân lát (phía đông đại lộ, quanh bát quái)
  const plaza: [number, number, number, number][] = [
    [7, 48, 4, 0.3],
    [9, 62, 4, 1.2],
    [13, 34, 4.2, 2.1],
    [22, 70, 3.6, 0.7],
    [-6, 60, 3.4, 1.9],
    [20, 12, 4, 2.6],
  ];
  for (const [x, z, r, yaw] of plaza) patches.push({ kind: 'crack', x, z, hx: r, hz: r * 0.8, yaw, plaza: true });
  // ấn trận mờ: bên kiếm bia (kiếm trận cổ), thạch lâm, đầu cầu, thoáng dưới cổng bài
  patches.push(
    { kind: 'seal', x: 66, z: 64, hx: 5.6, hz: 5.6, yaw: 0.4 },
    { kind: 'seal', x: 96, z: -8, hx: 5.2, hz: 5.2, yaw: 1.1 },
    { kind: 'seal', x: BRIDGE_A[0] + 2, z: BRIDGE_A[1] - 4, hx: 3.6, hz: 3.6, yaw: 0.2 },
    { kind: 'seal', x: 0, z: 112, hx: 5.6, hz: 5.6, yaw: 0.8 },
  );
  // rễ cây trồi: ven ao, bờ hác, chân đồi quanh thạch lâm, lối men vách
  const roots: [number, number, number][] = [
    [TC_POND.x - 9, TC_POND.z - 5, 3.4],
    [TC_POND.x + 4, TC_POND.z + 10.5, 3],
    [-131, 56, 3.2],
    [-112, 82, 3],
    [88, -14, 3.4],
    [104, -2, 3],
    [TC_GATE.x - 9, TC_GATE.z - 8, 3],
    [TC_GATE.x + 9.5, TC_GATE.z - 6, 3],
  ];
  roots.forEach(([x, z, r], i) => patches.push({ kind: 'root', x, z, hx: r, hz: r, yaw: hash01(i, 9, 3) * 6.28 }));
  return { trails, patches };
}

// ---------- hình học ----------

/** Lưới ô vuông quay `yaw` bám địa hình; uv ∈ [0,1]. */
function patchGeo(p: PatchDef, n: number): { pos: number[]; uv: number[]; seed: number[]; idx: number[] } {
  const pos: number[] = [];
  const uvs: number[] = [];
  const seed: number[] = [];
  const idx: number[] = [];
  const c = Math.cos(p.yaw);
  const s = Math.sin(p.yaw);
  const lift = p.plaza ? 0.14 : p.kind === 'puddle' ? 0.05 : 0.035;
  const sd = hash01(Math.round(p.x * 7), Math.round(p.z * 7), 5);
  for (let j = 0; j <= n; j++)
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      const v = j / n;
      const lx = (u - 0.5) * 2 * p.hx;
      const lz = (v - 0.5) * 2 * p.hz;
      const x = p.x + c * lx - s * lz;
      const z = p.z + s * lx + c * lz;
      pos.push(x, gy(x, z) + lift, z);
      uvs.push(u, v);
      seed.push(sd, 0, 0);
    }
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      const a = j * (n + 1) + i;
      idx.push(a, a + n + 1, a + 1, a + 1, a + n + 1, a + n + 2);
    }
  return { pos, uv: uvs, seed, idx };
}

/** Dải theo đường gấp khúc, mỗi ~1,6 m một mặt cắt; uv = (m ngang so với tim, m dọc đường); aP = (seed, nửa rộng, tổng dài). */
function trailGeo(t: TrailDef, seed: number): { pos: number[]; uv: number[]; seed: number[]; idx: number[] } {
  const pos: number[] = [];
  const uvs: number[] = [];
  const sd: number[] = [];
  const idx: number[] = [];
  // lấy mẫu đều
  const pts: [number, number][] = [];
  let total = 0;
  const cum: number[] = [0];
  for (let i = 1; i < t.pts.length; i++) {
    total += Math.hypot(t.pts[i]![0] - t.pts[i - 1]![0], t.pts[i]![1] - t.pts[i - 1]![1]);
    cum.push(total);
  }
  const step = 1.6;
  const m = Math.max(2, Math.ceil(total / step));
  for (let k = 0; k <= m; k++) {
    const d = (k / m) * total;
    let i = 1;
    while (i < cum.length - 1 && cum[i]! < d) i++;
    const f = (d - cum[i - 1]!) / Math.max(1e-6, cum[i]! - cum[i - 1]!);
    pts.push([t.pts[i - 1]![0] + (t.pts[i]![0] - t.pts[i - 1]![0]) * f, t.pts[i - 1]![1] + (t.pts[i]![1] - t.pts[i - 1]![1]) * f]);
  }
  for (let k = 0; k <= m; k++) {
    const a = pts[Math.max(0, k - 1)]!;
    const b = pts[Math.min(m, k + 1)]!;
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const l = Math.hypot(dx, dz) || 1;
    const nx = -dz / l;
    const nz = dx / l;
    for (const side of [-1, 1]) {
      const x = pts[k]![0] + nx * t.hw * side;
      const z = pts[k]![1] + nz * t.hw * side;
      pos.push(x, gy(x, z) + 0.035, z);
      uvs.push(side * t.hw, (k / m) * total);
      sd.push(seed, t.hw, total);
    }
  }
  for (let k = 0; k < m; k++) {
    const a = k * 2;
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); // ngược chiều kim đồng hồ nhìn từ trên (mặt hướng lên)
  }
  return { pos, uv: uvs, seed: sd, idx };
}

interface Acc {
  pos: number[];
  uv: number[];
  seed: number[];
  idx: number[];
}
const empty = (): Acc => ({ pos: [], uv: [], seed: [], idx: [] });
function append(acc: Acc, g: Acc): void {
  const base = acc.pos.length / 3;
  acc.pos.push(...g.pos);
  acc.uv.push(...g.uv);
  acc.seed.push(...g.seed);
  for (const i of g.idx) acc.idx.push(i + base);
}
function toGeometry(a: Acc): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(a.pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(a.uv, 2));
  g.setAttribute('aP', new THREE.Float32BufferAttribute(a.seed, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(a.pos.map((_, i) => (i % 3 === 1 ? 1 : 0)), 3)); // decal dẹt: pháp tuyến hướng lên
  g.setIndex(a.idx);
  g.computeBoundingSphere();
  return g;
}

export function buildGroundGeometry(layout = groundLayout()): Map<DecalKind, { acc: Acc; tris: number }> {
  const out = new Map<DecalKind, { acc: Acc; tris: number }>();
  const get = (k: DecalKind) => {
    let e = out.get(k);
    if (!e) out.set(k, (e = { acc: empty(), tris: 0 }));
    return e;
  };
  layout.trails.forEach((t, i) => {
    const e = get('foot');
    const g = trailGeo(t, hash01(i, 3, 3));
    append(e.acc, g);
    e.tris += g.idx.length / 3;
  });
  for (const p of layout.patches) {
    const e = get(p.kind);
    const g = patchGeo(p, p.kind === 'puddle' ? 8 : 12);
    append(e.acc, g);
    e.tris += g.idx.length / 3;
  }
  return out;
}

/** Số liệu cho test: số loại (draw call) và tam giác. */
export function groundStats(): { kinds: number; tris: number; trails: number; patches: Record<string, number> } {
  const l = groundLayout();
  const b = buildGroundGeometry(l);
  const patches: Record<string, number> = {};
  for (const p of l.patches) patches[p.kind] = (patches[p.kind] ?? 0) + 1;
  let tris = 0;
  for (const e of b.values()) tris += e.tris;
  return { kinds: b.size, tris, trails: l.trails.length, patches };
}

// ---------- vật liệu ----------

const aP = () => attribute('aP', 'vec3');
/** Gốc uv tròn: (−1..1) tâm mảnh. */
const cuv = () => uv().sub(0.5).mul(2);
const wp = () => positionWorld.xz;

function baseMat(): THREE.MeshStandardNodeMaterial {
  const m = new THREE.MeshStandardNodeMaterial({ transparent: true, depthWrite: false, roughness: 0.95, metalness: 0 });
  m.polygonOffset = true;
  m.polygonOffsetFactor = -3;
  m.polygonOffsetUnits = -3;
  return m;
}

/** Vệt mòn + vết chân so le (hai bàn chân/1,15 m). */
function footMaterial(): THREE.MeshStandardNodeMaterial {
  const m = baseMat();
  const p = aP();
  const x = uv().x;
  const s = uv().y;
  const hw = p.y;
  const total = p.z;
  const worn = smoothstep(hw, hw.mul(0.35), x.abs()).mul(vnoise(wp().mul(0.7)).mul(0.55).add(0.45));
  const ends = smoothstep(0, 4, s).mul(smoothstep(0, 4, total.sub(s)));
  const cell = s.div(1.15);
  const i = floor(cell);
  const side = fract(i.mul(0.5)).sub(0.25).sign(); // so le trái/phải (-1 / +1)
  const dx = x.sub(side.mul(0.2));
  const ym = fract(cell).sub(0.5).mul(1.15);
  // bàn chân = mũi (oval lớn) + gót (oval nhỏ) cách nhau một khe
  const toe = dx.div(0.13).pow(2).add(ym.add(0.14).div(0.22).pow(2)).sqrt();
  const heel = dx.div(0.09).pow(2).add(ym.sub(0.2).div(0.11).pow(2)).sqrt();
  const print = max(smoothstep(1.0, 0.6, toe), smoothstep(1.0, 0.6, heel)).mul(smoothstep(hw.mul(0.9), hw.mul(0.5), x.abs()));
  // chỉ một phần dấu chân còn rõ (mòn dần): dựa trên nhiễu theo ô
  const keep = smoothstep(0.35, 0.6, vnoise(vec2(i.mul(1.7), p.x.mul(9))));
  const a = clamp(worn.mul(0.5).add(print.mul(keep).mul(0.7)), 0, 0.85).mul(ends);
  m.colorNode = mix(vec3(0.07, 0.05, 0.032), vec3(0.025, 0.017, 0.011), print.mul(keep));
  m.opacityNode = a;
  return m;
}

/** Vũng nước: bóng như gương (roughness thấp), viền loang theo nhiễu, gợn nhẹ. */
function puddleMaterial(): THREE.MeshStandardNodeMaterial {
  const m = baseMat();
  m.roughness = 0.1;
  m.metalness = 0.1;
  const c = cuv();
  const d = length(c).add(vnoise(wp().mul(1.1)).sub(0.5).mul(0.5));
  const mask = smoothstep(1.0, 0.78, d);
  const rip = sin(length(c).mul(18).sub(time.mul(1.2))).mul(0.5).add(0.5).mul(smoothstep(0.5, 0.0, length(c)));
  m.colorNode = mix(vec3(0.012, 0.02, 0.026), vec3(0.03, 0.045, 0.052), smoothstep(0.9, 0.3, d));
  m.emissiveNode = vec3(0.02, 0.03, 0.038).add(vec3(0.02).mul(rip));
  m.opacityNode = mask.mul(0.72);
  return m;
}

/** Gạch vỡ: đường nứt đen + mảnh đá vụn sáng. */
function crackMaterial(): THREE.MeshStandardNodeMaterial {
  const m = baseMat();
  const c = cuv();
  const r = length(c);
  const edge = smoothstep(1.0, 0.45, r.add(vnoise(wp().mul(0.8)).sub(0.5).mul(0.6)));
  const n1 = vnoise(wp().mul(0.55));
  const n2 = vnoise(wp().mul(1.4).add(7.3));
  const l1 = float(1).sub(smoothstep(0.0, 0.03, n1.sub(0.5).abs()));
  const l2 = float(1).sub(smoothstep(0.0, 0.022, n2.sub(0.5).abs())).mul(0.75);
  const cracks = max(l1, l2).mul(edge);
  const bits = smoothstep(0.74, 0.8, vnoise(wp().mul(4.6).add(3.1))).mul(edge).mul(smoothstep(0.55, 0.9, vnoise(wp().mul(0.9))));
  m.colorNode = mix(vec3(0.02, 0.022, 0.025), vec3(0.42, 0.44, 0.42), bits);
  m.opacityNode = clamp(cracks.mul(0.85).add(bits.mul(0.8)), 0, 0.9);
  return m;
}

/** Ấn trận: vòng + gạch khắc quanh + sao tám cánh mờ, phát sáng nhịp thở. Pha trộn thường (cộng sáng làm trắng bệch giữa ngày), không ghi sâu. */
function sealMaterial(): THREE.MeshBasicNodeMaterial {
  const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, toneMapped: false });
  m.polygonOffset = true;
  m.polygonOffsetFactor = -4;
  m.polygonOffsetUnits = -4;
  const c = cuv();
  const r = length(c);
  const ang = atan(c.y, c.x).div(Math.PI * 2).add(0.5);
  const ring = (r0: number, w: number) => smoothstep(w, 0, r.sub(r0).abs());
  const rings = max(ring(0.93, 0.045), max(ring(0.64, 0.035), ring(0.32, 0.03)));
  const ticks = smoothstep(0.8, 0.86, fract(ang.mul(72))).mul(smoothstep(0.035, 0.0, r.sub(0.8).abs().sub(0.04)));
  const star = smoothstep(0.03, 0.0, fract(ang.mul(8)).sub(0.5).abs().mul(r))
    .mul(smoothstep(0.62, 0.34, r))
    .mul(smoothstep(0.1, 0.2, r));
  // mòn: nhiễu khoét từng đoạn ấn cho cũ kỹ
  const erode = smoothstep(0.3, 0.62, vnoise(c.mul(4.2).add(aP().x.mul(31))));
  const pulse = sin(time.mul(0.9).add(aP().x.mul(20))).mul(0.25).add(0.75);
  const g = max(rings, max(ticks.mul(0.55), star)).mul(erode).mul(smoothstep(1.0, 0.9, r)).mul(pulse);
  m.colorNode = mix(vec3(0.2, 0.55, 0.5), vec3(0.78, 0.5, 0.12), smoothstep(0.3, 0.95, r)).mul(0.9);
  m.opacityNode = clamp(g.mul(0.6), 0, 0.65);
  return m;
}

/** Rễ cây trồi: ~7 nhánh tỏa từ gốc, mảnh dần ra ngoài, uốn theo nhiễu. */
function rootMaterial(): THREE.MeshStandardNodeMaterial {
  const m = baseMat();
  const c = cuv();
  const r = length(c);
  const ang = atan(c.y, c.x).div(Math.PI * 2).add(0.5);
  const wob = vnoise(vec2(r.mul(3.2), aP().x.mul(40))).sub(0.5).mul(0.28);
  const lane = fract(ang.mul(7).add(wob)).sub(0.5).abs(); // 0 tại tim nhánh
  const width = float(0.2).mul(smoothstep(1.0, 0.1, r)).add(0.015);
  const arm = smoothstep(width, width.mul(0.35), lane.mul(r.mul(2.2).add(0.4)));
  const keep = smoothstep(0.4, 0.55, vnoise(vec2(ang.mul(7).floor(), aP().x.mul(13)))); // bỏ vài nhánh
  const a = arm.mul(keep).mul(smoothstep(1.0, 0.7, r)).mul(smoothstep(0.04, 0.14, r));
  m.colorNode = mix(vec3(0.09, 0.06, 0.04), vec3(0.2, 0.15, 0.09), smoothstep(0.0, width, lane.mul(0.7)).oneMinus().mul(0.6));
  m.opacityNode = a.mul(0.92);
  return m;
}

const MATERIALS: Record<DecalKind, () => THREE.Material> = {
  foot: footMaterial,
  puddle: puddleMaterial,
  crack: crackMaterial,
  seal: sealMaterial,
  root: rootMaterial,
};
const ORDER: Record<DecalKind, number> = { foot: 1, crack: 2, root: 3, puddle: 4, seal: 5 };

export class LacKiemGround {
  readonly group = new THREE.Group();
  private geos: THREE.BufferGeometry[] = [];
  private mats: THREE.Material[] = [];
  readonly tris: number;
  readonly drawCalls: number;

  constructor() {
    this.group.name = 'lac-kiem-ground';
    this.group.position.set(SECT.x, 0, SECT.z);
    const b = buildGroundGeometry();
    let tris = 0;
    for (const [kind, e] of b) {
      const g = toGeometry(e.acc);
      // toạ độ đỉnh đã là tương đối tâm (không cộng SECT): trừ y 0 và để group dịch x,z
      this.geos.push(g);
      const mat = MATERIALS[kind]();
      this.mats.push(mat);
      const mesh = new THREE.Mesh(g, mat);
      mesh.name = `tc-ground-${kind}`;
      mesh.renderOrder = ORDER[kind];
      mesh.receiveShadow = false;
      mesh.frustumCulled = false; // bao cầu lớn, dải rải cả bản đồ: một mesh/loại, rẻ
      this.group.add(mesh);
      tris += e.tris;
    }
    this.tris = tris;
    this.drawCalls = b.size;
  }

  dispose(): void {
    for (const g of this.geos) g.dispose();
    for (const m of this.mats) m.dispose();
  }
}
