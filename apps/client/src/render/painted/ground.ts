import * as THREE from 'three/webgpu';
import { cameraPosition, clamp, distance, float, mix, positionWorld, smoothstep, uniform, vec3 } from 'three/tsl';
import { hash42, meadowGreen, meadowTint, paintGround, slopeRel, type Node } from './meadow';
import { paintedColor } from './palette';

/**
 * Họa Cảnh P2: màu mặt đất đồng cỏ vẽ tay, port từ painted-valley (src/lib/ground.js, nhánh "beyond the last blades the ground is the grass";
 * MIT, © 2026 Patch, xem assets/LICENSES.md): `meadowGreen` theo tông (dốc quay về nắng), nhuộm `meadowTint`, `paintGround` (nét cọ + mảng
 * xanh vàng/lam). Lớp cỏ lá mảnh nằm ở `game/world/paintedGrass.ts`; đất dưới lá hơi tối hơn. Đá/vách/tuyết/lát đá/mộ giữ nguyên.
 */
export const paintedGroundParams = {
  /**
   * Nhân sáng toàn phần: đưa màu bảng (đã nhân ánh sáng ~1,2 ở nguồn) về đúng độ sáng sau đèn PBR của ta. Chỉnh theo ảnh đối chiếu cùng góc.
   */
  gain: uniform(1.0),
  /** Nhuộm ấm bù ánh sáng lạnh của cảnh (nguồn nhân `meadowLight` ~1,2 và hơi ấm ở trưa). */
  tint: uniform(new THREE.Color(1.1, 1.04, 0.84)),
};

const earth = (which: 0 | 1): Node => {
  const c = paintedColor('earth', which, new THREE.Color());
  return vec3(c.r, c.g, c.b);
};

export interface PaintedGroundIn {
  /** Pháp tuyến hình học thế giới. */
  nGeo: Node;
  /** Trọng số 0..1. */
  forest: Node;
  dry: Node;
  path: Node;
  /** Phần đất cỏ/đường mòn được tô (0 trên đá, vách, tuyết, lát đá, mộ). */
  weight: Node;
}

/** Màu đất cỏ vẽ tay; trả về màu tuyến tính, đã nhân `gain`. */
export function paintedGroundColor(base: Node, i: PaintedGroundIn): Node {
  const xz = positionWorld.xz;
  // camera chéo: khoảng cách tới camera trên mặt phẳng ngang, như `distance(xz, uCamPos.xz)` của nguồn
  const dist = distance(xz, cameraPosition.xz);
  const rel = slopeRel(i.nGeo);
  const tone = float(0.6)
    .add(rel.sub(0.5).mul(mix(0.6, 0.4, smoothstep(150, 450, dist))))
    .sub(i.forest.mul(0.22));
  let g: Node = meadowGreen(tone).mul(mix(vec3(1), meadowTint(xz), float(0.5).mul(float(1).sub(smoothstep(40, 110, dist)))));
  g = paintGround(g, xz, dist);
  // đất trần: đường mòn và nền đất khô, màu be nhạt (đường trong nguồn cũng sáng và nổi hẳn lên khỏi cỏ)
  const soil = clamp(i.path.max(i.dry.mul(0.85)).max(smoothstepSoil(base)), 0, 1);
  const lit = mix(earth(1), earth(0), clamp(hash42(xz.mul(0.7).floor()).x.mul(0.35).add(0.65), 0, 1));
  g = mix(g, lit, soil);
  // đất dưới lá hơi tối hơn, sáng dần ra xa nơi lá không vẽ nữa
  g = g.mul(mix(0.78, 1.0, smoothstep(8, 60, dist)));
  return mix(base, g.mul(paintedGroundParams.gain).mul(paintedGroundParams.tint), clamp(i.weight, 0, 1));
}

/** Đất nhận từ màu gốc (mảng đất khô/đường mòn rải ở isoDetail): chỗ đỏ lấn xanh thì là đất. */
function smoothstepSoil(base: Node): Node {
  return smoothstep(0.07, 0.2, base.r.sub(base.g.mul(0.92)));
}
