// Chia một lưới tĩnh lớn thành nhiều lưới nhỏ theo ô lưới trên mặt đất (XZ thế giới) để renderer cắt được phần ngoài khung nhìn và ngoài khung bóng.
// Dùng cho kiến trúc tông môn (`arch_sect`: vài lưới 20–90 nghìn tam giác trải cả tông môn, `frustumCulled = false` nên cả lượt cảnh lẫn lượt bóng
// vẽ hết). Không đổi asset, không đổi hình: mỗi tam giác chỉ chuyển sang lưới của ô chứa trọng tâm nó. Hàm thuần (chỉ three), có test.
import * as THREE from 'three/webgpu';
import { toFloatGeometry } from './dungeonBake';

/** Cạnh ô (m): khung camera chéo ~40×30 m, hộp bóng 140×140 m. */
export const CELL_SPLIT = 32;
/** Lưới ít tam giác hơn mức này thì giữ nguyên (thêm lượt vẽ không đáng). */
export const CELL_SPLIT_MIN_TRIS = 4000;
/** Ô có ít tam giác hơn mức này gộp vào ô lân cận gần nhất cùng lưới (tránh hàng chục lượt vẽ nhỏ). */
export const CELL_MIN_TRIS = 600;

/**
 * Tách `mesh` (đã có `matrixWorld` đúng) thành các lưới theo ô. Trả về `null` nếu không cần/không tách được (có nhóm vật liệu, morph, skin,
 * instancing, quá ít tam giác, hoặc chỉ nằm trong một ô). Lưới con giữ biến đổi cục bộ, vật liệu và cờ của lưới gốc; chưa gắn vào cha.
 */
export function splitMeshByCells(mesh: THREE.Mesh, cell = CELL_SPLIT): THREE.Mesh[] | null {
  const g0 = mesh.geometry;
  if (!g0 || (mesh as THREE.SkinnedMesh).isSkinnedMesh || (mesh as THREE.InstancedMesh).isInstancedMesh) return null;
  if (Array.isArray(mesh.material) || g0.groups.length > 1) return null;
  if (g0.morphAttributes && Object.keys(g0.morphAttributes).length) return null;
  const pos0 = g0.getAttribute('position');
  if (!pos0) return null;
  const triCount = (g0.index ? g0.index.count : pos0.count) / 3;
  if (triCount < CELL_SPLIT_MIN_TRIS) return null;

  const src = toFloatGeometry(g0);
  const pos = src.getAttribute('position') as THREE.BufferAttribute;
  const vc = pos.count;
  const idx = src.index ? (src.index.array as ArrayLike<number>) : null;
  const tri = (k: number): number => (idx ? idx[k]! : k);

  // XZ thế giới từng đỉnh.
  mesh.updateWorldMatrix(true, false);
  const e = mesh.matrixWorld.elements;
  const wx = new Float32Array(vc);
  const wz = new Float32Array(vc);
  for (let i = 0; i < vc; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    wx[i] = e[0]! * x + e[4]! * y + e[8]! * z + e[12]!;
    wz[i] = e[2]! * x + e[6]! * y + e[10]! * z + e[14]!;
  }

  // Tam giác → ô theo trọng tâm.
  const cells = new Map<string, { cx: number; cz: number; tris: number[] }>();
  for (let t = 0; t < triCount; t++) {
    const a = tri(t * 3);
    const b = tri(t * 3 + 1);
    const c = tri(t * 3 + 2);
    const cx = Math.floor((wx[a]! + wx[b]! + wx[c]!) / 3 / cell);
    const cz = Math.floor((wz[a]! + wz[b]! + wz[c]!) / 3 / cell);
    const key = cx + ',' + cz;
    let s = cells.get(key);
    if (!s) cells.set(key, (s = { cx, cz, tris: [] }));
    s.tris.push(t);
  }
  if (cells.size <= 1) {
    src.dispose();
    return null;
  }

  // Ô nhỏ gộp vào ô lớn gần nhất (theo tâm ô).
  const all = [...cells.values()];
  const big = all.filter((s) => s.tris.length >= CELL_MIN_TRIS);
  if (big.length <= 1) {
    src.dispose();
    return null;
  }
  for (const s of all) {
    if (s.tris.length >= CELL_MIN_TRIS) continue;
    let best = big[0]!;
    let bd = Infinity;
    for (const b of big) {
      const d = (b.cx - s.cx) ** 2 + (b.cz - s.cz) ** 2;
      if (d < bd) {
        bd = d;
        best = b;
      }
    }
    for (const t of s.tris) best.tris.push(t);
  }

  const out: THREE.Mesh[] = [];
  const remap = new Int32Array(vc);
  const names = Object.keys(src.attributes);
  for (const s of big) {
    remap.fill(-1);
    const verts: number[] = [];
    const index: number[] = [];
    for (const t of s.tris) {
      for (let k = 0; k < 3; k++) {
        const v = tri(t * 3 + k);
        let r = remap[v]!;
        if (r < 0) {
          r = verts.length;
          remap[v] = r;
          verts.push(v);
        }
        index.push(r);
      }
    }
    const g = new THREE.BufferGeometry();
    for (const name of names) {
      const at = src.getAttribute(name) as THREE.BufferAttribute;
      const arr = new Float32Array(verts.length * at.itemSize);
      for (let i = 0; i < verts.length; i++) {
        const o = verts[i]! * at.itemSize;
        for (let c = 0; c < at.itemSize; c++) arr[i * at.itemSize + c] = at.array[o + c]!;
      }
      g.setAttribute(name, new THREE.BufferAttribute(arr, at.itemSize));
    }
    g.setIndex(new THREE.BufferAttribute(verts.length > 65535 ? new Uint32Array(index) : new Uint16Array(index), 1));
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, mesh.material);
    m.name = `${mesh.name}@${s.cx}_${s.cz}`;
    m.position.copy(mesh.position);
    m.quaternion.copy(mesh.quaternion);
    m.scale.copy(mesh.scale);
    m.castShadow = mesh.castShadow;
    m.receiveShadow = mesh.receiveShadow;
    m.renderOrder = mesh.renderOrder;
    m.layers.mask = mesh.layers.mask;
    m.userData = { ...mesh.userData };
    m.frustumCulled = true;
    out.push(m);
  }
  src.dispose();
  return out;
}

/**
 * Tách mọi lưới đủ lớn dưới `root` (thay lưới gốc bằng các lưới con cùng cha). Trả về số lưới gốc đã tách và số lưới con tạo ra.
 * `onSplit` nhận từng lưới con (đặt cờ bóng...). Gọi sau khi gốc đã đặt vị trí cuối.
 */
export function splitMeshesUnder(root: THREE.Object3D, cell = CELL_SPLIT, onSplit?: (m: THREE.Mesh) => void): { split: number; made: number } {
  root.updateMatrixWorld(true);
  const todo: THREE.Mesh[] = [];
  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) todo.push(o as THREE.Mesh);
  });
  let split = 0;
  let made = 0;
  for (const m of todo) {
    const parts = splitMeshByCells(m, cell);
    if (!parts || !m.parent) continue;
    const parent = m.parent;
    parent.remove(m);
    for (const p of parts) {
      onSplit?.(p);
      parent.add(p);
    }
    split++;
    made += parts.length;
  }
  return { split, made };
}
