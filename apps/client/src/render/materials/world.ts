import * as THREE from 'three/webgpu';

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
    return m;
  };
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(convert) : convert(mesh.material);
  });
  return [...made.values()];
}
