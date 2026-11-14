import * as THREE from 'three/webgpu';
import { dot, float, length, materialColor, max, min, mix, pow, smoothstep, vec3, vec4 } from 'three/tsl';

/**
 * Nhuộm áo người chơi bằng tham số material (art bible mục 4.4, quyết định 6.4b): không cần texture mặt nạ riêng.
 *
 * Pipeline đã đổi mọi vải lam bão hòa của asset về đúng một tông (`import.recolor` trong meta.json → `CLOTH_REF`),
 * nên mặt nạ vùng vải tính ngay trong shader: texel có hướng sắc độ (màu trừ xám) gần hướng của `CLOTH_REF` và đủ
 * bão hòa. Da, tóc, gỗ, đồng ngả cam (ngược hướng) và vải ngà/xám (sắc độ thấp) không bị đụng tới. Trong mặt nạ:
 * màu áo × (độ sáng texel / độ sáng `CLOTH_REF`), nên giữ nguyên vân vải và nếp gấp.
 *
 * Đo trên texture màu của chr_kiem_tu_nam (1024²): ~63% texel có cos ≥ 0,9 so với hướng vải, phần còn lại ≤ −0,8
 * hoặc gần xám; ngưỡng [0,7; 0,85] nằm giữa khoảng trống đó.
 */

/** Hệ số độ sáng (tuyến tính, Rec. 709). */
const LUMA = new THREE.Vector3(0.2126, 0.7152, 0.0722);
/** Ngưỡng cos(góc) giữa sắc độ texel và sắc độ vải. */
const COS_LO = 0.7;
const COS_HI = 0.85;
/** Ngưỡng độ bão hòa tương đối (|sắc độ| / độ sáng trung bình). */
const SAT_LO = 0.12;
const SAT_HI = 0.24;

/** Sắc độ (màu trừ trung bình), chuẩn hóa. */
function chromaDir(c: THREE.Color): THREE.Vector3 {
  const m = (c.r + c.g + c.b) / 3;
  return new THREE.Vector3(c.r - m, c.g - m, c.b - m).normalize();
}

/** Màu tuyến tính từ hex sRGB. */
function linear(hex: string): THREE.Color {
  return new THREE.Color().setStyle(hex, THREE.SRGBColorSpace);
}

/**
 * Gắn `colorNode` nhuộm áo vào material đã chuyển từ glTF (giữ map, color, alpha của nó).
 * `clothRef`: màu vải trong texture (hex sRGB); `dye`: màu áo đã chọn. Cùng màu thì giữ nguyên material.
 */
export function applyDye(m: THREE.MeshStandardNodeMaterial, clothRef: string, dye: string): THREE.MeshStandardNodeMaterial {
  if (clothRef.toLowerCase() === dye.toLowerCase()) return m;
  const ref = linear(clothRef);
  const target = linear(dye);
  const dir = chromaDir(ref);
  const refLum = ref.r * LUMA.x + ref.g * LUMA.y + ref.b * LUMA.z;
  const targetLum = target.r * LUMA.x + target.g * LUMA.y + target.b * LUMA.z;

  const base = materialColor;
  const c = base.rgb;
  const mean = dot(c, vec3(1 / 3, 1 / 3, 1 / 3));
  const chroma = c.sub(mean);
  const mag = length(chroma);
  const cosA = dot(chroma, vec3(dir.x, dir.y, dir.z)).div(max(mag, float(1e-4)));
  const mask = smoothstep(COS_LO, COS_HI, cosA).mul(smoothstep(SAT_LO, SAT_HI, mag.div(mean.add(1e-3))));
  // Tỉ lệ sáng của texel so với tông vải gốc (nếp gấp, bóng). Màu sáng (ngà) nén tương phản để vùng sáng không cháy trắng.
  const ratio = dot(c, vec3(LUMA.x, LUMA.y, LUMA.z)).div(refLum);
  const gamma = targetLum > refLum ? 0.6 : 1;
  const dyed = min(vec3(target.r, target.g, target.b).mul(pow(ratio, float(gamma))), vec3(1, 1, 1));
  m.colorNode = vec4(mix(c, dyed, mask), base.a);
  m.needsUpdate = true;
  return m;
}
