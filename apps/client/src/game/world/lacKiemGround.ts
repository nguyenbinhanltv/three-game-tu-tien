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
import { BRIDGE_A, hash01, SECT, TC_POND } from '@dtl/shared';
import { heightAt } from '../../base/levelCtx';
import { vnoise } from '../../render/materials/isoDetail';

/**
 * Sáu tiểu cảnh kể chuyện trên mặt đất Lạc Kiếm Tông (Chân Cảnh M3). Mỗi cảnh đặt tay ở chỗ người chơi chắc chắn đi qua, bám vào prop có sẵn của tiểu cảnh
 * (kiếm gãy, đèn đá, đá rêu, tre…) và đọc được trong một giây từ camera chéo. Chỉ là decal dẹt bám địa hình (≤ 0,15 m, không che người/mục tiêu),
 * client-only, tất định, không va chạm. Chỉ HAI mesh = hai draw call: `ground` (vệt chân/bánh xe, nứt, rêu, rễ, lá, đá vụn, ấn trận; một shader chọn mẫu theo thuộc tính `aK`)
 * và `puddle` (phản chiếu trời + lá nổi). Tắt bằng `?ground=0`. Tọa độ tương đối tâm tông môn. Lời kể từng cảnh: `docs/map/lac-kiem-tieu-canh.md` (M3).
 */

/** Mẫu của decal `ground` (thuộc tính `aK`). */
const K = { foot: 0, crack: 1, burst: 2, root: 3, moss: 4, leaves: 5, chips: 6, seal: 7 } as const;
export type GroundKind = keyof typeof K | 'puddle';

/** Dải theo đường gấp khúc (vệt chân, bánh xe, rêu dọc chân tường). */
export interface TrailDef {
  kind: 'foot' | 'moss';
  pts: [number, number][];
  /** Nửa bề rộng (m). */
  hw: number;
}
/** Mảnh vuông quay `yaw`, nửa cạnh (hx, hz). */
export interface PatchDef {
  kind: Exclude<GroundKind, 'foot' | 'moss'>;
  x: number;
  z: number;
  hx: number;
  hz: number;
  yaw: number;
  /** Mặt sân lát (cao hơn đất một chút) thay vì đất. */
  plaza?: boolean;
}
/** Một tiểu cảnh kể chuyện: vị trí người đứng để chụp/kiểm, lời kể, và các decal. */
export interface Vignette {
  id: string;
  at: [number, number];
  story: string;
  trails: TrailDef[];
  patches: PatchDef[];
}

const PUDDLE_MAX_TAN = 0.09;
const gy = (x: number, z: number): number => heightAt(SECT.x + x, SECT.z + z);
const slopeAt = (x: number, z: number): number => Math.hypot(gy(x + 1.5, z) - gy(x - 1.5, z), gy(x, z + 1.5) - gy(x, z - 1.5)) / 3;

/** Vũng nước đặt tay: bỏ nếu chỗ dốc. */
const puddle = (x: number, z: number, hx: number, hz: number, yaw: number): PatchDef[] =>
  slopeAt(x, z) > PUDDLE_MAX_TAN ? [] : [{ kind: 'puddle', x, z, hx, hz, yaw }];

/** Vòng xoáy (vết chân quanh cọc): bán kính giảm dần từ r0 xuống r1 qua `turns` vòng. */
const spiral = (cx: number, cz: number, r0: number, r1: number, turns: number, n = 26): [number, number][] =>
  Array.from({ length: n + 1 }, (_, i) => {
    const t = i / n;
    const a = t * turns * Math.PI * 2 + 0.6;
    const r = r0 + (r1 - r0) * t;
    return [cx + Math.cos(a) * r, cz + Math.sin(a) * r];
  });

/** Vòng quanh bờ ao phía camera nhìn thấy. */
const pondRim = (): [number, number][] =>
  Array.from({ length: 7 }, (_, i) => {
    const t = ((-150 + i * 20) * Math.PI) / 180;
    return [TC_POND.x + Math.cos(t) * 11.8, TC_POND.z + Math.sin(t) * 11.8];
  });

export function vignettes(): Vignette[] {
  return [
    {
      id: 'bai_tap_kiem',
      at: [66, 57],
      story: 'Bãi tập kiếm bỏ hoang: kiếm gãy cắm đất, vệt chân xoáy tròn quanh bia, ấn kiếm trận cũ mờ dưới đất, vũng đọng bên đá.',
      trails: [{ kind: 'foot', pts: spiral(66, 60.5, 5.4, 3, 1.4), hw: 0.95 }],
      patches: [
        { kind: 'seal', x: 66, z: 60, hx: 7.5, hz: 7.5, yaw: 0.4 },
        { kind: 'leaves', x: 61, z: 58, hx: 2.8, hz: 2.3, yaw: 0.8 },
        { kind: 'leaves', x: 71, z: 63, hx: 2.4, hz: 2, yaw: 2.2 },
        ...puddle(74.5, 55, 2.4, 1.7, 1.2),
      ],
    },
    {
      id: 'vung_sau_mua',
      at: [8, 106],
      story: 'Vũng nước sau mưa trước cổng bài: phản chiếu trời, lá rơi nổi, rễ cỏ bên đá.',
      trails: [],
      patches: [
        ...puddle(6, 108, 3.6, 2.5, 0.3),
        ...puddle(2.5, 102, 2.4, 1.7, 2.4),
        ...puddle(-11, 114, 3, 2.2, 2.4),
        ...puddle(11, 103, 3, 2.2, 1.4),
        { kind: 'leaves', x: 9, z: 105, hx: 2.4, hz: 1.9, yaw: 0.2 },
        { kind: 'root', x: 11, z: 110, hx: 3.4, hz: 3.4, yaw: 1.7 },
      ],
    },
    {
      id: 'goc_den_da',
      at: [-55, 55],
      story: 'Gốc cổ thụ bên ao: rễ trồi bao quanh đèn đá và linh thảo cúng, rêu men theo rễ, đường mòn vòng bờ ao.',
      trails: [{ kind: 'foot', pts: pondRim(), hw: 1.3 }],
      patches: [
        { kind: 'root', x: -55, z: 55, hx: 5, hz: 5, yaw: 0.9 },
        { kind: 'leaves', x: -58, z: 53, hx: 2.4, hz: 2, yaw: 1.6 },
        { kind: 'root', x: BRIDGE_A[0] + 5, z: BRIDGE_A[1] + 9, hx: 3.6, hz: 3.6, yaw: 0.4 },
      ],
    },
    {
      id: 'loi_de_tu',
      at: [84, 22],
      story: 'Lối mòn đệ tử: vệt bánh xe đẩy và dấu chân dẫn ra thạch lâm, đá vụn rơi vãi dọc đường.',
      trails: [
        {
          kind: 'foot',
          pts: [
            [22, 66],
            [40, 63],
            [56, 60],
          ],
          hw: 2,
        },
        {
          kind: 'foot',
          pts: [
            [60, 52],
            [78, 30],
            [92, 8],
            [96, -4],
          ],
          hw: 2,
        },
      ],
      patches: [
        { kind: 'chips', x: 84, z: 22, hx: 2.6, hz: 2.2, yaw: 0.3 },
        { kind: 'chips', x: 80, z: 27, hx: 2.2, hz: 1.8, yaw: 1.1 },
        { kind: 'chips', x: 93, z: 4, hx: 2.4, hz: 2, yaw: 1.4 },
        { kind: 'chips', x: 95.5, z: -5, hx: 2.8, hz: 2.4, yaw: 2.2 },
        ...puddle(88, 18, 2.6, 1.8, 0.5),
      ],
    },
    {
      id: 'san_luyen_cong',
      at: [9, 46],
      story: 'Sân luyện công: ấn trận khắc chìm dưới đá lát, gạch nứt tỏa ra từ chỗ một chưởng đánh xuống.',
      trails: [],
      patches: [
        { kind: 'seal', x: 9, z: 46, hx: 7, hz: 7, yaw: 0.2, plaza: true },
        { kind: 'burst', x: 9, z: 46, hx: 6, hz: 6, yaw: 0.5, plaza: true },
        { kind: 'crack', x: 13, z: 34, hx: 4, hz: 3.4, yaw: 2.1, plaza: true },
      ],
    },
    {
      id: 'chan_tuong',
      at: [30, 85],
      story: 'Chân tường sơn môn: rêu men theo khe, lá gom thành đống ở góc.',
      trails: [
        {
          kind: 'moss',
          pts: [
            [20, 80.2],
            [29, 80.2],
            [38, 80.2],
          ],
          hw: 1.1,
        },
        {
          kind: 'moss',
          pts: [
            [20, 75.8],
            [29, 75.8],
            [38, 75.8],
          ],
          hw: 1,
        },
      ],
      patches: [
        { kind: 'leaves', x: 39, z: 80.5, hx: 2.6, hz: 2.2, yaw: 0.5 },
        { kind: 'leaves', x: 21.5, z: 76, hx: 2.2, hz: 1.8, yaw: 1.9 },
      ],
    },
  ];
}

// ---------- hình học ----------

interface Acc {
  pos: number[];
  uv: number[];
  p: number[];
  k: number[];
  idx: number[];
}
const empty = (): Acc => ({ pos: [], uv: [], p: [], k: [], idx: [] });

/** Lưới ô vuông quay `yaw` bám địa hình; uv ∈ [0,1]. */
function patchGeo(a: Acc, p: PatchDef, n: number, k: number): void {
  const base = a.pos.length / 3;
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
      a.pos.push(x, gy(x, z) + lift, z);
      a.uv.push(u, v);
      a.p.push(sd, 0, 0);
      a.k.push(k);
    }
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      const q = base + j * (n + 1) + i;
      a.idx.push(q, q + n + 1, q + 1, q + 1, q + n + 1, q + n + 2);
    }
}

/** Dải theo đường gấp khúc, mỗi ~1,6 m một mặt cắt; uv = (m ngang so với tim, m dọc đường); p = (seed, nửa rộng, tổng dài). */
function trailGeo(a: Acc, t: TrailDef, seed: number): void {
  const base = a.pos.length / 3;
  const cum: number[] = [0];
  let total = 0;
  for (let i = 1; i < t.pts.length; i++) {
    total += Math.hypot(t.pts[i]![0] - t.pts[i - 1]![0], t.pts[i]![1] - t.pts[i - 1]![1]);
    cum.push(total);
  }
  const m = Math.max(2, Math.ceil(total / 1.6));
  const pts: [number, number][] = [];
  for (let q = 0; q <= m; q++) {
    const d = (q / m) * total;
    let i = 1;
    while (i < cum.length - 1 && cum[i]! < d) i++;
    const f = (d - cum[i - 1]!) / Math.max(1e-6, cum[i]! - cum[i - 1]!);
    pts.push([t.pts[i - 1]![0] + (t.pts[i]![0] - t.pts[i - 1]![0]) * f, t.pts[i - 1]![1] + (t.pts[i]![1] - t.pts[i - 1]![1]) * f]);
  }
  for (let q = 0; q <= m; q++) {
    const pa = pts[Math.max(0, q - 1)]!;
    const pb = pts[Math.min(m, q + 1)]!;
    const dx = pb[0] - pa[0];
    const dz = pb[1] - pa[1];
    const l = Math.hypot(dx, dz) || 1;
    for (const side of [-1, 1]) {
      const x = pts[q]![0] + (-dz / l) * t.hw * side;
      const z = pts[q]![1] + (dx / l) * t.hw * side;
      a.pos.push(x, gy(x, z) + 0.035, z);
      a.uv.push(side * t.hw, (q / m) * total);
      a.p.push(seed, t.hw, total);
      a.k.push(K[t.kind]);
    }
  }
  for (let q = 0; q < m; q++) {
    const i = base + q * 2;
    a.idx.push(i, i + 1, i + 2, i + 1, i + 3, i + 2); // mặt hướng lên
  }
}

function toGeometry(a: Acc): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(a.pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(a.uv, 2));
  g.setAttribute('aP', new THREE.Float32BufferAttribute(a.p, 3));
  g.setAttribute('aK', new THREE.Float32BufferAttribute(a.k, 1));
  g.setAttribute(
    'normal',
    new THREE.Float32BufferAttribute(
      a.pos.map((_, i) => (i % 3 === 1 ? 1 : 0)),
      3,
    ),
  ); // decal dẹt: pháp tuyến hướng lên
  g.setIndex(a.idx);
  g.computeBoundingSphere();
  return g;
}

/** Hai mesh: `ground` (mọi mẫu trừ vũng) và `puddle`. */
export function buildGroundGeometry(list = vignettes()): Map<'ground' | 'puddle', { acc: Acc; tris: number }> {
  const out = new Map<'ground' | 'puddle', { acc: Acc; tris: number }>();
  const get = (k: 'ground' | 'puddle') => {
    let e = out.get(k);
    if (!e) out.set(k, (e = { acc: empty(), tris: 0 }));
    return e;
  };
  list.forEach((v, vi) => {
    v.trails.forEach((t, i) => trailGeo(get('ground').acc, t, hash01(vi, i, 3)));
    for (const p of v.patches)
      patchGeo(get(p.kind === 'puddle' ? 'puddle' : 'ground').acc, p, p.kind === 'puddle' ? 8 : 10, p.kind === 'puddle' ? 0 : K[p.kind]);
  });
  for (const e of out.values()) e.tris = e.acc.idx.length / 3;
  return out;
}

export function groundStats(): { meshes: number; tris: number; vignettes: number; patches: Record<string, number> } {
  const list = vignettes();
  const b = buildGroundGeometry(list);
  const patches: Record<string, number> = {};
  for (const v of list) for (const p of v.patches) patches[p.kind] = (patches[p.kind] ?? 0) + 1;
  let tris = 0;
  for (const e of b.values()) tris += e.tris;
  return { meshes: b.size, tris, vignettes: list.length, patches };
}

// ---------- vật liệu ----------

const aP = () => attribute('aP', 'vec3');
const aK = () => attribute('aK', 'float');
/** uv tròn (−1..1) quanh tâm mảnh. */
const cuv = () => uv().sub(0.5).mul(2);
const wp = () => positionWorld.xz;
/** 1 khi thuộc tính aK bằng n, 0 nếu không (aK là hằng trên cả mảnh). */
const isK = (n: number) => smoothstep(0.6, 0.4, aK().sub(n).abs());

function baseMat(): THREE.MeshStandardNodeMaterial {
  const m = new THREE.MeshStandardNodeMaterial({ transparent: true, depthWrite: false, roughness: 0.95, metalness: 0 });
  m.polygonOffset = true;
  m.polygonOffsetFactor = -3;
  m.polygonOffsetUnits = -3;
  return m;
}

/** Một shader cho mọi mẫu trên đất: chỉ mẫu trùng `aK` đóng góp. Mảnh nhỏ nên chi phí điểm ảnh không đáng kể (không phủ cả bản đồ). */
function groundMaterial(): THREE.MeshStandardNodeMaterial {
  const m = baseMat();
  const p = aP();
  const c = cuv();
  const r = length(c);
  const w = wp();
  const edgeN = vnoise(w.mul(0.8)).sub(0.5);

  // --- foot: vệt mòn + vệt bánh xe + dấu chân so le ---
  const x = uv().x;
  const s = uv().y;
  const hw = p.y;
  const worn = smoothstep(hw, hw.mul(0.35), x.abs()).mul(vnoise(w.mul(0.7)).mul(0.5).add(0.5));
  const ends = smoothstep(0, 3, s).mul(smoothstep(0, 3, p.z.sub(s)));
  const rut = smoothstep(0.14, 0.04, x.abs().sub(hw.mul(0.6)).abs())
    .mul(smoothstep(0.3, 0.55, vnoise(vec2(s.mul(0.45), x.sign().mul(3.7)))))
    .mul(worn);
  const cell = s.div(1.15);
  const i = floor(cell);
  const side = fract(i.mul(0.5)).sub(0.25).sign();
  const dx = x.sub(side.mul(0.2));
  const ym = fract(cell).sub(0.5).mul(1.15);
  const toe = dx.div(0.13).pow(2).add(ym.add(0.14).div(0.22).pow(2)).sqrt();
  const heel = dx.div(0.09).pow(2).add(ym.sub(0.2).div(0.11).pow(2)).sqrt();
  const print = max(smoothstep(1.0, 0.6, toe), smoothstep(1.0, 0.6, heel))
    .mul(smoothstep(hw.mul(0.9), hw.mul(0.5), x.abs()))
    .mul(smoothstep(0.3, 0.55, vnoise(vec2(i.mul(1.7), p.x.mul(9)))));
  const footA = clamp(worn.mul(0.9).add(print.mul(0.8)).add(rut.mul(0.6)), 0, 0.97).mul(ends);
  const footC = mix(mix(vec3(0.07, 0.048, 0.028), vec3(0.025, 0.017, 0.01), rut), vec3(0.015, 0.01, 0.006), print);

  // --- moss: rêu dọc dải (chân tường) ---
  const mossA = smoothstep(hw, hw.mul(0.1), x.abs().add(vnoise(w.mul(1.6)).sub(0.5).mul(hw)))
    .mul(vnoise(w.mul(0.45)).mul(0.6).add(0.55))
    .mul(ends)
    .clamp(0, 0.92);

  // --- crack: nứt mảnh ---
  const fade = smoothstep(1.0, 0.45, r.add(edgeN.mul(0.6)));
  const n1 = vnoise(w.mul(0.55));
  const n2 = vnoise(w.mul(1.4).add(7.3));
  const crackL = max(
    float(1).sub(smoothstep(0.0, 0.03, n1.sub(0.5).abs())),
    float(1)
      .sub(smoothstep(0.0, 0.022, n2.sub(0.5).abs()))
      .mul(0.75),
  ).mul(fade);
  const crackA = clamp(crackL.mul(0.85), 0, 0.9);

  // --- burst: nứt tỏa tia từ điểm chưởng đánh + vòng cháy ở tâm ---
  const ang = atan(c.y, c.x)
    .div(Math.PI * 2)
    .add(0.5);
  const wob = vnoise(vec2(r.mul(5), p.x.mul(30)))
    .sub(0.5)
    .mul(0.35);
  const lane = fract(ang.mul(9).add(wob)).sub(0.5).abs();
  const ray = smoothstep(0.09, 0.0, lane.mul(r.add(0.25)))
    .mul(smoothstep(0.08, 0.2, r))
    .mul(smoothstep(1.0, 0.5, r.add(edgeN.mul(0.4))));
  const scorch = smoothstep(0.22, 0.05, r).mul(0.8);
  const burstA = clamp(max(ray.mul(0.95), scorch), 0, 0.95);

  // --- root: rễ trồi tỏa nhánh + rêu bám quanh ---
  const wobR = vnoise(vec2(r.mul(3.2), p.x.mul(40)))
    .sub(0.5)
    .mul(0.28);
  const laneR = fract(ang.mul(7).add(wobR)).sub(0.5).abs();
  const widthR = float(0.3)
    .mul(smoothstep(1.0, 0.1, r))
    .add(0.03);
  const arm = smoothstep(widthR, widthR.mul(0.35), laneR.mul(r.mul(2.2).add(0.4)));
  const keepR = smoothstep(0.4, 0.55, vnoise(vec2(ang.mul(7).floor(), p.x.mul(13))));
  const rootA = arm
    .mul(keepR)
    .mul(smoothstep(1.0, 0.7, r))
    .mul(smoothstep(0.04, 0.14, r))
    .mul(0.92);
  const rootC = mix(vec3(0.06, 0.04, 0.025), vec3(0.2, 0.15, 0.09), smoothstep(0.0, widthR, laneR.mul(0.7)).oneMinus().mul(0.6));
  const rootMoss = smoothstep(0.85, 0.2, r.add(edgeN.mul(0.5)))
    .mul(smoothstep(0.4, 0.6, vnoise(w.mul(0.9))))
    .mul(0.7);

  // --- leaves: đống lá gom ---
  const leafDot = max(smoothstep(0.56, 0.63, vnoise(w.mul(3).add(vec2(3, 9)))), smoothstep(0.6, 0.66, vnoise(w.mul(4.4).add(vec2(8, 2)))));
  const leavesA = leafDot.mul(smoothstep(1.0, 0.25, r.add(edgeN.mul(0.5)))).mul(0.92);
  const tone = vnoise(w.mul(1.3));
  const leafC = mix(
    mix(vec3(0.15, 0.095, 0.04), vec3(0.22, 0.17, 0.07), smoothstep(0.35, 0.6, tone)),
    vec3(0.12, 0.18, 0.05),
    smoothstep(0.65, 0.85, tone),
  );

  // --- chips: đá vụn sáng ---
  const chipsA = smoothstep(0.7, 0.76, vnoise(w.mul(5.2).add(vec2(1, 5))))
    .mul(smoothstep(1.0, 0.35, r.add(edgeN.mul(0.5))))
    .mul(0.9);

  // --- seal: ấn trận khắc mờ (phát sáng nhẹ) ---
  const ring = (r0: number, wd: number) => smoothstep(wd, 0, r.sub(r0).abs());
  const rings = max(ring(0.93, 0.045), max(ring(0.64, 0.035), ring(0.32, 0.03)));
  const ticks = smoothstep(0.8, 0.86, fract(ang.mul(72))).mul(smoothstep(0.035, 0.0, r.sub(0.8).abs().sub(0.04)));
  const star = smoothstep(0.03, 0.0, fract(ang.mul(8)).sub(0.5).abs().mul(r))
    .mul(smoothstep(0.62, 0.34, r))
    .mul(smoothstep(0.1, 0.2, r));
  const erode = smoothstep(0.3, 0.62, vnoise(c.mul(4.2).add(p.x.mul(31))));
  const pulse = sin(time.mul(0.9).add(p.x.mul(20)))
    .mul(0.25)
    .add(0.75);
  const sealG = max(rings, max(ticks.mul(0.55), star))
    .mul(erode)
    .mul(smoothstep(1.0, 0.9, r))
    .mul(pulse);
  const sealC = mix(vec3(0.2, 0.55, 0.5), vec3(0.78, 0.5, 0.12), smoothstep(0.3, 0.95, r));

  const k0 = isK(K.foot);
  const k3 = isK(K.root);
  const k4 = isK(K.moss);
  const k5 = isK(K.leaves);
  const k6 = isK(K.chips);
  const k7 = isK(K.seal);
  const alpha = k0
    .mul(footA)
    .add(isK(K.crack).mul(crackA))
    .add(isK(K.burst).mul(burstA))
    .add(k3.mul(max(rootA, rootMoss)))
    .add(k4.mul(mossA))
    .add(k5.mul(leavesA))
    .add(k6.mul(chipsA))
    .add(k7.mul(clamp(sealG.mul(0.85), 0, 0.85)));
  // nứt/ấn trận: nền tối; mỗi mẫu khác ghi đè màu theo `aK`
  const col0 = mix(vec3(0.03, 0.03, 0.035), footC, k0);
  const col1 = mix(col0, mix(vec3(0.04, 0.1, 0.025), rootC, smoothstep(0.1, 0.5, rootA)), k3);
  const col2 = mix(col1, vec3(0.06, 0.17, 0.03), k4);
  const col3 = mix(col2, leafC, k5);
  const col = mix(col3, vec3(0.4, 0.41, 0.39), k6);
  m.colorNode = col;
  m.opacityNode = clamp(alpha, 0, 0.95);
  m.emissiveNode = sealC.mul(sealG).mul(k7).mul(1.5);
  return m;
}

/** Vũng nước: gần gương (roughness thấp) phản chiếu trời, viền loang, lá rơi nổi. */
function puddleMaterial(): THREE.MeshStandardNodeMaterial {
  const m = baseMat();
  m.roughness = 0.1;
  m.metalness = 0.1;
  const c = cuv();
  const w = wp();
  const d = length(c).add(vnoise(w.mul(1.1)).sub(0.5).mul(0.5));
  const mask = smoothstep(1.0, 0.78, d);
  const rip = sin(length(c).mul(18).sub(time.mul(1.2)))
    .mul(0.5)
    .add(0.5)
    .mul(smoothstep(0.5, 0.0, length(c)));
  const leaf = smoothstep(0.66, 0.72, vnoise(w.mul(3.6).add(vec2(5, 1)))).mul(smoothstep(0.85, 0.5, d));
  const water = mix(vec3(0.012, 0.02, 0.026), vec3(0.03, 0.045, 0.052), smoothstep(0.9, 0.3, d));
  m.colorNode = mix(water, vec3(0.22, 0.15, 0.06), leaf);
  m.emissiveNode = vec3(0.02, 0.03, 0.038).add(vec3(0.02).mul(rip)).mul(float(1).sub(leaf));
  m.opacityNode = max(mask.mul(0.72), leaf.mul(0.9));
  return m;
}

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
      this.geos.push(g);
      const mat = kind === 'puddle' ? puddleMaterial() : groundMaterial();
      this.mats.push(mat);
      const mesh = new THREE.Mesh(g, mat);
      mesh.name = `tc-ground-${kind}`;
      mesh.renderOrder = kind === 'puddle' ? 4 : 1;
      mesh.frustumCulled = false; // vài tiểu cảnh rải khắp sân: một mesh/loại, rẻ
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
