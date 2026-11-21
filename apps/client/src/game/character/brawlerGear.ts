// Thể tu: găng quyền + giáp nhẹ bằng mesh thủ tục, gắn vào xương của nhân vật có bộ xương (concept the_tu_gang_giap) cho
// đến khi có GLB dựng từ Tripo. Mỗi món là MỘT mesh gộp (màu theo đỉnh, chung một vật liệu): hộ uyển + găng ×2, giáp vai
// trái, đai chéo ngực, đai lưng, ống quyển ×2 = 7 mesh/người (chỉ người tu Thể tu, bóng đổ không dựng).
// Dựng theo hệ trục của rig lúc bind (y lên, z trước), kích thước theo độ dài xương thật rồi `bone.attach` giữ nguyên vị trí thế giới.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Bảng màu theo concept: nâu đất / đồng rèn / đồng thau sáng, vải gai. */
export const BRAWLER_COLORS = {
  earth: 0x4a2a12,
  bronze: 0xb9772e,
  brass: 0xf0d9a0,
  linen: 0xb7ac8c,
} as const;

/** Tay không: đòn thường là quyền, kiếm không rút. */
export const BRAWLER_WEAPON = 'fist';

export interface BrawlerGear {
  readonly meshes: readonly THREE.Mesh[];
  setVisible(v: boolean): void;
  dispose(): void;
}

const Y = new THREE.Vector3(0, 1, 0);

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

/** Hộp/trụ đặt theo trục `dir` từ điểm `from` (gốc ở đầu gần, kéo dài `len`). */
function along(g: THREE.BufferGeometry, from: THREE.Vector3, dir: THREE.Vector3, len: number): THREE.BufferGeometry {
  g.translate(0, len / 2, 0);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(Y, dir.clone().normalize()));
  g.translate(from.x, from.y, from.z);
  return g;
}

/** Hộ uyển (trụ cụt đồng rèn + vành đồng thau) và găng (khối quyền nặng + mặt đốt tay) trên một cẳng tay → bàn tay. */
export function gauntletGeometry(elbow: THREE.Vector3, wrist: THREE.Vector3, height: number): THREE.BufferGeometry {
  const dir = wrist.clone().sub(elbow);
  const fore = dir.length();
  const d = dir.clone().normalize();
  const k = height / 1.7;
  const cuffFrom = elbow.clone().addScaledVector(d, fore * 0.5);
  const cuffLen = fore * 0.5 + 0.015 * k;
  const parts: THREE.BufferGeometry[] = [];
  parts.push(tinted(along(new THREE.CylinderGeometry(0.052 * k, 0.045 * k, cuffLen, 10, 1), cuffFrom, d, cuffLen), BRAWLER_COLORS.bronze));
  // vành đồng thau hai đầu hộ uyển
  for (const t of [0, 1]) {
    const at = cuffFrom.clone().addScaledVector(d, cuffLen * t);
    parts.push(tinted(along(new THREE.CylinderGeometry(0.056 * k, 0.056 * k, 0.012 * k, 10, 1), at, d, 0.012 * k), BRAWLER_COLORS.brass));
  }
  // găng: khối nặng bao bàn tay + dải đốt tay đồng thau
  const handLen = 0.1 * k;
  const fist = new THREE.BoxGeometry(0.085 * k, handLen, 0.075 * k);
  const q = new THREE.Quaternion().setFromUnitVectors(Y, d);
  fist.translate(0, handLen / 2, 0);
  fist.applyQuaternion(q);
  fist.translate(wrist.x, wrist.y, wrist.z);
  parts.push(tinted(fist, BRAWLER_COLORS.earth));
  const knuck = new THREE.BoxGeometry(0.09 * k, 0.022 * k, 0.082 * k);
  knuck.translate(0, handLen * 0.88, 0);
  knuck.applyQuaternion(q);
  knuck.translate(wrist.x, wrist.y, wrist.z);
  parts.push(tinted(knuck, BRAWLER_COLORS.brass));
  return mergeGeometries(parts, false)!;
}

/** Giáp vai (nửa vòm đồng + viền đồng thau), tâm ở khớp vai. */
export function pauldronGeometry(shoulder: THREE.Vector3, outward: THREE.Vector3, height: number): THREE.BufferGeometry {
  const k = height / 1.7;
  const r = 0.068 * k;
  const dome = new THREE.SphereGeometry(r, 12, 6, 0, Math.PI * 2, 0, Math.PI * 0.5);
  dome.scale(1, 0.75, 1);
  const rim = new THREE.TorusGeometry(r, 0.006 * k, 6, 16);
  rim.rotateX(Math.PI / 2);
  // vòm úp lên vai: trục hướng ra ngoài và lên, đẩy nhẹ ra ngoài khớp để ôm đầu vai
  const axis = outward
    .clone()
    .normalize()
    .multiplyScalar(0.7)
    .add(new THREE.Vector3(0, 0.7, 0))
    .normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(Y, axis);
  const at = shoulder.clone().addScaledVector(outward.clone().normalize(), 0.015 * k);
  const place = (g: THREE.BufferGeometry): THREE.BufferGeometry => {
    g.applyQuaternion(q);
    g.translate(at.x, at.y, at.z);
    return g;
  };
  return mergeGeometries([tinted(place(dome), BRAWLER_COLORS.bronze), tinted(place(rim), BRAWLER_COLORS.brass)], false)!;
}

/** Đai lưng (vòng quanh hông) và đai chéo ngực (dải vải gai nghiêng từ vai trái xuống hông phải). */
export function beltGeometry(waist: THREE.Vector3, height: number): THREE.BufferGeometry {
  const k = height / 1.7;
  const belt = new THREE.CylinderGeometry(0.15 * k, 0.15 * k, 0.05 * k, 14, 1, true);
  belt.translate(waist.x, waist.y, waist.z);
  const buckle = new THREE.BoxGeometry(0.05 * k, 0.05 * k, 0.012 * k);
  buckle.translate(waist.x, waist.y, waist.z + 0.15 * k);
  return mergeGeometries([tinted(belt, BRAWLER_COLORS.earth), tinted(buckle, BRAWLER_COLORS.brass)], false)!;
}

export function sashGeometry(chest: THREE.Vector3, height: number): THREE.BufferGeometry {
  const k = height / 1.7;
  // vòng dải vải nghiêng quanh thân: từ vai trái xuống hông phải, ôm theo ngực thay vì tấm phẳng
  const g = new THREE.CylinderGeometry(0.16 * k, 0.16 * k, 0.04 * k, 18, 1, true);
  g.scale(1.1, 1, 0.85);
  g.rotateZ(0.65);
  g.translate(chest.x, chest.y, chest.z);
  return tinted(g, BRAWLER_COLORS.linen);
}

/** Ống quyển: trụ ôm cẳng chân, đồng rèn. */
export function shinGeometry(knee: THREE.Vector3, ankle: THREE.Vector3, height: number): THREE.BufferGeometry {
  const k = height / 1.7;
  const d = ankle.clone().sub(knee);
  const len = d.length() * 0.7;
  const from = knee.clone().addScaledVector(d.clone().normalize(), d.length() * 0.18);
  return tinted(along(new THREE.CylinderGeometry(0.058 * k, 0.045 * k, len, 10, 1), from, d, len), BRAWLER_COLORS.bronze);
}

let sharedMat: THREE.MeshStandardMaterial | null = null;
function gearMaterial(): THREE.MeshStandardMaterial {
  return (sharedMat ??= new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.45, side: THREE.DoubleSide }));
}

/** Ảnh chụp tư thế bind (hệ rig) của các xương cần gắn: gọi ngay sau khi dựng, trước khi animation chạy. */
export type BindSnapshot = ReadonlyMap<string, { pos: THREE.Vector3; inv: THREE.Matrix4 }>;

const GEAR_BONES = [
  'upperarm_l',
  'lowerarm_l',
  'lowerarm_r',
  'hand_l',
  'hand_r',
  'calf_l',
  'calf_r',
  'foot_l',
  'foot_r',
  'spine_01',
  'spine_02',
  'spine_03',
];

export function snapshotBind(rig: THREE.Object3D): BindSnapshot {
  rig.updateMatrixWorld(true);
  const toRig = rig.matrixWorld.clone().invert();
  const out = new Map<string, { pos: THREE.Vector3; inv: THREE.Matrix4 }>();
  for (const n of GEAR_BONES) {
    const b = rig.getObjectByName(n);
    if (!b) continue;
    const m = b.matrixWorld.clone().premultiply(toRig); // xương trong hệ rig
    out.set(n, { pos: new THREE.Vector3().setFromMatrixPosition(m), inv: m.clone().invert() });
  }
  return out;
}

/** Gắn bộ găng + giáp nhẹ (dựng theo `bind`, gắn vào xương nên chạy theo animation). Thiếu xương nào thì bỏ món đó. */
export function attachBrawlerGear(rig: THREE.Object3D, bind: BindSnapshot, height: number): BrawlerGear {
  const pos = (name: string): THREE.Vector3 | null => bind.get(name)?.pos ?? null;
  const meshes: THREE.Mesh[] = [];
  const mount = (boneName: string, geo: THREE.BufferGeometry | null): void => {
    const bone = rig.getObjectByName(boneName);
    const b = bind.get(boneName);
    if (!bone || !b || !geo) return;
    const m = new THREE.Mesh(geo, gearMaterial());
    m.name = `dtl_brawler_${boneName}`;
    m.frustumCulled = false;
    // hình dựng ở hệ rig lúc bind → đổi sang hệ cục bộ của xương bằng nghịch đảo ma trận bind
    b.inv.decompose(m.position, m.quaternion, m.scale);
    bone.add(m);
    meshes.push(m);
  };
  for (const s of ['l', 'r'] as const) {
    const elbow = pos(`lowerarm_${s}`);
    const wrist = pos(`hand_${s}`);
    mount(`hand_${s}`, elbow && wrist ? gauntletGeometry(elbow, wrist, height) : null);
    const knee = pos(`calf_${s}`);
    const ankle = pos(`foot_${s}`);
    mount(`calf_${s}`, knee && ankle ? shinGeometry(knee, ankle, height) : null);
  }
  const sh = pos('upperarm_l');
  const el = pos('lowerarm_l');
  mount('upperarm_l', sh && el ? pauldronGeometry(sh, new THREE.Vector3(Math.sign(el.x - sh.x) || 1, 0, 0), height) : null);
  const waist = pos('spine_01');
  mount('spine_01', waist ? beltGeometry(waist, height) : null);
  const chest = pos('spine_03') ?? pos('spine_02');
  mount(rig.getObjectByName('spine_03') ? 'spine_03' : 'spine_02', chest ? sashGeometry(chest, height) : null);
  return {
    meshes,
    setVisible(v) {
      for (const m of meshes) m.visible = v;
    },
    dispose() {
      for (const m of meshes) {
        m.removeFromParent();
        m.geometry.dispose();
      }
      meshes.length = 0;
    },
  };
}
