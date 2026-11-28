import { C, type GmListKind, type GmListResult, type GmReply, type GmState } from '@dtl/shared';
import { Game } from '../engine';

/**
 * Kênh GM có cấu trúc của client (`C.GM` / `S.GM`, xem docs/handbook/dien-vo-can-bang.md): gửi yêu cầu mang mã `r`, nhận `GmReply` cùng mã.
 * Client chỉ gửi ý định (lệnh + tham số, truy vấn trạng thái/danh sách); server kiểm quyền tài khoản thử và mọi tham số.
 * Yêu cầu xếp hàng, cách nhau ≥ GAP_MS (server giãn 40 ms mỗi yêu cầu). Không có trả lời trong TIMEOUT_MS (không phải tài khoản thử,
 * mất kết nối) thì lời hứa bị từ chối để giao diện hiện lỗi thay vì treo.
 */

const GAP_MS = 45;
const TIMEOUT_MS = 2500;

interface Pending {
  res: (m: GmReply) => void;
  rej: (e: Error) => void;
  timer: number;
}

let seq = 1;
const pending = new Map<number, Pending>();
let chain: Promise<unknown> = Promise.resolve();
let lastState: GmState | null = null;
const stateSubs = new Set<(s: GmState | null) => void>();

/** Nối vào `S.GM` ở `bindRoom`. */
export function gmOnReply(m: GmReply): void {
  if (m.st) setState(m.st);
  const p = pending.get(m.r);
  if (!p) return;
  pending.delete(m.r);
  window.clearTimeout(p.timer);
  p.res(m);
}

function setState(s: GmState | null): void {
  lastState = s;
  for (const f of stateSubs) f(s);
}

export const gmStateNow = (): GmState | null => lastState;
export function gmStateSub(f: (s: GmState | null) => void): () => void {
  stateSubs.add(f);
  return () => void stateSubs.delete(f);
}

function call(req: Record<string, unknown>): Promise<GmReply> {
  const run = () =>
    new Promise<GmReply>((res, rej) => {
      const g = Game.current;
      if (!g) return rej(new Error('no-game'));
      const r = seq++;
      const timer = window.setTimeout(() => {
        pending.delete(r);
        rej(new Error('timeout'));
      }, TIMEOUT_MS);
      pending.set(r, { res, rej, timer });
      g.send(C.GM, { r, ...req });
    });
  const p = chain.then(run, run);
  chain = p.then(
    () => new Promise((x) => window.setTimeout(x, GAP_MS)),
    () => new Promise((x) => window.setTimeout(x, GAP_MS)),
  );
  return p;
}

/** Chạy một lệnh (`['level', '20']`, không có `/gm`). Trả lời có `st` thì trạng thái cũng được cập nhật. */
export const gmRun = (a: string[]): Promise<GmReply> => call({ a });

/** Hỏi trạng thái phòng thử/nhân vật. */
export async function gmRefreshState(): Promise<GmState | null> {
  const m = await call({ q: 'state' });
  const s = m.ok ? (m.d as GmState) : null;
  setState(s);
  return s;
}

/** Danh sách có lọc (id + tên + ghi chú). Lỗi/timeout thì ném. */
export async function gmList(k: GmListKind, f = '', n = 60): Promise<GmListResult> {
  const m = await call({ q: 'list', k, f: f || undefined, n });
  if (!m.ok) throw new Error(m.e ?? 'fail');
  return m.d as GmListResult;
}
