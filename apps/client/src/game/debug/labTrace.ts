// Phòng thử (Diễn Võ Trường, V2c): NHẬT KÝ ĐIỀU KHIỂN. Ghi mốc thời gian của một lệnh hành động từ lúc bấm phím tới lúc đòn trúng:
// phím → client gửi (kể cả thời gian lệnh nằm chờ hết GCD ở client) → server trả lời (tin hồi chiêu `S.CD`) → sát thương đầu tiên của mình (`S.DMG`).
// Lớp thuần, không đụng DOM hay mạng: engine gọi `send`/`recv` ở đúng hai chỗ tin đi và tin về (sau ping giả), lớp phủ gọi `key`. Chỉ đo ở máy mình.

export interface TraceRow {
  id: number;
  /** Loại lệnh (`sk` chiêu, `dg` né) và tên hiển thị (id chiêu). */
  type: string;
  label: string;
  /** Phím/nút chuột gần nhất trước lệnh (null = lệnh tự phát, vd. tự đánh). */
  key: string | null;
  keyAt: number | null;
  sendAt: number;
  /** Lúc tin hồi chiêu của server về tới (server đã nhận và chấp nhận lệnh). */
  ackAt: number | null;
  /** Lúc sát thương đầu tiên do mình gây ra sau lệnh này về tới. */
  hitAt: number | null;
}

/** Phím bấm trước lệnh quá ngần này thì không coi là nguyên nhân của lệnh (ms). Phải dài hơn GCD 1 s vì lệnh bấm sớm nằm chờ ở client. */
export const TRACE_KEY_WINDOW = 1500;
/** Chờ server trả lời / chờ đòn trúng tối đa (ms); quá thì dòng giữ trống. */
export const TRACE_ACK_WINDOW = 2000;
export const TRACE_HIT_WINDOW = 3500;
export const TRACE_ROWS = 8;

const ACTIONS: Record<string, true> = { sk: true, dg: true };

export class LabTrace {
  rows: TraceRow[] = [];
  /** Tăng mỗi lần có thay đổi, để lớp phủ biết lúc nào vẽ lại. */
  ver = 0;
  private seq = 0;
  private lastKey: { code: string; at: number } | null = null;

  /** Phím hoặc nút chuột vừa bấm (không tính lặp phím). */
  key(code: string, at: number): void {
    this.lastKey = { code, at };
  }

  /** Client vừa quyết định gửi một tin lên server (trước ping giả). Chỉ ghi lệnh hành động. */
  send(type: string, msg: unknown, at: number): void {
    if (!ACTIONS[type]) return;
    const k = this.lastKey && at - this.lastKey.at <= TRACE_KEY_WINDOW ? this.lastKey : null;
    this.lastKey = null;
    const id = (msg as { id?: unknown } | undefined)?.id;
    this.rows.push({
      id: ++this.seq,
      type,
      label: typeof id === 'string' ? id : type,
      key: k?.code ?? null,
      keyAt: k?.at ?? null,
      sendAt: at,
      ackAt: null,
      hitAt: null,
    });
    if (this.rows.length > TRACE_ROWS) this.rows.shift();
    this.ver++;
  }

  /** Một tin của server vừa tới (sau ping giả). `me` = sid của mình. */
  recv(type: string, msg: unknown, me: string, at: number): void {
    if (type === 'cd') {
      const r = this.rows.find((x) => x.type === 'sk' && x.ackAt === null && at - x.sendAt <= TRACE_ACK_WINDOW);
      if (r) {
        r.ackAt = at;
        this.ver++;
      }
    } else if (type === 'dmg') {
      const m = msg as { src?: string; heal?: boolean } | undefined;
      if (!m || m.src !== me || m.heal) return;
      // Đòn trúng thuộc về lệnh MỚI NHẤT đã được server nhận mà chưa có mốc trúng (đòn quét trúng nhiều quái chỉ tính cú đầu).
      for (let i = this.rows.length - 1; i >= 0; i--) {
        const r = this.rows[i]!;
        if (r.type !== 'sk' || r.hitAt !== null) continue;
        if (r.ackAt === null || at - r.sendAt > TRACE_HIT_WINDOW) continue;
        r.hitAt = at;
        this.ver++;
        return;
      }
    }
  }

  clear(): void {
    this.rows = [];
    this.lastKey = null;
    this.ver++;
  }
}

/** Các khoảng (ms, làm tròn) của một dòng: chờ ở client (phím → gửi), khứ hồi server (gửi → trả lời), tới lúc trúng (gửi → trúng). null = chưa có. */
export function traceSpans(r: TraceRow): { hold: number | null; ack: number | null; hit: number | null } {
  return {
    hold: r.keyAt === null ? null : Math.round(r.sendAt - r.keyAt),
    ack: r.ackAt === null ? null : Math.round(r.ackAt - r.sendAt),
    hit: r.hitAt === null ? null : Math.round(r.hitAt - r.sendAt),
  };
}
