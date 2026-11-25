import { distance, cameraPosition, float, mix, smoothstep, time, vec2, vec3 } from 'three/tsl';
import { LIGHT } from './fieldShared';
import type { N, RefField } from './lab/field';

/**
 * Họa Cảnh P4 (phần thấp): sương nằm sát đáy thung lũng, vẽ vào màu ĐẤT (không thêm draw call). Sương painted-valley rất nhạt (mật độ 0,00017) nên đồng gần
 * không có sương; ở đây thêm một lớp sương thấp theo độ cao mặt đất (đáy thung lũng/suối) và khoảng cách tới camera: không có ở gần, đậm dần ra xa, trôi
 * chậm theo nhiễu mềm. Màu = màu sương của `LIGHT`. Chỉ `?style=painted`.
 */
export function lowMistAt(F: RefField, xz: N, y: N, strength = 0.5): N {
  const dist: N = distance(vec2(xz), vec2(cameraPosition.x, cameraPosition.z));
  const floorBand: N = float(1).sub(smoothstep(46, 66, y));
  const away: N = smoothstep(16, 70, dist);
  const drift: N = F.noise(xz.mul(0.011).add(vec2(time.mul(0.012), time.mul(0.007))), false).a;
  const body: N = smoothstep(0.25, 0.75, drift).mul(0.7).add(0.3);
  return floorBand.mul(away).mul(body).mul(strength);
}

/** Màu sương (tuyến tính) của giờ painted. */
export const LOW_MIST_COLOR = vec3(...(LIGHT.fogColor as [number, number, number])).mul(1.05);

/** Trộn sương thấp vào một màu đất phát sáng. */
export function withLowMist(F: RefField, color: N, xz: N, y: N, weight: N): N {
  return mix(color, LOW_MIST_COLOR, lowMistAt(F, xz, y).mul(weight));
}
