import * as THREE from 'three/webgpu';
import { SHAKE_DIR_SHARE, SHAKE_LEVEL } from './hitjuice';

/**
 * Rung camera. Mức rung là một biến duy nhất: mỗi sự kiện đặt `level = max(level, mức)`
 * rồi giảm tuyến tính DECAY đơn vị/giây, nên nhiều sự kiện dồn dập không cộng thành động đất.
 * Chỉ gọi `kick` cho sự kiện liên quan tới chính mình.
 */
export const SHAKE = {
  /** Đòn thứ ba của chuỗi đánh thường của mình trúng (K-7): chạm nhẹ. */
  combo3: SHAKE_LEVEL.combo3,
  /** Mình đánh chí mạng. */
  crit: SHAKE_LEVEL.crit,
  /** Chiêu tối thượng của mình trúng (K-7). */
  ult: SHAKE_LEVEL.ult,
  /** Mình trúng đòn nặng (cờ `hv`). */
  heavy: SHAKE_LEVEL.victimHeavy,
  /** Sấm độ kiếp của mình đánh xuống. */
  thunder: 0.8,
  /** Boss đập đất gần mình. */
  slam: 1.1,
} as const;

const DECAY = 2.2;
/** Mét dịch chuyển ứng với mức 1. Nhỏ để không chóng mặt. */
const AMP = 0.22;
/** Phần theo hướng đòn tắt nhanh gấp chừng này lần rung ngẫu nhiên. */
const DIR_DECAY = 3;

export class CameraShake {
  enabled = localStorage.getItem('dtl.camShake') !== '0';
  level = 0;
  private t = 0;
  /** Xung theo hướng đòn (hệ thế giới, đơn vị vector đã chuẩn hóa) và mức còn lại; tắt nhanh hơn rung ngẫu nhiên (khung đầu). */
  private dirX = 0;
  private dirZ = 0;
  private dirLevel = 0;

  /**
   * Rung mức `level` (lấy max, không cộng dồn). Có `dir` (nguồn → đích) thì 60% biên độ ở khung đầu đi theo hướng đòn.
   * Chỉ đòn thắng mức đang có mới đặt lại hướng, nên đòn dồn dập không xoay hướng loạn.
   */
  kick(level: number, dir?: { x: number; z: number }): void {
    if (!this.enabled || level <= this.level) return;
    this.level = level;
    const len = dir ? Math.hypot(dir.x, dir.z) : 0;
    if (dir && len > 1e-4) {
      this.dirX = dir.x / len;
      this.dirZ = dir.z / len;
      this.dirLevel = level;
    } else this.dirLevel = 0;
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    if (!on) this.level = this.dirLevel = 0;
    localStorage.setItem('dtl.camShake', on ? '1' : '0');
  }

  /** Cập nhật và ghi độ lệch cho vị trí camera (`pos`) và điểm nhìn (`look`). */
  update(dt: number, pos: THREE.Vector3, look: THREE.Vector3): void {
    this.t += dt;
    this.level = Math.max(0, this.level - DECAY * dt);
    this.dirLevel = Math.max(0, this.dirLevel - DECAY * DIR_DECAY * dt);
    if (this.level <= 0) {
      this.dirLevel = 0;
      pos.set(0, 0, 0);
      look.set(0, 0, 0);
      return;
    }
    // Phần theo hướng đòn (SHAKE_DIR_SHARE biên độ lúc đầu) giảm nhanh; phần ngẫu nhiên giữ lại (1 − phần hướng).
    const d = Math.min(this.level, this.dirLevel);
    const dirShare = this.level > 0 ? (SHAKE_DIR_SHARE * d) / this.level : 0;
    const a = this.level * AMP * (1 - dirShare);
    const t = this.t;
    // Tổng vài sóng sin lệch pha: rung gắt nhưng không lặp đều như một sóng.
    pos.set(Math.sin(t * 47) + Math.sin(t * 29.3) * 0.5, Math.sin(t * 53.1) + Math.sin(t * 31.7) * 0.5, Math.sin(t * 41.9) * 0.6).multiplyScalar(a / 1.5);
    look.set(Math.sin(t * 37.3 + 1.7), Math.sin(t * 43.7 + 0.6), 0).multiplyScalar(a * 0.5);
    if (dirShare > 0) {
      const push = this.level * AMP * dirShare;
      pos.x += this.dirX * push;
      pos.z += this.dirZ * push;
    }
  }
}
