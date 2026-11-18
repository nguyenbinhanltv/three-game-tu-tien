import * as THREE from 'three/webgpu';
import { float, mix, normalView, normalWorld, positionViewDirection } from 'three/tsl';
import { rimParams } from '../atmosphere';
import { skyParams } from '../sky';
import { registerDerived } from './derived';

/**
 * Material PBR cách điệu dùng chung cho thế giới (địa hình, cây, kiến trúc, nhân vật, quái) và sau
 * này cho model từ pipeline asset. Màu lấy từ màu đỉnh/texture; độ nhám cao, không kim loại, nên
 * nắng cho mảng sáng mềm và một chút ánh bóng ở góc nghiêng, không bóng loáng.
 * Sương, giảm bão hòa theo độ sâu nằm ở `scene.fogNode` (atmosphere.ts); chỉnh màu ở post.ts.
 * Dùng chung một instance cho nhiều mesh, đừng tạo mới cho từng mesh.
 */
export function createWorldMaterial(params: THREE.MeshStandardNodeMaterialParameters = {}): THREE.MeshStandardNodeMaterial {
  return new THREE.MeshStandardNodeMaterial({ roughness: 0.86, metalness: 0, ...params });
}

/**
 * Thay material glTF (MeshStandardMaterial do GLTFLoader tạo) trong cây `root` bằng `MeshStandardNodeMaterial`
 * giữ nguyên thông số PBR, màu đỉnh, texture (cả KHR_texture_transform nằm trên texture). `wrap` gắn thêm node
 * (vd. `withOccluderFade`) cho từng material mới. Mỗi material gốc chỉ đổi một lần.
 * Trả về các material mới: người gọi dispose khi bỏ asset; texture vẫn thuộc bản gốc trong AssetCache.
 */
export function adoptGltfMaterials(
  root: THREE.Object3D,
  wrap: (m: THREE.MeshStandardNodeMaterial) => THREE.MeshStandardNodeMaterial = (m) => m,
): THREE.MeshStandardNodeMaterial[] {
  const made = new Map<THREE.Material, THREE.MeshStandardNodeMaterial>();
  const convert = (src: THREE.Material): THREE.MeshStandardNodeMaterial => {
    let m = made.get(src);
    if (m) return m;
    const s = src as THREE.MeshStandardMaterial;
    m = wrap(
      createWorldMaterial({
        name: s.name,
        color: s.color,
        map: s.map,
        roughness: s.roughness ?? 0.86,
        metalness: s.metalness ?? 0,
        roughnessMap: s.roughnessMap,
        metalnessMap: s.metalnessMap,
        normalMap: s.normalMap,
        normalScale: s.normalScale,
        aoMap: s.aoMap,
        emissive: s.emissive,
        emissiveMap: s.emissiveMap,
        emissiveIntensity: s.emissiveIntensity ?? 1,
        vertexColors: s.vertexColors,
        side: s.side,
        transparent: s.transparent,
        alphaTest: s.alphaTest,
      }),
    );
    made.set(src, m);
    registerDerived(src, m);
    return m;
  };
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(convert) : convert(mesh.material);
  });
  return [...made.values()];
}

/**
 * Viền sáng (rim) tách khối nhân vật khỏi nền: fresnel hẹp ở mép hình bóng, sắc nắng, mạnh hơn ở phía hướng mặt trời
 * và ở phần trên thân, gần tắt ở phía khuất nắng. Yếu có chủ ý (art bible 5.3: không rim trắng gắt); cường độ theo preset
 * (`rimParams`, khối `grading` của palette.json). Cộng vào `emissiveNode`, không vào bloom, không thêm draw call hay texture.
 * Chỉ gọi cho material chưa dùng emissive (thân người chơi, NPC).
 */
export function rimLight(m: THREE.MeshStandardNodeMaterial): THREE.MeshStandardNodeMaterial {
  const fres = float(1).sub(normalView.dot(positionViewDirection).clamp(0, 1)).pow(2.6);
  const sunSide = normalWorld.dot(skyParams.sunDir).mul(0.5).add(0.5);
  const up = normalWorld.y.mul(0.5).add(0.5);
  m.emissiveNode = rimParams.color.mul(
    fres
      .mul(mix(float(0.25), float(1), sunSide))
      .mul(mix(float(0.6), float(1), up))
      .mul(rimParams.strength),
  );
  return m;
}
