import * as THREE from 'three/webgpu';
import { float, length, smoothstep, uniformArray, vec3 } from 'three/tsl';
import type { N } from './lab/field';

/**
 * Họa Cảnh đêm: vũng sáng ấm vẽ lên ĐẤT quanh các đèn (đèn lồng/đèn đá). Đất Họa Cảnh tô phẳng không dùng đèn điểm nên đèn thật không để lại vũng sáng;
 * ở đây dùng chính vị trí và cường độ của các PointLight của `LanternLights` (tối đa `MAX`, những đèn gần người chơi nhất) và cộng một vùng sáng mịn bán kính ~5,6 m màu hổ phách. Cộng ở pass cuối SAU bước nhuộm trăng (`paintedOutput`, từ vị trí thế giới dựng lại từ độ sâu) nên giữ đúng tông ấm
 * và phủ cả nhân vật đứng gần đèn; không thêm draw call.
 */
const MAX = 8;
/** Cường độ cơ sở của `LanternLights` (baseIntensity mặc định 22): chia để ra hệ số ~0..1. */
const BASE = 22;
const data = Array.from({ length: MAX }, () => new THREE.Vector4());
const lamps = uniformArray(data, 'vec4');

/** Gọi mỗi khung sau `LanternLights.update`. */
export function updateLampPools(lights: readonly THREE.PointLight[]): void {
  for (let i = 0; i < MAX; i++) {
    const l = lights[i];
    if (!l || !l.visible) data[i]!.set(0, 0, 0, 0);
    else data[i]!.set(l.position.x, l.position.z, l.intensity / BASE, 0);
  }
}

/** Ánh sáng ấm (HDR, cộng thêm) của các vũng đèn tại điểm xz của mặt đất. */
export function lampPoolAt(xz: N): N {
  let sum: N = float(0);
  for (let i = 0; i < MAX; i++) {
    const p: N = lamps.element(float(i));
    const fall: N = float(1).sub(smoothstep(0.8, 5.6, length(xz.sub(p.xy))));
    sum = sum.add(fall.mul(fall).mul(p.z));
  }
  return vec3(1.3, 0.72, 0.24).mul(sum.min(1)).mul(0.5);
}
