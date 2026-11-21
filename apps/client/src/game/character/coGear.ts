// Cổ tu: hũ cổ + sáo cổ bằng mesh thủ tục (concept co_tu_tui_sao: túi cổ hình hồ lô da khâu, nắp mây đan có lỗ thở, khóa xương;
// sáo cổ trúc bịt xương) cho đến khi có GLB dựng từ Tripo (khi đó thay file này).
//   - sáo: MỘT mesh gộp thay đúng chỗ cây kiếm của nhân vật (tay khi giao chiến, lưng khi nghỉ), 1 draw call, không tốn thêm;
//   - hũ: MỘT SkinnedMesh gộp dùng chung bộ xương, treo bên hông trái (+1 draw call), chỉ vẽ ở LOD0 (như găng Thể tu).
// Màu theo đỉnh, chung một vật liệu. Quy ước như kiếm v3: mũi +Y, tâm nắm ở gốc.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { skinGeometry, type BindSnapshot, type BrawlerGear } from './brawlerGear';

/** Loại vật dụng khai ở `paths.json` `weapons` để chọn hũ cổ + sáo. */
export const COHU_WEAPON = 'cohu';

/** Bảng màu theo concept: rêu đen / lục độc trầm / lục vàng nhạt; da, xương, trúc. */
export const CO_COLORS = {
  moss: 0x12301c,
  venom: 0x5e9a3a,
  glow: 0xd6e88a,
  leather: 0x3b2f22,
  bone: 0xe2d8b8,
  bamboo: 0xa68b4e,
  node: 0x6e5a2c,
} as const;

function tinted(g: THREE.BufferGeometry, color: number): THREE.BufferGeometry {
  const out = g.index ? g.toNonIndexed() : g;
  const c = new THREE.Color(color);
  const n = out.getAttribute('position').count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) c.toArray(arr, i * 3);
  out.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  out.deleteAttribute('uv');
  return out;
}

/** Chiều dài sáo (m) cho nhân vật cao `height` (m). */
export function fluteLength(height: number): number {
  return 0.5 * (height / 1.7);
}

/** Sáo cổ: ống trúc có đốt, sáu lỗ bấm tối, hai nắp xương, dây lục có nút buộc ở đuôi; tâm nắm ở gốc. */
export function fluteGeometry(height: number): THREE.BufferGeometry {
  const k = height / 1.7;
  const L = fluteLength(height);
  const parts: THREE.BufferGeometry[] = [];
  const tube = new THREE.CylinderGeometry(0.0125 * k, 0.0135 * k, L, 10);
  parts.push(tinted(tube, CO_COLORS.bamboo));
  // đốt trúc (vòng sẫm hơn)
  for (const f of [-0.32, 0.06, 0.34]) {
    const node = new THREE.CylinderGeometry(0.0148 * k, 0.0148 * k, 0.008 * k, 10);
    node.translate(0, f * L, 0);
    parts.push(tinted(node, CO_COLORS.node));
  }
  // sáu lỗ bấm (đĩa nhỏ tối nổi nhẹ ở một mặt)
  for (let i = 0; i < 6; i++) {
    const hole = new THREE.CylinderGeometry(0.0042 * k, 0.0042 * k, 0.003 * k, 8);
    hole.rotateX(Math.PI / 2);
    hole.translate(0, (0.1 + i * 0.062) * L - 0.1 * L, 0.0128 * k);
    parts.push(tinted(hole, CO_COLORS.moss));
  }
  // hai nắp xương bịt đầu ống
  for (const s of [-1, 1]) {
    const cap = new THREE.CylinderGeometry(0.0155 * k, 0.0155 * k, 0.014 * k, 10);
    cap.translate(0, s * (L / 2 + 0.002 * k), 0);
    parts.push(tinted(cap, CO_COLORS.bone));
  }
  // dây lục buộc ở đuôi: nút + hai sợi
  const knot = new THREE.SphereGeometry(0.007 * k, 6, 4);
  knot.translate(0, -L / 2 - 0.02 * k, 0);
  parts.push(tinted(knot, CO_COLORS.venom));
  for (const dx of [-0.004, 0.004]) {
    const strand = new THREE.BoxGeometry(0.003 * k, 0.07 * k, 0.003 * k);
    strand.translate(dx * k, -L / 2 - 0.06 * k, 0);
    parts.push(tinted(strand, CO_COLORS.venom));
  }
  const g = mergeGeometries(parts, false)!;
  for (const p of parts) p.dispose();
  return g;
}

let sharedMat: THREE.MeshStandardMaterial | null = null;
function material(): THREE.MeshStandardMaterial {
  return (sharedMat ??= new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.05, side: THREE.DoubleSide }));
}

/** Mesh sáo cổ (thay cây kiếm trong tay); vật liệu dùng chung, hình học riêng mỗi nhân vật. */
export function fluteMesh(height: number): { mesh: THREE.Mesh; len: number } {
  const mesh = new THREE.Mesh(fluteGeometry(height), material());
  mesh.name = 'dtl_flute';
  mesh.frustumCulled = false;
  return { mesh, len: fluteLength(height) / 2 + 0.03 * (height / 1.7) };
}

/** Hũ cổ hình hồ lô: thân dưới + thân trên da khâu, cổ thắt, nắp mây đan có lỗ thở, khóa xương, dây đeo, vài con cổ bò trên nắp. Hệ cục bộ: treo từ gốc, hạ xuống −Y. */
export function gourdGeometry(height: number): THREE.BufferGeometry {
  const k = height / 1.7;
  const parts: THREE.BufferGeometry[] = [];
  const low = new THREE.SphereGeometry(0.062 * k, 12, 9);
  low.scale(1, 0.9, 1);
  low.translate(0, -0.1 * k, 0);
  parts.push(tinted(low, CO_COLORS.leather));
  const up = new THREE.SphereGeometry(0.04 * k, 10, 8);
  up.translate(0, -0.038 * k, 0);
  parts.push(tinted(up, CO_COLORS.leather));
  const neck = new THREE.CylinderGeometry(0.02 * k, 0.03 * k, 0.03 * k, 10);
  neck.translate(0, -0.052 * k, 0);
  parts.push(tinted(neck, CO_COLORS.moss));
  // nắp mây đan (đĩa dẹt) + lỗ thở (đĩa tối) + khóa xương
  const lid = new THREE.CylinderGeometry(0.03 * k, 0.026 * k, 0.014 * k, 12);
  lid.translate(0, -0.002 * k, 0);
  parts.push(tinted(lid, CO_COLORS.bamboo));
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    const hole = new THREE.CylinderGeometry(0.0042 * k, 0.0042 * k, 0.003 * k, 6);
    hole.translate(Math.cos(a) * 0.017 * k, 0.006 * k, Math.sin(a) * 0.017 * k);
    parts.push(tinted(hole, CO_COLORS.moss));
  }
  const clasp = new THREE.BoxGeometry(0.012 * k, 0.03 * k, 0.008 * k);
  clasp.translate(0.034 * k, -0.025 * k, 0);
  parts.push(tinted(clasp, CO_COLORS.bone));
  // đường khâu giữa thân (vòng xương mảnh)
  const seam = new THREE.TorusGeometry(0.06 * k, 0.0035 * k, 5, 16);
  seam.rotateX(Math.PI / 2);
  seam.translate(0, -0.1 * k, 0);
  parts.push(tinted(seam, CO_COLORS.bone));
  // dây đeo: vòng da trên nắp
  const strap = new THREE.TorusGeometry(0.026 * k, 0.004 * k, 5, 14);
  strap.translate(0, 0.022 * k, 0);
  parts.push(tinted(strap, CO_COLORS.leather));
  // ba con cổ bò trên nắp (bầu dục lục độc)
  for (const [x, z] of [
    [0.012, 0.008],
    [-0.01, -0.012],
    [0.002, -0.018],
  ] as const) {
    const bug = new THREE.SphereGeometry(0.0055 * k, 5, 4);
    bug.scale(1.5, 0.8, 1);
    bug.translate(x * k, 0.01 * k, z * k);
    parts.push(tinted(bug, CO_COLORS.glow));
  }
  const g = mergeGeometries(parts, false)!;
  for (const p of parts) p.dispose();
  return g;
}

const NONE: BrawlerGear = { meshes: [], setVisible() {}, dispose() {} };

/** Treo hũ cổ bên hông trái (SkinnedMesh gộp dùng chung bộ xương, theo xương `spine_01`). Thiếu xương/mesh da thì bỏ. */
export function attachCoGear(rig: THREE.Object3D, bind: BindSnapshot, height: number): BrawlerGear {
  const ref = bind.ref;
  const waist = bind.pos.get('spine_01');
  const toBone = bind.toBone.get('spine_01');
  const bone = rig.getObjectByName('spine_01');
  if (!ref || !waist || !toBone || !bone) return NONE;
  const bi = ref.skeleton.bones.indexOf(bone as THREE.Bone);
  if (bi < 0) return NONE;
  const k = height / 1.7;
  const geo = gourdGeometry(height);
  geo.scale(1.35, 1.35, 1.35); // to hơn để lòi ra khỏi vạt áo
  geo.translate(waist.x + 0.27 * k, waist.y - 0.04 * k, waist.z + 0.02 * k); // hông trái, ngoài vạt áo bào
  skinGeometry(geo, bi, toBone);
  const mesh = new THREE.SkinnedMesh(geo, material());
  mesh.name = 'dtl_cohu';
  mesh.frustumCulled = false;
  (ref.parent ?? rig).add(mesh);
  mesh.bind(ref.skeleton, ref.bindMatrix);
  return {
    meshes: [mesh],
    setVisible(v) {
      mesh.visible = v;
    },
    dispose() {
      mesh.removeFromParent();
      mesh.geometry.dispose();
    },
  };
}
