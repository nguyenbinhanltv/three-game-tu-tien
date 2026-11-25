import * as THREE from 'three';

/**
 * Cắt theo khung nhìn cho lượt phản chiếu sàn gương Kính Nguyệt: lượt chính chỉ vẽ ~13 mesh kiến trúc tĩnh (three tự cắt theo khung nhìn)
 * nhưng lượt phản chiếu chỉ cắt theo khoảng cách nên vẽ ~45 (baseline 25/11). Một vật mà hình cầu bao của nó, nới thêm `margin` m, nằm
 * hoàn toàn ngoài khung nhìn của camera chính thì phản chiếu của nó không lên được phần sàn đang thấy (margin bù chiều cao: ảnh phản chiếu
 * của vật cao dịch về phía camera một đoạn cỡ chiều cao / tan(độ nghiêng)).
 */
export function outsideFrustum(frustum: THREE.Frustum, x: number, y: number, z: number, radius: number, margin: number): boolean {
  _s.center.set(x, y, z);
  _s.radius = radius + margin;
  return !frustum.intersectsSphere(_s);
}

/** Dựng khung nhìn từ camera (ma trận chiếu × nghịch đảo ma trận thế giới). */
export function frustumOf(camera: THREE.Camera, out: THREE.Frustum = new THREE.Frustum()): THREE.Frustum {
  return out.setFromProjectionMatrix(_m.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
}

const _s = new THREE.Sphere();
const _m = new THREE.Matrix4();
