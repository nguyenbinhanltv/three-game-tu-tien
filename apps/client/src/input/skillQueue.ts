/**
 * Hàng đợi chiêu phía client (M1-11). Bấm chiêu khi còn ít hơn `QUEUE_WINDOW_MS` nữa mới dùng lại
 * được (GCD hoặc hồi chiêu riêng) thì client giữ ý định, gửi lên khi hết chờ. Server không đổi: vẫn
 * chỉ nhận "dùng skill X lên Y" và tự kiểm GCD/hồi chiêu như cũ; hàng đợi chỉ dời thời điểm gửi.
 *
 * Vì sao phải gửi lại: server kiểm bằng `this.now` chỉ cập nhật mỗi tick (50 ms), GCD nới 60 ms còn
 * hồi chiêu riêng không nới, và server bỏ qua im lặng khi chưa hết GCD. Một lần gửi đúng mốc vẫn có
 * thể bị bỏ, nên chiêu ở lại trong hàng tới khi thấy server xác nhận (mốc dùng lại nhảy lên sau lần
 * gửi, tức `S.CD` mới), chưa thấy thì gửi lại sau `RESEND_MS`, tối đa `MAX_SENDS` lần.
 *
 * Đơn vị thời gian là ms theo đồng hồ của `readyAt` (engine dùng `Date.now()` vì `cds`/`gcdAt`
 * trong store đã quy về đồng hồ client, trễ hơn đồng hồ server khoảng một chiều mạng).
 */

/** Cửa sổ cuối thời gian chờ mà cú bấm được giữ lại. */
export const QUEUE_WINDOW_MS = 400;
/** Một tick server. Chiêu bị chặn bởi hồi chiêu riêng (server không nới) thì chờ thêm chừng này. */
export const SERVER_TICK_MS = 50;
/**
 * Chưa thấy server xác nhận sau chừng này thì gửi lại (hơn một tick). Ping cao thì chờ lâu hơn
 * (`rttMs` + một tick) để lần gửi lại không tới sau khi server đã nhận, gây toast "đang hồi chiêu" sai.
 */
export const RESEND_MS = 60;
/** Số lần gửi tối đa cho một cú bấm (lần đầu + gửi lại); hết mà chưa được thì bỏ (hết linh lực, ngoài tầm…). */
export const MAX_SENDS = 3;
/** Quá lâu mà vẫn chưa xong (server kéo dài GCD, lệch đồng hồ) thì bỏ, tránh ra chiêu ngoài ý muốn. */
export const QUEUE_MAX_WAIT_MS = 1200;

export type PressResult = 'send' | 'queued';

export class SkillQueue {
  /** Ô chiêu đang chờ (kể cả đã gửi nhưng chưa thấy xác nhận), -1 nếu không có. */
  slot = -1;
  private since = 0;
  /** Lần gửi gần nhất (0 = chưa gửi). */
  private sentAt = 0;
  private sends = 0;

  /**
   * Người chơi bấm ô `slot`. 'send': gửi ngay như trước đây (đã hết chờ, hoặc còn chờ lâu thì để
   * server từ chối như cũ). 'queued': đã giữ lại (thay chiêu đang chờ nếu có).
   */
  press(slot: number, now: number, readyAt: number): PressResult {
    const left = readyAt - now;
    if (left <= 0) {
      this.clear();
      return 'send';
    }
    if (left <= QUEUE_WINDOW_MS) {
      this.slot = slot;
      this.since = now;
      this.sentAt = 0;
      this.sends = 0;
      return 'queued';
    }
    return 'send';
  }

  /**
   * Gọi mỗi khung. Trả ô chiêu cần gửi ngay, hoặc -1. Ô vẫn nằm trong hàng sau khi gửi cho tới khi
   * được xác nhận, hết lượt gửi lại, hoặc quá `QUEUE_MAX_WAIT_MS`.
   * @param readyAt mốc dùng lại hiện tại của chính ô đang chờ.
   * @param cdGated mốc đó do hồi chiêu riêng quyết định (không phải GCD).
   * @param rttMs ping ước tính (ms), 0 nếu chưa biết.
   */
  poll(now: number, readyAt: number, cdGated: boolean, rttMs = 0): number {
    if (this.slot < 0) return -1;
    // Đã gửi và mốc dùng lại nhảy qua lần gửi: server đã nhận chiêu (đặt lại GCD/hồi chiêu).
    if (this.sentAt > 0 && readyAt > this.sentAt) {
      this.clear();
      return -1;
    }
    if (now - this.since > QUEUE_MAX_WAIT_MS) {
      this.clear();
      return -1;
    }
    if (now < readyAt + (cdGated ? SERVER_TICK_MS : 0)) return -1;
    if (this.sentAt > 0 && now - this.sentAt < Math.max(RESEND_MS, rttMs + SERVER_TICK_MS)) return -1;
    if (this.sends >= MAX_SENDS) {
      this.clear();
      return -1;
    }
    this.sends++;
    this.sentAt = now;
    return this.slot;
  }

  /** Hủy chiêu đang chờ; trả true nếu thật sự có chiêu bị hủy. */
  cancel(): boolean {
    const had = this.slot >= 0;
    this.clear();
    return had;
  }

  private clear(): void {
    this.slot = -1;
    this.sentAt = 0;
    this.sends = 0;
  }
}
