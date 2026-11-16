import * as THREE from 'three/webgpu';
import { float, materialColor, mix, texture, uniform, uv, vec3, vec4 } from 'three/tsl';
import { createWorldMaterial, rimLight } from './world';

/**
 * Material áo bộ trang bị mô-đun (T-5, `tools/blender/outfit_build.py`). Một atlas cho cả bộ; mặt nạ nhuộm đi qua kênh ORM của glTF:
 * R = vùng màu chính, G = vùng phụ, B = vùng viền/kim loại (độ phủ mềm, tổng ≈ 1). Vân phát sáng ở emissiveMap (đã nhân màu nhấn).
 *
 * - Nhuộm 3 kênh: màu texel × (1 + Σ mặt nạ_k · (màu nhuộm_k / màu bảng_k − 1)). Không nhuộm thì giữ nguyên (không thêm nút).
 * - Vải và kim loại: vùng viền (B) bóng và kim loại (metalness ≤ 0,6, roughness 0,4); vùng còn lại là vải nhám (0,84).
 * - Vân sáng = emissiveMap × `outfitGlow` (mặc định 1,2, trần HDR của dự án 2,4), cộng viền sáng chung của nhân vật (`rimLight`).
 * Asset cũ (#119, ORM thật không phải mặt nạ) rơi về material glTF + rim.
 */

/** Độ sáng vân phát sáng của mọi bộ (sau này theo bậc/cường hóa). */
export const outfitGlow = uniform(1.2);

export interface OutfitDye {
  /** Bảng màu gốc của bộ (hex sRGB) và màu nhuộm đích theo từng kênh; thiếu kênh = giữ nguyên. */
  palette: { main: string; sec: string; trim: string };
  dye: Partial<{ main: string; sec: string; trim: string }>;
}

const lin = (hex: string) => new THREE.Color().setStyle(hex, THREE.SRGBColorSpace);

/**
 * Chỉ asset dựng bằng `outfit_build.py` có mặt nạ: pipeline ghi extras `dtl_outfitMask` lên material. Không dò theo
 * `roughnessMap === metalnessMap`: GLTFLoader gán cả hai bằng cùng một texture cho MỌI asset có ORM (kể cả bản tạm #119).
 */
export function hasOutfitMask(src: THREE.MeshStandardMaterial): boolean {
  return src.userData?.dtl_outfitMask === 1 && !!src.roughnessMap && src.roughnessMap === src.metalnessMap;
}

export function createOutfitMaterial(src: THREE.MeshStandardMaterial, dye?: OutfitDye): THREE.MeshStandardNodeMaterial {
  const m = createWorldMaterial({
    name: src.name,
    map: src.map,
    normalMap: src.normalMap,
    normalScale: src.normalScale,
    roughness: 0.84,
    metalness: 0,
    side: THREE.DoubleSide, // áo là các tấm vỏ mỏng (vạt, tay áo): không cull mặt sau
  });
  const mask = texture(src.roughnessMap!, uv()).rgb;
  let color = materialColor.rgb;
  if (dye) {
    const ratio = (k: 'main' | 'sec' | 'trim') => {
      const to = dye.dye[k];
      if (!to) return vec3(1, 1, 1);
      const a = lin(to);
      const b = lin(dye.palette[k]);
      return vec3(a.r / Math.max(b.r, 1e-3), a.g / Math.max(b.g, 1e-3), a.b / Math.max(b.b, 1e-3));
    };
    const tint = vec3(1, 1, 1).add(mask.x.mul(ratio('main').sub(1))).add(mask.y.mul(ratio('sec').sub(1))).add(mask.z.mul(ratio('trim').sub(1)));
    color = color.mul(tint);
  }
  m.colorNode = vec4(color, materialColor.a);
  m.metalnessNode = mask.z.mul(0.6);
  m.roughnessNode = mix(float(0.84), float(0.4), mask.z);
  rimLight(m);
  const rim = m.emissiveNode as unknown as ReturnType<typeof vec3>;
  m.emissiveNode = src.emissiveMap ? rim.add(texture(src.emissiveMap, uv()).rgb.mul(outfitGlow)) : rim;
  m.needsUpdate = true;
  return m;
}
