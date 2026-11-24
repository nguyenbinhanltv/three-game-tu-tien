import * as THREE from 'three/webgpu';
import { clamp, dot, float, mix, normalize, smoothstep, texture, uniform, vec2, vec3 } from 'three/tsl';
import { getBrushTexture } from './brush';
import { CEL_SOFT, paintedColor, type PaintedKey } from './palette';

/**
 * Họa Cảnh P2: màu mặt đất theo kiểu vẽ tay. Một mảng xanh chậm + nét mảnh chạy theo dốc + chấm tròn, mờ dần trước khi thành lấm tấm;
 * mỗi chỗ chỉ hai tông (sáng/tối) nối bằng một bước ngắn. Nền đá/vách/tuyết/lát đá giữ nguyên (chỉ thay đất cỏ và đường mòn).
 * Ý tưởng dựa trên painted-valley (`heroPaint` ở src/lib/glsl.js, MIT, © 2026 Patch; xem assets/LICENSES.md), viết lại bằng TSL.
 */
/** Node TSL: dùng any cho gọn (giống materials/ground.ts). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Node = any;

export const paintedGroundParams = {
  /** Nhân sáng toàn phần: bù hệ số gain 1,5 của albedo texture, chỉnh theo ảnh so sánh. */
  gain: uniform(0.86),
  /** Độ tương phản của nét cọ (0 = chỉ còn mảng màu). */
  strokes: uniform(1),
};

const v3 = (key: PaintedKey, which: 0 | 1): Node => {
  const c = paintedColor(key, which, new THREE.Color());
  return vec3(c.r, c.g, c.b);
};

export interface PaintedGroundIn {
  /** Tọa độ thế giới xz. */
  p: Node;
  /** Khoảng cách tới camera (m). */
  dist: Node;
  /** Pháp tuyến hình học thế giới. */
  nGeo: Node;
  /** Mặt nạ vĩ mô 4096 m (`tex.mask.a`) lấy ở hai tỉ lệ. */
  patchA: Node;
  patchB: Node;
  /** Trọng số 0..1. */
  forest: Node;
  dry: Node;
  path: Node;
  /** Phần đất cỏ/đường mòn được tô (0 trên đá, vách, tuyết, lát đá, mộ). */
  weight: Node;
}

/** Hệ số 0..1 của nét cọ trong khoảng cách: đầy ở gần, hết ở xa (nét mảnh ở xa chỉ gây lấp lánh). */
const strokeFade = (dist: Node): Node => float(1).sub(smoothstep(38, 120, dist));

/** Màu đất cỏ vẽ tay; trả về màu tuyến tính, đã nhân `gain`. */
export function paintedGroundColor(base: Node, i: PaintedGroundIn): Node {
  const brush = getBrushTexture();
  const slope = float(1).sub(i.nGeo.y);
  // Hướng nét: theo hướng xuống dốc ở sườn, chéo cố định ở đất bằng (đổi mượt để không đứt nét).
  const down = normalize(vec2(i.nGeo.x, i.nGeo.z).add(vec2(0.0001, 0.0001)));
  const flatDir = vec2(0.8, 0.6);
  const dir = normalize(mix(flatDir, down, smoothstep(0.015, 0.1, slope)));
  const perp = vec2(dir.y.negate(), dir.x);
  const uvA = vec2(dot(i.p, dir), dot(i.p, perp)).div(12);
  const uvB = vec2(dot(i.p, dir), dot(i.p, perp)).div(37).add(0.31);
  const bA = texture(brush, uvA);
  const bB = texture(brush, uvB);
  const fade = strokeFade(i.dist).mul(paintedGroundParams.strokes);
  // Mảng xanh chậm: hai mặt nạ vĩ mô chọn giữa xanh đậm và xanh sáng; cộng mảng mềm của texture nét cọ ở gần.
  const patch = clamp(i.patchA.mul(0.6).add(i.patchB.mul(0.6)).sub(0.15).add(bB.g.sub(0.5).mul(0.5).mul(fade)), 0, 1);
  const patchK = smoothstep(0.3, 0.7, patch);
  const litG = mix(v3('meadow', 0), v3('meadowLight', 0), patchK);
  const shadeG = mix(v3('meadow', 1), v3('meadowLight', 1), patchK);
  // Rừng: sàn rừng thiên về tán lá; đất khô và đường mòn thiên về đất.
  const litF = mix(litG, v3('foliage', 0), i.forest.mul(0.7));
  const shadeF = mix(shadeG, v3('foliage', 1), i.forest.mul(0.7));
  // đất nhận từ cả màu gốc (mảng đất khô/đường mòn rải ở isoDetail): chỗ đỏ lấn xanh thì là đất
  const soil = smoothstep(0.07, 0.2, base.r.sub(base.g.mul(0.92)));
  const earthK = clamp(max2(max2(i.dry.mul(0.85), i.path), soil), 0, 1);
  const lit = mix(litF, v3('earth', 0), earthK);
  // nét tối là NÉT CỌ chứ không phải bóng thật: dùng tông tối pha nửa với tông sáng cho dịu (bóng thật vẫn do bản đồ bóng của cảnh)
  const shade = mix(lit, mix(shadeF, v3('earth', 1), earthK), 0.55);
  // Tông: nét sáng (R > 0,5) kéo về màu sáng, nét tối kéo về màu tối; mảng chậm quyết định thiên về đâu.
  const stroke = bA.r.sub(0.5).mul(1.0).mul(fade);
  const tone = clamp(float(0.68).add(patch.sub(0.5).mul(0.4)).add(stroke), 0, 1);
  const painted = mix(shade, lit, smoothstep(float(0.5).sub(CEL_SOFT), float(0.5).add(CEL_SOFT), tone));
  return mix(base, painted.mul(paintedGroundParams.gain), clamp(i.weight, 0, 1));
}

const max2 = (a: Node, b: Node): Node => a.max(b);

/**
 * Màu bụi cỏ vẽ tay: gốc tối (màu tối của bảng), ngọn sáng (màu sáng), nối bằng một bước ngắn; màu nhuộm của từng bụi chỉ còn làm
 * lệch độ sáng nhẹ (cỏ khô/cỏ xanh khác nhau chút) chứ không đổi sắc, để cỏ cùng bảng màu với đất.
 */
export function paintedGrassColor(tint: Node, h: Node): Node {
  const lum = dot(tint, vec3(0.3, 0.55, 0.15));
  const k = clamp(lum.mul(2.2), 0.7, 1.25);
  const lit = mix(v3('meadow', 0), v3('meadowLight', 0), smoothstep(0.35, 0.8, lum.mul(2)));
  const shade = mix(v3('meadow', 1), v3('meadowLight', 1), smoothstep(0.35, 0.8, lum.mul(2)));
  return mix(shade, lit, smoothstep(float(0.38).sub(CEL_SOFT), float(0.38).add(CEL_SOFT), h))
    .mul(k)
    .mul(paintedGroundParams.gain);
}
