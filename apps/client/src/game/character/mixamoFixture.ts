import * as THREE from 'three/webgpu';

/**
 * Rig Mixamo tối giản sinh bằng code (dùng cho test IK và viewer pose khi chưa có model người có xương trong manifest).
 * Tên xương giống GLB Mixamo sau GLTFLoader (`mixamorig:Hips` → `mixamorigHips`), tư thế T, trục cục bộ +Y dọc theo
 * xương như Mixamo. Số đo khớp `POSE_REF` (cao ~1,75m, hông 0,95m). Mặt nhìn +Z, tay phải ở -X.
 */

type J = [name: string, parent: string | null, x: number, y: number, z: number];

/** [tên, cha, vị trí thế giới lúc T-pose] cho bên trái; bên phải tự sinh bằng đổi dấu x. */
const CENTER: J[] = [
  ['Hips', null, 0, 0.95, 0],
  ['Spine', 'Hips', 0, 1.05, 0],
  ['Spine1', 'Spine', 0, 1.17, 0],
  ['Spine2', 'Spine1', 0, 1.3, 0],
  ['Neck', 'Spine2', 0, 1.46, 0],
  ['Head', 'Neck', 0, 1.55, 0],
  ['HeadTop_End', 'Head', 0, 1.75, 0],
];
const SIDE: J[] = [
  ['Shoulder', 'Spine2', 0.06, 1.4, 0],
  ['Arm', 'Shoulder', 0.18, 1.4, 0],
  ['ForeArm', 'Arm', 0.46, 1.4, 0],
  ['Hand', 'ForeArm', 0.72, 1.4, 0],
  ['HandMiddle1', 'Hand', 0.8, 1.4, 0],
  ['HandMiddle4', 'HandMiddle1', 0.9, 1.4, 0],
  ['UpLeg', 'Hips', 0.09, 0.9, 0],
  ['Leg', 'UpLeg', 0.09, 0.48, 0],
  ['Foot', 'Leg', 0.09, 0.08, 0],
  ['ToeBase', 'Foot', 0.09, 0.02, 0.12],
  ['Toe_End', 'ToeBase', 0.09, 0.02, 0.2],
];

function joints(): J[] {
  const out = [...CENTER];
  for (const [side, sx] of [
    ['Left', 1],
    ['Right', -1],
  ] as const) {
    for (const [n, p, x, y, z] of SIDE) {
      const parent = p === 'Hips' || p === 'Spine2' ? p : side + p;
      out.push([side + n, parent, x * sx, y, z]);
    }
  }
  return out;
}

const PREFIX = 'mixamorig';

interface FixtureOpts {
  /** Bọc xương trong node `Armature` scale 0,01 (xương tính bằng cm) như GLB Mixamo xuất từ FBX. */
  centimeters?: boolean;
  /** Thêm SkinnedMesh khối (1 draw call) để xem trong viewer. */
  mesh?: boolean;
}

/** Dựng rig; trả về gốc (đặt vào cảnh như `gltf.scene`). */
export function buildMixamoFixture(o: FixtureOpts = {}): THREE.Group {
  const root = new THREE.Group();
  root.name = 'mixamo_fixture';
  const armature = new THREE.Object3D();
  armature.name = 'Armature';
  const unit = o.centimeters ? 100 : 1;
  if (o.centimeters) armature.scale.setScalar(0.01);
  root.add(armature);

  const list = joints();
  const world = new Map<string, THREE.Vector3>(list.map(([n, , x, y, z]) => [n, new THREE.Vector3(x, y, z)]));
  const firstChild = new Map<string, string>();
  for (const [n, p] of list) if (p && !firstChild.has(p)) firstChild.set(p, n);
  // Tay/vai: con chính là xương dọc chi chứ không phải ngón/vai.
  firstChild.set('Spine2', 'Neck');
  firstChild.set('Hips', 'Spine');

  // Hướng thế giới của mỗi xương: +Y cục bộ chỉ về con chính (lá thì theo cha). Thêm chút xoay quanh trục để
  // trục X/Z cục bộ không trùng trục thế giới, buộc bộ giải không dựa vào trục cố định.
  const worldQ = new Map<string, THREE.Quaternion>();
  const bones = new Map<string, THREE.Bone>();
  const up = new THREE.Vector3(0, 1, 0);
  for (const [n, p] of list) {
    const child = firstChild.get(n);
    let q: THREE.Quaternion;
    if (child) {
      const dir = world.get(child)!.clone().sub(world.get(n)!).normalize();
      q = new THREE.Quaternion().setFromUnitVectors(up, dir);
      q.multiply(new THREE.Quaternion().setFromAxisAngle(up, 0.35));
    } else q = worldQ.get(p!)!.clone();
    worldQ.set(n, q);
    const b = new THREE.Bone();
    b.name = PREFIX + n;
    const pos = world.get(n)!.clone();
    if (p) {
      const pq = worldQ.get(p)!;
      pos.sub(world.get(p)!).applyQuaternion(pq.clone().invert());
      b.quaternion.copy(pq.clone().invert().multiply(q));
      bones.get(p)!.add(b);
    } else {
      b.quaternion.copy(q);
      armature.add(b);
    }
    b.position.copy(pos.multiplyScalar(unit));
    bones.set(n, b);
  }
  root.updateMatrixWorld(true);
  if (o.mesh) root.add(fixtureMesh(bones, world));
  return root;
}

/** Thân khối: mỗi đoạn xương một hộp gắn cứng vào xương đó, gộp chung một SkinnedMesh. */
function fixtureMesh(bones: Map<string, THREE.Bone>, world: Map<string, THREE.Vector3>): THREE.SkinnedMesh {
  const order = [...bones.keys()];
  const idx = new Map(order.map((n, i) => [n, i]));
  const parts: THREE.BufferGeometry[] = [];
  const seg = (bone: string, a: string, b: string, w: number, d = w) => {
    const pa = world.get(a)!;
    const pb = world.get(b)!;
    const len = pa.distanceTo(pb);
    const g = new THREE.BoxGeometry(w, len, d);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), pb.clone().sub(pa).normalize()));
    g.translate((pa.x + pb.x) / 2, (pa.y + pb.y) / 2, (pa.z + pb.z) / 2);
    const n = g.attributes.position!.count;
    g.setAttribute(
      'skinIndex',
      new THREE.Uint16BufferAttribute(
        new Array(n * 4).fill(0).map((_, i) => (i % 4 === 0 ? idx.get(bone)! : 0)),
        4,
      ),
    );
    g.setAttribute(
      'skinWeight',
      new THREE.Float32BufferAttribute(
        new Array(n * 4).fill(0).map((_, i) => (i % 4 === 0 ? 1 : 0)),
        4,
      ),
    );
    parts.push(g);
  };
  seg('Hips', 'Hips', 'Spine', 0.32, 0.2);
  seg('Spine', 'Spine', 'Spine1', 0.3, 0.19);
  seg('Spine1', 'Spine1', 'Spine2', 0.32, 0.2);
  seg('Spine2', 'Spine2', 'Neck', 0.38, 0.22);
  seg('Neck', 'Neck', 'Head', 0.09);
  seg('Head', 'Head', 'HeadTop_End', 0.19, 0.21);
  for (const s of ['Left', 'Right']) {
    seg(s + 'Shoulder', s + 'Shoulder', s + 'Arm', 0.1);
    seg(s + 'Arm', s + 'Arm', s + 'ForeArm', 0.09);
    seg(s + 'ForeArm', s + 'ForeArm', s + 'Hand', 0.075);
    seg(s + 'Hand', s + 'Hand', s + 'HandMiddle4', 0.06, 0.09);
    seg(s + 'UpLeg', s + 'UpLeg', s + 'Leg', 0.13);
    seg(s + 'Leg', s + 'Leg', s + 'Foot', 0.1);
    seg(s + 'Foot', s + 'Foot', s + 'Toe_End', 0.09, 0.07);
  }
  const geo = mergeGeometries(parts);
  const mat = new THREE.MeshStandardNodeMaterial({ color: 0x7f8f9e, roughness: 0.65 });
  const mesh = new THREE.SkinnedMesh(geo, mat);
  mesh.name = 'fixture_body';
  mesh.castShadow = true;
  const skeleton = new THREE.Skeleton(order.map((n) => bones.get(n)!));
  mesh.bind(skeleton);
  mesh.frustumCulled = false;
  return mesh;
}

function mergeGeometries(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const out = new THREE.BufferGeometry();
  const names = ['position', 'normal', 'skinIndex', 'skinWeight'] as const;
  const arrays: Record<string, number[]> = { position: [], normal: [], skinIndex: [], skinWeight: [] };
  const index: number[] = [];
  let base = 0;
  for (const g of list) {
    for (const n of names) arrays[n]!.push(...Array.from(g.attributes[n]!.array as ArrayLike<number>));
    for (const i of Array.from(g.index!.array)) index.push(i + base);
    base += g.attributes.position!.count;
    g.dispose();
  }
  out.setAttribute('position', new THREE.Float32BufferAttribute(arrays.position!, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(arrays.normal!, 3));
  out.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(arrays.skinIndex!, 4));
  out.setAttribute('skinWeight', new THREE.Float32BufferAttribute(arrays.skinWeight!, 4));
  out.setIndex(index);
  return out;
}

/** Kiếm thẳng (kiếm Trung Hoa) theo quy ước của `swordMount`: mũi +Z, lưỡi (cạnh sắc) ±X, chuôi ở -Z. */
export function buildFixtureSword(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'fixture_sword';
  const steel = new THREE.MeshStandardNodeMaterial({ color: 0xd8dde2, metalness: 0.9, roughness: 0.25 });
  const dark = new THREE.MeshStandardNodeMaterial({ color: 0x3a2a20, roughness: 0.8 });
  const gold = new THREE.MeshStandardNodeMaterial({ color: 0xb8923a, metalness: 0.8, roughness: 0.4 });
  const box = (w: number, h: number, d: number, z: number, m: THREE.Material) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    mesh.position.z = z;
    mesh.castShadow = true;
    g.add(mesh);
  };
  box(0.035, 0.008, 0.78, 0.47, steel); // lưỡi
  box(0.1, 0.025, 0.025, 0.07, gold); // đốc chắn
  box(0.028, 0.028, 0.16, -0.02, dark); // chuôi
  return g;
}
