// Đao tu: đao lớn bằng mesh thủ tục (concept dao_tu_dao_lon: lưỡi một cạnh bản rộng, mũi vát, rãnh máu, chắn đĩa, cán quấn
// dây, khâu vòng có tua) cho đến khi có GLB dựng từ Tripo (khi đó thay file này). Một mesh gộp, màu theo đỉnh, một vật liệu chung:
// 1 draw call, thay đúng chỗ cây kiếm của nhân vật nên không tốn thêm. Quy ước như kiếm v3: mũi +Y, cán ở gốc.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Loại vũ khí khai ở `paths.json` `weapons` để chọn đao lớn. */
export const GREATBLADE_WEAPON = 'greatblade';

/** Bảng màu theo concept: huyết dụ / son thẫm / vàng tàn lửa, thép và lưỡi mài. */
export const GREATBLADE_COLORS = {
  dark: 0x3a0e0c,
  red: 0x9e2b22,
  ember: 0xf2b36a,
  steel: 0x4a4e55,
  edge: 0xc9ced4,
} as const;

/** Chiều dài lưỡi (m) cho nhân vật cao `height` (m). */
export function greatbladeLength(height: number): number {
  return 0.78 * (height / 1.7) * 1.6;
}

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

/** Hình học đao lớn: gốc ở tâm cán, mũi ở y = greatbladeLength(height) + 0.15·k. */
export function greatbladeGeometry(height: number): THREE.BufferGeometry {
  const k = height / 1.7;
  const L = greatbladeLength(height);
  const w = 0.055 * k; // nửa bản rộng
  const t = 0.016 * k; // dày
  const y0 = 0.14 * k; // chân lưỡi (trên chắn)
  const parts: THREE.BufferGeometry[] = [];
  // lưỡi: sống thẳng phía -x, cạnh phía +x, mũi vát về phía sống
  const shape = new THREE.Shape();
  shape.moveTo(-w, y0);
  shape.lineTo(w, y0);
  shape.lineTo(w, y0 + L * 0.82);
  shape.lineTo(-w, y0 + L);
  shape.lineTo(-w, y0);
  const blade = new THREE.ExtrudeGeometry(shape, { depth: t, bevelEnabled: false });
  blade.translate(0, 0, -t / 2);
  parts.push(tinted(blade, GREATBLADE_COLORS.edge));
  // sống dày màu thép và rãnh máu tối chạy dọc lưỡi
  parts.push(tinted(new THREE.BoxGeometry(w * 0.45, L * 0.9, t * 1.5).translate(-w * 0.78, y0 + L * 0.45, 0), GREATBLADE_COLORS.steel));
  parts.push(tinted(new THREE.BoxGeometry(w * 0.22, L * 0.62, t * 1.15).translate(-w * 0.1, y0 + L * 0.42, 0), GREATBLADE_COLORS.dark));
  // chắn đĩa thép viền vàng tàn lửa
  const guard = new THREE.CylinderGeometry(0.062 * k, 0.062 * k, 0.014 * k, 16);
  guard.translate(0, y0 - 0.005 * k, 0);
  parts.push(tinted(guard, GREATBLADE_COLORS.steel));
  const rim = new THREE.TorusGeometry(0.062 * k, 0.005 * k, 6, 18);
  rim.rotateX(Math.PI / 2);
  rim.translate(0, y0 - 0.005 * k, 0);
  parts.push(tinted(rim, GREATBLADE_COLORS.ember));
  // cán quấn dây huyết dụ, ba vòng son thẫm, khâu vòng vàng tàn lửa + tua son
  const grip = new THREE.CylinderGeometry(0.017 * k, 0.017 * k, 0.3 * k, 10);
  grip.translate(0, y0 - 0.17 * k, 0);
  parts.push(tinted(grip, GREATBLADE_COLORS.dark));
  for (let i = 0; i < 3; i++) {
    const band = new THREE.CylinderGeometry(0.0195 * k, 0.0195 * k, 0.012 * k, 10);
    band.translate(0, y0 - (0.08 + i * 0.08) * k, 0);
    parts.push(tinted(band, GREATBLADE_COLORS.red));
  }
  const ring = new THREE.TorusGeometry(0.026 * k, 0.006 * k, 6, 14);
  ring.translate(0, y0 - 0.335 * k, 0);
  parts.push(tinted(ring, GREATBLADE_COLORS.ember));
  const tassel = new THREE.BoxGeometry(0.014 * k, 0.12 * k, 0.006 * k);
  tassel.translate(0, y0 - 0.41 * k, 0);
  parts.push(tinted(tassel, GREATBLADE_COLORS.red));
  const g = mergeGeometries(parts, false)!;
  for (const p of parts) p.dispose();
  // dời để tâm cán (chỗ tay nắm) nằm ở gốc
  g.translate(0, -(y0 - 0.17 * k), 0);
  return g;
}

let sharedMat: THREE.MeshStandardMaterial | null = null;

/** Mesh đao lớn mới (dùng chung vật liệu; hình học riêng mỗi nhân vật, `dispose` khi bỏ). */
export function greatbladeMesh(height: number): { mesh: THREE.Mesh; len: number } {
  sharedMat ??= new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.38, metalness: 0.7, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(greatbladeGeometry(height), sharedMat);
  mesh.name = 'dtl_greatblade';
  mesh.frustumCulled = false;
  return { mesh, len: greatbladeLength(height) + 0.3 * (height / 1.7) };
}
