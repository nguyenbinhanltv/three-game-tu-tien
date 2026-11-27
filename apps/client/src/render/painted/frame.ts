import * as THREE from 'three/webgpu';
import { themeU } from './theme';
import {
  abs,
  clamp,
  dot,
  exp,
  float,
  fract,
  max,
  mix,
  rtt,
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
/** 1 = dùng mặt nạ VFX (mặc định), 0 = tắt (chỉ còn ngưỡng HDR): để so cùng một khung có/không mặt nạ (`window.__vfxMask`, kịch bản vfxlab `--maskcmp`). */
export const vfxMaskOn = uniform(1);

export interface PaintedOutputOpts {
  /** Ánh sáng cộng thêm tại điểm xz của thế giới (vũng đèn đêm), cộng SAU bước nhuộm trăng (đọc từ đích MRT `lamp` mà shader đất ghi). */
  lampGlow?: (uv: N) => N;
  /** Cân bằng màu nhân vào ảnh (chỉ game; cảnh thử đo khớp để trống). Kéo màu cỏ trong game về painted-valley (đo ΔE). */
  tint?: readonly [number, number, number];
  /** `?paint=` của nguồn: 0 tắt, 3 là mặc định của bản demo (bán kính hiệu dụng 2, còn 1 ở rất gần/rất xa). */
  paint: number;
  exposure: number;
  vignette: number;
  /** Độ lệch quang sai màu (UV, 0 = không): R/B lấy mẫu lệch hướng ra mép (trúng đòn). */
  /** Mặt nạ 0..1 tại một điểm UV (VFX/linh quang cần giữ nguyên, không nhòe); có thì Kuwahara bỏ qua chỗ đó và 2 điểm ảnh quanh nó. */
  mask?: (uv: N) => N;
  /**
   * Kết quả của pass bút rộng (`createPaintedWide`, B6) tại một điểm UV: rgb = Kuwahara bút rộng, a = mặt nạ VFX đã nới. Có thì pass cuối KHÔNG tính
   * bút rộng (25 lần lấy mẫu) và không nới mặt nạ (15 lần) ở mọi điểm ảnh; `mask` khi đó bị bỏ qua (đã nằm trong kênh a).
   */
  wide?: (uv: N) => N;
  aberration?: N;
  /** Lớp phủ ở không gian hiển thị (sau sRGB): chớp, viền trúng đòn, khung va chạm… */
  overlay?: (rgb: N) => N;
}

/**
 * The frame as paint: round each point, four overlapping patches; the calmest of them gives its colour. Edges stay where they are and
 * everything between them goes flat, as a loaded brush leaves it.
 * `hdr` lấy mẫu ảnh HDR của cảnh; mỗi bước của cửa sổ dài `texel` (UV); `r` là bán kính theo bước.
 */
function kuwahara(hdr: (uv: N) => N, texel: N, uv: N, r: number): N {
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
}

/**
 * Kuwahara bút rộng (bán kính 2) bằng 16 lần lấy mẫu thay cho 25: mỗi góc phần tư vẫn là hộp 3×3 điểm ảnh cảnh như `kuwahara(…, 2)`, nhưng trung bình
 * của hộp lấy bằng 4 mẫu lọc tuyến tính đặt ở 1/3 và 5/3 điểm ảnh tính từ tâm (hai mẫu như thế theo một trục cho trọng số đều 1/3-1/3-1/3), nên TRUNG BÌNH
 * từng góc là chính xác; chỉ phương sai (để chọn góc lặng nhất) ước lượng từ 4 mẫu đã trộn thay vì 9 điểm.
 * `px`: một điểm ảnh cảnh theo UV; `base`: tâm cách tâm điểm ảnh cảnh gần nhất bao nhiêu điểm ảnh (0 khi `uv` ở tâm điểm ảnh, 0,5 khi ở góc chung).
 */
function kuwaharaBox(hdr: (uv: N) => N, px: N, uv: N, base: N): N {
  const near: N = base.add(1 / 3);
  const far: N = base.add(5 / 3);
  let sum: N = vec3(0);
  let total: N = float(0);
  for (const [sx, sy] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ] as const) {
    let m: N = vec3(0);
    let q: N = vec3(0);
    for (const dx of [near, far]) {
      for (const dy of [near, far]) {
        const raw: N = hdr(uv.add(vec2(dx.mul(sx), dy.mul(sy)).mul(px))).rgb;
        const c: N = raw.div(raw.add(1));
        m = m.add(c);
        q = q.add(c.mul(c));
      }
    }
    const mean: N = m.div(4);
    const v: N = abs(q.div(4).sub(mean.mul(mean)));
    const vs: N = v.x.add(v.y).add(v.z);
    // (the calmest patch nearly alone, but never a hard choice: a hard one flickers)
    const w: N = float(1).div(vs.mul(vs).mul(vs).mul(vs).mul(1e12).add(1e-7));
    sum = sum.add(mean.mul(w));
    total = total.add(w);
  }
  const out: N = sum.div(total);
  return out.div(float(1).sub(out.min(0.985)));
}

/**
 * Pass bút rộng của Họa Cảnh (B6): vẽ vào một đích riêng (`createPaintedWide`), pass cuối đọc lại bằng `PaintedOutputOpts.wide`.
 * rgb = Kuwahara bút rộng (`kuwaharaBox`, 16 lần lấy mẫu); a = mặt nạ VFX nới 2 điểm ảnh cảnh (như bản cũ) để mép VFX không bị trộn với nền.
 * `px`: một điểm ảnh cảnh theo UV; `base`: xem `kuwaharaBox` (0 khi đích bằng cỡ cảnh, 0,5 khi đích bằng nửa cảnh).
 */
export function paintedWide(scenePass: N, o: { mask?: (uv: N) => N; px: N; base: N }): N {
  const tHdr: N = scenePass.getTextureNode('output');
  const uv: N = screenUV;
  const wide: N = kuwaharaBox((p) => tHdr.sample(p), o.px, uv, o.base);
  let m: N = float(0);
  if (o.mask) {
    const mk = (du: number, dv: number): N => o.mask!(uv.add(vec2(du, dv).mul(o.px)));
    m = max(max(max(mk(0, 0), mk(2, 0)), max(mk(-2, 0), mk(0, 2))), mk(0, -2));
  }
  return vec4(wide, m);
}

const _buf = new THREE.Vector2();

/** Tỉ lệ cỡ đích bút rộng so với bộ đệm vẽ: xấp xỉ độ phân giải MÀN HÌNH (1/pixelRatio), không dưới nửa và không quá cỡ cảnh. */
export function paintedWideScale(pixelRatio: number): number {
  return Math.min(1, Math.max(0.5, 1 / Math.max(pixelRatio, 1e-3)));
}

/** Đích của `paintedWide`, kèm việc giữ cỡ và giải phóng (dùng chung cho game `render/post.ts` và cảnh thử `lab/frame.ts`). */
export interface PaintedWidePass {
  /** Mẫu tại một điểm UV màn hình: rgb = bút rộng, a = mặt nạ đã nới. Truyền cho `PaintedOutputOpts.wide`. */
  sample(uv: N): N;
  /** Gọi trước mỗi lần vẽ: đặt cỡ đích theo bộ đệm vẽ và pixelRatio hiện tại (`RTTNode` có cỡ đặt tay không tự đổi theo cửa sổ). */
  resize(renderer: THREE.WebGPURenderer): void;
  dispose(): void;
}

/**
 * Đích bút rộng co giãn theo pixelRatio nội bộ (`paintedWideScale`): Cao (pixelRatio ~2) → nửa cỡ cảnh, tức 16 lần lấy mẫu trên 1/4 số điểm ảnh;
 * pixelRatio 1 (Thấp, màn lớn ở Vừa) → bằng cỡ cảnh, 16 lần lấy mẫu mỗi điểm ảnh và không mềm đi vì phóng to. Đổi cỡ không phải dựng lại pipeline:
 * chỉ đổi cỡ đích và hai uniform.
 */
export function createPaintedWide(scenePass: N, o: { mask?: (uv: N) => N } = {}): PaintedWidePass {
  const px = uniform(new THREE.Vector2(1, 1));
  const base = uniform(0);
  // Nửa-float: giá trị HDR sau Kuwahara; 8 bit tuyến tính sẽ bậc thang ở vùng tối.
  const target = rtt(paintedWide(scenePass, { ...o, px, base }), 2, 2, { type: THREE.HalfFloatType });
  return {
    sample: (uv) => target.sample(uv),
    resize(renderer) {
      renderer.getDrawingBufferSize(_buf);
      const k = paintedWideScale(renderer.getPixelRatio());
      const w = Math.max(1, Math.ceil(_buf.x * k));
      const h = Math.max(1, Math.ceil(_buf.y * k));
      if (target.width !== w || target.height !== h) target.setSize(w, h);
      px.value.set(1 / _buf.x, 1 / _buf.y);
      // k = 1: tâm điểm ảnh đích trùng tâm điểm ảnh cảnh (cửa sổ 5×5, các góc phần tư chung hàng/cột giữa như bản gốc);
      // k = 0,5: tâm rơi vào góc chung của 4 điểm ảnh cảnh (cửa sổ 6×6, bốn hộp 3×3 rời nhau).
      base.value = 1 - k;
    },
    dispose() {
      target.renderTarget?.dispose();
      // RTTNode không tự giải phóng vật liệu của quad
      (target as unknown as { _quadMesh?: { material: THREE.Material } })._quadMesh?.material.dispose();
      target.dispose();
    },
  };
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

  const uv: N = screenUV;
  const c0: N = hdr(uv).toVar();
  let c: N;
  // điểm ảnh của VFX (mặt nạ/HDR): giữ màu và độ chói gốc, kể cả khỏi nhuộm trăng ban đêm (vòng chọn, rune không chìm)
  let vfxKeep: N = float(0);
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
    const one: N = kuwahara(hdr, texel, uv, 1);
    // bút rộng: đọc từ pass riêng nếu có (B6), không thì tính tại chỗ (bản dịch từng dòng; mức bút không có pass riêng)
    const half: N | null = o.wide && rWide >= 2 ? o.wide(uv) : null;
    const wide: N = half ? half.rgb : rWide >= 2 ? kuwahara(hdr, texel, uv, 2) : one;
    const painted: N = select(done, c0.rgb, select(useOne, one, wide));
    let keep: N = smoothstep(1.3, 2.2, hiLum);
    if (half) {
      // mặt nạ đã nới sẵn ở pass bút rộng
      keep = max(keep, clamp(half.a.mul(6), 0, 1).mul(vfxMaskOn));
    } else if (o.mask) {
      // mặt nạ mở rộng 2 điểm ảnh (cửa sổ Kuwahara) để mép VFX không bị trộn với nền
      const mk = (du: number, dv: number): N => o.mask!(uv.add(vec2(du, dv).mul(texel)));
      const m: N = max(max(max(mk(0, 0), mk(2, 0)), max(mk(-2, 0), mk(0, 2))), mk(0, -2));
      keep = max(keep, clamp(m.mul(6), 0, 1).mul(vfxMaskOn));
    }
    vfxKeep = keep;
    c = mix(painted, c0.rgb, keep);
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
  if (o.tint) c = c.mul(vec3(...o.tint));
  // đêm Họa Cảnh: giữ ít tông (sáng/tối của bản vẽ), nhuộm lam ánh trăng, tối rõ nhưng còn đọc được hình
  const ln: N = dot(c, vec3(0.2126, 0.7152, 0.0722));
  const moonBase: N = mix(vec3(ln, ln, ln), c, 0.4)
    .mul(themeU.nightTint)
    .mul(themeU.nightGain)
    .mul(0.62);
  // tương phản đêm theo level (theme.ts; 1 = giữ nguyên Vân Lam): kéo sáng/tối xa nhau quanh 0,1 để vách, nhân vật còn khối
  const moon: N = moonBase.sub(0.1).mul(themeU.nightContrast).add(0.1).max(0);
  // vùng tối (nhân vật, quái, bóng) được nâng sàn lam để còn đọc được hình; điểm sáng HDR (đèn, VFX) không bị nhuộm trăng: giữ màu và độ chói của chúng
  const floorLift: N = vec3(0.02, 0.03, 0.055).mul(float(1).sub(smoothstep(0.0, 0.2, ln)));
  const hot: N = smoothstep(0.7, 1.5, ln);
  c = mix(c, moon.add(floorLift), paintedNight.mul(float(1).sub(hot)).mul(float(1).sub(vfxKeep)));
  if (o.lampGlow) c = c.add(o.lampGlow(uv).mul(paintedNight));
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
