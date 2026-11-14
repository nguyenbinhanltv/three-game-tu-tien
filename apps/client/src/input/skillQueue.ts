/**
 * Hàng đợi chiêu phía client (M1-11). Bấm chiêu khi còn ít hơn `QUEUE_WINDOW_MS` nữa mới dùng lại
 * được (GCD hoặc hồi chiêu riêng) thì client giữ ý định, gửi lên khi hết chờ. Server không đổi: vẫn
 * chỉ nhận "dùng skill X lên Y" và tự kiểm GCD như cũ; hàng đợi chỉ dời thời điểm gửi.
 *
 * Đơn vị thời gian là ms theo đồng hồ của `readyAt` (engine dùng `Date.now()` vì `cds`/`gcdAt`
 * trong store đã quy về đồng hồ client).
 */

/** Cửa sổ cuối thời gian chờ mà cú bấm được giữ lại. */
export const QUEUE_WINDOW_MS = 400;
/** Gửi sớm hơn mốc dùng lại một chút; server nhận sớm tới 60 ms, gói tin còn phải đi đường. */
export const SEND_LEAD_MS = 30;
/** Quá lâu mà vẫn chưa gửi được (server kéo dài GCD, lệch đồng hồ) thì bỏ, tránh ra chiêu ngoài ý muốn. */
export const QUEUE_MAX_WAIT_MS = 1200;

export type PressResult = 'send' | 'queued';

export class SkillQueue {
  /** Ô chiêu đang chờ, -1 nếu không có. */
  slot = -1;
  private since = 0;

  /**
   * Người chơi bấm ô `slot`. 'send': gửi ngay như trước đây (kể cả khi còn chờ lâu, để server từ
   * chối như cũ). 'queued': đã giữ lại (thay chiêu đang chờ nếu có).
   */
  press(slot: number, now: number, readyAt: number): PressResult {
    const left = readyAt - now;
    if (left <= SEND_LEAD_MS) {
      this.slot = -1;
      return 'send';
    }
    if (left <= QUEUE_WINDOW_MS) {
      this.slot = slot;
      this.since = now;
      return 'queued';
    }
    return 'send';
  }

  /**
   * Gọi mỗi khung. Trả ô chiêu cần gửi ngay (và xóa khỏi hàng), hoặc -1.
   * `readyAt` là mốc dùng lại của chính ô đang chờ.
   */
  poll(now: number, readyAt: number): number {
    if (this.slot < 0) return -1;
    if (now - this.since > QUEUE_MAX_WAIT_MS) {
      this.slot = -1;
      return -1;
    }
    if (now < readyAt - SEND_LEAD_MS) return -1;
    const s = this.slot;
    this.slot = -1;
    return s;
  }

  /** Hủy chiêu đang chờ; trả true nếu thật sự có chiêu bị hủy. */
  cancel(): boolean {
    const had = this.slot >= 0;
    this.slot = -1;
    return had;
  }
}
