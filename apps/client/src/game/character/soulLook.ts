import * as THREE from 'three/webgpu';
import { float, normalView, positionViewDirection, vec3 } from 'three/tsl';
import { applyPalette } from './monsterSkins';

/** Loại linh thể dựng từ model người chơi: `soul` nguyên anh, `husk` thân xác bỏ lại, `shadow` phân thân Ảnh Biến. */
export type SoulKind = 'soul' | 'husk' | 'shadow';

/**
 * Vật liệu linh thể (E3-K, RFX-1) áp lên bản sao vật liệu của model người chơi (v1 lẫn v3): bảng màu hai tông theo độ sáng texture,
 * rìa fresnel, trong mờ không ghi độ sâu. Gỡ mọi cắt alpha của vật liệu gốc (voan dither của model v3 giữ gốc).
 */
export function applySoulLook(m: THREE.MeshStandardNodeMaterial, kind: SoulKind): void {
  const fres = float(1).sub(normalView.dot(positionViewDirection).clamp(0, 1)).pow(2.2);
  if (kind === 'soul') {
    applyPalette(m, { dark: '#8fb7aa', light: '#eaf6ee', glow: '#f0dc9c' });
    // Cộng sáng: thân ngọc trong mờ, rìa fresnel vàng nhạt đậm dần (đỉnh dưới ngưỡng bloom, không lóa).
    m.emissiveNode = vec3(0.62, 0.78, 0.66)
      .mul(0.16)
      .add(vec3(0.94, 0.82, 0.5).mul(fres.mul(0.85)));
    m.opacityNode = fres.mul(0.45).add(0.42);
    m.blending = THREE.AdditiveBlending;
  } else if (kind === 'shadow') {
    // Phân thân Ảnh Biến (RFX-1): bóng mờ tím sẫm của chính nhân vật, rìa vàng; hòa trộn thường nên đọc được trên nền sáng.
    applyPalette(m, { dark: '#1c0e38', light: '#5a3aa8', glow: '#e2b84a' });
    m.emissiveNode = vec3(0.32, 0.18, 0.62)
      .mul(0.35)
      .add(vec3(0.95, 0.78, 0.35).mul(fres.mul(0.9)));
    m.opacityNode = fres.mul(0.3).add(0.34);
  } else {
    applyPalette(m, { dark: '#3a4a46', light: '#b4c7bf', glow: '#6d8a7a' });
    m.opacityNode = fres.mul(0.2).add(0.34);
  }
  m.alphaTestNode = null;
  m.alphaTest = 0;
  m.alphaHash = false;
  m.vertexColors = false;
  m.transparent = true;
  m.depthWrite = false;
  m.needsUpdate = true;
}
