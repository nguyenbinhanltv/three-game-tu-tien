// Tia điện nhẹ dọc kiếm của Lôi tu (nợ hướng tu phần 2): kiếm cầm tay lẫn đeo lưng đều có hồ quang mảnh chạy dọc lưỡi, không rối mắt.
// MỘT lưới (hai dải chéo nhau để nhìn được từ mọi góc) con của mesh kiếm nên bám theo kiếm cả ở tay, ở vỏ lưng và khi đỗ rig LOD1;
// dạng tia đổi ~12 lần/giây theo `arcFrame` (tất định, có khung ẩn), tím điện đậm pha trộn thường + bloom chọn lọc. Thêm +1 draw call mỗi Lôi tu ở LOD0.
import * as THREE from 'three/webgpu';
import { markBloom } from '../../render/post';
import { ARC_HZ, ARC_POINTS, arcFrame } from '../entities/loiBlade';

/** Gốc tia tính từ chuôi, theo tỉ lệ chiều dài kiếm (bỏ phần chuôi). */
const START = 0.18;
/** Nửa bề rộng dải tia (m). */
const HALF_W = 0.02;

export class SwordArc {
  readonly mesh: THREE.Mesh;
  private pos: THREE.BufferAttribute;
  private mat: THREE.MeshBasicMaterial;
  private frameNo = -1;
  private time = Math.random() * 9;
  private seed = Math.floor(Math.random() * 97);
  private len = 0.9;

  constructor() {
    const g = new THREE.BufferGeometry();
    this.pos = new THREE.BufferAttribute(new Float32Array(ARC_POINTS * 4 * 3), 3);
    g.setAttribute('position', this.pos);
    const idx: number[] = [];
    for (let s = 0; s < 2; s++)
      for (let i = 0; i < ARC_POINTS - 1; i++) {
        const a = s * ARC_POINTS * 2 + i * 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    g.setIndex(idx);
    this.mat = new THREE.MeshBasicMaterial({
      // Pha trộn thường (không cộng sáng): lưỡi kiếm và nền đá đều trắng nên tia cộng sáng sẽ biến mất; tím điện đậm đọc được trên nền sáng.
      color: 0x3a7bff,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
    });
    markBloom(this.mat, 1.8);
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
  }

  /** Gắn vào mesh kiếm hiện tại (mũi +Y, chuôi ở gốc) với chiều dài `len`; gọi lại khi đổi kiếm. */
  attach(blade: THREE.Object3D, len: number): void {
    this.len = len > 0 ? len : 0.9;
    this.frameNo = -1;
    blade.add(this.mesh);
  }

  detach(): void {
    this.mesh.removeFromParent();
  }

  /** Bật/tắt hiển thị (tắt ở LOD xa); khi tắt không tốn cập nhật. */
  setVisible(on: boolean): void {
    this.mesh.visible = on;
  }

  update(dt: number): void {
    if (!this.mesh.visible) return;
    this.time += dt;
    const f = Math.floor(this.time * ARC_HZ);
    if (f === this.frameNo) return;
    this.frameNo = f;
    const fr = arcFrame(f, this.seed);
    // Khung ẩn: thu nhỏ về 0 (không đổi cờ visible để khỏi đụng LOD).
    this.mesh.scale.setScalar(fr.vis ? 1 : 0);
    if (!fr.vis) return;
    const a = this.pos.array as Float32Array;
    for (let i = 0; i < ARC_POINTS; i++) {
      const y = this.len * (START + ((1 - START) * i) / (ARC_POINTS - 1));
      // dải A: tâm lệch theo X, rộng theo Z; dải B: tâm lệch theo Z, rộng theo X
      a.set([fr.x[i]!, y, -HALF_W, fr.x[i]!, y, HALF_W], i * 6);
      a.set([-HALF_W, y, fr.y[i]!, HALF_W, y, fr.y[i]!], (ARC_POINTS + i) * 6);
    }
    this.pos.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    this.mat.dispose();
  }
}
