import type * as THREE from 'three/webgpu';

/**
 * Material dẫn xuất từ material gốc của GLB (`adoptGltfMaterials` chép tham chiếu texture sang material mới).
 * `AssetCache` tra bảng này khi thay texture bậc cao (game/hires) để material đang vẽ cũng nhận texture mới.
 */
const derived = new WeakMap<THREE.Material, Set<THREE.Material>>();

export function registerDerived(src: THREE.Material, made: THREE.Material): void {
  let set = derived.get(src);
  if (!set) derived.set(src, (set = new Set()));
  set.add(made);
}

export function derivedOf(src: THREE.Material): ReadonlySet<THREE.Material> {
  return derived.get(src) ?? EMPTY;
}

const EMPTY: ReadonlySet<THREE.Material> = new Set();
