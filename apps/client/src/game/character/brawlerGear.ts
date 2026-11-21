// Thể tu: găng quyền + giáp nhẹ bằng mesh thủ tục (concept the_tu_gang_giap) cho đến khi có GLB dựng từ Tripo (khi đó thay
// file này). TOÀN BỘ gộp thành MỘT SkinnedMesh dùng chung bộ xương của nhân vật (mỗi đỉnh ăn trọng số 1 xương): +1 draw
// call mỗi người Thể tu, chạy theo animation; màu theo đỉnh, một vật liệu chung.
//   giáp vai trái: ba lá chồng (viền đồng thau, gờ giữa, đinh tán, hoa văn thoi) + vòm đỉnh vai
//   găng ×2: hộ uyển hai đai đồng thau + quấn vải gai, giáp mu bàn tay, hàng giáp đốt ngón + mảnh giáp ngón
//   đai chéo ngực + đai quấn vai phải, đai lưng có tấm vải trước hông, ống quyển có vành + gờ
// Hình dựng theo hệ rig lúc bind (chụp ngay sau khi dựng, trước animation) rồi đổi sang hệ cục bộ của mesh da tham chiếu.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Bảng màu theo concept: nâu đất / đồng rèn / đồng thau sáng, vải gai. */
export const BRAWLER_COLORS = {
  earth: 0x4a2a12,
  bronze: 0xb9772e,
  brass: 0xf0d9a0,
  linen: 0xb7ac8c,
} as const;

/**
 * Cổ Thần (TN-5): cùng bộ găng + giáp của Thể tu nhưng "nâng cấp": đổi sang huyết đồng (đỏ sẫm / đỏ đồng / vàng cổ) và thêm gai xương
 * trên giáp vai. Thủ tục như bộ gốc: vẫn MỘT SkinnedMesh, +0 draw call so với Thể tu.
 */
export const COTHAN_COLORS = {
  earth: 0x3a0d0d,
  bronze: 0xb3322a,
  brass: 0xe8b04a,
} as const;

const RECOLOR = new Map<number, number>([
  [BRAWLER_COLORS.earth, COTHAN_COLORS.earth],
  [BRAWLER_COLORS.bronze, COTHAN_COLORS.bronze],
  [BRAWLER_COLORS.brass, COTHAN_COLORS.brass],
]);

/** Đổi màu đỉnh theo bảng `RECOLOR` (màu không có trong bảng, như vải gai, giữ nguyên). Sửa tại chỗ. */
export function recolorGear(geo: THREE.BufferGeometry): void {
  const attr = geo.getAttribute('color');
  if (!attr) return;
  const arr = attr.array as Float32Array;
  const from = new Map<string, THREE.Color>();
  for (const [a, b] of RECOLOR) from.set(new THREE.Color(a).getHexString(), new THREE.Color(b));
  const c = new THREE.Color();
  for (let i = 0; i < attr.count; i++) {
    c.fromArray(arr, i * 3);
    const to = from.get(c.getHexString());
    if (to) to.toArray(arr, i * 3);
  }
  attr.needsUpdate = true;
}

/** Gai xương trên giáp vai trái: ba gai xếp quạt dọc cung vai, mũi hướng lên + ra. */
export function spikeParts(shoulder: THREE.Vector3, elbow: THREE.Vector3, outward: THREE.Vector3, height: number): THREE.BufferGeometry {
  const k = height / 1.7;
  const arm = elbow.clone().sub(shoulder);
  const up = outward
    .clone()
    .normalize()
    .multiplyScalar(0.8)
    .add(new THREE.Vector3(0, 1, 0))
    .normalize();
  const m = frame(shoulder, arm, up);
  const g: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 3; i++) {
    const a = -0.5 + i * 0.5;
    const cone = new THREE.ConeGeometry(0.011 * k, (0.075 - Math.abs(a) * 0.04) * k, 6, 1);
    cone.rotateX(Math.PI / 2); // mũi hướng +z (lên + ra)
    cone.translate(0, (0.012 + i * 0.002) * k, 0.07 * k);
    cone.rotateY(a);
    g.push(put(cone, m, COTHAN_COLORS.brass));
  }
  const out = mergeGeometries(g, false)!;
  for (const p of g) p.dispose();
  return out;
}

/** Tay không: đòn thường là quyền, kiếm không rút. */
export const BRAWLER_WEAPON = 'fist';

/** Găng/giáp chỉ vẽ khi đang là Thể tu VÀ ở LOD0: người xa không đáng một draw call (ngân sách 300). */
export function gearShown(on: boolean, lodLevel: number): boolean {
  return on && lodLevel === 0;
}

export interface BrawlerGear {
  readonly meshes: readonly THREE.Mesh[];
  /** Bật/tắt vẽ (người gọi tự gộp điều kiện: đang là Thể tu và đang ở LOD gần). */
  setVisible(v: boolean): void;
  dispose(): void;
}

const GEAR_BONES = [
  'upperarm_l',
  'upperarm_r',
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

/**
 * Ảnh chụp tư thế lúc dựng (hệ rig) các xương cần gắn + mesh da tham chiếu. Gọi ngay sau khi dựng, trước khi animation chạy.
 * `toBone`: với mỗi xương, ma trận đổi một điểm hệ rig sang không gian đỉnh để khi da tính (bindInv · xương · xươngInv · bind)
 * điểm đó nằm đúng chỗ cũ lúc chụp, KHÔNG giả định tư thế lúc dựng trùng tư thế bind của file.
 */
export interface BindSnapshot {
  pos: ReadonlyMap<string, THREE.Vector3>;
  toBone: ReadonlyMap<string, THREE.Matrix4>;
  ref: THREE.SkinnedMesh | null;
}

export function snapshotBind(rig: THREE.Object3D): BindSnapshot {
  rig.updateMatrixWorld(true);
  const toRig = rig.matrixWorld.clone().invert();
  const pos = new Map<string, THREE.Vector3>();
  const toBone = new Map<string, THREE.Matrix4>();
  let ref: THREE.SkinnedMesh | null = null;
  rig.traverse((o) => {
    const s = o as THREE.SkinnedMesh;
    if (!ref && s.isSkinnedMesh && s.skeleton) ref = s;
  });
  const r = ref as THREE.SkinnedMesh | null;
  for (const n of GEAR_BONES) {
    const b = rig.getObjectByName(n);
    if (!b) continue;
    pos.set(n, new THREE.Vector3().setFromMatrixPosition(b.matrixWorld.clone().premultiply(toRig)));
    const i = r ? r.skeleton.bones.indexOf(b as THREE.Bone) : -1;
    if (r && i >= 0 && r.skeleton.boneInverses[i]) {
      const skin = r.bindMatrixInverse.clone().multiply(b.matrixWorld).multiply(r.skeleton.boneInverses[i]!).multiply(r.bindMatrix);
      const vertexToWorld = r.matrixWorld.clone().multiply(skin);
      toBone.set(n, vertexToWorld.invert().multiply(rig.matrixWorld));
    }
  }
  return { pos, toBone, ref: r };
}

// ---- hình học -------------------------------------------------------------------------------------------------

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

/** Hệ trục địa phương: y = `up`, z = `hint` đã trực giao hoá, gốc `at`. Hình dựng ở gốc, trục y là trục chi/khớp. */
function frame(at: THREE.Vector3, up: THREE.Vector3, hint: THREE.Vector3): THREE.Matrix4 {
  const y = up.clone().normalize();
  let z = hint.clone().addScaledVector(y, -hint.dot(y));
  if (z.lengthSq() < 1e-6) z = new THREE.Vector3(0, 0, 1).addScaledVector(y, -y.z);
  z.normalize();
  const x = new THREE.Vector3().crossVectors(y, z);
  return new THREE.Matrix4().makeBasis(x, y, z).setPosition(at);
}

function put(g: THREE.BufferGeometry, m: THREE.Matrix4, color: number): THREE.BufferGeometry {
  g.applyMatrix4(m);
  return tinted(g, color);
}

/** Hộp nhỏ đặt trong hệ `m` ở vị trí (x, y, z) cục bộ. */
function boxAt(
  m: THREE.Matrix4,
  x: number,
  y: number,
  z: number,
  w: number,
  h: number,
  d: number,
  color: number,
  rotZ = 0,
): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  if (rotZ) g.rotateZ(rotZ);
  g.translate(x, y, z);
  return put(g, m, color);
}

function ringAt(m: THREE.Matrix4, y: number, r: number, h: number, color: number): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(r, r, h, 14, 1, false);
  g.translate(0, y, 0);
  return put(g, m, color);
}

/** Cung trụ hở (một phần vòng) quanh trục y, tâm cung về +z, rộng `arc` rad. */
function arcAt(m: THREE.Matrix4, y: number, r: number, h: number, arc: number, color: number): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(r, r * 0.92, h, 12, 1, true, -arc / 2, arc);
  g.translate(0, y, 0);
  return put(g, m, color);
}

export function gauntletParts(elbow: THREE.Vector3, wrist: THREE.Vector3, back: THREE.Vector3, height: number): THREE.BufferGeometry {
  const k = height / 1.7;
  const dir = wrist.clone().sub(elbow);
  const fore = dir.length() / k; // độ dài cẳng tay theo "đơn vị người 1,7 m"
  const m = frame(wrist, dir, back);
  const g: THREE.BufferGeometry[] = [];
  const s = (v: number): number => v * k;
  // hộ uyển: ống đồng rèn nửa cẳng tay, hai đai đồng thau, hai vòng quấn vải gai gần khuỷu
  const cuffLen = Math.min(0.5 * fore, 0.15) * k;
  g.push(ringAt(m, -cuffLen / 2, s(0.05), cuffLen, BRAWLER_COLORS.bronze));
  g.push(ringAt(m, -cuffLen, s(0.054), s(0.012), BRAWLER_COLORS.brass));
  g.push(ringAt(m, -s(0.004), s(0.054), s(0.012), BRAWLER_COLORS.brass));
  g.push(ringAt(m, -cuffLen - s(0.02), s(0.048), s(0.025), BRAWLER_COLORS.linen));
  g.push(ringAt(m, -cuffLen - s(0.05), s(0.047), s(0.02), BRAWLER_COLORS.linen));
  // gờ nổi dọc hộ uyển (hoa văn)
  g.push(boxAt(m, 0, -cuffLen / 2, s(0.054), s(0.01), cuffLen * 0.8, s(0.008), BRAWLER_COLORS.brass));
  // giáp mu bàn tay: cung cong đồng rèn + gờ giữa
  g.push(arcAt(m, s(0.05), s(0.048), s(0.09), 2.3, BRAWLER_COLORS.bronze));
  g.push(boxAt(m, 0, s(0.05), s(0.05), s(0.012), s(0.09), s(0.008), BRAWLER_COLORS.brass));
  // giáp đốt ngón: hàng bốn mảnh đồng thau + mảnh giáp ngón nâu đất phía trên
  for (let i = 0; i < 4; i++) {
    const x = s(-0.03 + i * 0.02);
    g.push(boxAt(m, x, s(0.1), s(0.036), s(0.018), s(0.02), s(0.014), BRAWLER_COLORS.brass));
    g.push(boxAt(m, x, s(0.13), s(0.028), s(0.015), s(0.032), s(0.01), BRAWLER_COLORS.earth));
  }
  // giáp ngón cái
  g.push(boxAt(m, s(-0.05), s(0.04), s(0.01), s(0.016), s(0.05), s(0.016), BRAWLER_COLORS.earth));
  return mergeGeometries(g, false)!;
}

/** Giáp vai: vòm đỉnh vai + ba lá chồng dọc cánh tay (viền đồng thau, đinh tán, gờ giữa, hoa văn thoi trên lá đầu). */
export function pauldronParts(shoulder: THREE.Vector3, elbow: THREE.Vector3, outward: THREE.Vector3, height: number): THREE.BufferGeometry {
  const k = height / 1.7;
  const s = (v: number): number => v * k;
  const arm = elbow.clone().sub(shoulder);
  const up = outward
    .clone()
    .normalize()
    .multiplyScalar(0.8)
    .add(new THREE.Vector3(0, 1, 0))
    .normalize(); // hướng "lên + ra" của cung
  const m = frame(shoulder, arm, up);
  const g: THREE.BufferGeometry[] = [];
  // vòm đỉnh vai
  const dome = new THREE.SphereGeometry(s(0.062), 12, 6, 0, Math.PI * 2, 0, Math.PI * 0.5);
  dome.scale(1, 0.55, 1);
  dome.rotateX(Math.PI / 2); // đỉnh vòm hướng +z (lên + ra)
  dome.translate(0, s(0.01), 0);
  g.push(put(dome, m, BRAWLER_COLORS.bronze));
  // ba lá chồng, lá sau to dần xuống cánh tay
  for (let i = 0; i < 3; i++) {
    const y = s(0.02 + i * 0.034);
    const r = s(0.066 + i * 0.006);
    g.push(arcAt(m, y, r, s(0.05), 2.5 + i * 0.1, BRAWLER_COLORS.bronze));
    g.push(arcAt(m, y + s(0.026), r + s(0.002), s(0.008), 2.5 + i * 0.1, BRAWLER_COLORS.brass)); // viền dưới
    g.push(boxAt(m, 0, y, r + s(0.003), s(0.009), s(0.05), s(0.007), BRAWLER_COLORS.brass)); // gờ giữa
    for (const a of [-0.6, 0.6]) {
      const st = new THREE.SphereGeometry(s(0.0065), 6, 4);
      st.translate(Math.sin(a) * (r + s(0.002)), y + s(0.018), Math.cos(a) * (r + s(0.002))); // đinh tán
      g.push(put(st, m, BRAWLER_COLORS.brass));
    }
  }
  // hoa văn thoi trên lá đầu
  g.push(boxAt(m, 0, s(0.02), s(0.075), s(0.022), s(0.022), s(0.006), BRAWLER_COLORS.brass, Math.PI / 4));
  return mergeGeometries(g, false)!;
}

/** Đai lưng (da nâu đất) + khóa đồng thau + tấm vải gai rũ trước hông. */
export function beltParts(waist: THREE.Vector3, height: number): THREE.BufferGeometry {
  const k = height / 1.7;
  const m = new THREE.Matrix4().setPosition(waist);
  const belt = new THREE.CylinderGeometry(0.15 * k, 0.15 * k, 0.05 * k, 16, 1, true);
  return mergeGeometries(
    [
      put(belt, m, BRAWLER_COLORS.earth),
      boxAt(m, 0, 0, 0.153 * k, 0.05 * k, 0.05 * k, 0.012 * k, BRAWLER_COLORS.brass),
      boxAt(m, 0.03 * k, -0.07 * k, 0.15 * k, 0.07 * k, 0.12 * k, 0.008 * k, BRAWLER_COLORS.linen),
    ],
    false,
  )!;
}

/** Đai chéo ngực: vòng vải gai nghiêng quanh thân (vai trái xuống hông phải) + khóa tròn. */
export function sashParts(chest: THREE.Vector3, height: number): THREE.BufferGeometry {
  const k = height / 1.7;
  const ring = new THREE.CylinderGeometry(0.16 * k, 0.16 * k, 0.04 * k, 18, 1, true);
  ring.scale(1.1, 1, 0.85);
  ring.rotateZ(0.65);
  ring.translate(chest.x, chest.y, chest.z);
  const clasp = new THREE.CylinderGeometry(0.018 * k, 0.018 * k, 0.01 * k, 10);
  clasp.rotateX(Math.PI / 2);
  clasp.translate(chest.x, chest.y + 0.005 * k, chest.z + 0.14 * k);
  return mergeGeometries([tinted(ring, BRAWLER_COLORS.linen), tinted(clasp, BRAWLER_COLORS.brass)], false)!;
}

/** Đai quấn quanh vai phải (vải gai) + vòng đồng thau, nối với đai chéo. */
export function shoulderWrapParts(shoulder: THREE.Vector3, elbow: THREE.Vector3, height: number): THREE.BufferGeometry {
  const k = height / 1.7;
  const m = frame(shoulder.clone().lerp(elbow, 0.12), elbow.clone().sub(shoulder), new THREE.Vector3(0, 0, 1));
  return mergeGeometries(
    [ringAt(m, 0, 0.056 * k, 0.05 * k, BRAWLER_COLORS.linen), ringAt(m, 0.03 * k, 0.057 * k, 0.01 * k, BRAWLER_COLORS.brass)],
    false,
  )!;
}

/** Ống quyển: trụ ôm cẳng chân đồng rèn, vành đồng thau trên/dưới, gờ giữa phía trước. */
export function shinParts(knee: THREE.Vector3, ankle: THREE.Vector3, height: number): THREE.BufferGeometry {
  const k = height / 1.7;
  const d = ankle.clone().sub(knee);
  const len = d.length() * 0.7;
  const m = frame(knee.clone().addScaledVector(d.clone().normalize(), d.length() * 0.18), d, new THREE.Vector3(0, 0, 1));
  // trục y của hệ hướng XUỐNG (gối → cổ chân)
  return mergeGeometries(
    [
      ringAt(m, len / 2, 0.052 * k, len, BRAWLER_COLORS.bronze),
      ringAt(m, 0.004 * k, 0.057 * k, 0.014 * k, BRAWLER_COLORS.brass),
      ringAt(m, len - 0.004 * k, 0.05 * k, 0.014 * k, BRAWLER_COLORS.brass),
      boxAt(m, 0, len / 2, 0.055 * k, 0.012 * k, len * 0.85, 0.008 * k, BRAWLER_COLORS.brass),
    ],
    false,
  )!;
}

let sharedMat: THREE.MeshStandardMaterial | null = null;
function gearMaterial(): THREE.MeshStandardMaterial {
  return (sharedMat ??= new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.5, side: THREE.DoubleSide }));
}

/** Gán trọng số da (một xương) cho hình `geo` đang ở hệ rig, đổi sang hệ cục bộ của mesh tham chiếu. */
function skinTo(geo: THREE.BufferGeometry, boneIndex: number, toBone: THREE.Matrix4): THREE.BufferGeometry {
  geo.applyMatrix4(toBone);
  const n = geo.getAttribute('position').count;
  const idx = new Uint16Array(n * 4);
  const w = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    idx[i * 4] = boneIndex;
    w[i * 4] = 1;
  }
  geo.setAttribute('skinIndex', new THREE.BufferAttribute(idx, 4));
  geo.setAttribute('skinWeight', new THREE.BufferAttribute(w, 4));
  return geo;
}

const NONE: BrawlerGear = { meshes: [], setVisible() {}, dispose() {} };

/** Dựng toàn bộ găng + giáp thành MỘT SkinnedMesh dùng chung bộ xương của mesh tham chiếu. Thiếu xương nào thì bỏ món đó. */
export function attachBrawlerGear(rig: THREE.Object3D, bind: BindSnapshot, height: number, ancient = false): BrawlerGear {
  const ref = bind.ref;
  if (!ref) return NONE;
  const pos = (name: string): THREE.Vector3 | null => bind.pos.get(name) ?? null;
  const bones = ref.skeleton.bones;
  const parts: THREE.BufferGeometry[] = [];
  const add = (boneName: string, geo: THREE.BufferGeometry | null): void => {
    const b = rig.getObjectByName(boneName);
    const bi = b ? bones.indexOf(b as THREE.Bone) : -1;
    const tb = bind.toBone.get(boneName);
    if (!geo || bi < 0 || !tb) return;
    parts.push(skinTo(geo, bi, tb));
  };
  for (const s of ['l', 'r'] as const) {
    const sign = s === 'l' ? 1 : -1;
    const elbow = pos(`lowerarm_${s}`);
    const wrist = pos(`hand_${s}`);
    // mu bàn tay hướng ra ngoài thân (A-pose, lòng bàn tay hướng đùi)
    add(`hand_${s}`, elbow && wrist ? gauntletParts(elbow, wrist, new THREE.Vector3(sign, 0, 0), height) : null);
    const knee = pos(`calf_${s}`);
    const ankle = pos(`foot_${s}`);
    add(`calf_${s}`, knee && ankle ? shinParts(knee, ankle, height) : null);
  }
  const sh = pos('upperarm_l');
  const el = pos('lowerarm_l');
  add('upperarm_l', sh && el ? pauldronParts(sh, el, new THREE.Vector3(Math.sign(el.x - sh.x) || 1, 0, 0), height) : null);
  if (ancient && sh && el) add('upperarm_l', spikeParts(sh, el, new THREE.Vector3(Math.sign(el.x - sh.x) || 1, 0, 0), height));
  const shr = pos('upperarm_r');
  const elr = pos('lowerarm_r');
  add('upperarm_r', shr && elr ? shoulderWrapParts(shr, elr, height) : null);
  const waist = pos('spine_01');
  add('spine_01', waist ? beltParts(waist, height) : null);
  const chestBone = rig.getObjectByName('spine_03') ? 'spine_03' : 'spine_02';
  const chest = pos(chestBone);
  add(chestBone, chest ? sashParts(chest, height) : null);
  if (!parts.length) return NONE;
  const geo = mergeGeometries(parts, false)!;
  if (ancient) recolorGear(geo);
  for (const p of parts) p.dispose();
  const mesh = new THREE.SkinnedMesh(geo, gearMaterial());
  mesh.name = ancient ? 'dtl_cothan_gear' : 'dtl_brawler_gear';
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
