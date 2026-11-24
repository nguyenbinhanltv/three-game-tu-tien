// Thân Pháp T4: nét kéo (smear) của lưỡi kiếm ở đòn nhanh. MỘT dải lưới (vài chục tam giác, +1 draw call, chỉ khi đang vung) nối vị trí gốc/mũi lưỡi của
// ~10 khung gần nhất, thon dần về phía khung cũ; chỉ hiện trong cửa sổ đường chém của pose `_tp` (xem `smearWindow`) rồi tan nhanh, để đúng nhịp với khung giữ
// ở đỉnh đòn và VFX. Mẫu lưu trong không gian cục bộ của `space` (root nhân vật) nên tịnh tiến theo người. Không có trạng thái khi không vung: không tốn CPU.
import * as THREE from 'three/webgpu';
import { markBloom } from '../../render/post';

/** Số mẫu tối đa của dải. */
export const SMEAR_N = 10;

/**
 * Cửa sổ bật nét kéo quanh khung trúng `hit` (giây trong pose): từ lúc bắt đầu đường chém (`hit − snap − lead`) tới hết khung giữ (`hit + tail`).
 * Hàm thuần để test.
 */
export function smearWindow(t: number, hit: number, snap = 0.034): boolean {
  return t >= hit - snap - 0.03 && t <= hit + 0.045;
}

/** Hệ số bề ngang của mẫu thứ `i` (0 = cũ nhất) trên `n` mẫu: thon tuyến tính về 0 ở mẫu cũ nhất. */
export function taperOf(i: number, n: number): number {
  return n <= 1 ? 1 : i / (n - 1);
}

const _m = new THREE.Vector3();

export class BladeSmear {
  readonly mesh: THREE.Mesh;
  private pos: THREE.BufferAttribute;
  private base: Float32Array = new Float32Array(SMEAR_N * 3);
  private tip: Float32Array = new Float32Array(SMEAR_N * 3);
  private n = 0;

  constructor(
    private readonly space: THREE.Object3D,
    color = 0xa8ecff,
  ) {
    const g = new THREE.BufferGeometry();
    this.pos = new THREE.BufferAttribute(new Float32Array(SMEAR_N * 2 * 3), 3);
    g.setAttribute('position', this.pos);
    const idx: number[] = [];
    for (let i = 0; i < SMEAR_N - 1; i++) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    g.setIndex(idx);
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.6,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
    });
    markBloom(mat, 1.2);
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    space.add(this.mesh);
  }

  /** Thêm một mẫu (gốc, mũi lưỡi, tọa độ thế giới) khi đang trong cửa sổ; `null` = hết cửa sổ: bỏ dần mẫu cũ. */
  push(b: THREE.Vector3 | null, t: THREE.Vector3 | null): void {
    if (b && t) {
      if (this.n === SMEAR_N) {
        this.base.copyWithin(0, 3);
        this.tip.copyWithin(0, 3);
        this.n--;
      }
      this.space.worldToLocal(_m.copy(b)).toArray(this.base, this.n * 3);
      this.space.worldToLocal(_m.copy(t)).toArray(this.tip, this.n * 3);
      this.n++;
    } else if (this.n > 0) {
      // tan nhanh: bỏ hai mẫu cũ mỗi khung
      const drop = Math.min(this.n, 2);
      this.base.copyWithin(0, drop * 3);
      this.tip.copyWithin(0, drop * 3);
      this.n -= drop;
    }
    this.mesh.visible = this.n >= 2;
    if (this.n < 2) return;
    const a = this.pos.array as Float32Array;
    for (let i = 0; i < SMEAR_N; i++) {
      const w = taperOf(Math.max(0, i - (SMEAR_N - this.n)), this.n);
      const j = Math.min(this.n - 1, Math.max(0, i - (SMEAR_N - this.n)));
      for (let c = 0; c < 3; c++) {
        const bb = this.base[j * 3 + c]!;
        const tt = this.tip[j * 3 + c]!;
        const mid = (bb + tt) * 0.5;
        a[i * 6 + c] = mid + (bb - mid) * w;
        a[i * 6 + 3 + c] = mid + (tt - mid) * w;
      }
    }
    this.pos.needsUpdate = true;
  }

  get active(): boolean {
    return this.n > 0;
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}
