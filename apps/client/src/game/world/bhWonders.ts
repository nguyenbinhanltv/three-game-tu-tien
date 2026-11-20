import * as THREE from 'three/webgpu';
import {
  attribute,
  clamp,
  float,
  mix,
  length,
  normalView,
  normalWorld,
  positionLocal,
  positionView,
  positionViewDirection,
  positionWorld,
  pow,
  sin,
  smoothstep,
  time,
  uv,
  vec2,
  vec3,
  vertexColor,
} from 'three/tsl';
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

type Rgb3 = readonly [number, number, number];
interface Part {
  g: THREE.BufferGeometry;
  c: Rgb3;
}

/** Gộp các hình (đã biến đổi, mỗi hình một màu đỉnh) thành một BufferGeometry không chỉ mục có `normal` + `color`. `chip` > 0 bào mòn bề mặt theo nhiễu 3D (xương sứt mẻ). */
function mergeColored(parts: Part[], chip = 0): THREE.BufferGeometry {
  const pos: number[] = [];
  const nrm: number[] = [];
  const col: number[] = [];
  for (const p of parts) {
    const g = p.g.index ? p.g.toNonIndexed() : p.g;
    const pa = g.getAttribute('position');
    const na = g.getAttribute('normal');
    for (let i = 0; i < pa.count; i++) {
      let x = pa.getX(i);
      let y = pa.getY(i);
      let z = pa.getZ(i);
      if (chip > 0) {
        // nhiễu mượt theo vị trí (không theo đỉnh) nên không rách lưới
        const n = Math.sin(x * 1.9 + Math.sin(y * 2.7)) * Math.sin(z * 2.3 + Math.sin(x * 1.3)) + Math.sin(y * 3.1 + z * 1.7) * 0.5;
        x += na.getX(i) * n * chip;
        y += na.getY(i) * n * chip;
        z += na.getZ(i) * n * chip;
      }
      pos.push(x, y, z);
      nrm.push(na.getX(i), na.getY(i), na.getZ(i));
      col.push(p.c[0], p.c[1], p.c[2]);
    }
    if (g !== p.g) g.dispose();
    p.g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  out.computeBoundingSphere();
  return out;
}

/** Gộp hình đơn sắc (không màu đỉnh): dùng cho cột đá, tinh thể. */
function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const out = mergeColored(parts.map((g) => ({ g, c: [1, 1, 1] as Rgb3 })));
  out.deleteAttribute('color');
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

/** Ống thon: tâm đường cong qua `pts`, bán kính nội suy r0 → r1, mặt cắt dẹt theo x-thế-giới bằng `flat` (1 = tròn). */
const tube = (pts: THREE.Vector3[], r0: number, r1: number, segs = 14, sides = 8, flat = 1): THREE.BufferGeometry => {
  const curve = new THREE.CatmullRomCurve3(pts);
  const g = new THREE.TubeGeometry(curve, segs, 1, sides, false);
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  const ring = sides + 1;
  const c = new THREE.Vector3();
  const v = new THREE.Vector3();
  for (let i = 0; i <= segs; i++) {
    curve.getPointAt(i / segs, c);
    const r = r0 + (r1 - r0) * (i / segs);
    for (let j = 0; j < ring; j++) {
      const k = i * ring + j;
      v.fromBufferAttribute(pos, k).sub(c);
      v.x *= flat;
      v.multiplyScalar(r).add(c);
      pos.setXYZ(k, v.x, v.y, v.z);
    }
  }
  g.computeVertexNormals();
  return g;
};

const IVORY: Rgb3 = [1.0, 0.86, 0.58];
const DARK: Rgb3 = [0.04, 0.035, 0.05];
const tone = (c: Rgb3, k: number): Rgb3 => [c[0] * k, c[1] * k, c[2] * k];

/**
 * Bộ xương cự thú dài ~46 m dọc trục x, đầu ở +x (trục z là bề ngang): đốt sống khối có gai thần kinh cao + mỏm ngang, xương sườn dày cong vòm (gãy, thiếu vài chiếc),
 * đuôi thon, sọ lớn có mào, hốc mắt sâu, hàm há với hàng răng lởm chởm, hai sừng có đai. Màu đỉnh ngà ngả vàng; bề mặt sứt mẻ bằng nhiễu 3D.
 */
export function beastSkeleton(): THREE.BufferGeometry {
  const parts: Part[] = [];
  const add = (g: THREE.BufferGeometry, c: Rgb3 = IVORY, k = 1): void => void parts.push({ g, c: tone(c, k) });
  const spineY = (t: number): number => 3.2 + Math.sin(t * Math.PI) * 1.9 - t * 1.0; // t 0 (đuôi) → 1 (cổ)
  const N = 24;
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1);
    const x = -22 + t * 34;
    const r = 0.7 + Math.sin(t * Math.PI) * 0.55;
    const k = 0.85 + hash01(i, 1, 101) * 0.3;
    const dy = (hash01(i, 2, 103) - 0.5) * 0.5;
    const tilt = (hash01(i, 3, 105) - 0.5) * 0.28;
    const y = spineY(t) + dy;
    // thân đốt: trụ 8 cạnh nằm ngang, đĩa viền
    add(place(new THREE.CylinderGeometry(r, r * 1.08, 1.5, 8), x, y, 0, 1, 1, 1, 0, 0, Math.PI / 2 + tilt), IVORY, k);
    add(place(new THREE.CylinderGeometry(r * 1.2, r * 1.2, 0.22, 8), x - 0.8, y, 0, 1, 1, 1, 0, 0, Math.PI / 2 + tilt), IVORY, k * 0.9);
    // mỏm ngang hai bên
    for (const side of [-1, 1])
      add(
        place(new THREE.ConeGeometry(r * 0.32, r * 2.4, 5), x, y + 0.1, side * (r + 0.9), 1, 1, 0.55, side * (Math.PI / 2), 0, 0),
        IVORY,
        k * 0.92,
      );
    // gai thần kinh (một số gãy cụt)
    if (hash01(i, 4, 107) > 0.18) {
      const hgt = (2.2 + Math.sin(t * Math.PI) * 2.6) * (hash01(i, 5, 109) > 0.8 ? 0.45 : 1);
      add(place(new THREE.ConeGeometry(r * 0.5, hgt, 4), x - 0.25, y + r + hgt * 0.5, 0, 1, 1, 0.4, 0, 0, 0.18 + tilt), IVORY, k * 1.05);
    }
  }
  // đuôi thon: đốt nhỏ dần, nằm sát đất, uốn
  for (let i = 0; i < 12; i++) {
    const t = i / 11;
    const r = 0.62 * (1 - t * 0.8);
    add(
      place(
        new THREE.CylinderGeometry(r, r * 1.08, 1.2, 7),
        -22.8 - i * 1.25,
        3.1 - i * 0.24,
        Math.sin(i * 0.7) * 1.1,
        1,
        1,
        1,
        0,
        0,
        Math.PI / 2,
      ),
      IVORY,
      0.8 + hash01(i, 6, 111) * 0.3,
    );
  }
  // xương sườn: vòm dày từ cột sống; bên −1 đổ sụp, vài chiếc gãy cụt hoặc thiếu
  for (let k = 0; k < 11; k++) {
    const t = 0.2 + (k / 10) * 0.6;
    const x = -22 + t * 34;
    const sh = Math.sin((k / 10) * Math.PI);
    const h = 5.4 + sh * 4.4;
    const w = 3.6 + sh * 2.8;
    const y0 = spineY(t);
    for (const side of [-1, 1]) {
      if (hash01(k, side + 2, 113) < 0.14) continue; // thiếu
      const fallen = side < 0 && k % 3 === 1;
      const pts = fallen
        ? [
            new THREE.Vector3(x, y0, 0.4 * side),
            new THREE.Vector3(x - 0.2, y0 + h * 0.42, side * w * 0.55),
            new THREE.Vector3(x - 1.5, y0 + h * 0.2, side * w * 1.45),
            new THREE.Vector3(x - 1.9, y0 - h * 0.1, side * w * 1.9),
          ]
        : [
            new THREE.Vector3(x, y0, 0.4 * side),
            new THREE.Vector3(x + 0.2, y0 + h * 0.5, side * w * 0.78),
            new THREE.Vector3(x + 0.4, y0 + h * 0.28, side * w * 1.35),
            new THREE.Vector3(x + 0.6, y0 - h * 0.38, side * w * 1.6),
          ];
      const broken = hash01(k, side + 5, 115) > 0.75;
      const cut = broken ? pts.slice(0, 3) : pts;
      const kk = 0.85 + hash01(k, side + 7, 117) * 0.3;
      add(tube(cut, 0.62, broken ? 0.35 : 0.16, 14, 8, 0.7), IVORY, kk);
      if (broken) {
        const e = cut[cut.length - 1]!;
        add(place(new THREE.SphereGeometry(0.32, 6, 5), e.x, e.y, e.z, 1, 0.6, 1), IVORY, 0.7);
      }
    }
  }
  // sọ
  const hx = 14.5;
  const hy = 3.5;
  add(place(new THREE.SphereGeometry(1, 16, 12), hx + 2.0, hy, 0, 4.4, 2.4, 2.5), IVORY, 1.0); // hộp sọ
  add(place(new THREE.SphereGeometry(1, 12, 9), hx + 6.4, hy - 0.5, 0, 3.4, 1.15, 1.35), IVORY, 0.95); // mõm
  add(place(new THREE.BoxGeometry(5.5, 0.7, 0.55), hx + 2.2, hy + 2.35, 0, 1, 1, 1, 0, 0, -0.08), IVORY, 0.85); // mào sọ
  for (const side of [-1, 1]) {
    add(
      place(new THREE.TorusGeometry(0.85, 0.34, 8, 14), hx + 4.4, hy + 0.55, side * 2.0, 1, 1.15, 1, 0, Math.PI / 2 - 0.25 * side, 0),
      IVORY,
      0.9,
    ); // vành hốc mắt
    add(place(new THREE.SphereGeometry(0.78, 10, 8), hx + 4.35, hy + 0.55, side * 1.75, 0.8, 1.05, 0.7), DARK, 1); // hốc mắt sâu
    add(place(new THREE.SphereGeometry(0.62, 8, 6), hx + 4.1, hy + 1.55, side * 1.7, 1.3, 0.7, 0.9), IVORY, 1.05); // gờ mày
    add(place(new THREE.SphereGeometry(0.3, 6, 5), hx + 10.1, hy - 0.2, side * 0.5), DARK, 1); // lỗ mũi
    // sừng chính: cong ra sau, có đai
    const horn = [
      new THREE.Vector3(hx + 0.5, hy + 1.7, side * 1.2),
      new THREE.Vector3(hx - 1.2, hy + 3.4, side * 2.4),
      new THREE.Vector3(hx - 3.8, hy + 5.0, side * 3.4),
      new THREE.Vector3(hx - 6.4, hy + 4.6, side * 4.4),
    ];
    add(tube(horn, 0.7, 0.06, 16, 8), IVORY, 0.8);
    const hc = new THREE.CatmullRomCurve3(horn);
    for (let r = 1; r < 7; r++) {
      const p = hc.getPointAt(r / 8);
      add(place(new THREE.TorusGeometry(0.62 * (1 - r / 9), 0.1, 5, 10), p.x, p.y, p.z, 1, 1, 1, 0.5, 0.6, 0.2), IVORY, 0.7);
    }
    // gai gò má
    add(place(new THREE.ConeGeometry(0.4, 2.2, 5), hx + 3.0, hy - 0.8, side * 2.4, 1, 1, 1, side * 0.9, 0, 0.3), IVORY, 0.9);
  }
  // hàm dưới há, hai nhánh + răng lởm chởm
  for (const side of [-1, 1]) {
    add(place(new THREE.CapsuleGeometry(0.42, 7.2, 4, 8), hx + 6.8, hy - 2.7, side * 0.95, 1, 1, 1, 0, 0, Math.PI / 2 - 0.1), IVORY, 0.92);
    for (let i = 0; i < 13; i++) {
      const x = hx + 3.2 + i * 0.62;
      const lenU = (0.55 + hash01(i, side + 3, 121) * 0.9) * (hash01(i, side + 8, 123) > 0.88 ? 0.3 : 1);
      add(
        place(
          new THREE.ConeGeometry(0.17 + hash01(i, 1, 125) * 0.08, lenU, 5),
          x,
          hy - 1.25 - lenU * 0.5,
          side * (0.7 + hash01(i, 9, 127) * 0.15),
          1,
          1,
          1,
          Math.PI,
          0,
          0,
        ),
        IVORY,
        1.15,
      );
      const lenL = 0.45 + hash01(i, side + 11, 129) * 0.7;
      add(
        place(new THREE.ConeGeometry(0.15, lenL, 5), x + 0.2, hy - 2.1 + lenL * 0.5, side * (0.9 + hash01(i, 12, 131) * 0.15)),
        IVORY,
        1.15,
      );
    }
  }
  // xương rời rải quanh
  for (let i = 0; i < 9; i++) {
    const a = hash01(i, 5, 71) * Math.PI * 2;
    const d = 6 + hash01(i, 6, 73) * 11;
    add(
      place(
        new THREE.CapsuleGeometry(0.25 + hash01(i, 7, 75) * 0.25, 1.6 + hash01(i, 8, 77) * 2.8, 3, 7),
        Math.cos(a) * d - 2,
        0.4,
        Math.sin(a) * d,
        1,
        1,
        1,
        Math.PI / 2,
        hash01(i, 9, 79) * 3,
        0,
      ),
      IVORY,
      0.8,
    );
  }
  return mergeColored(parts, 0.06);
}

/** Đụn tuyết phủ quanh thân xác (chôn nửa dưới, phủ lên xương sườn thấp). */
export function beastDrifts(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  // đụn thấp quanh chân xương sườn (không phủ kín thân), và một gò lớn hơn nơi đầu
  for (let i = 0; i < 16; i++) {
    const t = 0.15 + (i / 15) * 0.7;
    const x = -22 + t * 34 + (hash01(i, 1, 141) - 0.5) * 2;
    const side = i % 2 ? 1 : -1;
    const z = side * (4 + hash01(i, 2, 143) * 4.5);
    const sz = 1.8 + hash01(i, 3, 145) * 2.2;
    parts.push(place(new THREE.SphereGeometry(1, 12, 8), x, 0.1, z, sz * 1.3, 0.35 + hash01(i, 4, 147) * 0.35, sz * 0.8));
  }
  parts.push(place(new THREE.SphereGeometry(1, 12, 8), 20, 0.1, 0, 5, 0.9, 3.8));
  return merge(parts);
}

function boneMaterial(): THREE.MeshStandardNodeMaterial {
  const mat = new THREE.MeshStandardNodeMaterial({ roughness: 0.86, metalness: 0 });
  mat.vertexColors = true;
  const p = positionLocal;
  const n1 = vnoise(vec2(p.x.mul(0.55).add(p.z.mul(0.31)), p.y.mul(0.8).add(p.z.mul(0.2))));
  const n2 = vnoise(vec2(p.x.mul(2.4).add(p.z.mul(1.3)), p.y.mul(2.7)));
  const base = vertexColor().mul(n1.mul(0.5).add(0.75)).mul(n2.mul(0.35).add(0.8));
  // ngả vàng ở chỗ dày; băng xanh đóng ở chỗ ẩm (nhiễu cao)
  const stain = mix(base, vec3(0.62, 0.5, 0.26).mul(n2.add(0.4)), smoothstep(0.55, 0.85, n1).mul(0.45));
  const ice = smoothstep(0.62, 0.8, n2.add(n1.mul(0.35)));
  const iced = mix(stain, vec3(0.55, 0.78, 0.92), ice.mul(0.4));
  // tuyết phủ mặt hướng lên
  const snow = smoothstep(0.45, 0.9, normalWorld.y.add(n1.sub(0.5).mul(0.6)));
  mat.colorNode = mix(iced, vec3(0.9, 0.94, 1.0), snow.mul(0.6));
  mat.roughnessNode = mix(float(0.88), float(0.28), ice.mul(float(1).sub(snow)));
  return mat;
}

export interface BhSpot {
  x: number;
  z: number;
  yaw: number;
  s: number;
  sink?: number;
}

/** Xác cự thú: bốn cá thể (hình chiếm chỗ không đè bãi quái/boss/điểm đặt, xem `bhFootprint.ts` + test) tại vùng trống (xa trạm, trụ truyền tống, đường đi); cá thể gần trạm là điểm "wow" đầu tiên khi nhìn về bắc. */
export const BEAST_SPOTS: BhSpot[] = [
  { x: 1060, z: 1320, yaw: 1.75, s: 2.3, sink: 4.5 },
  { x: 1160, z: 1060, yaw: 0.7, s: 1.9, sink: 3.6 },
  { x: 880, z: 740, yaw: 4.2, s: 2.6, sink: 5.1 },
  { x: 1220, z: 380, yaw: 0, s: 2.1, sink: 4.2 },
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
  const pos: number[] = [];
  const nrm: number[] = [];
  const uvs: number[] = [];
  for (const [y, r0, r1, h] of [
    [2.2, 1.42, 1.5, 0.9],
    [4.6, 1.22, 1.3, 1.1],
    [7.0, 1.02, 1.1, 0.8],
  ] as const) {
    const cyl = place(new THREE.CylinderGeometry(r0, r1, h, 24, 1, true), 0, y, 0);
    const flat = cyl.index ? cyl.toNonIndexed() : cyl; // CylinderGeometry luôn có chỉ mục; chỉ gọi khi có
    for (const [src, dst] of [
      ['position', pos],
      ['normal', nrm],
      ['uv', uvs],
    ] as const) {
      const arr = flat.getAttribute(src).array;
      for (let i = 0; i < arr.length; i++) dst.push(arr[i]!);
    }
    if (flat !== cyl) flat.dispose();
    cyl.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  out.computeBoundingSphere();
  return out;
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

/** Tinh thể tím (thạch anh tím): lăng trụ 6 cạnh vát đầu, vài mũi nhỏ mọc cụm. */
function amethystGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const prism = (r: number, h: number, x: number, z: number, rx: number, rz: number): void => {
    parts.push(place(new THREE.CylinderGeometry(r, r * 1.15, h * 0.72, 6), x, h * 0.36, z, 1, 1, 1, rx, 0, rz));
    parts.push(
      place(
        new THREE.ConeGeometry(r, h * 0.34, 6),
        x - Math.sin(rz) * h * 0.55,
        h * 0.72 + h * 0.17,
        z + Math.sin(rx) * h * 0.55,
        1,
        1,
        1,
        rx,
        0,
        rz,
      ),
    );
  };
  prism(0.5, 3.4, 0, 0, 0.1, -0.08);
  prism(0.34, 2.3, 0.6, 0.3, -0.35, 0.3);
  prism(0.3, 2.0, -0.55, 0.2, 0.3, -0.4);
  prism(0.24, 1.4, 0.2, -0.6, 0.5, 0.15);
  return withGradient(merge(parts), [0.1, 0.04, 0.26], [0.58, 0.38, 0.92]);
}

/** Điểm mọc tinh thể trên vách khe: nơi dốc, độ sâu giữa đáy và mép; hướng theo pháp tuyến địa hình. */
export function wallCrystalSpots(
  path: readonly RiftPt[],
  heightAt: (x: number, z: number) => number,
  count: number,
): { x: number; y: number; z: number; nx: number; ny: number; nz: number; s: number }[] {
  const out: { x: number; y: number; z: number; nx: number; ny: number; nz: number; s: number }[] = [];
  let guard = 0;
  while (out.length < count && guard++ < count * 40) {
    const i = Math.floor(hash01(guard, 1, 201) * (path.length - 1));
    const a = path[i]!;
    const b = path[i + 1]!;
    const u = hash01(guard, 2, 203);
    const cx = a.x + (b.x - a.x) * u;
    const cz = a.z + (b.z - a.z) * u;
    const tl = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    const side = hash01(guard, 3, 205) > 0.5 ? 1 : -1;
    const off = 9 + hash01(guard, 4, 207) * 34;
    const x = cx + (-(b.z - a.z) / tl) * side * off;
    const z = cz + ((b.x - a.x) / tl) * side * off;
    const y = heightAt(x, z);
    const dx = heightAt(x + 1.5, z) - heightAt(x - 1.5, z);
    const dz = heightAt(x, z + 1.5) - heightAt(x, z - 1.5);
    const nl = Math.hypot(dx / 3, 1, dz / 3);
    const ny = 1 / nl;
    if (ny > 0.9) continue; // mặt phẳng: không mọc
    out.push({ x, y: y - 0.2, z, nx: -dx / 3 / nl, ny, nz: -dz / 3 / nl, s: 0.45 + hash01(guard, 5, 209) * 1.2 });
  }
  return out;
}

/** Dải sương nằm ngang bám khe (rộng 2×half), `uv.x` ngang khe 0..1, `uv.y` dọc khe theo mét/60. */
function mistGeometry(path: readonly RiftPt[], y: number, half: number): THREE.BufferGeometry {
  const pos: number[] = [];
  const uvs: number[] = [];
  const idx: number[] = [];
  let acc = 0;
  for (let i = 0; i < path.length; i++) {
    const p = path[i]!;
    const q = path[Math.min(i + 1, path.length - 1)]!;
    const o = path[Math.max(i - 1, 0)]!;
    if (i) acc += Math.hypot(p.x - path[i - 1]!.x, p.z - path[i - 1]!.z);
    const l = Math.hypot(q.x - o.x, q.z - o.z) || 1;
    const nx = -(q.z - o.z) / l;
    const nz = (q.x - o.x) / l;
    for (const s of [-1, 1]) {
      pos.push(p.x + nx * half * s, p.y + y, p.z + nz * half * s);
      uvs.push(s * 0.5 + 0.5, acc / 60);
    }
    if (i > 0) {
      const a = (i - 1) * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

/** Sương tím cuộn ra từ khe: nhiễu trôi ra hai bên, dày ở giữa, tan dần ra mép; trộn thường (không cộng sáng) nên che được cảnh một chút. */
function mistMaterial(strength: number): THREE.MeshBasicNodeMaterial {
  const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false });
  const across = uv().x.mul(2).sub(1);
  const flow = time.mul(0.05);
  const n1 = vnoise(vec2(uv().y.mul(1.6).add(flow), across.mul(2.2).sub(flow.mul(across.sign().mul(0.8).add(0.001).mul(3)))));
  const n2 = vnoise(vec2(uv().y.mul(4.5).sub(flow.mul(2)), across.abs().mul(3.4).sub(flow.mul(5))));
  const body = pow(float(1).sub(across.abs()), 1.3);
  const dens = clamp(n1.mul(0.9).add(n2.mul(0.5)).sub(0.35), 0, 1).mul(body);
  mat.colorNode = mix(vec3(0.34, 0.18, 0.62), vec3(0.75, 0.45, 1.0), n2.mul(body));
  const nearFade = smoothstep(10, 45, length(positionView));
  mat.opacityNode = clamp(dens.mul(strength).mul(nearFade), 0, 0.6);
  return mat;
}

/** Thêm màu đỉnh gradient theo độ cao cục bộ (chân tối → mũi sáng) để vật liệu tinh thể có chiều sâu thay vì một màu phẳng (kiểu PROP-1). */
function withGradient(g: THREE.BufferGeometry, base: [number, number, number], tip: [number, number, number]): THREE.BufferGeometry {
  const p = g.attributes.position as THREE.BufferAttribute;
  let top = 0;
  for (let i = 0; i < p.count; i++) top = Math.max(top, p.getY(i));
  const col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const t = Math.pow(Math.min(1, Math.max(0, p.getY(i) / (top || 1))), 1.3);
    col[i * 3] = base[0] + (tip[0] - base[0]) * t;
    col[i * 3 + 1] = base[1] + (tip[1] - base[1]) * t;
    col[i * 3 + 2] = base[2] + (tip[2] - base[2]) * t;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

/** Vật liệu tinh thể gradient (như `propCrystal`): lõi nóng ở mũi, fresnel viền cùng sắc, thân giữa sẫm. */
function gradientCrystalMaterial(roughness: number, emissiveK: number): THREE.MeshStandardNodeMaterial {
  const vc = vertexColor();
  const fres = pow(float(1).sub(normalView.dot(positionViewDirection).abs()), 2.2);
  const lum = vc
    .dot(vec3(0.3, 0.5, 0.2))
    .mul(2.2)
    .clamp(0, 1);
  const m = new THREE.MeshStandardNodeMaterial({ roughness, metalness: 0.05 });
  m.colorNode = vc.mul(0.35);
  m.emissiveNode = vc
    .mul(float(1).add(lum.mul(lum).mul(0.9)))
    .mul(emissiveK)
    .add(vc.normalize().mul(fres).mul(0.7));
  return m;
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
  return withGradient(merge(parts), [0.1, 0.2, 0.42], [0.55, 0.72, 0.95]);
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

/** Điểm tinh thể băng dọc mép khe (`per` điểm mỗi đoạn). Luôn vẽ đủ 7 ở mọi chất lượng để hình khớp collider (server quyết định va chạm, không phụ thuộc chất lượng đồ họa). */
export function iceSpots(path: readonly RiftPt[], per: number): { x: number; z: number; s: number; yaw: number }[] {
  const spots: { x: number; z: number; s: number; yaw: number }[] = [];
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
  return spots;
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

    // Xác cự thú
    const boneMat = own(boneMaterial());
    const boneGeo = own(beastSkeleton());
    const bones = new THREE.InstancedMesh(boneGeo, boneMat, BEAST_SPOTS.length);
    bones.name = 'bh-beast-bones';
    BEAST_SPOTS.forEach((s, i) => {
      q.setFromEuler(e.set(0, s.yaw, (hash01(i, 1, 3) - 0.5) * 0.12));
      m.compose(new THREE.Vector3(s.x, heightAt(s.x, s.z) - (s.sink ?? 1), s.z), q, new THREE.Vector3(s.s, s.s, s.s));
      bones.setMatrixAt(i, m);
    });
    bones.instanceMatrix.needsUpdate = true;
    bones.computeBoundingSphere();
    bones.castShadow = true;
    bones.receiveShadow = true;
    this.group.add(bones);
    const driftMat = own(new THREE.MeshStandardNodeMaterial({ color: 0xe6edff, roughness: 0.78, metalness: 0 }));
    const drifts = new THREE.InstancedMesh(own(beastDrifts()), driftMat, BEAST_SPOTS.length);
    drifts.name = 'bh-beast-drifts';
    BEAST_SPOTS.forEach((s, i) => {
      q.setFromEuler(e.set(0, s.yaw, 0));
      m.compose(new THREE.Vector3(s.x, heightAt(s.x, s.z) - 0.2, s.z), q, new THREE.Vector3(s.s, s.s, s.s));
      drifts.setMatrixAt(i, m);
    });
    drifts.instanceMatrix.needsUpdate = true;
    drifts.computeBoundingSphere();
    drifts.receiveShadow = true;
    this.group.add(drifts);

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
      const iceMat = own(gradientCrystalMaterial(0.12, 0.9));
      const spots = iceSpots(path, 7);
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

      // Vực khe: tinh thể tím mọc từ vách + sương tím cuộn ra
      const spotsC = wallCrystalSpots(path, heightAt, opts.detail ? 170 : 70);
      if (spotsC.length) {
        const amMat = own(gradientCrystalMaterial(0.18, 1.2));
        markBloom(amMat, 0.35);
        const am = new THREE.InstancedMesh(own(amethystGeometry()), amMat, spotsC.length);
        am.name = 'bh-amethyst';
        const up = new THREE.Vector3(0, 1, 0);
        const nrmV = new THREE.Vector3();
        spotsC.forEach((c, i) => {
          nrmV.set(c.nx, c.ny, c.nz).normalize();
          // mọc ra khỏi vách: pháp tuyến nghiêng thêm về phía ngang
          nrmV.x *= 1.5;
          nrmV.z *= 1.5;
          nrmV.normalize();
          q.setFromUnitVectors(up, nrmV);
          m.compose(new THREE.Vector3(c.x, c.y, c.z), q, new THREE.Vector3(c.s, c.s, c.s));
          am.setMatrixAt(i, m);
        });
        am.instanceMatrix.needsUpdate = true;
        am.computeBoundingSphere();
        this.group.add(am);
      }
      for (const [y, half, k, order] of [
        [6, 36, 1.0, 5],
        [16, 58, 0.7, 6],
      ] as const) {
        const mm = own(mistMaterial(k));
        const mist = new THREE.Mesh(own(mistGeometry(path, y, half)), mm);
        mist.name = 'bh-rift-mist';
        mist.frustumCulled = false;
        mist.renderOrder = order;
        this.group.add(mist);
      }
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
