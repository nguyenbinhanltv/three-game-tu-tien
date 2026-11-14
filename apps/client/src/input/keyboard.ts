import { isAlt, OPPOSITE_KEY, STICKY_MODS } from './bindings';

export type KeyEventKind = 'down' | 'up' | 'clear';

/** Một dòng trong nhật ký phím của bảng gỡ lỗi. `code` là mã phím, hoặc lý do khi `kind` là 'clear'. */
export interface KeyLogEntry {
  id: number;
  at: number;
  kind: KeyEventKind;
  code: string;
}

export const KEY_LOG_SIZE = 8;

/**
 * Tập phím đang giữ, kèm các luật chống kẹt phím:
 * - Sự kiện thả phím hay mất khi giữ Cmd/Ctrl hoặc chuyển cửa sổ, nên xóa sạch tập phím ở những lúc đó.
 *   Không tính Shift (hạ độ cao khi bay).
 * - Alt là phím chơi (thả/khóa con trỏ): chạm Alt không xóa phím; chỉ xóa khi thả Alt sau một tổ hợp
 *   Alt+phím khác, lúc phím kia có thể đã mất sự kiện thả. Alt+Tab ra cửa sổ khác đã có blur lo.
 * - Nhấn một hướng thì bỏ hướng ngược lại (phòng phím kia đã mất sự kiện thả). Đánh đổi có chủ ý:
 *   giữ W, chạm S rồi thả thì nhân vật dừng, phải nhấn lại W. Không khôi phục W khi thả S, vì nếu W
 *   chính là phím đã mất keyup thì khôi phục sẽ làm kẹt lại.
 *
 * Không đụng tới DOM để test được; engine gắn sự kiện window/document vào các hàm dưới.
 */
export class KeyState {
  readonly held = new Set<string>();
  /** Tối đa `KEY_LOG_SIZE` sự kiện gần nhất, cũ trước mới sau. */
  readonly log: KeyLogEntry[] = [];
  private altChord = false;
  private nextId = 1;

  constructor(private readonly clock: () => number = () => performance.now()) {}

  has(code: string): boolean {
    return this.held.has(code);
  }

  /** Gọi cho mọi keydown, kể cả khi đang gõ chat (để luật Ctrl/Alt luôn chạy). */
  onDown(code: string, altKey: boolean, repeat: boolean): void {
    if (!repeat) this.record('down', code);
    if (STICKY_MODS.has(code)) this.clear('mod');
    else if (isAlt(code)) {
      if (!repeat) this.altChord = false;
    } else if (altKey && code !== 'ShiftLeft' && code !== 'ShiftRight') this.altChord = true;
  }

  /** Ghi nhận phím vào tập đang giữ (engine gọi khi phím thuộc về game, không phải lặp). */
  press(code: string): void {
    const opp = OPPOSITE_KEY[code];
    if (opp) this.held.delete(opp);
    this.held.add(code);
  }

  onUp(code: string): void {
    this.record('up', code);
    if (STICKY_MODS.has(code)) this.clear('mod');
    else {
      if (isAlt(code)) {
        if (this.altChord) this.clear('alt');
        this.altChord = false;
      }
      this.held.delete(code);
    }
  }

  clear(reason: string): void {
    this.held.clear();
    this.record('clear', reason);
  }

  private record(kind: KeyEventKind, code: string): void {
    this.log.push({ id: this.nextId++, at: this.clock(), kind, code });
    if (this.log.length > KEY_LOG_SIZE) this.log.splice(0, this.log.length - KEY_LOG_SIZE);
  }
}
