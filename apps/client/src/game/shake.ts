import * as THREE from 'three/webgpu';

/**
 * Rung camera. Mức rung là một biến duy nhất: mỗi sự kiện đặt `level = max(level, mức)`
 * rồi giảm tuyến tính DECAY đơn vị/giây, nên nhiều sự kiện dồn dập không cộng thành động đất.
 * Chỉ gọi `kick` cho sự kiện liên quan tới chính mình.
 */
export const SHAKE = {
  /** Mình đánh chí mạng. */
  crit: 0.3,
  /** Mình trúng đòn nặng (cờ `hv`). */
  heavy: 0.5,
  /** Sấm độ kiếp của mình đánh xuống. */
  thunder: 0.8,
  /** Boss đập đất gần mình. */
  slam: 1.1,
} as const;

const DECAY = 2.2;
/** Mét dịch chuyển ứng với mức 1. Nhỏ để không chóng mặt. */
const AMP = 0.22;

export class CameraShake {
  enabled = localStorage.getItem('dtl.camShake') !== '0';
  level = 0;
  private t = 0;

  kick(level: number): void {
    if (this.enabled && level > this.level) this.level = level;
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    if (!on) this.level = 0;
    localStorage.setItem('dtl.camShake', on ? '1' : '0');
  }

  /** Cập nhật và ghi độ lệch cho vị trí camera (`pos`) và điểm nhìn (`look`). */
  update(dt: number, pos: THREE.Vector3, look: THREE.Vector3): void {
    this.t += dt;
    this.level = Math.max(0, this.level - DECAY * dt);
    if (this.level <= 0) {
      pos.set(0, 0, 0);
      look.set(0, 0, 0);
      return;
    }
    const a = this.level * AMP;
    const t = this.t;
    // Tổng vài sóng sin lệch pha: rung gắt nhưng không lặp đều như một sóng.
    pos.set(Math.sin(t * 47) + Math.sin(t * 29.3) * 0.5, Math.sin(t * 53.1) + Math.sin(t * 31.7) * 0.5, Math.sin(t * 41.9) * 0.6).multiplyScalar(a / 1.5);
    look.set(Math.sin(t * 37.3 + 1.7), Math.sin(t * 43.7 + 0.6), 0).multiplyScalar(a * 0.5);
  }
}
