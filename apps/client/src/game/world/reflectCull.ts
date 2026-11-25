import * as THREE from 'three';

/**
 * Cắt theo khung nhìn cho lượt phản chiếu sàn gương Kính Nguyệt: lượt chính chỉ vẽ ~13 mesh kiến trúc tĩnh (three tự cắt theo khung nhìn)
 * nhưng lượt phản chiếu chỉ cắt theo khoảng cách nên vẽ ~45 (baseline 25/11). Dùng `mirrorOutsideFrustum` (ảnh gương của vật, lật qua sàn) thay vì
 * vị trí thật của vật; `outsideFrustum` là phép thử hình cầu cơ bản của nó (margin bù sai số hình cầu bao).
 */
export function outsideFrustum(frustum: THREE.Frustum, x: number, y: number, z: number, radius: number, margin: number): boolean {
  _s.center.set(x, y, z);
  _s.radius = radius + margin;
  return !frustum.intersectsSphere(_s);
}

/**
 * Phép thử CHÍNH XÁC cho lượt phản chiếu phẳng: cái cần vẽ vào lượt phản chiếu là vật mà ẢNH GƯƠNG của nó (lật qua mặt phẳng sàn, y → 2·floorY − y)
 * nằm trong khung nhìn của camera chính, không phải bản thân vật. Camera chéo nghiêng xuống nên cột/cổng cao ngay ngoài mép trên của màn hình có ảnh
 * gương rơi vào vùng sàn đang thấy; margin cố định theo chiều cao chỉ xấp xỉ, phép lật thì đúng cho mọi chiều cao (margin chỉ bù sai số hình cầu bao).
 */
export function mirrorOutsideFrustum(
  frustum: THREE.Frustum,
  x: number,
  y: number,
  z: number,
  radius: number,
  floorY: number,
  margin: number,
): boolean {
  return outsideFrustum(frustum, x, 2 * floorY - y, z, radius, margin);
}

/** Dựng khung nhìn từ camera (ma trận chiếu × nghịch đảo ma trận thế giới). */
export function frustumOf(camera: THREE.Camera, out: THREE.Frustum = new THREE.Frustum()): THREE.Frustum {
  return out.setFromProjectionMatrix(_m.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
}

const _s = new THREE.Sphere();
const _m = new THREE.Matrix4();
