import {
  abs,
  dot,
  exp,
  float,
  fract,
  mix,
  screenCoordinate,
  screenSize,
  screenUV,
  select,
  smoothstep,
  step,
  uniform,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';
import type { N } from './lab/field';

/** 0 ban ngày, 1 ban đêm: tông trăng lam lạnh ở pass cuối (đặt từ mood trong render/atmosphere.ts). */
export const paintedNight = uniform(0);

/**
 * Khung hình: dựa trên painted-valley/src/lib/frame.js (finalMaterial; MIT, © 2026 Patch; xem assets/LICENSES.md), dịch từng dòng sang
 * TSL. Thứ tự pass như nguồn: cảnh HDR (MSAA 4, nửa-float) → [lửa/khói: không có trong cảnh thử] → [bloom: bỏ qua trong lần dịch đầu
 * vì ngưỡng 1,5 không chạm cỏ/hoa; kiểm lại bằng ảnh chênh] → pass cuối: Kuwahara (`painted`) → [viền mực: chỉ cho nhân vật, bước P7]
 * → vignette → phơi sáng → đường cong họa sĩ → bão hòa 1,06 → sRGB → dither.
 */
export interface PaintedOutputOpts {
  /** `?paint=` của nguồn: 0 tắt, 3 là mặc định của bản demo (bán kính hiệu dụng 2, còn 1 ở rất gần/rất xa). */
  paint: number;
  exposure: number;
  vignette: number;
  /** Độ lệch quang sai màu (UV, 0 = không): R/B lấy mẫu lệch hướng ra mép (trúng đòn). */
  aberration?: N;
  /** Lớp phủ ở không gian hiển thị (sau sRGB): chớp, viền trúng đòn, khung va chạm… */
  overlay?: (rgb: N) => N;
}

/**
 * Nút đầu ra của pass cuối (finalMaterial của painted-valley): Kuwahara, vignette, phơi sáng, đường cong họa sĩ, bão hòa 1,06, sRGB, dither.
 * `scenePass` là `pass(scene, camera, { samples })`. Không ACES, không chỉnh màu, không hạt phim, không bloom, không FXAA.
 */
export function paintedOutput(scenePass: N, o: PaintedOutputOpts): N {
  const tHdr: N = scenePass.getTextureNode('output');
  const tDepth: N = scenePass.getTextureNode('depth');
  const texel: N = vec2(1).div(screenSize);

  const hdr = (uv: N): N => tHdr.sample(uv);

  /**
   * The frame as paint: round each point, four overlapping patches; the calmest of them gives its colour. Edges stay where they are and
   * everything between them goes flat, as a loaded brush leaves it.
   */
  const kuwahara = (uv: N, r: number): N => {
    const m: N[] = [vec3(0), vec3(0), vec3(0), vec3(0)];
    const s: N[] = [vec3(0), vec3(0), vec3(0), vec3(0)];
    for (let j = -r; j <= r; j++) {
      for (let i = -r; i <= r; i++) {
        const raw: N = hdr(uv.add(vec2(i, j).mul(texel))).rgb;
        const c: N = raw.div(raw.add(1));
        const cc: N = c.mul(c);
        if (i <= 0 && j <= 0) {
          m[0] = m[0]!.add(c);
          s[0] = s[0]!.add(cc);
        }
        if (i >= 0 && j <= 0) {
          m[1] = m[1]!.add(c);
          s[1] = s[1]!.add(cc);
        }
        if (i <= 0 && j >= 0) {
          m[2] = m[2]!.add(c);
          s[2] = s[2]!.add(cc);
        }
        if (i >= 0 && j >= 0) {
          m[3] = m[3]!.add(c);
          s[3] = s[3]!.add(cc);
        }
      }
    }
    const n = (r + 1) * (r + 1);
    let sum: N = vec3(0);
    let total: N = float(0);
    for (let k = 0; k < 4; k++) {
      const mean: N = m[k]!.div(n);
      const v: N = abs(s[k]!.div(n).sub(mean.mul(mean)));
      const vs: N = v.x.add(v.y).add(v.z);
      // (the calmest patch nearly alone, but never a hard choice: a hard one flickers)
      const w: N = float(1).div(vs.mul(vs).mul(vs).mul(vs).mul(1e12).add(1e-7));
      sum = sum.add(mean.mul(w));
      total = total.add(w);
    }
    const out: N = sum.div(total);
    return out.div(float(1).sub(out.min(0.985)));
  };

  const uv: N = screenUV;
  const c0: N = hdr(uv).toVar();
  let c: N;
  if (o.paint > 0.5) {
    // a finer brush for what is near: grass at your feet keeps its blades, the far country goes to flat paint
    const away: N = float(0.12).div(max1(float(1).sub(tDepth.sample(uv).r)));
    // (what is painted already keeps its detail)
    // VFX/điểm sáng HDR (độ chói 1,3..2,2 mờ dần về ảnh gốc) không bị nhòe (nguyên tắc 5: VFX giữ chuẩn HPL2)
    const hiLum: N = dot(c0.rgb, vec3(0.2126, 0.7152, 0.0722));
    const done: N = c0.a.lessThan(0.6);
    // The brush is broadest in the middle distance, where grass is a mass. Near, it leaves the strokes of the blades alone; far off,
    // where a house is a few pixels across, it leaves those alone too.
    const rWide = Math.min(Math.round(o.paint), 2);
    const useOne: N = away.lessThan(16).or(away.greaterThan(140));
    const wide: N = rWide >= 2 ? kuwahara(uv, 2) : kuwahara(uv, 1);
    const one: N = kuwahara(uv, 1);
    const painted: N = select(done, c0.rgb, select(useOne, one, wide));
    c = mix(painted, c0.rgb, smoothstep(1.3, 2.2, hiLum));
  } else {
    c = c0.rgb;
  }
  // (the line is the colour under it: only for a figure, which writes a small alpha; none here)
  const d: N = uv.sub(0.5);
  c = c.mul(float(1).sub(float(o.vignette).mul(dot(d, d)).mul(1.6)));
  if (o.aberration) {
    // quang sai màu khi trúng đòn (0 khi không trúng): kênh R/B lấy mẫu lệch ra mép
    const ca: N = d.mul(o.aberration);
    c = vec3(c.r.add(hdr(uv.add(ca)).r.sub(c0.r).mul(0.6)), c.g, c.b.add(hdr(uv.sub(ca)).b.sub(c0.b).mul(0.6)));
  }
  c = c.mul(o.exposure);
  // đêm Họa Cảnh: giữ ít tông (sáng/tối của bản vẽ), nhuộm lam ánh trăng, tối rõ nhưng còn đọc được hình
  const ln: N = dot(c, vec3(0.2126, 0.7152, 0.0722));
  const moon: N = mix(vec3(ln, ln, ln), c, 0.4)
    .mul(vec3(0.3, 0.46, 0.88))
    .mul(0.62);
  c = mix(c, moon, paintedNight);
  // a painter's curve: what is below white stays as it was mixed, and only the brightest lights are eased in
  const hi: N = c.sub(0.62).max(0);
  c = c.min(0.62).add(float(0.38).mul(float(1).sub(exp(hi.negate().div(0.38)))));
  const l: N = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(l, l, l), c, 1.06).max(0);
  const toSrgb = (x: N): N =>
    mix(
      x.mul(12.92),
      x
        .pow(1 / 2.4)
        .mul(1.055)
        .sub(0.055),
      step(0.0031308, x),
    );
  c = toSrgb(c);
  if (o.overlay) c = o.overlay(c);
  const n: N = fract(fract(dot(screenCoordinate.xy, vec2(0.06711056, 0.00583715))).mul(52.9829189));
  return vec4(c.add(n.sub(0.5).div(255)), 1);
}

const max1 = (x: N): N => x.max(1e-6);
