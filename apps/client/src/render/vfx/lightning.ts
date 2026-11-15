import * as THREE from 'three/webgpu';
import { abs, atan, cos, exp, float, length, log, min, mix, pow, sin, smoothstep, time, uv, vec2, vec3 } from 'three/tsl';
import { seededRandom, vnoise, type FxUniforms } from './common';

/**
 * Thiên lôi (M4-4).
 *
 * 1. Hình tia sét sinh từ seed do SERVER gửi (`HazardMsg.sd`, `FxMsg.sd`): cùng seed thì mọi client
 *    ra cùng một đường gấp khúc (dịch điểm giữa, nhánh rẽ), tính theo tọa độ tương đối với điểm đánh.
 *    `boltShape` chỉ dùng `seededRandom`, không đụng `Math.random`.
 * 2. Lưới: dải quay mặt về camera dọc theo đường gấp khúc (thân chính + nhánh), dựng lại mỗi khung
 *    trong bộ đệm cấp sẵn (`BoltGeometry`, giữ trong pool), vẽ bằng material dùng chung kiểu `bolt`.
 *    UV: `u` chạy từ đỉnh (0) xuống đất (1), `v` ngang dải. Shader: lõi trắng nóng ở giữa, quầng màu
 *    thiên lôi ra mép, tia dẫn (leader) lộ dần từ trên xuống rồi tia ngược sáng bừng và nhấp nháy.
 *    Tham số theo lưới (`fxA`): x = đầu tia dẫn 0..1, y = độ sáng (nhấp nháy), z = seed.
 * 3. Mây kiếp xoáy (`vortex`): một đĩa phẳng, xoắn ốc logarit + nhiễu trôi trong fragment, mắt bão
 *    sáng tím ở giữa, sét trong mây khi có tia đánh gần (`fxA.y`). `fxA.z` = seed.
 */

/** Một nhánh của tia sét: đoạn [start, start + count) trong mảng điểm. */
export interface BoltStrand {
  start: number;
  count: number;
  /** Bề rộng dải (m) ở đầu nhánh; thon dần về cuối. */
  width: number;
}

/** Hình tia sét (tọa độ tương đối với điểm đánh, đất ở y = 0). */
export interface BoltShape {
  /** x,y,z,u cho mỗi điểm (u: 0 ở đỉnh, 1 ở đất theo thân chính; nhánh nối tiếp u của điểm rẽ). */
  pts: Float32Array;
  strands: BoltStrand[];
  /** Số điểm dùng. */
  n: number;
}

const MAIN_SEGS = 32;
const MAX_BRANCH = 5;
const BRANCH_SEGS = 10;
export const BOLT_MAX_PTS = MAIN_SEGS + 1 + MAX_BRANCH * (BRANCH_SEGS + 1);

/**
 * Sinh hình tia sét từ seed. `h`: độ cao đỉnh, `spread`: độ lệch ngang của đỉnh, `scale`: bề rộng.
 * Ghi vào `out` nếu có (tránh cấp phát khi phát).
 */
export function boltShape(seed: number, h = 62, spread = 7, scale = 1, out?: BoltShape): BoltShape {
  const rnd = seededRandom(seed);
  const shape: BoltShape = out ?? { pts: new Float32Array(BOLT_MAX_PTS * 4), strands: [], n: 0 };
  shape.strands.length = 0;
  const p = shape.pts;
  // Thân chính: dịch điểm giữa trên đoạn từ đỉnh lệch xuống điểm đánh.
  const tx = (rnd() - 0.5) * 2 * spread;
  const tz = (rnd() - 0.5) * 2 * spread;
  for (let i = 0; i <= MAIN_SEGS; i++) {
    const u = i / MAIN_SEGS;
    p[i * 4] = tx * (1 - u);
    p[i * 4 + 1] = h * (1 - u);
    p[i * 4 + 2] = tz * (1 - u);
    p[i * 4 + 3] = u;
  }
  // Dịch điểm giữa theo bậc: bước 16, 8, 4, 2, 1 với biên độ giảm dần; hai đầu cố định.
  let amp = h * 0.2;
  for (let step = MAIN_SEGS / 2; step >= 1; step /= 2) {
    for (let i = step; i < MAIN_SEGS; i += step * 2) {
      const a = (i - step) * 4;
      const b = (i + step) * 4;
      // Gần đất lệch ít hơn một chút; hai đầu vẫn cố định nên tia cắm đúng điểm đánh.
      const damp = Math.min(1, 0.45 + (1 - i / MAIN_SEGS) * 2);
      p[i * 4] = (p[a] + p[b]) / 2 + (rnd() - 0.5) * amp * damp;
      p[i * 4 + 2] = (p[a + 2] + p[b + 2]) / 2 + (rnd() - 0.5) * amp * damp;
      p[i * 4 + 1] = (p[a + 1] + p[b + 1]) / 2 + (rnd() - 0.5) * amp * 0.25;
    }
    amp *= 0.62;
  }
  shape.strands.push({ start: 0, count: MAIN_SEGS + 1, width: 0.22 * scale });
  let n = MAIN_SEGS + 1;
  // Nhánh rẽ: rẽ ra từ nửa trên của thân, đi xiên xuống, ngắn dần.
  const branches = 2 + Math.floor(rnd() * (MAX_BRANCH - 1));
  for (let b = 0; b < branches; b++) {
    const at = 3 + Math.floor(rnd() * (MAIN_SEGS * 0.6));
    const ang = rnd() * Math.PI * 2;
    const len = h * (0.1 + rnd() * 0.18);
    const dx = Math.cos(ang);
    const dz = Math.sin(ang);
    const start = n;
    let x = p[at * 4];
    let y = p[at * 4 + 1];
    let z = p[at * 4 + 2];
    const u0 = p[at * 4 + 3];
    const segLen = len / BRANCH_SEGS;
    for (let i = 0; i <= BRANCH_SEGS; i++) {
      p[n * 4] = x;
      p[n * 4 + 1] = y;
      p[n * 4 + 2] = z;
      p[n * 4 + 3] = u0 + (i / BRANCH_SEGS) * 0.35;
      n++;
      x += (dx * 0.75 + (rnd() - 0.5) * 0.9) * segLen;
      z += (dz * 0.75 + (rnd() - 0.5) * 0.9) * segLen;
      y -= (0.55 + rnd() * 0.5) * segLen;
    }
    shape.strands.push({ start, count: BRANCH_SEGS + 1, width: (0.12 - b * 0.012) * scale });
  }
  shape.n = n;
  return shape;
}

/**
 * Bộ đệm lưới dải cho một tia sét, cấp sẵn đủ cho `BOLT_MAX_PTS` điểm. Mỗi điểm 2 đỉnh (hai mép),
 * mỗi đoạn 2 tam giác. Chỉ số dựng một lần; vị trí ghi lại mỗi khung theo hướng camera.
 */
export class BoltGeometry {
  readonly geo = new THREE.BufferGeometry();
  private readonly pos: THREE.BufferAttribute;
  private readonly uvs: THREE.BufferAttribute;

  constructor() {
    const nv = BOLT_MAX_PTS * 2;
    this.pos = new THREE.BufferAttribute(new Float32Array(nv * 3), 3);
    this.uvs = new THREE.BufferAttribute(new Float32Array(nv * 2), 2);
    const idx = new Uint16Array((BOLT_MAX_PTS - 1) * 6);
    this.geo.setAttribute('position', this.pos);
    this.geo.setAttribute('uv', this.uvs);
    // Pháp tuyến không dùng (dải tự phát sáng) nhưng node material mặc định vẫn đọc: điền hằng.
    this.geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(nv * 3).fill(0).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
    this.geo.setIndex(new THREE.BufferAttribute(idx, 1));
    this.geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e4);
  }

  /**
   * Dựng dải quay về `cam` cho hình `s` đặt tại (x, y, z).
   */
  build(s: BoltShape, x: number, y: number, z: number, cam: THREE.Vector3): void {
    const P = this.pos.array as Float32Array;
    const UV = this.uvs.array as Float32Array;
    const I = this.geo.index!.array as Uint16Array;
    const p = s.pts;
    let ii = 0;
    for (const st of s.strands) {
      for (let j = 0; j < st.count; j++) {
        const i = st.start + j;
        // Tiếp tuyến theo điểm trước/sau trong cùng nhánh.
        const a = (st.start + Math.max(0, j - 1)) * 4;
        const b = (st.start + Math.min(st.count - 1, j + 1)) * 4;
        const tx = p[b] - p[a];
        const ty = p[b + 1] - p[a + 1];
        const tz = p[b + 2] - p[a + 2];
        const px = x + p[i * 4];
        const py = y + p[i * 4 + 1];
        const pz = z + p[i * 4 + 2];
        // Mép = tiếp tuyến × hướng nhìn, chuẩn hóa, nhân nửa bề rộng (thon về cuối nhánh).
        const vx = cam.x - px;
        const vy = cam.y - py;
        const vz = cam.z - pz;
        let sx = ty * vz - tz * vy;
        let sy = tz * vx - tx * vz;
        let sz = tx * vy - ty * vx;
        const l = Math.hypot(sx, sy, sz) || 1;
        const taper = st.start === 0 ? 1 - (j / st.count) * 0.35 : 1 - (j / st.count) * 0.85;
        const w = (st.width * taper) / l;
        sx *= w;
        sy *= w;
        sz *= w;
        P[i * 6] = px - sx;
        P[i * 6 + 1] = py - sy;
        P[i * 6 + 2] = pz - sz;
        P[i * 6 + 3] = px + sx;
        P[i * 6 + 4] = py + sy;
        P[i * 6 + 5] = pz + sz;
        UV[i * 4] = p[i * 4 + 3];
        UV[i * 4 + 1] = 0;
        UV[i * 4 + 2] = p[i * 4 + 3];
        UV[i * 4 + 3] = 1;
        if (j < st.count - 1) {
          const v0 = i * 2;
          I[ii++] = v0;
          I[ii++] = v0 + 2;
          I[ii++] = v0 + 1;
          I[ii++] = v0 + 1;
          I[ii++] = v0 + 2;
          I[ii++] = v0 + 3;
        }
      }
    }
    this.pos.clearUpdateRanges();
    this.pos.addUpdateRange(0, s.n * 6);
    this.pos.needsUpdate = true;
    this.uvs.clearUpdateRanges();
    this.uvs.addUpdateRange(0, s.n * 4);
    this.uvs.needsUpdate = true;
    this.geo.index!.clearUpdateRanges();
    this.geo.index!.addUpdateRange(0, ii);
    this.geo.index!.needsUpdate = true;
    this.geo.setDrawRange(0, ii);
  }
}

/**
 * Nhịp một tia sét theo tiến độ k (0..1 trên 0,42 giây, như bản cũ): tia dẫn lộ dần trong 12% đầu
 * (mờ), rồi tia ngược sáng bừng, tắt, bừng lại một lần, rồi tàn.
 */
export function boltPhase(k: number): { head: number; lum: number } {
  const head = Math.min(1, k / 0.12);
  let lum: number;
  if (k < 0.12) lum = 0.35;
  else if (k < 0.24) lum = 1;
  else if (k < 0.34) lum = 0.18;
  else if (k < 0.52) lum = 0.85;
  else lum = 0.35 * (1 - (k - 0.52) / 0.48);
  return { head, lum };
}

/** Node màu/độ trong cho tia sét (kiểu `bolt`, cộng sáng, bloom). */
export function boltNodes(U: FxUniforms) {
  const st = uv();
  const u = st.x;
  const v = st.y;
  const head = U.a.x;
  const lum = U.a.y;
  const seed = U.a.z;
  const one = float(1);
  // Phần tia dẫn đã xuống tới; mép đầu mềm.
  const reveal = one.sub(smoothstep(head.sub(0.04), head, u));
  // Lõi trắng nóng ở giữa dải, quầng màu ra mép.
  const x = abs(v.sub(0.5)).mul(2);
  const core = exp(x.mul(x).mul(-28));
  const halo = pow(one.sub(x), 2);
  // Gợn sáng chạy dọc thân.
  const ripple = vnoise(vec2(u.mul(40).sub(time.mul(25)).add(seed.mul(7)), seed)).mul(0.35).add(0.75);
  const c = mix(U.color, vec3(1, 0.98, 1), core.mul(0.85));
  const glow = core.mul(1.6).add(halo.mul(0.7)).mul(ripple).mul(lum);
  return {
    color: min(c.mul(glow).mul(1.2), U.maxHdr),
    opacity: U.opacity.mul(reveal).mul(min(halo.add(core), 1)).mul(lum.mul(0.6).add(0.4)),
  };
}

/** Đĩa phẳng cho mây xoáy (bán kính 1, nằm ngang, mặt nhìn xuống). */
export function vortexGeometry(): THREE.BufferGeometry {
  const g = new THREE.CircleGeometry(1, 48, 0, Math.PI * 2);
  g.rotateX(Math.PI / 2);
  return g;
}
export const VORTEX_GEO = vortexGeometry();

/**
 * Node mây kiếp xoáy (kiểu `vortex`, hòa trộn thường, có sương). Màu lưới = màu mây tối; quầng
 * sét trong mây dùng màu thiên lôi cố định `#B48CFF` (art bible `spirit_thunder`).
 * `fxA`: y = chớp sét trong mây 0..1, z = seed. `fxOpacity` = độ đậm tổng.
 */
export function vortexNodes(U: FxUniforms) {
  const st = uv();
  const p = st.sub(0.5).mul(2);
  const r = length(p);
  const a = atan(p.y, p.x);
  const seed = U.a.z;
  const flash = U.a.y;
  const one = float(1);
  // Xoắn ốc logarit: góc + ln(r)·xoắn, cuộn chậm vào trong.
  // Lấy mẫu nhiễu trên vòng tròn (cos θ, sin θ) để tuần hoàn theo góc: không có đường nối ở θ = ±π.
  const th = a.add(log(r.add(0.02)).mul(0.55 * Math.PI * 2)).add(time.mul(0.3));
  const ring = vec2(cos(th), sin(th));
  const n1 = vnoise(ring.mul(1.0).add(vec2(r.mul(5).sub(time.mul(0.35)), seed)));
  const n2 = vnoise(ring.mul(2.1).add(vec2(r.mul(11).sub(time.mul(0.6)), seed.mul(1.7))));
  const base = smoothstep(0.2, 0.6, n1.mul(0.65).add(n2.mul(0.35)));
  // Cánh xoắn ốc rõ nét quanh tâm: 3 cánh theo góc đã cuộn, mờ dần ra mép để không lộ họa tiết.
  const arms = smoothstep(-0.1, 0.9, sin(th.mul(3)));
  const armW = one.sub(smoothstep(0.35, 0.95, r)).mul(0.6).add(0.15);
  const dens = base.mul(one.sub(armW)).add(arms.mul(armW).mul(base.mul(0.6).add(0.4)));
  // Mép ngoài tan; mắt bão ở giữa mỏng hơn.
  const edge = one.sub(smoothstep(0.65, 1, r));
  const eye = smoothstep(0.04, 0.2, r);
  const body = dens.mul(0.45).add(0.55).mul(edge).mul(eye.mul(0.75).add(0.25));
  // Mắt bão phát sáng tím; sét trong mây bừng theo vân nhiễu khi có tia đánh.
  const thunder = vec3(0.456, 0.262, 1.0);
  const eyeGlow = one.sub(smoothstep(0.02, 0.22, r)).mul(0.9);
  const inner = flash.mul(smoothstep(0.45, 0.9, n2)).mul(edge).mul(1.3);
  const shade = U.color.mul(dens.mul(0.55).add(0.45));
  const col = shade.add(thunder.mul(eyeGlow.add(inner)));
  return {
    color: min(col, U.maxHdr),
    opacity: U.opacity.mul(min(body.add(eyeGlow.mul(0.4)), 1)),
  };
}

