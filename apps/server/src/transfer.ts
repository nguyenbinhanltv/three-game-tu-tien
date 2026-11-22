// Vé chuyển bản đồ (E1-B). Một nhân vật có tối đa một vé, dùng một lần, hết hạn sau TICKET_TTL_MS.
// Room đi cấp vé sau khi kiểm điều kiện; room đến kiểm vé trong `static onAuth` (xác thực nằm trước khi Colyseus giữ chỗ).
// Sống ở cấp tiến trình (một tiến trình Node chạy mọi room) như tổ đội và hồi chiêu Truyền Tống.

/** Vé hết hạn sau chừng này (ms) kể từ lúc cấp. */
export const TICKET_TTL_MS = 15_000;

export interface Ticket {
  /** Level đích. */
  to: string;
  /** Điểm xuất hiện ở level đích; null = vị trí đã lưu (đăng nhập lại, vào bí cảnh theo điểm của bí cảnh). */
  spawn: { x: number; z: number } | null;
  exp: number;
  /** Vé vào room độ kiếp (E1-F): khóa room (mỗi lần độ kiếp một room) và kiếp cần bắt đầu khi tới nơi (thiếu = hộ pháp, chỉ xem và chắn). */
  trib?: { key: string; id?: string; from?: { level: string; x: number; z: number } };
  /** Vé vào phó bản riêng (E2-C): khóa room của nhóm; room kiểm khớp với `options.dgKey` client gửi. */
  dg?: string;
}

export class TicketBook {
  private tickets = new Map<number, Ticket>();

  constructor(
    /** Đổi được để test. */
    public now: () => number = Date.now,
    private ttl = TICKET_TTL_MS,
  ) {}

  /** Cấp vé tới `to` (thay vé cũ nếu có). */
  issue(charId: number, to: string, spawn: { x: number; z: number } | null = null, trib?: Ticket['trib'], dg?: string): Ticket {
    const t: Ticket = { to, spawn: spawn ? { x: spawn.x, z: spawn.z } : null, exp: this.now() + this.ttl };
    if (trib) t.trib = { ...trib };
    if (dg) t.dg = dg;
    this.tickets.set(charId, t);
    return t;
  }

  /**
   * Dùng vé tới `to`: trả vé và xóa nó. Vé tới nơi khác không bị đốt (người chơi gọi nhầm room không làm mất vé của mình);
   * vé hết hạn bị xóa và coi như không có.
   */
  take(charId: number, to: string): Ticket | null {
    const t = this.tickets.get(charId);
    if (!t) return null;
    if (t.exp < this.now()) {
      this.tickets.delete(charId);
      return null;
    }
    if (t.to !== to) return null;
    this.tickets.delete(charId);
    return t;
  }

  /** Xem vé tới `to` (chưa hết hạn) mà không tiêu thụ. */
  peek(charId: number, to: string): Ticket | null {
    const t = this.tickets.get(charId);
    return t && t.exp >= this.now() && t.to === to ? t : null;
  }

  /** Còn vé (chưa hết hạn) tới `to` không; không tiêu thụ. */
  has(charId: number, to: string): boolean {
    const t = this.tickets.get(charId);
    return !!t && t.exp >= this.now() && t.to === to;
  }

  clear(charId?: number): void {
    if (charId === undefined) this.tickets.clear();
    else this.tickets.delete(charId);
  }
}

/** Sổ vé dùng chung mọi room. */
export const tickets = new TicketBook();
