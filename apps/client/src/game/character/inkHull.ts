// Viền mực Dạ Cảnh (`?style=da`): mỗi nhân vật/quái được viền có thêm MỘT lưới "vỏ" dùng chung hình học và bộ xương của lưới thân lớn nhất,
// vẽ mặt sau phồng theo pháp tuyến (xem `createInkHullMaterial`). Cùng khuôn với `HeroGhosts` (hero.ts). Tốn 1 draw call + một lần skinning mỗi thể,
// nên có TRẦN: hết chỗ thì thể mới không được viền cho tới khi thể khác nhả ra (chết, đi xa, rời tầm nhìn).
import * as THREE from 'three/webgpu';
import { createInkHullMaterial } from '../../render/materials/world';
import { markVfxMask } from '../../render/post';

/** Số thể tối đa được viền cùng lúc (người chơi + quái). */
export const INK_HULL_MAX = 10;
/** Bề dày viền (m, không gian thế giới) và màu mực mặc định. */
export const INK_WIDTH = 0.03;
export const INK_COLOR = 0x05040a;
/** Bậc LOD của lưới dùng làm vỏ (1 = lưới gộp ít tam giác của v3); thể không có bậc này thì dùng bậc 0. */
export const INK_LOD = 1;

/** Màu và hệ số bề dày viền theo trạng thái quái: lộ yếu điểm = vàng (hue > 45°, không cam), vỡ thế = lam nhạt, boss đổi pha = đỏ thẫm dày. */
export const INK_STATE = {
  normal: { color: INK_COLOR, mul: 1 },
  weak: { color: 0xe0c050, mul: 1.6 },
  broken: { color: 0x9ed8e6, mul: 1.7 },
  rage: { color: 0xc8101c, mul: 2 },
} as const;
export type InkState = keyof typeof INK_STATE;

/** Trạng thái viền của quái từ cờ server: vỡ thế > lộ yếu điểm > boss đã sang pha sau > thường. Chỉ là lớp hình. */
export function inkStateOf(weak: boolean, broken: boolean, phase: number): InkState {
  if (broken) return 'broken';
  if (weak) return 'weak';
  return phase > 0 ? 'rage' : 'normal';
}

interface Hull {
  mesh: THREE.SkinnedMesh;
  /** Lưới cho hình học + bộ xương của vỏ (ưu tiên LOD thấp để bớt tam giác). */
  src: THREE.SkinnedMesh;
  /** Mọi lưới thân của `root`: vỏ hiện khi BẤT KỲ lưới nào đang hiện (LOD nào đang vẽ cũng có viền). */
  bodies: THREE.SkinnedMesh[];
}

const _s = new THREE.Vector3();

/** Vật liệu vỏ viền, đã vào mặt nạ của Họa Cảnh (Dạ Họa: bút Kuwahara không nhòe viền; không tác dụng ở style khác). */
function inkMaterial(): THREE.MeshStandardNodeMaterial {
  const m = createInkHullMaterial();
  markVfxMask(m);
  return m;
}

export class InkHulls {
  private hulls = new Map<THREE.Object3D, Hull>();
  private mat = inkMaterial();
  enabled = true;

  get count(): number {
    return this.hulls.size;
  }

  has(root: THREE.Object3D): boolean {
    return this.hulls.has(root);
  }

  /** Gắn vỏ cho `root` nếu còn chỗ và có lưới có xương; trả true nếu root có vỏ sau lời gọi. */
  attach(root: THREE.Object3D): boolean {
    if (this.hulls.has(root)) return true;
    if (this.hulls.size >= INK_HULL_MAX) return false;
    // Lưới lớn nhất của từng bậc LOD. Vỏ lấy bậc `INK_LOD` nếu có (lưới gộp ít tam giác), không thì bậc 0.
    const byLod = new Map<number, THREE.SkinnedMesh>();
    const bodies: THREE.SkinnedMesh[] = [];
    root.traverse((o) => {
      const m = o as THREE.SkinnedMesh;
      if (!m.isSkinnedMesh || m.userData.heroGhost || m.userData.inkHull || !m.geometry.attributes.normal) return;
      bodies.push(m);
      const lod = (m.userData.lod as number | undefined) ?? 0;
      const cur = byLod.get(lod);
      if (!cur || (m.geometry.attributes.position?.count ?? 0) > (cur.geometry.attributes.position?.count ?? 0)) byLod.set(lod, m);
    });
    const src = byLod.get(INK_LOD) ?? byLod.get(0) ?? null;
    if (!src || !src.parent) return false;
    const g = new THREE.SkinnedMesh(src.geometry, this.mat);
    g.userData.inkHull = true;
    g.userData.ink = { w: 0, color: INK_COLOR };
    g.bind(src.skeleton, src.bindMatrix);
    g.position.copy(src.position);
    g.quaternion.copy(src.quaternion);
    g.scale.copy(src.scale);
    g.frustumCulled = false;
    g.castShadow = false;
    g.receiveShadow = false;
    src.parent.add(g);
    this.hulls.set(root, { mesh: g, src, bodies });
    this.style(root, 'normal');
    return true;
  }

  /** Đổi màu và bề dày viền của `root` theo trạng thái (không đổi vật liệu: tham số theo từng vật). */
  style(root: THREE.Object3D, state: InkState): void {
    const h = this.hulls.get(root);
    if (!h) return;
    const st = INK_STATE[state];
    // Bề dày tính theo mét thế giới: chia cho tỉ lệ thế giới của lưới để ra đơn vị cục bộ.
    const scale = Math.max(1e-4, h.src.getWorldScale(_s).x);
    const ink = h.mesh.userData.ink as { w: number; color: number };
    ink.w = (INK_WIDTH * st.mul) / scale;
    ink.color = st.color;
  }

  /** Đồng bộ hiện/ẩn với lưới gốc (LOD, chết, chui đất). Gọi mỗi khung. */
  sync(): void {
    for (const h of this.hulls.values()) h.mesh.visible = this.enabled && h.src.parent !== null && h.bodies.some((b) => b.visible);
  }

  release(root: THREE.Object3D): void {
    const h = this.hulls.get(root);
    if (!h) return;
    h.mesh.removeFromParent();
    this.hulls.delete(root);
  }

  dispose(): void {
    for (const root of [...this.hulls.keys()]) this.release(root);
    this.mat.dispose();
  }
}
