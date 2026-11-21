import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Mức LOD của một lưới: `userData.lod` của chính nó, hoặc của nhóm cha gần nhất. Lưới có nhiều primitive (LOD1/LOD2 của model giữ gốc)
 * được GLTFLoader bọc trong một `Group` mang extras, lưới con không có `userData.lod`.
 */
export function lodOf(o: THREE.Object3D, root: THREE.Object3D): number {
  for (let p: THREE.Object3D | null = o; p; p = p === root ? null : p.parent) {
    if (typeof p.userData.lod === 'number') return p.userData.lod;
  }
  return 0;
}

/**
 * Gộp các lưới skin cùng mức LOD ≥ 1 (cùng vật liệu, cùng danh sách xương) của một model thành MỘT lưới mỗi mức (N-7): model bậc cao có
 * LOD1/LOD2 gồm 4 primitive (thân 2 + tay áo cũ 2) = 4 draw call mỗi người ở xa; gộp còn 1. LOD0 giữ nguyên (lưới tay áo cũ còn dùng
 * riêng cho vải mô phỏng). Sửa tại chỗ trên `scene` (bản mẫu, trước khi nhân bản). Nhóm nào không gộp được (thuộc tính đỉnh lệch nhau)
 * thì để nguyên. Trả các hình học mới tạo để bên gọi `dispose` khi bỏ mẫu (hình học gốc do `AssetCache` giữ).
 */
export function mergeLodMeshes(scene: THREE.Object3D): THREE.BufferGeometry[] {
  const groups = new Map<string, THREE.SkinnedMesh[]>();
  scene.traverse((o) => {
    const m = o as THREE.SkinnedMesh;
    if (!m.isSkinnedMesh || Array.isArray(m.material)) return;
    const lod = lodOf(m, scene);
    if (lod < 1) return;
    // Mỗi lưới của GLTF/`SkeletonUtils.clone` có một `Skeleton` riêng trên CÙNG danh sách xương: nhóm theo xương gốc, so kỹ ở dưới.
    const key = `${lod}|${m.material.uuid}|${m.skeleton.bones[0]?.uuid ?? ''}|${m.skeleton.bones.length}`;
    let g = groups.get(key);
    if (!g) groups.set(key, (g = []));
    g.push(m);
  });
  const made: THREE.BufferGeometry[] = [];
  for (const [key, list] of groups) {
    const first = list[0]!;
    if (list.length < 2 || !first.parent) continue;
    // Mọi lưới phải cùng ma trận bind và cùng hệ tọa độ (tính tới gốc model) thì đỉnh mới ghép thẳng được.
    scene.updateMatrixWorld(true);
    if (
      list.some(
        (m) =>
          !m.bindMatrix.equals(first.bindMatrix) || !m.matrixWorld.equals(first.matrixWorld) || !sameSkeleton(m.skeleton, first.skeleton),
      )
    )
      continue;
    let geo: THREE.BufferGeometry | null = null;
    try {
      geo = mergeGeometries(
        list.map((m) => m.geometry),
        false,
      );
    } catch {
      geo = null;
    }
    if (!geo) continue;
    const merged = new THREE.SkinnedMesh(geo, first.material);
    merged.name = `${first.name || 'mesh'}_merged`;
    merged.userData.lod = Number(key.slice(0, key.indexOf('|')));
    merged.castShadow = first.castShadow;
    merged.receiveShadow = first.receiveShadow;
    merged.visible = false; // như `AssetCache`: LOD > 0 ẩn sẵn, nơi dùng tự bật theo khoảng cách
    // Đặt dưới gốc model với đúng ma trận thế giới của lưới gốc (so với gốc).
    merged.applyMatrix4(new THREE.Matrix4().copy(scene.matrixWorld).invert().multiply(first.matrixWorld));
    scene.add(merged);
    merged.bind(first.skeleton, first.bindMatrix);
    for (const m of list) m.removeFromParent();
    made.push(geo);
  }
  return made;
}

/** Hai bộ xương dùng đúng cùng các xương theo cùng thứ tự và cùng ma trận nghịch đảo (chỉ số skin của hai lưới khi đó dùng lẫn được). */
function sameSkeleton(a: THREE.Skeleton, b: THREE.Skeleton): boolean {
  if (a === b) return true;
  if (a.bones.length !== b.bones.length) return false;
  for (let i = 0; i < a.bones.length; i++) {
    if (a.bones[i] !== b.bones[i] || !a.boneInverses[i]!.equals(b.boneInverses[i]!)) return false;
  }
  return true;
}
