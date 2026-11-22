import * as THREE from 'three/webgpu';
import { ISO_ARRIVE, ISO_DIST, nearestTo, rayGround } from './iso';

/**
 * Trạng thái runtime của camera chéo (`?cam=iso`): con trỏ, đích đi chuột phải, vòng ngắm trên đất.
 * Chỉ ý định; vị trí cuối do server quyết định (đích chỉ đổi thành mx/mz như WASD).
 */
export class IsoRig {
  distCur: number = ISO_DIST;
  /** Con trỏ (px màn hình); null khi chưa rê chuột vào canvas. */
  cursor: { x: number; y: number } | null = null;
  /** Điểm con trỏ chiếu xuống đất. */
  ground: { x: number; y: number; z: number } | null = null;
  /** Đích đi tới (chuột phải). */
  dest: { x: number; z: number } | null = null;
  lead = { x: 0, z: 0 };
  /** Điểm camera nhìn vào khung này (người + dẫn trước): tâm bản đồ bóng đặt ở đây. */
  readonly look = new THREE.Vector3();
  /** `camera.far` gốc, lưu lần đầu vào iso để trả lại khi cảnh điện ảnh/độ kiếp dùng camera cũ. */
  baseFar = 0;
  /** Cảnh xa (biển mây, trời, núi nền) đang bị ẩn do iso; khôi phục khi iso tạm tắt. */
  farHidden = false;
  /** Đã áp cấu hình dựng hình iso (ô địa hình, bóng) hay chưa. */
  applied = false;
  /** Biển mây có hiện trước khi iso ẩn không (theo cờ của level). */
  cloudWas = true;
  readonly ring: THREE.Mesh;
  readonly destMark: THREE.Mesh;
  private readonly o = { x: 0, y: 0, z: 0 };
  private readonly d = { x: 0, y: 0, z: 0 };
  private readonly v = new THREE.Vector3();

  constructor() {
    const mk = (r0: number, r1: number, color: number, op: number) => {
      const m = new THREE.Mesh(
        new THREE.RingGeometry(r0, r1, 40).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: op, depthWrite: false, depthTest: false, toneMapped: false }),
      );
      m.renderOrder = 999;
      m.visible = false;
      m.frustumCulled = false;
      return m;
    };
    this.ring = mk(0.7, 0.85, 0xfff2b8, 0.85);
    this.destMark = mk(0.25, 0.4, 0x8fe3ff, 0.8);
  }

  /** Chiếu con trỏ xuống mặt đất theo camera hiện tại (gọi sau khi camera đã cập nhật ma trận). */
  project(camera: THREE.PerspectiveCamera, w: number, h: number, ground: (x: number, z: number) => number): void {
    if (!this.cursor) {
      this.ground = null;
      return;
    }
    camera.updateMatrixWorld();
    this.v.set((this.cursor.x / w) * 2 - 1, -(this.cursor.y / h) * 2 + 1, 0.5).unproject(camera);
    const p = camera.position;
    this.o.x = p.x;
    this.o.y = p.y;
    this.o.z = p.z;
    this.d.x = this.v.x - p.x;
    this.d.y = this.v.y - p.y;
    this.d.z = this.v.z - p.z;
    this.ground = rayGround(this.o, this.d, ground);
  }

  /** Điểm ngắm gửi kèm ý định (chiêu, né); rỗng khi con trỏ không chạm đất. Server kiểm và kẹp lại. */
  aimMsg(): { ax: number; az: number } | Record<string, never> {
    return this.ground ? { ax: this.ground.x, az: this.ground.z } : {};
  }

  /** Quái sống gần con trỏ nhất (id rỗng nếu không có hoặc con trỏ ngoài đất). */
  pickMonster(cands: Iterable<{ id: string; x: number; z: number }>): string {
    return this.ground ? nearestTo(this.ground.x, this.ground.z, cands) : '';
  }

  /** Cập nhật hiển thị vòng ngắm + dấu đích. */
  updateVisuals(destFlash: number): void {
    const g = this.ground;
    this.ring.visible = !!g;
    if (g) this.ring.position.set(g.x, g.y + 0.08, g.z);
    this.destMark.visible = !!this.dest;
    if (this.dest && g) {
      const s = 1 + 0.15 * Math.sin(destFlash * 8);
      this.destMark.scale.setScalar(s);
    }
  }

  setDest(x: number, z: number, groundY: number): void {
    this.dest = { x, z };
    this.destMark.position.set(x, groundY + 0.08, z);
  }

  /** Đã tới đích chưa (kèm xóa). */
  arrived(px: number, pz: number): boolean {
    if (!this.dest) return false;
    if (Math.hypot(this.dest.x - px, this.dest.z - pz) < ISO_ARRIVE) {
      this.dest = null;
      return true;
    }
    return false;
  }

  dispose(): void {
    for (const m of [this.ring, this.destMark]) {
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    }
  }
}
