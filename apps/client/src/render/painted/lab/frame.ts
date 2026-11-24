import * as THREE from 'three/webgpu';
import {
  abs,
  clamp,
  dot,
  exp,
  float,
  fract,
  mix,
  pass,
  screenCoordinate,
  screenSize,
  screenUV,
  select,
  step,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';
import type { N } from './field';

/**
 * Khung hình: dựa trên painted-valley/src/lib/frame.js (finalMaterial; MIT, © 2026 Patch; xem assets/LICENSES.md), dịch từng dòng sang
 * TSL. Thứ tự pass như nguồn: cảnh HDR (MSAA 4, nửa-float) → [lửa/khói: không có trong cảnh thử] → [bloom: bỏ qua trong lần dịch đầu
 * vì ngưỡng 1,5 không chạm cỏ/hoa; kiểm lại bằng ảnh chênh] → pass cuối: Kuwahara (`painted`) → [viền mực: chỉ cho nhân vật, bước P7]
 * → vignette → phơi sáng → đường cong họa sĩ → bão hòa 1,06 → sRGB → dither.
 */
export interface FrameOpts {
  /** `?paint=` của nguồn: 0 tắt, 3 là mặc định của bản demo. */
  paint: number;
  exposure: number;
  vignette: number;
  samples: number;
}

export function createFrame(renderer: THREE.WebGPURenderer, scene: THREE.Scene, camera: THREE.Camera, o: FrameOpts) {
  const post = new THREE.PostProcessing(renderer);
  post.outputColorTransform = false;
  const scenePass = pass(scene, camera, { samples: o.samples });
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
    const done: N = c0.a.lessThan(0.6);
    // The brush is broadest in the middle distance, where grass is a mass. Near, it leaves the strokes of the blades alone; far off,
    // where a house is a few pixels across, it leaves those alone too.
    const rWide = Math.min(Math.round(o.paint), 2);
    const useOne: N = away.lessThan(16).or(away.greaterThan(140));
    const wide: N = rWide >= 2 ? kuwahara(uv, 2) : kuwahara(uv, 1);
    const one: N = kuwahara(uv, 1);
    c = select(done, c0.rgb, select(useOne, one, wide));
  } else {
    c = c0.rgb;
  }
  // (the line is the colour under it: only for a figure, which writes a small alpha; none here)
  const d: N = uv.sub(0.5);
  c = c.mul(float(1).sub(float(o.vignette).mul(dot(d, d)).mul(1.6)));
  c = c.mul(o.exposure);
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
  const n: N = fract(fract(dot(screenCoordinate.xy, vec2(0.06711056, 0.00583715))).mul(52.9829189));
  post.outputNode = vec4(c.add(n.sub(0.5).div(255)), 1);
  void clamp;
  return {
    render(): void {
      post.render();
    },
    /** Vẽ khung cuối vào một render target (để đọc ảnh bằng readback thay vì chụp màn hình: chụp treo khi khung nặng). */
    renderTo(target: THREE.RenderTarget): void {
      renderer.setRenderTarget(target);
      post.render();
      renderer.setRenderTarget(null);
    },
    dispose(): void {
      post.dispose?.();
    },
  };
}

const max1 = (x: N): N => x.max(1e-6);
