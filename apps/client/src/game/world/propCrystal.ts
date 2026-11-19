import * as THREE from 'three/webgpu';
import { float, normalView, positionViewDirection, pow, vec3, vertexColor } from 'three/tsl';

/**
 * Vật liệu tinh thể cho prop PROP-1 (cùng kiểu mạch tinh Phục Mạch v2): màu đỉnh là gradient chân tối → lõi sáng ở mũi (Blender, `crystal_prism`),
 * dùng làm màu phát sáng; thêm fresnel viền sáng cùng sắc với màu đỉnh, mặt giữa sẫm như có chiều sâu. `tcvein` = mặt sáng, `tccrystal` = kính sẫm chỉ bắt viền.
 * Không phải vật liệu tinh thể thì trả nguyên. Màu trầm (ngọc lục / lam băng), không bão hòa.
 */
export function propCrystal(m: THREE.MeshStandardNodeMaterial): THREE.MeshStandardNodeMaterial {
  const isVein = m.name.endsWith('_tcvein');
  if (!isVein && !m.name.endsWith('_tccrystal')) return m;
  const vc = vertexColor();
  const fres = pow(float(1).sub(normalView.dot(positionViewDirection).abs()), 2.2);
  // Độ sáng đỉnh (0 chân → 1 mũi): lõi nóng ở mũi (pha trắng cùng sắc), chân vẫn phát sáng nhẹ nên không phẳng một màu.
  const lum = vc.dot(vec3(0.3, 0.5, 0.2)).mul(2.2).clamp(0, 1);
  const core = vc.mul(float(1).add(lum.mul(lum).mul(0.9)));
  const rim = vc.normalize().mul(fres).mul(isVein ? 0.7 : 0.55);
  m.roughness = isVein ? 0.12 : 0.08;
  m.metalness = isVein ? 0.05 : 0.3;
  m.colorNode = vc.mul(isVein ? 0.3 : 0.55);
  m.emissiveNode = isVein ? core.mul(0.9).add(rim) : vc.mul(0.5).add(rim);
  return m;
}
