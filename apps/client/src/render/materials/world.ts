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
