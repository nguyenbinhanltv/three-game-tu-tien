// Viền mực Dạ Cảnh (`?style=da`): mỗi nhân vật/quái được viền có thêm MỘT lưới "vỏ" dùng chung hình học và bộ xương của lưới thân lớn nhất,
// vẽ mặt sau phồng theo pháp tuyến (xem `createInkHullMaterial`). Cùng khuôn với `HeroGhosts` (hero.ts). Tốn 1 draw call + một lần skinning mỗi thể,
// nên có TRẦN: hết chỗ thì thể mới không được viền cho tới khi thể khác nhả ra (chết, đi xa, rời tầm nhìn).
import * as THREE from 'three/webgpu';
import { createInkHullMaterial } from '../../render/materials/world';
import { markVfxMask } from '../../render/post';

/** Số thể tối đa được viền cùng lúc (người chơi + quái). */
export const INK_HULL_MAX = 16;
/** Thể đang có viền được ưu tiên giữ chỗ: điểm ưu tiên nhân với hệ số này (tránh hai thể cách đều giành viền qua lại mỗi khung). */
export const INK_KEEP_BIAS = 0.8;
/** Bề dày viền (m, không gian thế giới) và màu mực mặc định. */
export const INK_WIDTH = 0.03;
export const INK_COLOR = 0x05040a;
/** Phòng thử (khu Phong cách): hệ số nhân bề dày viền của MỌI thể, chỉnh lúc chạy; 1 = như thiết kế. Không lưu, không đổi mặc định của game. */
export const INK_TUNE = { width: 1 };
/** Bậc LOD của lưới dùng làm vỏ (1 = lưới gộp ít tam giác của v3); thể không có bậc này thì dùng bậc 0. */
export const INK_LOD = 1;
/** Trần bề dày viền theo cỡ thân: không quá ngần này lần bán kính bao (thân sói nhỏ không bị viền trạng thái nuốt mất). */
export const INK_MAX_OF_BODY = 0.07;

/** Bề dày viền (m thế giới) của thân có bán kính bao `radWorld` ở hệ số trạng thái `mul`. Hàm thuần. */
export function inkWidthOf(mul: number, radWorld: number): number {
  const w = INK_WIDTH * mul;
  return radWorld > 0 ? Math.min(w, Math.max(INK_WIDTH, radWorld * INK_MAX_OF_BODY)) : w;
}

/** Màu và hệ số bề dày viền theo trạng thái quái: lộ yếu điểm = vàng (hue > 45°, không cam), vỡ thế = lam nhạt, boss đổi pha = đỏ thẫm dày. */
export const INK_STATE = {
  normal: { color: INK_COLOR, mul: 1 },
  // Bề dày trạng thái đủ để đọc ở khoảng cách camera chéo mặc định (~20 m, 720p: 0,1 m ≈ 3 px). Diễn Võ Trường cho thấy mức cũ (×1,6–2) không khác viền thường.
  weak: { color: 0xffd84a, mul: 3.4 },
  broken: { color: 0xa8ecff, mul: 3.6 },
  rage: { color: 0xd8121e, mul: 3.2 },
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
  /** Hệ số bề dày của trạng thái đang đặt (`INK_STATE[..].mul`); bề dày cục bộ tính lại mỗi khung ở `sync`. */
  mul: number;
  /** Bán kính bao của lưới nguồn (đơn vị cục bộ): trần bề dày viền theo cỡ thân. */
  rad: number;
}

const _m = new THREE.Matrix4();

/**
 * Tỉ lệ thế giới THẬT của đỉnh một lưới có xương: đỉnh đi qua `xương.matrixWorld × boneInverse × bindMatrix`, không qua ma trận của chính nút lưới.
 * Skin Tripo của quái để đỉnh ở đơn vị khác (xương mang tỉ lệ), nên lấy tỉ lệ của nút lưới (=1) làm viền mỏng đi cả trăm lần và biến mất.
 */
export function skinnedWorldScale(m: THREE.SkinnedMesh): number {
  const b = m.skeleton?.bones[0];
  const inv = m.skeleton?.boneInverses[0];
  if (!b || !inv) return Math.max(1e-4, m.matrixWorld.getMaxScaleOnAxis());
  _m.multiplyMatrices(b.matrixWorld, inv).multiply(m.bindMatrix);
  // 'detached': xương ở không gian riêng của bộ xương, nút lưới đặt nó vào thế giới.
  if (m.bindMode === THREE.DetachedBindMode) _m.premultiply(m.matrixWorld);
  return Math.max(1e-4, _m.getMaxScaleOnAxis());
}

/** `o` còn nằm trong cây của `root` không. */
function isUnder(o: THREE.Object3D, root: THREE.Object3D): boolean {
  for (let p: THREE.Object3D | null = o; p; p = p.parent) if (p === root) return true;
  return false;
}

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
    const old = this.hulls.get(root);
    if (old) {
      // Lưới nguồn đã bị thay (skin của quái nạp xong sau, đổi trang phục): vỏ cũ bám lưới đã gỡ nên không bao giờ hiện. Nhả để dựng lại từ lưới mới.
      if (isUnder(old.src, root)) return true;
      this.release(root);
    }
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
    // Skin quái gắn xương kiểu 'detached' (xương nằm ngoài cảnh, vị trí do ma trận của nút lưới quyết định): vỏ phải cùng kiểu, nếu không three
    // nhân thêm nghịch đảo ma trận thế giới của vỏ và vỏ bị vẽ lệch ra khỏi khung (Diễn Võ Trường: viền trạng thái của quái không bao giờ hiện).
    g.bindMode = src.bindMode;
    g.bind(src.skeleton, src.bindMatrix);
    g.position.copy(src.position);
    g.quaternion.copy(src.quaternion);
    g.scale.copy(src.scale);
    g.frustumCulled = false;
    g.castShadow = false;
    g.receiveShadow = false;
    src.parent.add(g);
    if (!src.geometry.boundingSphere) src.geometry.computeBoundingSphere();
    this.hulls.set(root, { mesh: g, src, bodies, mul: 1, rad: src.geometry.boundingSphere?.radius ?? 0 });
    this.style(root, 'normal');
    return true;
  }

  /** Đổi màu và bề dày viền của `root` theo trạng thái (không đổi vật liệu: tham số theo từng vật). */
  style(root: THREE.Object3D, state: InkState): void {
    const h = this.hulls.get(root);
    if (!h) return;
    const st = INK_STATE[state];
    h.mul = st.mul;
    const ink = h.mesh.userData.ink as { w: number; color: number };
    // Bề dày tính theo mét thế giới: chia cho tỉ lệ thế giới thật của đỉnh để ra đơn vị cục bộ (tính lại mỗi khung ở `sync`, khi xương đã cập nhật).
    const sc = skinnedWorldScale(h.src);
    ink.w = (inkWidthOf(st.mul, h.rad * sc) * INK_TUNE.width) / sc;
    ink.color = st.color;
  }

  private wants = new Map<THREE.Object3D, { prio: number; state: InkState }>();

  /**
   * Xin viền cho `root` ở khung này với điểm ưu tiên `prio` (NHỎ hơn = cần hơn: mình âm, mục tiêu âm, còn lại là bình phương khoảng cách tới mình).
   * `sync()` chia `INK_HULL_MAX` suất cho các thể xin có điểm nhỏ nhất, nhả viền của thể không còn trong nhóm đó (kể cả thể không xin nữa).
   */
  want(root: THREE.Object3D, prio: number, state: InkState = 'normal'): void {
    this.wants.set(root, { prio: this.hulls.has(root) && prio > 0 ? prio * INK_KEEP_BIAS : prio, state });
  }

  private resolveWants(): void {
    const ranked = [...this.wants.entries()].sort((a, b) => a[1].prio - b[1].prio).slice(0, INK_HULL_MAX);
    const keep = new Set(ranked.map((r) => r[0]));
    for (const root of [...this.hulls.keys()]) if (!keep.has(root)) this.release(root);
    for (const [root, w] of ranked) if (this.attach(root)) this.style(root, w.state);
    this.wants.clear();
  }

  /** Đồng bộ hiện/ẩn với lưới gốc (LOD, chết, chui đất). Gọi mỗi khung. */
  sync(): void {
    if (this.wants.size) this.resolveWants();
    for (const [root, h] of this.hulls) {
      // Thể đã bị gỡ khỏi cảnh (quái bị dọn, mô hình tạm bị thay bằng skin): trả chỗ, nếu không trần `INK_HULL_MAX` đầy dần và thể mới không được viền.
      if (!root.parent) {
        this.release(root);
        continue;
      }
      h.mesh.visible = this.enabled && h.src.parent !== null && h.bodies.some((b) => b.visible);
      if (h.mesh.visible) {
        const sc = skinnedWorldScale(h.src);
        (h.mesh.userData.ink as { w: number }).w = (inkWidthOf(h.mul, h.rad * sc) * INK_TUNE.width) / sc;
      }
    }
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
