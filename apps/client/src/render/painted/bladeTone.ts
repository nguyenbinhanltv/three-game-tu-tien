import * as THREE from 'three/webgpu';
import { uniform } from 'three/tsl';

/**
 * Họa Cảnh P9: tông lá cỏ theo level (cặp [sáng, tối] của đất và mức trộn). Module lá (không import gì của Họa Cảnh) để `lab/blades.ts` đọc mà không tạo vòng
 * import với `theme.ts`; `setPaintedTheme` là nơi duy nhất ghi. `mix` = 0: lá giữ màu nguồn.
 */
export const bladeTone = {
  lit: uniform(new THREE.Color()),
  shade: uniform(new THREE.Color()),
  mix: uniform(0),
};
