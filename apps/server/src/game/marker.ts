// Điểm đánh dấu (M-4): mỗi người một điểm trên bản đồ, đồng đội cùng room thấy điểm của nhau. Chỉ giữ trong bộ nhớ.
// Server kiểm toạ độ (trong vùng chơi), giãn lệnh, hết hạn sau MARK_TTL_MS; mỗi nhịp đồng bộ chỉ gửi cho người có thay đổi.

import { MARK_GAP_MS, MARK_TTL_MS, type MarkCmd, type MarkInfo, type MarkMsg, S, validMark } from '@dtl/shared';
import { parties } from './party';
import type { PlayerEnt } from './sim';

interface Mark {
  x: number;
  z: number;
  at: number;
}

export class MarkerSystem {
  private marks = new Map<string, Mark>();
  private cmdAt = new Map<string, number>();
  /** Bản đã gửi lần cuối cho từng người (so khóa để không gửi lặp). */
  private sent = new Map<string, string>();

  /** `room`: danh tính room (cùng khái niệm với `parties.attach`) để tìm đồng đội cùng room. */
  constructor(
    private room: object,
    private players: () => Iterable<PlayerEnt>,
    private now: () => number = Date.now,
    /** Vùng chơi của level (E1-B); mặc định Vân Lam. */
    private bounds?: { x0: number; z0: number; x1: number; z1: number },
  ) {}

  command(p: PlayerEnt, msg: unknown): void {
    const m = (msg ?? {}) as Partial<MarkCmd>;
    const now = this.now();
    if (now - (this.cmdAt.get(p.sid) ?? 0) < MARK_GAP_MS) return;
    this.cmdAt.set(p.sid, now);
    if (m.clear === true) this.marks.delete(p.sid);
    else if (validMark(m.x, m.z, this.bounds)) this.marks.set(p.sid, { x: Math.round(m.x * 10) / 10, z: Math.round((m.z as number) * 10) / 10, at: now });
    else return;
    this.sync();
  }

  drop(p: PlayerEnt): void {
    const had = this.marks.delete(p.sid);
    this.cmdAt.delete(p.sid);
    this.sent.delete(p.sid);
    if (had) this.sync();
  }

  /** Điểm `viewer` đang thấy: của mình và của đồng đội cùng room. */
  visibleTo(viewer: PlayerEnt): MarkInfo[] {
    const out: MarkInfo[] = [];
    const mine = this.marks.get(viewer.sid);
    if (mine) out.push({ id: viewer.char.id, name: viewer.char.name, x: mine.x, z: mine.z, own: true });
    for (const o of parties.matesInRoom(viewer.char.id, this.room)) {
      if (o === viewer) continue;
      const m = this.marks.get(o.sid);
      if (m) out.push({ id: o.char.id, name: o.char.name, x: m.x, z: m.z, own: false });
    }
    return out;
  }

  /** Hết hạn điểm cũ rồi gửi cho ai có thay đổi. Gọi ngay sau lệnh và định kỳ (~1 s, bắt cả việc vào/rời tổ đội). */
  sync(): void {
    const now = this.now();
    for (const [sid, m] of this.marks) if (now - m.at > MARK_TTL_MS) this.marks.delete(sid);
    for (const p of this.players()) {
      if (!p.connected) continue;
      const marks = this.visibleTo(p);
      const key = JSON.stringify(marks);
      if (this.sent.get(p.sid) === key || (!marks.length && !this.sent.has(p.sid))) continue;
      this.sent.set(p.sid, key);
      p.client.send(S.MARK, { marks } satisfies MarkMsg);
    }
  }
}
