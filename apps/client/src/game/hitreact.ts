import * as THREE from 'three/webgpu';
import { HIT_FEEL_HUMAN, type HitFeel } from '@dtl/shared';
import { HIT_STOP_CAP, hitStopOf } from './hitjuice';

/**
 * Phản ứng trúng đòn phía client (chỉ trình bày, không đổi kết quả hay vị trí logic):
 * - hit-stop riêng từng thực thể: animation khựng lại, các thực thể khác vẫn chạy;
 * - chớp sáng: tạm thay material của các mesh bằng material dùng chung;
 * - giật lùi: độ lệch hiển thị theo hướng nguồn → đích, tắt dần về 0;
 * - rung thân: dao động nhỏ trong khung cục bộ của model.
 */

/** Trần khựng (K-7): 90 ms. Bảng theo cấp đòn nằm ở `hitjuice.ts` (`hitStopOf`). */
export const HIT_STOP_MAX = HIT_STOP_CAP;

// Chớp trúng đòn là màu phẳng không đổ bóng: trắng tinh thì che mất hình nhân vật (art bible mục 5, 8), nên dùng màu kem/vàng dịu
// (≈ 60% độ sáng, hậu kỳ nâng lên cream) và chớp ngắn (`FLASH_MAX`); vẫn đủ rõ để đọc đòn mà còn thấy dáng người.
const FLASH_MAT = new THREE.MeshBasicMaterial({ color: 0x9c8f76 });
const FLASH_MAT_CRIT = new THREE.MeshBasicMaterial({ color: 0xd2a850 });
/** Chớp tối đa bao lâu (giây), kể cả khi khựng lâu hơn. */
const FLASH_MAX = 0.05;

/** Thời gian giật lùi đạt đỉnh, rồi tắt dần theo hàm mũ. */
const KNOCK_RISE = 0.05;
const KNOCK_DECAY = 9;
const KNOCK_LIFE = 0.6;

export interface HitOpts {
  crit?: boolean;
  /** Đòn nặng (cờ `hv` từ server): khựng lâu hơn, giật lùi và rung mạnh hơn. */
  heavy?: boolean;
  /** Hướng giật lùi trong hệ thế giới (không cần chuẩn hóa). Bỏ trống = không giật lùi. */
  dirX?: number;
  dirZ?: number;
  /** Hệ số giật lùi thêm (ngoài `feel` theo hạng thân). */
  mass?: number;
  /** Trễ trước khi phản ứng (giây), để khớp lúc đạn bay tới. */
  delay?: number;
  /** Khựng (giây, trước hệ số hạng thân) theo bảng K-7; bỏ trống = suy từ `crit`/`heavy`. */
  stop?: number;
  /** Bỏ khựng (vẫn chớp/giật lùi/rung), dùng cho đòn không liên quan tới mình. */
  noStop?: boolean;
  /** Bỏ chớp trắng (cảnh boss: camera sát thân nên chớp che hết hình); vẫn giật lùi/rung. */
  noFlash?: boolean;
}

export class HitReact {
  /** Độ lệch giật lùi hiện tại (hệ thế giới, mét). */
  kx = 0;
  kz = 0;
  /** Độ rung hiện tại (hệ cục bộ của model). */
  shake = 0;
  /** Tham số theo hạng thân (P2-E1): quái nhỏ giật nhiều, boss gần như đứng vững. Chủ model gán khi dựng. */
  feel: HitFeel = HIT_FEEL_HUMAN;
  private stopT = 0;
  private flashT = 0;
  private knockT = KNOCK_LIFE;
  private knockAmp = 0;
  private dirX = 0;
  private dirZ = 0;
  private shakeT = 0;
  private shakeAmp = 0;
  private crit = false;
  // Hai chỗ chờ riêng: đòn nhận vào (react) và khựng của người ra đòn (hitStop), để cái này
  // không đè cái kia. Mỗi chỗ giữ hạn sớm nhất; đòn mới trong lúc chờ chỉ nâng cấp nội dung,
  // không lùi hạn, nên đòn dồn dập vẫn nổ đúng lúc đạn đầu tiên chạm.
  private pendHitT = -1;
  private pendHit: HitOpts = {};
  private pendHitStop = 0;
  private pendStopT = -1;
  private pendStopDur = 0;
  private flashing = false;
  private orig: THREE.Material[] = [];

  /** `meshes`: các mesh sẽ chớp sáng. */
  constructor(private meshes: THREE.Mesh[] = []) {}

  get stopped(): boolean {
    return this.stopT > 0;
  }

  /** Bị trúng đòn: khựng + chớp + giật lùi + rung. */
  react(o: HitOpts): void {
    const base = o.stop ?? hitStopOf({ crit: !!o.crit, heavy: !!o.heavy, combo3: false, power: 0, ult: false, victimIsMe: false, byMe: false }).target;
    const stop = base * this.feel.stop;
    if (o.delay && o.delay > 0) {
      if (this.pendHitT < 0) {
        this.pendHitT = o.delay;
        this.pendHit = o;
        this.pendHitStop = stop;
      } else {
        this.pendHitT = Math.min(this.pendHitT, o.delay);
        if (stop >= this.pendHitStop) {
          // Giữ khựng nếu một trong các đòn đang chờ có liên quan tới mình.
          this.pendHit = { ...o, noStop: !!o.noStop && !!this.pendHit.noStop };
          this.pendHitStop = stop;
        }
      }
      return;
    }
    this.start(o, stop);
  }

  /** Chỉ khựng (người ra đòn). */
  hitStop(dur: number, delay = 0): void {
    if (delay > 0) {
      if (this.pendStopT < 0) {
        this.pendStopT = delay;
        this.pendStopDur = dur;
      } else {
        this.pendStopT = Math.min(this.pendStopT, delay);
        this.pendStopDur = Math.max(this.pendStopDur, dur);
      }
      return;
    }
    this.stopT = Math.min(HIT_STOP_MAX, Math.max(this.stopT, dur));
  }

  private start(o: HitOpts, stop: number): void {
    // Đang chớp đòn thường mà dính chí mạng thì đổi sang màu chí mạng ngay.
    if (o.crit && !this.crit && this.flashing) for (const m of this.meshes) m.material = FLASH_MAT_CRIT;
    this.crit = !!o.crit || (this.crit && this.flashing);
    if (!o.noStop) this.stopT = Math.min(HIT_STOP_MAX, Math.max(this.stopT, stop));
    if (!o.noFlash) this.flashT = Math.max(this.flashT, FLASH_MAX);
    this.shakeT = stop + 0.1;
    const f = this.feel;
    this.shakeAmp = ((o.crit ? 0.09 : 0.05) + (o.heavy ? f.heavyShake : 0)) * f.shake;
    const len = Math.hypot(o.dirX ?? 0, o.dirZ ?? 0);
    if (len > 1e-4) {
      this.dirX = (o.dirX ?? 0) / len;
      this.dirZ = (o.dirZ ?? 0) / len;
      this.knockAmp = (o.crit ? 0.42 : 0.22) * (o.heavy ? f.heavyKnock : 1) * f.knock * Math.max(0.15, Math.min(1, o.mass ?? 1));
      this.knockT = 0;
    }
  }

  /**
   * Gọi mỗi khung với dt thật. Trả về dt dùng cho animation (0 khi đang khựng).
   */
  update(dt: number): number {
    if (this.pendHitT >= 0) {
      this.pendHitT -= dt;
      if (this.pendHitT < 0) {
        this.start(this.pendHit, this.pendHitStop);
        this.pendHit = {};
      }
    }
    if (this.pendStopT >= 0) {
      this.pendStopT -= dt;
      if (this.pendStopT < 0) this.hitStop(this.pendStopDur);
    }

    let animDt = dt;
    if (this.stopT > 0) {
      const used = Math.min(this.stopT, dt);
      this.stopT -= used;
      animDt = dt - used;
    }

    if (this.flashT > 0) this.flashT -= dt;
    this.setFlash(this.flashT > 0);

    if (this.knockT < KNOCK_LIFE) {
      this.knockT += dt;
      const t = this.knockT;
      const f = t < KNOCK_RISE ? t / KNOCK_RISE : Math.exp(-(t - KNOCK_RISE) * KNOCK_DECAY);
      const a = t >= KNOCK_LIFE ? 0 : this.knockAmp * f;
      this.kx = this.dirX * a;
      this.kz = this.dirZ * a;
    }

    if (this.shakeT > 0) {
      this.shakeT = Math.max(0, this.shakeT - dt);
      // Dao động tần số cao, biên độ giảm dần; dùng thời gian còn lại nên không cần đồng hồ riêng.
      this.shake = Math.sin(this.shakeT * 95) * this.shakeAmp * Math.min(1, this.shakeT * 8);
    } else this.shake = 0;

    return animDt;
  }

  private setFlash(on: boolean): void {
    if (on === this.flashing) return;
    this.flashing = on;
    if (on) {
      const fm = this.crit ? FLASH_MAT_CRIT : FLASH_MAT;
      for (let i = 0; i < this.meshes.length; i++) {
        this.orig[i] = this.meshes[i].material as THREE.Material;
        this.meshes[i].material = fm;
      }
    } else {
      for (let i = 0; i < this.meshes.length; i++) this.meshes[i].material = this.orig[i];
    }
  }

  /** Trả material gốc (gọi trước khi bỏ model). */
  reset(): void {
    this.setFlash(false);
    this.stopT = this.flashT = this.shakeT = 0;
    this.pendHitT = this.pendStopT = -1;
    this.knockT = KNOCK_LIFE;
    this.kx = this.kz = this.shake = 0;
  }
}
