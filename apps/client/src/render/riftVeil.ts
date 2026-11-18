import * as THREE from 'three/webgpu';
import { attribute, clamp, float, length, mix, positionView, positionWorld, pow, sin, smoothstep, time, uv, vec2, vec3 } from 'three/tsl';
import { smoothstep as sstep } from '@dtl/shared';
import { markBloom } from './post';
import { vnoise } from './vfx/common';

/**
 * Vệt nứt Giới Khích (DV-3I): thay mảng sương nón cũ bằng ba lớp phát sáng bám đường tâm khe, đọc được từ xa như một vết rạn trên trời.
 *  - **Màn dọc** (`curtain`): một tấm cao ~260 m dựng dọc khe, sáng than hồng ở chân, ngả tím thực lên cao, vệt dọc trôi lên;
 *  - **Sườn chéo** (`ribs`): các tấm ngang khe cách nhau 30 m (thấy được khi nhìn dọc khe từ trạm, lúc màn dọc chỉ còn là một đường);
 *  - **Lòng khe** (`floor`): dải phủ đáy khe, mạng gân sáng như vỉa than, mép tan vào đất.
 * Mỗi lớp một draw call (3 tổng), một material TSL, cộng sáng, không ghi độ sâu, bỏ sương (phải thấy xuyên sương). Màu theo `rift_ember`/`rift_violet`
 * (assets/palette.json), đỉnh HDR ≤ 1,6 mỗi kênh. Đứng gần thì mờ đi để không bị bức tường sáng che màn hình.
 */
interface RiftVeilPt {
  x: number;
  z: number;
  y: number;
}

export interface RiftVeil {
  group: THREE.Group;
  dispose(): void;
}

const RIFT_VEIL_HEIGHT = 260;
const EMBER = [0.552, 0.054, 0.024] as const; // rift_ember #C4412B → tuyến tính
const VIOLET = [0.147, 0.05, 0.352] as const; // rift_violet #6B3FA0 → tuyến tính

/** Tấm lưới dựng theo đường gấp khúc: cột theo điểm, hàng theo chiều cao `rows` (0..1, thưa ở chân). uv.x = dài dọc tấm (đơn vị 50 m), uv.y = độ cao 0..1. */
function sheet(pts: readonly { x: number; y: number; z: number }[], baseY: (i: number) => number, height: number, rows: readonly number[], edge: (i: number, n: number) => number): THREE.BufferGeometry {
  const pos: number[] = [];
  const uvs: number[] = [];
  const edges: number[] = [];
  const idx: number[] = [];
  let acc = 0;
  for (let i = 0; i < pts.length; i++) {
    if (i) acc += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
    for (const v of rows) {
      pos.push(pts[i].x, baseY(i) + v * height, pts[i].z);
      uvs.push(acc / 50, v);
      edges.push(edge(i, pts.length));
    }
  }
  const R = rows.length;
  for (let i = 0; i + 1 < pts.length; i++)
    for (let j = 0; j + 1 < R; j++) {
      const a = i * R + j;
      const b = (i + 1) * R + j;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setAttribute('aEdge', new THREE.Float32BufferAttribute(edges, 1));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

/** Màn/ sườn chéo: sáng than hồng ở chân, tím thực lên cao, vệt dọc trôi lên, mép tan. */
function veilMaterial(strength: number): THREE.MeshBasicNodeMaterial {
  const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
  const s = uv().x;
  const v = uv().y;
  const sway = vnoise(vec2(s.mul(2.2), time.mul(0.12)));
  const streak = vnoise(vec2(s.mul(9).add(sway.mul(3)), v.mul(1.6).sub(time.mul(0.32))));
  const fine = vnoise(vec2(s.mul(24), v.mul(4.5).sub(time.mul(0.75))));
  const body = pow(float(1).sub(v), 1.55);
  const flick = sin(time.mul(1.7).add(s.mul(5))).mul(0.08).add(0.92);
  const inten = clamp(body.mul(streak.mul(0.95).add(0.25)).add(fine.sub(0.55).mul(0.5).mul(float(1).sub(v))), 0, 1.2).mul(flick);
  const hot = smoothstep(0.3, 0.0, v);
  const col = mix(vec3(EMBER[0] * 3, EMBER[1] * 3, EMBER[2] * 3), vec3(VIOLET[0] * 4.4, VIOLET[1] * 4.4, VIOLET[2] * 4.4), smoothstep(0.04, 0.6, v)).add(vec3(0.25, 0.1, 0.04).mul(hot));
  const dist = length(positionView);
  const near = mix(float(0.2), float(1), smoothstep(10, 90, dist));
  const rootFade = smoothstep(0, 0.025, v);
  mat.colorNode = col;
  mat.opacityNode = clamp(inten.mul(attribute('aEdge', 'float')).mul(rootFade).mul(near).mul(strength), 0, 1);
  return mat;
}

/** Lòng khe: dải phủ đáy, gân sáng như vỉa than (nhiễu hai tầng), mép tan, ngả tím về phía bắc. */
function floorMaterial(): THREE.MeshBasicNodeMaterial {
  const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
  const across = uv().x.mul(2).sub(1); // −1..1 ngang khe
  const p = positionWorld.xz;
  const n1 = vnoise(p.mul(0.11).add(vec2(time.mul(0.02), 0)));
  const n2 = vnoise(p.mul(0.34).add(vec2(0, time.mul(-0.03))));
  const vein1 = smoothstep(0.09, 0.0, n1.sub(0.5).abs());
  const vein2 = smoothstep(0.07, 0.0, n2.sub(0.5).abs());
  const pulse = sin(time.mul(1.3).add(n1.mul(6.3))).mul(0.18).add(0.82);
  const glow = pow(float(1).sub(across.abs()), 1.6);
  const inten = glow.mul(vein1.mul(1.0).add(vein2.mul(0.6)).add(0.22)).mul(pulse);
  const north = smoothstep(2048 / 2 - 40, 2048 / 2 - 600, positionWorld.z);
  const col = mix(vec3(EMBER[0] * 3.2, EMBER[1] * 3.2, EMBER[2] * 3.2), vec3(VIOLET[0] * 4.2, VIOLET[1] * 4.2, VIOLET[2] * 4.2), north.mul(0.55));
  const dist = length(positionView);
  const near = mix(float(0.55), float(1), smoothstep(8, 70, dist));
  mat.colorNode = col;
  mat.opacityNode = clamp(inten.mul(near).mul(1.1), 0, 1);
  return mat;
}

/** Dựng ba lớp. `heightAt` lấy mặt đất thật để dải lòng khe nằm sát đáy (khe có nếp gấp ±3 m). */
export function buildRiftVeil(path: readonly RiftVeilPt[], heightAt: (x: number, z: number) => number): RiftVeil {
  const group = new THREE.Group();
  group.name = 'rift-veil';
  const geos: THREE.BufferGeometry[] = [];
  const mats: THREE.Material[] = [];
  const add = (g: THREE.BufferGeometry, m: THREE.Material, bloom: number, order: number): void => {
    geos.push(g);
    mats.push(m);
    const mesh = new THREE.Mesh(g, m);
    mesh.frustumCulled = false;
    mesh.renderOrder = order;
    if (bloom > 0) markBloom(m, bloom);
    group.add(mesh);
  };
  if (path.length < 2) return { group, dispose() {} };

  // Màn dọc: mép tan ở hai đầu khe.
  const fade = (i: number, n: number): number => sstep(0, 1.6, Math.min(i, n - 1 - i));
  add(sheet(path, (i) => path[i].y - 4, RIFT_VEIL_HEIGHT, [0, 0.015, 0.06, 0.16, 0.32, 0.55, 0.8, 1], fade), veilMaterial(0.8), 0.45, 5);

  // Sườn chéo: mỗi 30 m một tấm ngang khe (±30 m), nối thành một lưới (tổng ≤ 14 tấm × 5 cột): ghép bằng một BufferGeometry gộp.
  const ribPos: number[] = [];
  const ribUv: number[] = [];
  const ribEdge: number[] = [];
  const ribIdx: number[] = [];
  const rows = [0, 0.02, 0.1, 0.28, 0.55, 0.85];
  const COLS = 5;
  const RIB_H = 150;
  let vtx = 0;
  for (let i = 0; i < path.length; i += 1) {
    const a = path[Math.max(0, i - 1)];
    const b = path[Math.min(path.length - 1, i + 1)];
    let tx = b.x - a.x;
    let tz = b.z - a.z;
    const tl = Math.hypot(tx, tz) || 1;
    tx /= tl;
    tz /= tl;
    const nx = -tz;
    const nz = tx;
    for (let c = 0; c < COLS; c++) {
      const k = (c / (COLS - 1)) * 2 - 1;
      const x = path[i].x + nx * k * 32;
      const z = path[i].z + nz * k * 32;
      for (const v of rows) {
        ribPos.push(x, path[i].y - 4 + v * RIB_H, z);
        ribUv.push((c / (COLS - 1)) * 1.2 + i * 0.37, v);
        ribEdge.push(1 - Math.pow(Math.abs(k), 1.4));
      }
    }
    for (let c = 0; c + 1 < COLS; c++)
      for (let j = 0; j + 1 < rows.length; j++) {
        const a0 = vtx + c * rows.length + j;
        const b0 = vtx + (c + 1) * rows.length + j;
        ribIdx.push(a0, b0, a0 + 1, a0 + 1, b0, b0 + 1);
      }
    vtx += COLS * rows.length;
  }
  const rg = new THREE.BufferGeometry();
  rg.setAttribute('position', new THREE.Float32BufferAttribute(ribPos, 3));
  rg.setAttribute('uv', new THREE.Float32BufferAttribute(ribUv, 2));
  rg.setAttribute('aEdge', new THREE.Float32BufferAttribute(ribEdge, 1));
  rg.setIndex(ribIdx);
  rg.computeBoundingSphere();
  add(rg, veilMaterial(0.5), 0.35, 4);

  // Lòng khe: lưới dọc khe, 7 cột ngang (±16 m), 4 hàng mỗi đoạn 30 m; y theo mặt đất thật.
  const fp: number[] = [];
  const fu: number[] = [];
  const fi: number[] = [];
  const FC = 7;
  const STEPS = 3;
  const pts: { x: number; z: number; nx: number; nz: number }[] = [];
  for (let i = 0; i + 1 < path.length; i++)
    for (let s = 0; s < STEPS; s++) {
      const t = s / STEPS;
      const x = path[i].x + (path[i + 1].x - path[i].x) * t;
      const z = path[i].z + (path[i + 1].z - path[i].z) * t;
      const tx = path[i + 1].x - path[i].x;
      const tz = path[i + 1].z - path[i].z;
      const tl = Math.hypot(tx, tz) || 1;
      pts.push({ x, z, nx: -tz / tl, nz: tx / tl });
    }
  const last = path[path.length - 1];
  pts.push({ x: last.x, z: last.z, nx: pts[pts.length - 1].nx, nz: pts[pts.length - 1].nz });
  for (const q of pts)
    for (let c = 0; c < FC; c++) {
      const k = (c / (FC - 1)) * 2 - 1;
      const x = q.x + q.nx * k * 17;
      const z = q.z + q.nz * k * 17;
      fp.push(x, heightAt(x, z) + 0.45, z);
      fu.push(c / (FC - 1), 0);
    }
  for (let r = 0; r + 1 < pts.length; r++)
    for (let c = 0; c + 1 < FC; c++) {
      const a = r * FC + c;
      const b = a + FC;
      fi.push(a, b, a + 1, a + 1, b, b + 1);
    }
  const fg = new THREE.BufferGeometry();
  fg.setAttribute('position', new THREE.Float32BufferAttribute(fp, 3));
  fg.setAttribute('uv', new THREE.Float32BufferAttribute(fu, 2));
  fg.setIndex(fi);
  fg.computeBoundingSphere();
  add(fg, floorMaterial(), 0.5, 3);

  return {
    group,
    dispose() {
      for (const g of geos) g.dispose();
      for (const m of mats) m.dispose();
    },
  };
}
