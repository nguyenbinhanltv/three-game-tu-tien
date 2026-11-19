import type * as THREE from 'three/webgpu';
import { float, instanceIndex, positionLocal, sin, time, uv, vec3 } from 'three/tsl';

/**
 * Gió cho phướn (PROP-1): material vải (`cloth`) của GLB lưu trọng số lắc ở UV.x (0 ở mép treo, 1 ở đầu tự do; vải không có texture
 * nên UV rảnh). Dịch đỉnh trong không gian cục bộ trước ma trận instance, pha lệch theo instance để các lá phướn không lắc đồng bộ.
 * Material khác (cột, xà, đồng) giữ nguyên.
 */
export function bannerSway(m: THREE.MeshStandardNodeMaterial): THREE.MeshStandardNodeMaterial {
  if (!m.name.includes('cloth')) return m;
  const w = uv().x.clamp(0, 1);
  const w2 = w.mul(w);
  const phase = instanceIndex.toFloat().mul(1.73);
  const p = positionLocal;
  const t = time.mul(1.7).add(phase);
  const dx = sin(t.add(p.y.mul(1.1)))
    .mul(0.16)
    .add(sin(t.mul(2.3).add(p.y.mul(2.4))).mul(0.05))
    .mul(w2);
  const dz = sin(t.mul(1.3).add(p.y.mul(0.8)).add(1.1))
    .mul(0.1)
    .add(0.03)
    .mul(w2);
  m.positionNode = vec3(p.x.add(dx), p.y.sub(w2.mul(0.04).mul(float(1))), p.z.add(dz));
  return m;
}
