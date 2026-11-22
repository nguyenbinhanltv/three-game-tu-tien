// Cấm chế sư: cờ trận cầm tay bằng mesh thủ tục (cán gỗ tối, đỉnh vàng ấn, lá cờ chàm tím viền vàng nhạt có ấn trận tròn) cho đến khi có GLB.
// MỘT mesh gộp thay đúng chỗ cây kiếm của nhân vật (tay khi giao chiến, lưng khi nghỉ), 1 draw call, không tốn thêm.
// Màu theo đỉnh, chung một vật liệu. Quy ước như kiếm v3: mũi +Y, tâm nắm ở gốc.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Loại vật dụng khai ở `paths.json` `weapons` để chọn cờ trận. */
export const TRAN_KY_WEAPON = 'tran_ky';

/** Bảng màu theo bảng `cam_che_kinh`: chàm đen / chàm tím / vàng nhạt / vàng ấn; cán gỗ tối. */
export const TRAN_COLORS = {
  core: 0x241a54,
  body: 0x6a5ae0,
  rim: 0xf4e6a8,
  accent: 0xffd25a,
  wood: 0x3a2c22,
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

/** Chiều dài cán cờ (m) cho nhân vật cao `height` (m). */
export function tranKyLength(height: number): number {
  return 0.95 * (height / 1.7);
}

/** Cờ trận: cán dài, đỉnh hình giọt vàng, lá cờ tam giác cắt đuôi én ở nửa trên (mặt phẳng XY, dày nhẹ), viền vàng nhạt, ấn tròn vàng. */
export function tranKyGeometry(height: number): THREE.BufferGeometry {
  const k = height / 1.7;
  const L = tranKyLength(height);
  const parts: THREE.BufferGeometry[] = [];
  const shaft = new THREE.CylinderGeometry(0.011 * k, 0.014 * k, L, 8);
  parts.push(tinted(shaft, TRAN_COLORS.wood));
  const tip = new THREE.ConeGeometry(0.02 * k, 0.07 * k, 8);
  tip.translate(0, L / 2 + 0.035 * k, 0);
  parts.push(tinted(tip, TRAN_COLORS.accent));
  const knob = new THREE.SphereGeometry(0.018 * k, 8, 6);
  knob.translate(0, L / 2 - 0.01 * k, 0);
  parts.push(tinted(knob, TRAN_COLORS.accent));
  const butt = new THREE.CylinderGeometry(0.016 * k, 0.012 * k, 0.04 * k, 8);
  butt.translate(0, -L / 2, 0);
  parts.push(tinted(butt, TRAN_COLORS.accent));
  // lá cờ: hình thang cắt đuôi én, treo từ đỉnh cán xuống, bay sang +X
  const w = 0.3 * k;
  const h = 0.34 * k;
  const top = L / 2 - 0.05 * k;
  const flag = new THREE.BufferGeometry();
  const v = [0, top, 0, w, top, 0, w * 0.78, top - h / 2, 0, w, top - h, 0, 0, top - h, 0];
  flag.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  flag.setIndex([0, 1, 2, 0, 2, 4, 4, 2, 3].slice(0, 9));
  flag.computeVertexNormals();
  parts.push(tinted(flag, TRAN_COLORS.body));
  // viền vàng nhạt (thanh mảnh trên cạnh trên và cạnh cán)
  const edge = new THREE.BoxGeometry(w, 0.012 * k, 0.004 * k);
  edge.translate(w / 2, top, 0);
  parts.push(tinted(edge, TRAN_COLORS.rim));
  const edge2 = new THREE.BoxGeometry(0.012 * k, h, 0.004 * k);
  edge2.translate(0.006 * k, top - h / 2, 0);
  parts.push(tinted(edge2, TRAN_COLORS.rim));
  // ấn trận: vòng + chấm vàng ấn giữa lá cờ
  const ring = new THREE.TorusGeometry(0.05 * k, 0.006 * k, 5, 18);
  ring.translate(w * 0.45, top - h * 0.5, 0.003 * k);
  parts.push(tinted(ring, TRAN_COLORS.accent));
  const dot = new THREE.SphereGeometry(0.014 * k, 6, 4);
  dot.translate(w * 0.45, top - h * 0.5, 0.004 * k);
  parts.push(tinted(dot, TRAN_COLORS.accent));
  const g = mergeGeometries(parts, false)!;
  for (const p of parts) p.dispose();
  return g;
}

let sharedMat: THREE.MeshStandardMaterial | null = null;
function material(): THREE.MeshStandardMaterial {
  return (sharedMat ??= new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.65, metalness: 0.1, side: THREE.DoubleSide }));
}

/** Mesh cờ trận (thay cây kiếm trong tay); vật liệu dùng chung, hình học riêng mỗi nhân vật. */
export function tranKyMesh(height: number): { mesh: THREE.Mesh; len: number } {
  const mesh = new THREE.Mesh(tranKyGeometry(height), material());
  mesh.name = 'dtl_tran_ky';
  mesh.frustumCulled = false;
  return { mesh, len: tranKyLength(height) / 2 + 0.05 * (height / 1.7) };
}
