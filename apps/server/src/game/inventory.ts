// Túi đồ TD-A phía server: sắp xếp, khóa ô, tách chồng. Tách khỏi sim.ts; sim.ts chỉ nối lệnh `isort`, `ilock`, `isplit`.
//
//  - Mỗi lệnh đổi chỗ là MỘT `Character.tx` (bản nháp + một giao dịch DB), có khóa idem (sort/split) và giới hạn tần suất.
//  - Sắp xếp/tách không tạo hay mất vật phẩm: `itemDelta` rỗng nên ledger chỉ có một dòng 'noop' mang khóa idem.
//  - Khóa ô là trạng thái đặt thẳng (`on` true/false) nên tự idempotent; lưu ở cột `items.locked`.

import { INV_SIZE, planSort } from '@dtl/shared';
import { ITEM, itemName } from '@dtl/content';
import type { InvItem } from '@dtl/shared';
import type { PlayerEnt } from './entities';

interface InventoryHost {
  now(): number;
  isDead(p: PlayerEnt): boolean;
  idem(p: PlayerEnt, r: unknown): string | null | undefined;
  warn(p: PlayerEnt, k: string, params?: Record<string, string | number>): void;
}

/** Tối thiểu giữa hai lệnh cùng loại của một người (ms). */
const SORT_GAP_MS = 1000;
const SPLIT_GAP_MS = 150;
const LOCK_GAP_MS = 100;

export class InventorySystem {
  private last = new WeakMap<PlayerEnt, { sort: number; split: number; lock: number }>();

  constructor(private h: InventoryHost) {}

  private gate(p: PlayerEnt, k: 'sort' | 'split' | 'lock', gap: number): boolean {
    let t = this.last.get(p);
    if (!t) this.last.set(p, (t = { sort: 0, split: 0, lock: 0 }));
    if (this.h.now() < t[k]) return false;
    t[k] = this.h.now() + gap;
    return true;
  }

  /** `isort`: `{ r }`. Gộp chồng rồi xếp: loại → phẩm → bậc → cấp → tên. */
  onSort(p: PlayerEnt, msg: unknown): void {
    const m = msg as { r?: unknown } | null;
    if (this.h.isDead(p)) return;
    const idem = this.h.idem(p, m?.r);
    if (!idem || !this.gate(p, 'sort', SORT_GAP_MS)) return;
    const c = p.char;
    c.tx('inv:sort', idem, (d) => {
      const next = planSort(d.inv, { def: (id) => ITEM.get(id), name: (it) => itemName(it.id) });
      for (let i = 0; i < INV_SIZE; i++) d.inv[i] = next[i] ?? null;
      return true;
    });
  }

  /** `ilock`: `{ slot, on }`. */
  onLock(p: PlayerEnt, msg: unknown): void {
    const m = msg as { slot?: unknown; on?: unknown } | null;
    if (!m || !Number.isInteger(m.slot) || typeof m.on !== 'boolean') return;
    const slot = m.slot as number;
    if (slot < 0 || slot >= INV_SIZE || this.h.isDead(p) || !this.gate(p, 'lock', LOCK_GAP_MS)) return;
    const on = m.on;
    const cur = p.char.inv[slot];
    if (!cur || !!cur.lk === on) return;
    p.char.tx('inv:lock', null, (d) => {
      const it = d.inv[slot];
      if (!it) return false;
      if (on) it.lk = true;
      else delete it.lk;
      return true;
    });
  }

  /** `isplit`: `{ slot, n, to?, r }`. Tách `n` món (0 < n < số trong chồng) sang ô trống `to` (mặc định: ô trống đầu tiên). */
  onSplit(p: PlayerEnt, msg: unknown): void {
    const m = msg as { slot?: unknown; n?: unknown; to?: unknown; r?: unknown } | null;
    if (!m || !Number.isInteger(m.slot) || !Number.isInteger(m.n)) return;
    const slot = m.slot as number;
    const n = m.n as number;
    if (slot < 0 || slot >= INV_SIZE || n < 1 || this.h.isDead(p)) return;
    let to = -1;
    if (m.to !== undefined) {
      if (!Number.isInteger(m.to) || (m.to as number) < 0 || (m.to as number) >= INV_SIZE || m.to === slot) return;
      to = m.to as number;
    }
    const idem = this.h.idem(p, m.r);
    if (!idem || !this.gate(p, 'split', SPLIT_GAP_MS)) return;
    const src = p.char.inv[slot];
    const def = src ? ITEM.get(src.id) : undefined;
    if (!src || !def || def.stack <= 1 || n >= src.n) return this.h.warn(p, 'sys.inv_split_fail');
    const ok = p.char.tx('inv:split:' + src.id, idem, (d) => {
      const cur = d.inv[slot];
      if (!cur || cur.id !== src.id || cur.n <= n) return false;
      const dst = to >= 0 ? to : d.inv.findIndex((s) => !s);
      if (dst < 0 || d.inv[dst]) return false;
      const part: InvItem = { id: cur.id, n };
      if (cur.plus) part.plus = cur.plus;
      if (cur.lk) part.lk = true;
      cur.n -= n;
      d.inv[dst] = part;
      return true;
    });
    if (!ok && p.char.txFail === 'abort') this.h.warn(p, 'sys.inv_split_fail');
  }
}
