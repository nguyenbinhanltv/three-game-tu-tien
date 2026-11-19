import * as THREE from 'three/webgpu';
import { attribute, clamp, float, mix, positionWorld, pow, sin, smoothstep, time, uv, vec2, vec3 } from 'three/tsl';
import { hash01 } from '@dtl/shared';
import { markBloom } from '../../render/post';
import { vnoise } from '../../render/vfx/common';
import type { RiftPt } from './bacHoangArt';

/**
 * Điểm nhấn Bắc Hoang (MAP-5 PR2, phong cách B), toàn bộ dựng bằng code, không asset ngoài:
 *  - **Xác cự thú cổ đại**: bộ xương khổng lồ nằm nửa chìm trong tuyết (cột sống, xương sườn vòm, sọ có sừng và răng); 1 `InstancedMesh` = 1 draw call;
 *  - **Cột tà trận**: trụ đá đen sáu cạnh có vòng phù văn tím phát sáng quanh thân (2 draw call), đặt ở các bia trận Trấn Giới Đài;
 *  - **Tinh thể băng** dọc mép khe: mảnh băng trong, nhám thấp, ánh tím (1 draw call);
 *  - **Vết nứt dị vực**: mạng vết rạn phát sáng tím tỏa từ khe lên mặt tuyết, bám địa hình (1 draw call), đậm ở gần khe và tan dần.
 * Chỉ để nhìn, không va chạm (không đổi `shared/level.ts`). Mọi vị trí tất định (`hash01`).
 */

/** Gộp nhiều hình (đã biến đổi) thành một BufferGeometry không chỉ mục, có `normal`. */
function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const pos: number[] = [];
  const nrm: number[] = [];
  for (const p of parts) {
    const g = p.index ? p.toNonIndexed() : p;
    for (const v of g.getAttribute('position').array) pos.push(v);
    for (const v of g.getAttribute('normal').array) nrm.push(v);
    if (g !== p) g.dispose();
    p.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  out.computeBoundingSphere();
  return out;
}

const place = (
  g: THREE.BufferGeometry,
  x: number,
  y: number,
  z: number,
  sx = 1,
  sy = 1,
  sz = 1,
  rx = 0,
  ry = 0,
  rz = 0,
): THREE.BufferGeometry => {
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
    new THREE.Vector3(sx, sy, sz),
  );
  g.applyMatrix4(m);
  return g;
};

const tube = (pts: THREE.Vector3[], r0: number, r1: number, segs = 14, sides = 7): THREE.BufferGeometry => {
  // TubeGeometry bán kính đều: thon dần bằng cách co từng vòng quanh tâm đường cong.
  const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), segs, 1, sides, false);
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  const curve = new THREE.CatmullRomCurve3(pts);
  const ring = sides + 1;
  const c = new THREE.Vector3();
  const v = new THREE.Vector3();
  for (let i = 0; i <= segs; i++) {
    curve.getPointAt(i / segs, c);
    const r = r0 + (r1 - r0) * (i / segs);
    for (let j = 0; j < ring; j++) {
      const k = i * ring + j;
      v.fromBufferAttribute(pos, k).sub(c).multiplyScalar(r).add(c);
      pos.setXYZ(k, v.x, v.y, v.z);
    }
  }
  g.computeVertexNormals();
  return g;
};

/** Bộ xương dài ~46 m dọc trục x, đầu ở +x: cột sống cong, 10 cặp xương sườn vòm, đuôi thon, sọ có sừng + răng. Gốc ở mặt đất (xương chìm nhẹ). */
export function beastSkeleton(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const spineY = (t: number): number => 3.4 + Math.sin(t * Math.PI) * 1.8 - t * 1.2; // t 0 (đuôi) → 1 (cổ)
  const N = 26;
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1);
    const x = -22 + t * 34;
    const r = 0.55 + Math.sin(t * Math.PI) * 0.45;
    // đốt sống: cầu dẹt + gai thần kinh hướng lên
    parts.push(place(new THREE.SphereGeometry(r, 9, 7), x, spineY(t), 0, 1.15, 0.8, 0.95));
    parts.push(
      place(
        new THREE.ConeGeometry(r * 0.35, 1.4 + Math.sin(t * Math.PI) * 1.2, 5),
        x,
        spineY(t) + r * 1.1 + 0.5,
        0,
        1,
        1,
        0.6,
        0,
        0,
        -0.15,
      ),
    );
  }
  // đuôi thon: các đốt nhỏ dần nằm sát đất
  for (let i = 0; i < 10; i++) {
    const t = i / 9;
    parts.push(
      place(new THREE.SphereGeometry(0.5 * (1 - t * 0.75), 7, 6), -22 - i * 1.2, 3.3 - i * 0.28, Math.sin(i * 0.8) * 0.8, 1.2, 0.8, 0.9),
    );
  }
  // xương sườn: vòm từ cột sống xuống đất, hai bên, thấp dần về hai đầu
  for (let k = 0; k < 10; k++) {
    const t = 0.22 + (k / 9) * 0.55;
    const x = -22 + t * 34;
    const h = 5.2 + Math.sin((k / 9) * Math.PI) * 4.2;
    const w = 3.4 + Math.sin((k / 9) * Math.PI) * 2.6;
    for (const side of [-1, 1]) {
      // sườn bên +1 đổ nghiêng ra ngoài, bên −1 gãy đổ sụp xuống (xác cổ, không còn nguyên vẹn)
      const broken = side < 0 && k % 3 === 1;
      const y0 = spineY(t);
      const pts = broken
        ? [
            new THREE.Vector3(x, y0, 0.3 * side),
            new THREE.Vector3(x - 0.2, y0 + h * 0.5, side * w * 0.5),
            new THREE.Vector3(x - 1.3, y0 + h * 0.45, side * w * 1.35),
          ]
        : [
            new THREE.Vector3(x, y0, 0.3 * side),
            new THREE.Vector3(x + 0.2, y0 + h * 0.45, side * w * 0.8),
            new THREE.Vector3(x + 0.4, y0 + h * 0.2, side * w * 1.35),
            new THREE.Vector3(x + 0.6, y0 - h * 0.35, side * w * 1.55),
          ];
      parts.push(tube(pts, 0.42, 0.12, 12, 7));
    }
  }
  // sọ: ellipsoid dài, hốc mắt sẫm, hàm, răng, hai sừng cong
  const hx = 14.5;
  const hy = 3.6;
  parts.push(place(new THREE.SphereGeometry(1, 14, 10), hx + 2.2, hy, 0, 3.6, 1.7, 1.9));
  parts.push(place(new THREE.SphereGeometry(1, 12, 8), hx + 5.4, hy - 0.5, 0, 2.4, 1.0, 1.15));
  parts.push(place(new THREE.SphereGeometry(1, 12, 8), hx + 4.2, hy - 1.7, 0, 3.1, 0.55, 1.0, 0, 0, -0.08)); // hàm dưới, hơi há
  for (let i = 0; i < 9; i++) {
    const x = hx + 2.6 + i * 0.7;
    for (const side of [-1, 1]) {
      parts.push(place(new THREE.ConeGeometry(0.16, 0.7, 5), x, hy - 1.15, side * 0.85, 1, 1, 1, Math.PI, 0, 0));
      parts.push(place(new THREE.ConeGeometry(0.14, 0.6, 5), x + 0.2, hy - 1.3, side * 0.8, 1, 1, 1, 0, 0, 0));
    }
  }
  for (const side of [-1, 1]) {
    parts.push(place(new THREE.SphereGeometry(0.62, 8, 6), hx + 3.6, hy + 0.35, side * 1.35, 1, 1, 0.6)); // vành hốc mắt
    parts.push(
      tube(
        [
          new THREE.Vector3(hx + 0.8, hy + 1.2, side * 1.0),
          new THREE.Vector3(hx - 0.8, hy + 3.2, side * 2.0),
          new THREE.Vector3(hx - 3.2, hy + 4.6, side * 2.6),
          new THREE.Vector3(hx - 5.2, hy + 4.4, side * 3.2),
        ],
        0.55,
        0.05,
        14,
        7,
      ),
    );
  }
  // vài mảnh xương rời quanh đó
  for (let i = 0; i < 7; i++) {
    const a = hash01(i, 5, 71) * Math.PI * 2;
    const d = 5 + hash01(i, 6, 73) * 9;
    parts.push(
      place(
        new THREE.CapsuleGeometry(0.22 + hash01(i, 7, 75) * 0.2, 1.4 + hash01(i, 8, 77) * 2.2, 3, 7),
        Math.cos(a) * d - 3,
        0.3,
        Math.sin(a) * d,
        1,
        1,
        1,
        Math.PI / 2,
        hash01(i, 9, 79) * 3,
        0,
      ),
    );
  }
  return merge(parts);
}

export interface BhSpot {
  x: number;
  z: number;
  yaw: number;
  s: number;
  sink?: number;
}

/** Xác cự thú: ba cá thể tại vùng trống (xa trạm, trụ truyền tống, đường đi); cá thể gần trạm là điểm "wow" đầu tiên khi nhìn về bắc. */
export const BEAST_SPOTS: BhSpot[] = [
  { x: 1060, z: 1330, yaw: 0.35, s: 1.7, sink: 1.8 },
  { x: 1190, z: 1110, yaw: 2.6, s: 1.4, sink: 1.5 },
  { x: 850, z: 640, yaw: -0.5, s: 2.0, sink: 2.2 },
  { x: 1215, z: 380, yaw: 1.4, s: 1.5, sink: 1.6 },
];

/** Cột tà trận: tọa độ các bia trận (`tran_gioi_bia_*` trong terrain.json). */
export const PILLAR_SPOTS: { x: number; z: number; s: number }[] = [
  { x: 1324, z: 724, s: 1 },
  { x: 1434, z: 774, s: 1 },
  { x: 724, z: 724, s: 1 },
  { x: 614, z: 774, s: 1 },
  { x: 1024, z: 494, s: 1.3 },
  { x: 1084, z: 554, s: 1.1 },
];

function pillarStoneGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  parts.push(place(new THREE.CylinderGeometry(0.95, 1.5, 8.5, 6, 1), 0, 4.25, 0));
  parts.push(place(new THREE.CylinderGeometry(0.0, 0.95, 1.8, 6, 1), 0, 9.4, 0, 1, 1, 1));
  parts.push(place(new THREE.CylinderGeometry(1.9, 2.2, 0.8, 6), 0, 0.2, 0)); // chân đài
  parts.push(place(new THREE.CylinderGeometry(1.6, 1.9, 0.5, 6), 0, 0.85, 0));
  // mảnh đá vỡ trôi quanh đỉnh
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.4;
    parts.push(
      place(
        new THREE.OctahedronGeometry(0.28 + hash01(i, 3, 5) * 0.2),
        Math.cos(a) * 1.9,
        5 + hash01(i, 4, 7) * 5,
        Math.sin(a) * 1.9,
        1,
        1.5,
        1,
        a,
        a,
        0,
      ),
    );
  }
  return merge(parts);
}

function pillarRuneGeometry(): THREE.BufferGeometry {
  // Ba vòng phù văn (ống hở) quanh thân + vòng trận trên mặt đất; uv.x quanh vòng, uv.y dọc.
  const g: THREE.BufferGeometry[] = [];
  for (const [y, r0, r1, h] of [
    [2.2, 1.42, 1.5, 0.9],
    [4.6, 1.22, 1.3, 1.1],
    [7.0, 1.02, 1.1, 0.8],
  ] as const) {
    g.push(place(new THREE.CylinderGeometry(r0, r1, h, 24, 1, true), 0, y, 0));
  }
  return g.reduce((a, b) => {
    // gộp có uv
    const m = new THREE.BufferGeometry();
    const pa = a.toNonIndexed();
    const pb = b.toNonIndexed();
    for (const name of ['position', 'uv'] as const) {
      const A = pa.getAttribute(name).array as ArrayLike<number>;
      const B = pb.getAttribute(name).array as ArrayLike<number>;
      m.setAttribute(name, new THREE.Float32BufferAttribute(Array.from(A).concat(Array.from(B)), name === 'uv' ? 2 : 3));
    }
    return m;
  });
}

function runeMaterial(): THREE.MeshBasicNodeMaterial {
  const mat = new THREE.MeshBasicNodeMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    fog: false,
  });
  const a = uv().x;
  const v = uv().y;
  // dải phù văn: ô chữ vuông xen kẽ theo vòng, chớp chậm lệch pha theo vị trí thế giới
  const cell = vnoise(vec2(a.mul(18), v.mul(3.2).add(positionWorld.x.mul(0.01))));
  const glyph = smoothstep(0.42, 0.55, cell)
    .mul(smoothstep(0.0, 0.18, v))
    .mul(smoothstep(1.0, 0.82, v));
  const pulse = sin(time.mul(1.4).add(positionWorld.x.mul(0.07).add(positionWorld.z.mul(0.05))))
    .mul(0.25)
    .add(0.75);
  mat.colorNode = vec3(0.6, 0.2, 1.6).mul(glyph.mul(1.2).add(0.12)).mul(pulse);
  mat.opacityNode = clamp(glyph.mul(0.95).add(0.18), 0, 1);
  return mat;
}

function crystalGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 4; i++) {
    const a = i * 1.7 + 0.3;
    const h = 1.2 + hash01(i, 1, 11) * 1.4;
    parts.push(
      place(
        new THREE.ConeGeometry(0.28 + hash01(i, 2, 13) * 0.16, h, 5, 1),
        Math.cos(a) * 0.35,
        h * 0.5 - 0.1,
        Math.sin(a) * 0.35,
        1,
        1,
        1,
        Math.sin(a) * 0.35,
        0,
        Math.cos(a) * 0.35,
      ),
    );
  }
  parts.push(place(new THREE.ConeGeometry(0.4, 2.8, 5, 1), 0, 1.3, 0));
  return merge(parts);
}

/** Mạng vết rạn tỏa từ khe: đa giác dải (ribbon) bám địa hình; `aNear` 1 ở sát khe → 0 ở đầu vết nứt (mờ dần), `aEdge` thon hai mép. */
export function crackGeometry(path: readonly RiftPt[], heightAt: (x: number, z: number) => number, seed = 4242): THREE.BufferGeometry {
  const pos: number[] = [];
  const uvs: number[] = [];
  const near: number[] = [];
  const edge: number[] = [];
  const idx: number[] = [];
  let vi = 0;
  const addPolyline = (pts: { x: number; z: number }[], w0: number, n0: number): void => {
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i]!;
      const q = pts[Math.min(i + 1, pts.length - 1)]!;
      const o = pts[Math.max(i - 1, 0)]!;
      let dx = q.x - o.x;
      let dz = q.z - o.z;
      const l = Math.hypot(dx, dz) || 1;
      dx /= l;
      dz /= l;
      const t = i / Math.max(1, pts.length - 1);
      const w = w0 * (1 - t * 0.85);
      for (const side of [-1, 1]) {
        const x = p.x - dz * w * side;
        const z = p.z + dx * w * side;
        pos.push(x, heightAt(x, z) + 0.14, z);
        uvs.push(side * 0.5 + 0.5, t);
        near.push(n0 * (1 - t * 0.9));
        edge.push(1 - t * 0.6);
      }
      if (i > 0) {
        const a = vi - 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
      vi += 2;
    }
  };
  const stride = 3;
  for (let i = 0; i + 1 < path.length; i++) {
    const a = path[i]!;
    const b = path[i + 1]!;
    for (let k = 0; k < stride; k++) {
      for (const side of [-1, 1]) {
        const u = (k + hash01(i, k, seed)) / stride;
        const cx = a.x + (b.x - a.x) * u;
        const cz = a.z + (b.z - a.z) * u;
        const tx = b.x - a.x;
        const tz = b.z - a.z;
        const tl = Math.hypot(tx, tz) || 1;
        const nx = (-tz / tl) * side;
        const nz = (tx / tl) * side;
        // xuất phát cách tâm khe ~14–22 m (mép khe), đi ra ngoài, rẽ ngẫu nhiên
        let x = cx + nx * (14 + hash01(i, k + 9, seed) * 8);
        let z = cz + nz * (14 + hash01(i, k + 9, seed) * 8);
        let ang = Math.atan2(nz, nx) + (hash01(i, k + 17, seed + side) - 0.5) * 1.2;
        const len = 10 + Math.floor(hash01(i, k + 23, seed) * 14);
        const pts: { x: number; z: number }[] = [{ x, z }];
        for (let s = 0; s < len; s++) {
          ang += (hash01(i * 7 + s, k, seed + 5 + side) - 0.5) * 0.9;
          x += Math.cos(ang) * 3.2;
          z += Math.sin(ang) * 3.2;
          pts.push({ x, z });
          // nhánh phụ
          if (s === 4 && hash01(i, k, seed + 31) > 0.45) {
            const b2: { x: number; z: number }[] = [{ x, z }];
            let a2 = ang + (hash01(i, k + 3, seed + 33) > 0.5 ? 0.9 : -0.9);
            let x2 = x;
            let z2 = z;
            for (let q = 0; q < 5; q++) {
              a2 += (hash01(i * 3 + q, k, seed + 35) - 0.5) * 0.8;
              x2 += Math.cos(a2) * 3;
              z2 += Math.sin(a2) * 3;
              b2.push({ x: x2, z: z2 });
            }
            addPolyline(b2, 0.18, 0.6);
          }
        }
        addPolyline(pts, 0.34 + hash01(i, k, seed + 41) * 0.2, 1);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setAttribute('aNear', new THREE.Float32BufferAttribute(near, 1));
  g.setAttribute('aEdge', new THREE.Float32BufferAttribute(edge, 1));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

function crackMaterial(): THREE.MeshBasicNodeMaterial {
  const mat = new THREE.MeshBasicNodeMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    fog: false,
  });
  mat.polygonOffset = true;
  mat.polygonOffsetFactor = -2;
  mat.polygonOffsetUnits = -2;
  const across = uv().x.mul(2).sub(1).abs();
  const core = pow(float(1).sub(across), 1.6); // lõi sáng giữa vết, mép tan
  const flow = vnoise(vec2(uv().y.mul(9).sub(time.mul(0.35)), positionWorld.x.mul(0.05).add(positionWorld.z.mul(0.05))));
  const pulse = sin(time.mul(1.1).add(positionWorld.x.mul(0.03)))
    .mul(0.18)
    .add(0.82);
  const k = core
    .mul(flow.mul(0.7).add(0.5))
    .mul(pulse)
    .mul(attribute('aNear', 'float').mul(0.75).add(0.25))
    .mul(attribute('aEdge', 'float'));
  mat.colorNode = mix(vec3(0.45, 0.1, 1.2), vec3(1.2, 0.8, 1.9), core.mul(core)).mul(k.mul(1.3));
  mat.opacityNode = clamp(k.mul(1.4), 0, 1);
  return mat;
}

export class BhWonders {
  readonly group = new THREE.Group();
  private disposables: { dispose(): void }[] = [];

  constructor(path: readonly RiftPt[], heightAt: (x: number, z: number) => number, opts: { detail: boolean }) {
    this.group.name = 'bh-wonders';
    const own = <T extends { dispose(): void }>(o: T): T => {
      this.disposables.push(o);
      return o;
    };
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const col = new THREE.Color();

    // Xác cự thú
    const boneMat = own(new THREE.MeshStandardNodeMaterial({ color: 0xcfc6b4, roughness: 0.82, metalness: 0 }));
    const boneGeo = own(beastSkeleton());
    const bones = new THREE.InstancedMesh(boneGeo, boneMat, BEAST_SPOTS.length);
    bones.name = 'bh-beast-bones';
    BEAST_SPOTS.forEach((s, i) => {
      q.setFromEuler(e.set(0, s.yaw, (hash01(i, 1, 3) - 0.5) * 0.12));
      m.compose(new THREE.Vector3(s.x, heightAt(s.x, s.z) - (s.sink ?? 1), s.z), q, new THREE.Vector3(s.s, s.s, s.s));
      bones.setMatrixAt(i, m);
      col.setRGB(0.78, 0.76, 0.82).multiplyScalar(0.85 + hash01(i, 2, 5) * 0.3);
      bones.setColorAt(i, col);
    });
    bones.instanceMatrix.needsUpdate = true;
    if (bones.instanceColor) bones.instanceColor.needsUpdate = true;
    bones.computeBoundingSphere();
    bones.castShadow = true;
    bones.receiveShadow = true;
    this.group.add(bones);

    // Cột tà trận
    const stoneMat = own(new THREE.MeshStandardNodeMaterial({ color: 0x2b2735, roughness: 0.62, metalness: 0.15 }));
    const stone = new THREE.InstancedMesh(own(pillarStoneGeometry()), stoneMat, PILLAR_SPOTS.length);
    stone.name = 'bh-pillar-stone';
    const runeMat = own(runeMaterial());
    markBloom(runeMat, 0.5);
    const runes = new THREE.InstancedMesh(own(pillarRuneGeometry()), runeMat, PILLAR_SPOTS.length);
    runes.name = 'bh-pillar-runes';
    runes.frustumCulled = false;
    PILLAR_SPOTS.forEach((s, i) => {
      q.setFromEuler(e.set((hash01(i, 4, 7) - 0.5) * 0.08, hash01(i, 5, 9) * 6.28, (hash01(i, 6, 11) - 0.5) * 0.08));
      m.compose(new THREE.Vector3(s.x, heightAt(s.x, s.z), s.z), q, new THREE.Vector3(s.s, s.s, s.s));
      stone.setMatrixAt(i, m);
      runes.setMatrixAt(i, m);
    });
    stone.instanceMatrix.needsUpdate = runes.instanceMatrix.needsUpdate = true;
    stone.computeBoundingSphere();
    stone.castShadow = true;
    this.group.add(stone, runes);

    // Tinh thể băng dọc mép khe
    if (path.length > 1) {
      const iceMat = own(
        new THREE.MeshStandardNodeMaterial({
          color: 0xbfd6ff,
          roughness: 0.12,
          metalness: 0.0,
          emissive: new THREE.Color(0x3a1a78),
          emissiveIntensity: 0.9,
        }),
      );
      const spots: { x: number; z: number; s: number; yaw: number }[] = [];
      const per = opts.detail ? 7 : 3;
      for (let i = 0; i + 1 < path.length; i++) {
        const a = path[i]!;
        const b = path[i + 1]!;
        const tx = b.x - a.x;
        const tz = b.z - a.z;
        const tl = Math.hypot(tx, tz) || 1;
        for (let k = 0; k < per; k++) {
          const side = hash01(i, k, 61) > 0.5 ? 1 : -1;
          const u = hash01(i, k, 63);
          const off = 15 + hash01(i, k, 65) * 9;
          spots.push({
            x: a.x + tx * u + (-tz / tl) * side * off,
            z: a.z + tz * u + (tx / tl) * side * off,
            s: 0.8 + hash01(i, k, 67) * 1.6,
            yaw: hash01(i, k, 69) * 6.28,
          });
        }
      }
      const ice = new THREE.InstancedMesh(own(crystalGeometry()), iceMat, spots.length);
      ice.name = 'bh-ice';
      spots.forEach((s, i) => {
        q.setFromEuler(e.set(0, s.yaw, 0));
        m.compose(
          new THREE.Vector3(s.x, heightAt(s.x, s.z) - 0.1, s.z),
          q,
          new THREE.Vector3(s.s, s.s * (0.9 + hash01(i, 8, 3) * 0.8), s.s),
        );
        ice.setMatrixAt(i, m);
      });
      ice.instanceMatrix.needsUpdate = true;
      ice.computeBoundingSphere();
      this.group.add(ice);

      // Vết nứt dị vực
      const cm = own(crackMaterial());
      markBloom(cm, 0.4);
      const cracks = new THREE.Mesh(own(crackGeometry(path, heightAt)), cm);
      cracks.name = 'bh-cracks';
      cracks.frustumCulled = false;
      cracks.renderOrder = 4;
      this.group.add(cracks);
    }
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
    for (const c of this.group.children) (c as THREE.InstancedMesh).dispose?.();
  }
}
