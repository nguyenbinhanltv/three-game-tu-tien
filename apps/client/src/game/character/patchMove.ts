// Thân Pháp: clip anymove CC0 của Patch (`anim_patch_move`, xem tools/asset-pipeline/src/patch-clips.ts) nối vào locomotion v3.
// Hàm thuần (không đụng three) để test trong Node. Clip chuyển trạng thái dài 2–2,5 s với chuyển động gốc đã bỏ (vị trí do server quyết), nên phát NHANH
// (tốc độ phát > 1) cho vừa nhịp tăng/giảm tốc của game rồi trả về vòng chạy UAL; vòng `PM_Run`/`PM_Sprint` được nhập sẵn nhưng chưa thay vòng UAL
// (cần hiệu chỉnh pha bước chân; xem docs/handbook/vfx-animation.md).

/** Thư viện clip và các clip dùng. */
export const PATCH_LIB = 'anim_patch_move';

export type PatchClip =
  'PM_Idle_To_Walk' | 'PM_Idle_To_Run' | 'PM_Idle_To_Sprint' | 'PM_Walk_To_Idle' | 'PM_Run_To_Idle' | 'PM_Sprint_To_Idle' | 'PM_Idle_Tired';

/** Độ dài (giây) của từng clip ở tốc độ 1× (đo từ file nhập). */
export const PATCH_DUR: Readonly<Record<PatchClip, number>> = {
  PM_Idle_To_Walk: 1.8,
  PM_Idle_To_Run: 2.33,
  PM_Idle_To_Sprint: 2.1,
  PM_Walk_To_Idle: 1.83,
  PM_Run_To_Idle: 2.23,
  PM_Sprint_To_Idle: 2.53,
  PM_Idle_Tired: 2.67,
};

/** Tốc độ (m/s) từ đó coi là chạy / chạy nhanh. */
export const RUN_SPEED = 2.5;
export const SPRINT_SPEED = 6.5;
/** Chạy liên tục ≥ chừng này giây rồi dừng thì thở dốc (idle mệt). */
export const TIRED_AFTER = 8;
/** Thời gian (giây) mong muốn của clip chuyển trạng thái khi phát nhanh: bắt đầu ngắn, dừng dài hơn một chút. */
export const START_SEC = 0.85;
export const STOP_SEC = 1.0;
/** Thời gian chờ sau khi vượt ngưỡng bắt đầu để biết tốc độ đích (giây). */
export const START_PROBE = 0.12;

export type PatchEventKind = 'start' | 'stop' | 'tired';
export interface PatchEvent {
  kind: PatchEventKind;
  clip: PatchClip;
  /** Tốc độ phát (clip dài / thời gian mong muốn). */
  rate: number;
}

/** Tốc độ phát để clip `clip` kéo dài đúng `sec` giây. */
export function rateFor(clip: PatchClip, sec: number): number {
  return PATCH_DUR[clip] / Math.max(0.2, sec);
}

/** Chọn clip bắt đầu theo tốc độ đạt được sau `START_PROBE`. */
export function startClipOf(speed: number): PatchClip {
  return speed >= SPRINT_SPEED ? 'PM_Idle_To_Sprint' : speed >= RUN_SPEED ? 'PM_Idle_To_Run' : 'PM_Idle_To_Walk';
}

/** Chọn clip dừng theo tốc độ đỉnh vừa chạy. */
export function stopClipOf(peak: number): PatchClip {
  return peak >= SPRINT_SPEED ? 'PM_Sprint_To_Idle' : peak >= RUN_SPEED ? 'PM_Run_To_Idle' : 'PM_Walk_To_Idle';
}

/**
 * Máy trạng thái: nhận tốc độ mỗi khung, trả sự kiện cần phát clip (hoặc null).
 * - bắt đầu: vọt qua 0,8 m/s từ đứng yên; chờ `START_PROBE` giây để biết tốc độ rồi chọn đi/chạy/chạy nhanh;
 * - dừng: rớt dưới 0,6 m/s từ đỉnh ≥ 1,5 m/s; chạy liên tục ≥ `TIRED_AFTER` s thì kèm sự kiện thở dốc sau clip dừng (`tiredAfter` giây).
 * `busy` = đang có đòn/động tác khác (không phát gì, xóa trạng thái chờ).
 */
export class PatchMove {
  private prev = 0;
  private peak = 0;
  private runT = 0;
  private probe = -1;
  /** Còn thở dốc cần phát sau clip dừng: thời điểm (giây, đồng hồ nội bộ) và clip. */
  private tiredAt = -1;
  private clock = 0;

  update(dt: number, speed: number, busy = false): PatchEvent | null {
    if (dt <= 0) return null;
    this.clock += dt;
    let ev: PatchEvent | null = null;
    if (busy) {
      this.probe = -1;
      this.tiredAt = -1;
    }
    this.peak = speed > this.peak ? speed : this.peak - dt * 2;
    if (speed >= RUN_SPEED) this.runT += dt;
    else if (speed < 1.2) this.runT = Math.max(0, this.runT - dt * 3);
    if (!busy) {
      if (this.prev < 0.3 && speed >= 0.8) {
        this.probe = START_PROBE;
        this.tiredAt = -1;
      } else if (this.prev >= 0.6 && speed < 0.6 && this.peak >= 1.5) {
        const clip = stopClipOf(this.peak);
        const rate = rateFor(clip, STOP_SEC);
        ev = { kind: 'stop', clip, rate };
        this.probe = -1;
        if (this.runT >= TIRED_AFTER) this.tiredAt = this.clock + STOP_SEC;
        this.runT = 0;
        this.peak = 0;
      } else if (this.probe >= 0) {
        this.probe -= dt;
        if (this.probe < 0) {
          if (speed >= 0.8) {
            const clip = startClipOf(speed);
            ev = { kind: 'start', clip, rate: rateFor(clip, START_SEC) };
          }
          this.probe = -1;
        }
      } else if (this.tiredAt >= 0 && speed < 0.3 && this.clock >= this.tiredAt) {
        ev = { kind: 'tired', clip: 'PM_Idle_Tired', rate: 1 };
        this.tiredAt = -1;
      }
      if (speed >= 0.8) this.tiredAt = -1;
    }
    this.prev = speed;
    return ev;
  }

  reset(): void {
    this.prev = this.peak = this.runT = 0;
    this.probe = this.tiredAt = -1;
  }

  /** Chạy liên tục (giây) tới giờ, để test/đo. */
  get running(): number {
    return this.runT;
  }
}
