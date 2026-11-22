import * as THREE from 'three';

/**
 * Điểm/đoạn/sprite không có pháp tuyến, nhưng lượt AO ghi `normalView` vào MRT nên TSL cảnh báo
 * `Vertex attribute "normal" not found` mỗi lần dựng material. Gắn pháp tuyến hướng lên (giá trị không dùng để tô sáng).
 */
export function addUpNormals(g: THREE.BufferGeometry, n = g.getAttribute('position')?.count ?? 0): THREE.BufferGeometry {
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) a[i * 3 + 1] = 1;
  g.setAttribute('normal', new THREE.BufferAttribute(a, 3));
  return g;
}
