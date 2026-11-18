import * as THREE from 'three/webgpu';
import { abs, atan, clamp, color, float, floor, fract, length, max, min, select, sin, smoothstep, step, time, uv, vec2 } from 'three/tsl';
import { hash21, type FxUniforms, type N } from './common';

/**
 * Pháp trận / vùng báo trước (M4-3): một tấm phẳng duy nhất, mọi chi tiết vẽ trong fragment shader.
 *
 * Hình (theo `HazardMsg` của server; client chỉ vẽ, ai trúng do server phán định):
 * - tròn: tâm (x, z), bán kính r.
 * - chữ nhật: gốc ở mép sau, dài r theo hướng `yaw`, rộng w.
 * - quạt: đỉnh ở gốc, bán kính r, nửa góc w.
 *
 * Các lớp, từ dưới lên: nền mực mờ đúng hình (tương phản trên nền đá/sương sáng) → phần đã quét đậm
 * hơn → sọc chảy ở phần chưa quét (vạch chữ V với chữ nhật, cung với tròn/quạt) → dải phù văn hoa
 * văn không đọc được (art bible mục 8.11), xoay/trôi theo thời gian → viền ngoài + vòng trong →
 * **vạch tiến độ** chạy từ gốc ra mép. Vạch chạm mép là lúc nổ; vùng tròn có thêm viền sáng dần như
 * kim đồng hồ. 25% cuối viền nháy nhanh dần và sáng hơn.
 *
 * Tham số theo lưới: `fxA` = (tiến độ k 0..1, hình 0/1/2, nháy 0/1 ở 80 ms cuối, seed); `fxB` = (r, w, cỡ tấm x, cỡ tấm z)
 * theo mét. Tấm là `SIGIL_GEO` (1×1 nằm ngang) phóng theo `sigilLayout`.
 */

export const SIGIL_CIRCLE = 0;
export const SIGIL_RECT = 1;
export const SIGIL_CONE = 2;
export type SigilShape = typeof SIGIL_CIRCLE | typeof SIGIL_RECT | typeof SIGIL_CONE;

/** Lề quanh hình để viền không bị cắt (m). */
export const SIGIL_PAD = 0.3;
/** Màu nền mực (lam ngọc rất tối). */
const SIGIL_INK = 0x0d1c20;

/** Tấm 1×1 nằm ngang, tâm ở gốc. */
export const SIGIL_GEO = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);

interface SigilLayout {
  /** Cỡ tấm theo trục x/z cục bộ (m). */
  sx: number;
  sz: number;
  /** Tâm tấm cách gốc vùng bao xa theo hướng `yaw` (m). */
  offset: number;
}

/** Cỡ và vị trí tấm cho một vùng. `w`: bề rộng (chữ nhật) hoặc nửa góc (quạt, rad). */
export function sigilLayout(shape: SigilShape, r: number, w: number): SigilLayout {
  const p2 = SIGIL_PAD * 2;
  if (shape === SIGIL_CIRCLE) return { sx: 2 * r + p2, sz: 2 * r + p2, offset: 0 };
  if (shape === SIGIL_RECT) return { sx: w + p2, sz: r + p2, offset: r / 2 };
  const half = Math.min(Math.PI / 2, Math.max(0.01, w));
  return { sx: 2 * r * Math.sin(half) + p2, sz: r + p2, offset: r / 2 };
}

/** Một nét phù văn ngang (theo `cu`) ở hàng `y`, từ `l` tới `rr` trong ô 0..1. */
function hStroke(cu: N, cv: N, y: number, l: N, rr: N): N {
  return float(1)
    .sub(smoothstep(0.045, 0.075, abs(cv.sub(y))))
    .mul(smoothstep(l.sub(0.03), l, cu))
    .mul(float(1).sub(smoothstep(rr, rr.add(0.03), cu)));
}

/** Một nét dọc ở cột `x`, từ `l` tới `rr`. */
function vStroke(cu: N, cv: N, x: number, l: N, rr: N): N {
  return hStroke(cv, cu, x, l, rr);
}

/** Hoa văn trong một ô: 3 nét ngang + 2 nét dọc bật/tắt và dài ngắn theo hash. Không thành chữ. */
function glyph(cell: N, seed: N, cu: N, cv: N): N {
  const ha = hash21(vec2(cell, seed));
  const hb = hash21(vec2(cell, seed.add(1.7)));
  const hc = hash21(vec2(cell, seed.add(3.1)));
  const hd = hash21(vec2(cell, seed.add(5.3)));
  const lo = float(0.16);
  const hi = float(0.84);
  const mid = float(0.5);
  // Mỗi nét: bật nếu hash > ngưỡng; nửa trái/phải/cả nét theo phần lẻ của hash.
  const span = (h: N) => fract(h.mul(7.3));
  const left = (h: N) => select(span(h).lessThan(0.33), mid, lo);
  const right = (h: N) => select(span(h).greaterThan(0.66), mid, hi);
  const s1 = hStroke(cu, cv, 0.18, left(ha), right(ha)).mul(step(0.35, ha));
  const s2 = hStroke(cu, cv, 0.5, left(hb), right(hb)).mul(step(0.3, hb));
  const s3 = hStroke(cu, cv, 0.82, left(hc), right(hc)).mul(step(0.4, hc));
  const s4 = vStroke(cu, cv, 0.3, left(hd), right(hd)).mul(step(0.3, hd));
  const s5 = vStroke(cu, cv, 0.7, left(ha.add(hc)), right(hb.add(hd))).mul(step(0.45, fract(ha.mul(13.1))));
  return min(max(max(s1, s2), max(max(s3, s4), s5)), 1);
}

export function sigilNodes(U: FxUniforms) {
  const k = U.a.x;
  const shape = U.a.y;
  const seed = U.a.w;
  /** 80 ms cuối của vùng báo (K-6): 1 = nháy sáng một lần. */
  const flash = U.a.z;
  const r = U.b.x;
  const w = U.b.y;
  const one = float(1);

  // Tọa độ cục bộ suy từ uv (tấm 1×1 nằm ngang: x = u − 0,5, z = −(v − 0,5)). Không dùng `positionLocal`: với InstancedMesh
  // three gán lại nó theo ma trận instance (gộp draw call, K-6).
  const st = uv();
  const p = vec2(st.x.sub(0.5).mul(U.b.z), float(0.5).sub(st.y).mul(U.b.w));
  const isCircle = shape.lessThan(0.5);
  const isRect = shape.greaterThan(0.5).and(shape.lessThan(1.5));
  // Gốc vùng: tâm (tròn) hoặc mép sau / đỉnh quạt.
  const q = select(isCircle, p, p.add(vec2(0, r.mul(0.5))));
  const rho = length(q);
  const ang = atan(q.x, q.y);
  const hw = w.mul(0.5);

  // s: tọa độ tiến độ (m) từ gốc ra mép; d: khoảng cách tới biên (dương ở trong);
  // band: khoảng cách từ biên ngoài của dải phù văn; along: chiều dài dọc dải (m).
  const sM = select(isRect, q.y, rho);
  const dCircle = r.sub(rho);
  const dRect = min(min(q.y, r.sub(q.y)), hw.sub(abs(q.x)));
  const dCone = min(r.sub(rho), rho.mul(sin(w.sub(abs(ang)))));
  const d = select(isCircle, dCircle, select(isRect, dRect, dCone));
  const band = select(isRect, hw.sub(abs(q.x)), dCircle);
  const along = select(isRect, q.y, ang.mul(r));

  const inside = smoothstep(-0.03, 0.03, d);
  const urg = smoothstep(0.7, 1, k);
  const pulse = sin(time.mul(float(14).add(urg.mul(18)))).mul(0.5).add(0.5);

  // Viền ngoài; vùng tròn sáng dần theo kim đồng hồ (từ phía sau, tới k).
  const border = one.sub(smoothstep(0.05, 0.11, abs(d.sub(0.12))));
  const a01 = ang.div(Math.PI * 2).add(0.5);
  const clockLit = select(isCircle, one.sub(smoothstep(k.sub(0.004), k, a01)).mul(0.6).add(0.4), one);
  const borderL = border.mul(clockLit).mul(urg.mul(pulse).mul(0.6).add(0.85));

  // Dải phù văn.
  const bandW = clamp(min(r.mul(0.11), select(isRect, hw.mul(0.38), r)), 0.3, 0.7);
  const b0 = float(0.3);
  const cv = band.sub(b0).div(bandW);
  const inBand = smoothstep(-0.02, 0.02, cv).mul(one.sub(smoothstep(0.98, 1.02, cv))).mul(inside);
  const cellLen = bandW.mul(1.15);
  // Tròn: xoay; chữ nhật: trôi về phía trước; quạt: trôi ngang chậm.
  const speed = select(isCircle, float(0.7), select(isRect, float(-1.4), float(0.5)));
  const a2 = along.div(cellLen).sub(time.mul(speed).div(cellLen));
  const runes = glyph(floor(a2), seed, fract(a2), cv).mul(inBand);
  const innerLine = one.sub(smoothstep(0.02, 0.045, abs(band.sub(b0.add(bandW).add(0.08))))).mul(inside).mul(0.55);

  // Phần đã quét và vạch tiến độ.
  const kM = k.mul(r);
  const filled = inside.mul(one.sub(smoothstep(kM.sub(0.06), kM, sM)));
  const front = one.sub(smoothstep(0.08, 0.18, abs(sM.sub(kM)))).mul(inside);

  // Sọc chảy ra ngoài ở phần chưa quét (chữ nhật: chữ V hướng về phía trước).
  const sc = select(isRect, q.y.sub(abs(q.x).mul(0.7)), rho);
  const stripe = smoothstep(0.55, 0.85, fract(sc.div(1.1).sub(time.mul(1.2))))
    .mul(inside)
    .mul(one.sub(filled))
    .mul(smoothstep(0.05, 0.6, d));

  const L0 = borderL.add(innerLine).add(runes.mul(0.85)).add(front).add(stripe.mul(0.32)).add(filled.mul(0.04));
  // Nháy 80 ms cuối chỉ làm sáng viền và vạch tiến độ, không phủ thêm lên nền.
  const L = L0.add(flash.mul(borderL.add(front).mul(0.9).mul(inside)));
  const b = clamp(L.mul(0.95), 0, 0.95);
  // Nền ≤ 0,35 (K-6) để vẫn đọc được chân nhân vật.
  const wash = inside.mul(0.3);
  const A = b.add(wash.mul(one.sub(b)));
  const hot = one.add(urg.mul(0.5)).add(front.mul(0.4)).add(flash.mul(0.5));
  const bright = min(U.color.mul(hot), U.maxHdr);
  const col = bright.mul(b).add(color(SIGIL_INK).mul(wash.mul(one.sub(b)))).div(max(A, 0.001));
  return { color: col, opacity: A.mul(U.opacity) };
}
