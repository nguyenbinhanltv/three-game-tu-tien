import * as THREE from 'three/webgpu';
import { float, length, smoothstep, uniformArray, vec3 } from 'three/tsl';
import type { N } from './lab/field';
import { paintedNight } from './frame';

/**
 * Họa Cảnh đêm: vũng sáng ấm vẽ lên ĐẤT quanh các đèn (đèn lồng/đèn đá). Đất Họa Cảnh tô phẳng không dùng đèn điểm nên đèn thật không để lại vũng sáng;
 * ở đây dùng chính vị trí và cường độ của các PointLight của `LanternLights` (tối đa `MAX`, những đèn gần người chơi nhất) và cộng một vùng sáng mịn vào
 * `emissiveNode` của đất. Gộp trong shader đất: không thêm draw call. Chỉ có tác dụng khi `paintedNight` > 0 (đêm); màu HDR > 1 nên không bị nhuộm trăng.
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
    const fall: N = float(1).sub(smoothstep(1.0, 8.5, length(xz.sub(p.xy))));
    sum = sum.add(fall.mul(fall).mul(p.z));
  }
  return vec3(1.55, 0.92, 0.4).mul(sum.min(1)).mul(0.7).mul(paintedNight);
}
