import { clamp, dot, float, fract, mix, normalize, smoothstep, texture, vec2, vec3, vec4, max } from 'three/tsl';
import { skyParams } from '../sky';
import { getCloudNoise } from '../noiseTex';
import { getBrushTexture } from './brush';

/**
 * Họa Cảnh P2 (làm lại): các hàm màu và trường nhiễu của đồng cỏ, port SÁT từ painted-valley (src/lib/glsl.js: meadowGreen, meadowTint,
 * tallAt, slopeRel, paintGround; MIT, © 2026 Patch, xem assets/LICENSES.md) sang TSL. Số màu và hằng số là của nguồn.
 * Khác nguồn: `tNoiseHi` của nguồn (4 trường mịn) thay bằng texture nhiễu `getCloudNoise()` của ta (R lớn, G vừa, B nhỏ, A sợi);
 * `tStrokes` thay bằng `getBrushTexture()`; hướng thung lũng `uFloor` cố định (0,6; 0,8).
 */
/** Node TSL: dùng any cho gọn (giống materials/ground.ts). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Node = any;

/** Hướng "dọc thung lũng" (HERO của nguồn). */
const FLOOR_DIR = vec2(0.6, 0.8);

export interface SampleOpts {
  /** Đọc ở tầng mip 0 (bắt buộc ở vertex shader). */
  lod0?: boolean;
}

const noise = (uv: Node, o: SampleOpts): Node => {
  const t = texture(getCloudNoise(), uv);
  return o.lod0 ? t.level(float(0)) : t;
};
const strokes = (uv: Node, o: SampleOpts): Node => {
  const t = texture(getBrushTexture(), uv);
  return o.lod0 ? t.level(float(0)) : t;
};

/** Mảng xanh ngả vàng/ngả lam rộng, như người vẽ trải đồng cỏ; có đốm sẫm hơn của cỏ ba lá. */
export function meadowTint(xz: Node, o: SampleOpts = {}): Node {
  const a = noise(xz.div(520), o).a;
  const b = noise(xz.div(37).add(0.23), o).r;
  const w = smoothstep(0.3, 0.7, a.mul(0.6).add(b.mul(0.4)));
  const t = mix(vec3(0.8, 0.96, 1.1), vec3(1.2, 1.06, 0.76), w);
  const c = noise(xz.div(13).add(0.61), o).g;
  return t.mul(mix(vec3(1), vec3(0.72, 0.87, 0.96), smoothstep(0.6, 0.72, c)));
}

/** Cỏ cao ở chỗ này, thấp ở chỗ kia: 1 là chiều cao thường. */
export function tallAt(xz: Node, o: SampleOpts = {}): Node {
  const a = noise(xz.div(23).add(0.47), o).b;
  const b = noise(xz.div(7).add(0.11), o).r;
  return mix(0.72, 1.5, smoothstep(0.34, 0.68, a.mul(0.7).add(b.mul(0.3))));
}

/** Đồng cỏ như được vẽ: ba màu xanh chọn theo tông (0 trong bóng sâu, 1 nơi sáng đầy). */
export function meadowGreen(tone: Node): Node {
  const c = mix(vec3(0.05, 0.25, 0.07), vec3(0.15, 0.46, 0.085), smoothstep(0.2, 0.5, tone));
  return mix(c, vec3(0.3, 0.57, 0.12), smoothstep(0.56, 0.9, tone));
}

/** Sườn dốc so với mặt trời: 0,5 cho đất bằng; hơn nếu quay về phía sáng. Dốc bị nhân 3,2 vì đất thoải gần như không hiện gì. */
export function slopeRel(N: Node): Node {
  const n = normalize(vec3(N.x.mul(3.2), N.y, N.z.mul(3.2)));
  const sd = skyParams.sunDir;
  const L = normalize(vec3(sd.x, max(sd.y, 0.3), sd.z));
  return clamp(float(0.5).add(dot(n, L).sub(L.y).mul(1.5)), 0, 1);
}

/** Mặt trời chiếu bao nhiêu lên chỗ dốc như vậy: chỗ trũng được bầu trời chiếu. */
export function slopeSun(rel: Node): Node {
  return mix(0.3, 1.0, smoothstep(0.04, 0.5, rel));
}

/**
 * Đồng cỏ xa nhìn như nét cọ: chấm và nét sáng/tối ở mọi cỡ, mảng xanh vàng/lam mềm, vài khóm cỏ dài sẫm (`paintGround` của nguồn).
 * `dist` là khoảng cách tới camera (m).
 */
export function paintGround(g: Node, xz: Node, dist: Node, o: SampleOpts = {}): Node {
  const nearK = float(1).sub(smoothstep(40, 110, dist));
  const t = strokes(xz.div(6), o)
    .r.sub(0.5)
    .mul(0.5)
    .add(strokes(vec2(xz.y, xz.x).div(27).add(0.37), o).r.sub(0.5).mul(0.7))
    .add(strokes(xz.div(95).add(0.11), o).r.sub(0.5).mul(0.9))
    .mul(0.7)
    .mul(nearK);
  const farK = float(1).sub(nearK);
  const t2 = t.add(noise(xz.div(1100).add(0.2), o).r.sub(0.5).mul(0.5).mul(farK));
  let out: Node = g
    .mul(float(1).add(t2.mul(0.5)))
    .mul(mix(vec3(0.9, 1.0, 1.1), vec3(1.1, 1.03, 0.84), clamp(float(0.5).add(t2.mul(1.4)), 0, 1)));
  const v = noise(xz.div(520).add(0.2), o)
    .g.mul(0.58)
    .add(noise(xz.div(170).add(0.61), o).b.mul(0.42));
  out = out.mul(mix(vec3(1), vec3(1.26, 1.13, 0.76), smoothstep(0.5, 0.62, v).mul(farK).mul(0.4)));
  out = out.mul(
    mix(
      vec3(1),
      vec3(0.76, 0.92, 1.06),
      float(1)
        .sub(smoothstep(0.36, 0.48, v))
        .mul(farK)
        .mul(0.4),
    ),
  );
  const q = vec2(dot(xz, vec2(FLOOR_DIR.y.negate(), FLOOR_DIR.x)).div(130), dot(xz, FLOOR_DIR).div(64));
  const tuft = float(1).sub(smoothstep(0.13, 0.2, strokes(q, o).r));
  out = out.mul(
    mix(
      vec3(1),
      vec3(0.7, 0.86, 0.9),
      tuft
        .mul(farK)
        .mul(float(1).sub(smoothstep(350, 800, dist)))
        .mul(0.6),
    ),
  );
  return out.mul(mix(vec3(1), vec3(1.16, 1.1, 0.9), farK));
}

/** Băm 4 số từ một ô (số thực, dùng được ở mọi backend): hash42 của nguồn. */
export function hash42(p: Node): Node {
  const p4 = fract(vec4(p.x, p.y, p.x, p.y).mul(vec4(0.1031, 0.103, 0.0973, 0.1099)));
  const s = p4.add(dot(p4, p4.wzxy.add(33.33)));
  return fract(s.xxyz.add(s.yzzw).mul(s.zywx));
}
