import * as THREE from 'three/webgpu';

// Tự dựng thay cho GridHelper/SkeletonHelper của three: lớp đó chỉ viewer dùng nhưng Rollup
// sẽ giữ chúng trong chunk chung chứa `three` (tức bundle game chính). LineSegments thì game đã có sẵn.

/** Lưới vuông trên mặt phẳng XZ, ô 1 đơn vị, tâm ở gốc. */
export function makeGrid(size: number, divisions: number, color: number): THREE.LineSegments {
  const half = size / 2;
  const step = size / divisions;
  const pos: number[] = [];
  for (let i = 0; i <= divisions; i++) {
    const k = -half + i * step;
    pos.push(-half, 0, k, half, 0, k, k, 0, -half, k, 0, half);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color }));
}

/** Đoạn thẳng nối mỗi xương với xương cha, vẽ đè lên model; gọi update() mỗi khung. */
export class BoneLines extends THREE.LineSegments {
  private pairs: [THREE.Bone, THREE.Bone][] = [];
  private tmp = new THREE.Vector3();

  constructor(root: THREE.Object3D) {
    const bones = new Set<THREE.Bone>();
    root.traverse((o) => {
      const sk = o as THREE.SkinnedMesh;
      if (sk.isSkinnedMesh) for (const b of sk.skeleton.bones) bones.add(b);
    });
    const pairs: [THREE.Bone, THREE.Bone][] = [];
    for (const b of bones) if ((b.parent as THREE.Bone | null)?.isBone) pairs.push([b, b.parent as THREE.Bone]);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pairs.length * 6), 3));
    super(geo, new THREE.LineBasicMaterial({ color: 0x40ff90, depthTest: false, depthWrite: false, transparent: true }));
    this.pairs = pairs;
    this.renderOrder = 999;
    this.frustumCulled = false;
    this.matrixAutoUpdate = false;
  }

  update(): void {
    if (!this.visible) return;
    const attr = this.geometry.attributes.position as THREE.BufferAttribute;
    this.pairs.forEach(([a, b], i) => {
      this.tmp.setFromMatrixPosition(a.matrixWorld);
      attr.setXYZ(i * 2, this.tmp.x, this.tmp.y, this.tmp.z);
      this.tmp.setFromMatrixPosition(b.matrixWorld);
      attr.setXYZ(i * 2 + 1, this.tmp.x, this.tmp.y, this.tmp.z);
    });
    attr.needsUpdate = true;
  }

  dispose(): void {
    this.geometry.dispose();
    (this.material as THREE.Material).dispose();
  }
}
