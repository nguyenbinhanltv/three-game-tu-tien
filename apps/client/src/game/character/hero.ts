import * as THREE from 'three/webgpu';
import { float, length, positionGeometry, smoothstep, vec3 } from 'three/tsl';
import { createHeroGhostMaterial, heroParams } from '../../render/materials/world';

/**
 * Hero light (Chân Cảnh C1): nhân vật của mình và đồng đội đọc rõ ở góc 52° nhờ (a) đèn phụ bám camera + viền Fresnel theo màu hướng tu,
 * ghi vào `userData.hero` của mesh (vật liệu `rimLight` đọc theo từng vật), (b) viền tối khi bị vật che (bản sao thân vẽ ở điểm sau vật khác),
 * (c) vòng chân tương phản. Chỉ là hình ở client; tắt bằng Cài đặt "Viền nhân vật" hoặc `?hero=0`.
 */

/** Màu viền mặc định khi chưa có công pháp/hướng tu (vàng nắng sớm, cùng sắc viền nắng). */
export const HERO_DEFAULT_TINT = 0xf2c47e;
/** Số bản sao viền tối tối đa cùng lúc (mỗi bản sao = một draw call: mình + tối đa 3 đồng đội). */
export const HERO_GHOST_MAX = 4;

const meshesOf = new WeakMap<THREE.Object3D, THREE.Mesh[]>();

function collect(root: THREE.Object3D): THREE.Mesh[] {
  let list = meshesOf.get(root);
  if (!list) {
    list = [];
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && !m.userData.heroGhost) list!.push(m);
    });
    meshesOf.set(root, list);
  }
  return list;
}

/** Quên danh sách mesh đã nhớ (model dựng lại khi đổi ngoại hình). */
export function forgetHero(root: THREE.Object3D): void {
  meshesOf.delete(root);
}

/** Đặt hero light cho mọi mesh của `root`: `k` 0 = tắt, 1 = bật; `tint` là số hex màu viền. */
export function setHero(root: THREE.Object3D, k: number, tint: number): void {
  for (const m of collect(root)) {
    const h = m.userData.hero as { k: number; tint: number } | undefined;
    if (k <= 0) {
      if (h) delete m.userData.hero;
    } else if (!h || h.k !== k || h.tint !== tint) m.userData.hero = { k, tint };
  }
}

interface Ghost {
  mesh: THREE.SkinnedMesh;
  src: THREE.SkinnedMesh;
}

/**
 * Bản sao viền tối của một nhân vật: chọn mesh thân LOD 0 nhiều đỉnh nhất, dựng SkinnedMesh dùng chung hình học và xương,
 * vật liệu ma (chỉ lộ ở điểm sau vật khác). Hiện/ẩn theo mesh gốc (LOD). Vòng đời: `release` khi nhân vật không còn là hero.
 */
export class HeroGhosts {
  private ghosts = new Map<THREE.Object3D, Ghost>();
  private mat = createHeroGhostMaterial();

  get count(): number {
    return this.ghosts.size;
  }

  /** Có bản sao cho `root` chưa. */
  has(root: THREE.Object3D): boolean {
    return this.ghosts.has(root);
  }

  /** Gắn bản sao cho `root` nếu còn chỗ; trả true nếu root có bản sao sau lời gọi. */
  attach(root: THREE.Object3D): boolean {
    if (this.ghosts.has(root)) return true;
    if (this.ghosts.size >= HERO_GHOST_MAX) return false;
    let best: THREE.SkinnedMesh | null = null;
    let bestN = 0;
    root.traverse((o) => {
      const m = o as THREE.SkinnedMesh;
      if (!m.isSkinnedMesh || m.userData.heroGhost || (m.userData.lod ?? 0) > 0) return;
      const n = m.geometry.attributes.position?.count ?? 0;
      if (n > bestN) {
        best = m;
        bestN = n;
      }
    });
    const src = best as THREE.SkinnedMesh | null;
    if (!src || !src.parent) return false;
    const g = new THREE.SkinnedMesh(src.geometry, this.mat);
    g.userData.heroGhost = true;
    g.bind(src.skeleton, src.bindMatrix);
    g.position.copy(src.position);
    g.quaternion.copy(src.quaternion);
    g.scale.copy(src.scale);
    g.frustumCulled = false;
    g.renderOrder = 5;
    g.castShadow = false;
    g.receiveShadow = false;
    src.parent.add(g);
    this.ghosts.set(root, { mesh: g, src });
    return true;
  }

  /** Đồng bộ hiện/ẩn với mesh gốc (LOD, ẩn khi chết…) và công tắc chung. Gọi mỗi khung. */
  sync(): void {
    const on = heroParams.enabled.value > 0;
    for (const g of this.ghosts.values()) g.mesh.visible = on && g.src.visible && g.src.parent !== null;
  }

  release(root: THREE.Object3D): void {
    const g = this.ghosts.get(root);
    if (!g) return;
    g.mesh.removeFromParent();
    this.ghosts.delete(root);
  }

  dispose(): void {
    for (const root of [...this.ghosts.keys()]) this.release(root);
    this.mat.dispose();
  }
}

/**
 * Tỉ lệ đọc từ trên (Chân Cảnh C2): phóng vai, tay (tay áo, bao tay), đầu (mũ, tóc) và bàn tay cầm kiếm bằng scale XƯƠNG, không sửa model.
 * Khóa là tên xương đã chuẩn hóa (`boneKey`). Scale xương cha kéo theo con (cánh tay, kiếm gắn vào bàn tay, dải lụa gắn vào tay) nên mọi
 * thứ nở đồng đều; xương lò xo tính theo vị trí thế giới nên vẫn bám. Mỗi khung phải gán lại SAU mixer (clip nướng có kênh scale).
 */
export const HERO_PROPORTIONS: Readonly<Record<string, number>> = {
  // Bộ xương UE5 Mannequin của nhân vật v3 (tên chuẩn hóa chữ thường); bộ Mixamo cũ dùng left/rightshoulder, left/righthand.
  clavicle_l: 1.12,
  clavicle_r: 1.12,
  head: 1.06,
  hand_l: 1.1,
  hand_r: 1.14,
  leftshoulder: 1.12,
  rightshoulder: 1.12,
  lefthand: 1.1,
  righthand: 1.14,
};
export interface BoneScale {
  bone: THREE.Object3D;
  s: number;
}

/** Tìm xương theo bảng tỉ lệ trong `rig` (tên chuẩn hóa bằng `keyOf`). */
export function proportionBones(
  rig: THREE.Object3D,
  keyOf: (name: string) => string,
  table: Readonly<Record<string, number>> = HERO_PROPORTIONS,
): BoneScale[] {
  const out: BoneScale[] = [];
  rig.traverse((b) => {
    if (!(b as THREE.Bone).isBone) return;
    const s = table[keyOf(b.name)];
    if (s !== undefined) out.push({ bone: b, s });
  });
  return out;
}

/** Gán scale xương (gọi mỗi khung sau mixer). `k` 0..1 nội suy giữa 1 và tỉ lệ đầy đủ. */
export function applyProportions(list: readonly BoneScale[], k = 1): void {
  for (const e of list) e.bone.scale.setScalar(1 + (e.s - 1) * k);
}

/** Vòng chân tương phản (C2): một InstancedMesh cho cả mình và đồng đội (1 draw call), tối ở ngoài + vành sáng mảnh ở trong. */
export const HERO_RING_MAX = 6;
const RING_IN = 0.42;
const RING_OUT = 0.86;

export class HeroRing {
  readonly mesh: THREE.InstancedMesh;
  private geo = new THREE.RingGeometry(RING_IN, RING_OUT, 40);
  private mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, fog: false });
  private n = 0;
  private static m = new THREE.Matrix4();
  private static q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
  private static p = new THREE.Vector3();
  private static s = new THREE.Vector3(1, 1, 1);

  constructor() {
    // r theo bán kính cục bộ: vành sáng mảnh ở sát trong, rồi tối dần ra ngoài.
    const r = length(positionGeometry.xy);
    const rim = smoothstep(float(RING_IN), float(RING_IN + 0.04), r).mul(
      float(1).sub(smoothstep(float(RING_IN + 0.04), float(RING_IN + 0.1), r)),
    );
    const dark = float(1)
      .sub(smoothstep(float(RING_IN + 0.06), float(RING_OUT), r))
      .mul(0.5);
    this.mat.colorNode = vec3(0.95, 0.9, 0.78)
      .mul(rim)
      .add(vec3(0.02, 0.03, 0.05).mul(dark));
    this.mat.opacityNode = rim.mul(0.55).add(dark.mul(0.55)).mul(heroParams.enabled);
    this.mesh = new THREE.InstancedMesh(this.geo, this.mat, HERO_RING_MAX);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    this.mesh.count = 0;
    this.mesh.visible = false;
    this.mesh.name = 'hero-ring';
  }

  begin(): void {
    this.n = 0;
  }

  /** Thêm một vòng dưới chân tại (x, y, z) thế giới (y = mặt đất); tối đa HERO_RING_MAX. */
  add(x: number, y: number, z: number): void {
    if (this.n >= HERO_RING_MAX) return;
    HeroRing.p.set(x, y + 0.04, z);
    HeroRing.m.compose(HeroRing.p, HeroRing.q, HeroRing.s);
    this.mesh.setMatrixAt(this.n++, HeroRing.m);
  }

  end(): void {
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.visible = this.n > 0 && heroParams.enabled.value > 0;
  }

  dispose(): void {
    this.geo.dispose();
    this.mat.dispose();
    this.mesh.dispose();
  }
}
