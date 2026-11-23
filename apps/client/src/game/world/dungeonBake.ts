// O2 (Chân Cảnh): gộp vật trang trí đứng yên của bí cảnh. Trước: mỗi (lưới × vật liệu) một InstancedMesh `frustumCulled = false` (Phục Mạch/Luyện Thần
// ~110 lượt vẽ, luôn vẽ cả khi ngoài khung nhìn). Sau: nướng ma trận vào đỉnh và gộp theo (vật liệu, đổ bóng, ô lưới), mỗi ô một Mesh có bán kính bao
// nên bị cắt khi ngoài khung nhìn/khung bóng. Hàm thuần (chỉ three), có test.
import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Cạnh ô gộp (m): đủ nhỏ để cắt được ngoài khung (khung camera chéo ~40×30 m), đủ lớn để không quá nhiều lưới. */
export const BAKE_CELL = 32;
/** Quá số đỉnh này thì giữ InstancedMesh (nướng nhân bản bộ nhớ đỉnh). */
export const BAKE_MAX_VERTS = 3_000_000;

export interface DungeonBakeInput {
  mesh: THREE.Mesh;
  /** Ma trận từng bản trong hệ của gốc GLB. */
  mats: THREE.Matrix4[];
  cast: boolean;
}

export interface DungeonBaked {
  name: string;
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  cast: boolean;
}

/** Chữ ký thuộc tính: chỉ gộp được các lưới cùng bộ thuộc tính và cùng có/không chỉ mục. */
export function geoSignature(g: THREE.BufferGeometry): string {
  const attrs = Object.entries(g.attributes)
    .map(([k, a]) => `${k}:${a.itemSize}:${a.normalized ? 1 : 0}:${(a.array as { constructor: { name: string } }).constructor.name}`)
    .sort()
    .join(',');
  return `${attrs}|${g.index ? 'i' : 'n'}|${g.morphAttributes && Object.keys(g.morphAttributes).length ? 'm' : '-'}`;
}

/**
 * Bản sao với mọi thuộc tính ở Float32. GLB đã lượng tử hóa (Int16/Uint16 chuẩn hóa, 3 thành phần → arrayStride 6) thì `applyMatrix4` ghi đè sai
 * thang và WebGPU từ chối bộ đệm đỉnh có stride không chia hết cho 4.
 */
export function toFloatGeometry(src: THREE.BufferGeometry): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  for (const [name, a] of Object.entries(src.attributes)) {
    const at = a as THREE.BufferAttribute;
    const arr = new Float32Array(at.count * at.itemSize);
    for (let i = 0; i < at.count; i++) for (let c = 0; c < at.itemSize; c++) arr[i * at.itemSize + c] = at.getComponent(i, c);
    g.setAttribute(name, new THREE.BufferAttribute(arr, at.itemSize));
  }
  if (src.index) g.setIndex(new THREE.BufferAttribute(src.index.array.slice() as Uint32Array | Uint16Array, 1));
  return g;
}

/** Có nên nướng không: tổng số đỉnh sau nhân bản ≤ `BAKE_MAX_VERTS`. */
export function planDungeonBake(groups: { geo: THREE.BufferGeometry; count: number }[]): boolean {
  let v = 0;
  for (const g of groups) v += (g.geo.attributes.position?.count ?? 0) * g.count;
  return v <= BAKE_MAX_VERTS;
}

/** Nướng và gộp. Ô theo vị trí gốc từng bản (x, z của ma trận). */
export function bakeDungeonCells(inputs: DungeonBakeInput[], cell = BAKE_CELL): DungeonBaked[] {
  const buckets = new Map<string, { material: THREE.Material; cast: boolean; cx: number; cz: number; geos: THREE.BufferGeometry[] }>();
  const v = new THREE.Vector3();
  for (const { mesh, mats, cast } of inputs) {
    const material = mesh.material as THREE.Material;
    const sig = geoSignature(mesh.geometry);
    const flt = toFloatGeometry(mesh.geometry);
    for (const mt of mats) {
      v.setFromMatrixPosition(mt);
      const cx = Math.floor(v.x / cell);
      const cz = Math.floor(v.z / cell);
      const key = `${material.uuid}|${cast ? 1 : 0}|${sig}|${cx},${cz}`;
      let b = buckets.get(key);
      if (!b) buckets.set(key, (b = { material, cast, cx, cz, geos: [] }));
      b.geos.push(flt.clone().applyMatrix4(mt));
    }
    flt.dispose();
  }
  const out: DungeonBaked[] = [];
  for (const b of buckets.values()) {
    const geometry = b.geos.length === 1 ? b.geos[0]! : mergeGeometries(b.geos, false);
    if (b.geos.length > 1) for (const g of b.geos) g.dispose();
    if (!geometry) continue;
    geometry.computeBoundingSphere();
    out.push({ name: `${b.material.name || 'mat'}@${b.cx}_${b.cz}${b.cast ? '' : '-ns'}`, geometry, material: b.material, cast: b.cast });
  }
  return out;
}
