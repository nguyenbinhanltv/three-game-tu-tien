// Tủ ngoại trang (P4, docs/wardrobe/README.md): chọn dáng đã mở khóa để HIỂN THỊ thay cho món đang mặc, và nhuộm 3 kênh.
// Server quyết định: client chỉ gửi ý định; id phải nằm trong tủ của chính nhân vật, đúng ô, đúng giới. Không đổi chỉ số.
// Miễn phí (người dùng đã chốt): mọi thao tác chỉ ghi dòng ledger `noop` có khóa idem, qua `Character.tx` (một transaction).
// Mở khóa KHÔNG có tin nhắn: do `Character.tx` tự ghi trong cùng transaction khi món vào túi/trang bị.
import { canShow, emptyLook, isEmptyLook, parseLookDyeMsg, parseLookSetMsg, S, type OutfitLook, type WardrobeMsg } from '@dtl/shared';
import { APPEARANCE, ITEM } from '@dtl/content';
import type { PlayerEnt } from '../entities';
import type { DuelSystem } from '../duel';

const DYE_IDS: ReadonlySet<string> = new Set(APPEARANCE.dyes.map((d) => d.id));

/** Phần GameSim mà tủ ngoại trang cần. */
export interface WardrobeCtx {
  readonly duel: DuelSystem;
  idem(p: PlayerEnt, r: unknown): string | null | undefined;
  isDead(p: PlayerEnt): boolean;
  readonly now: number;
  warn(p: PlayerEnt, k: string, params?: Record<string, string | number>): void;
}

const same = (a: OutfitLook, b: OutfitLook): boolean => JSON.stringify(a) === JSON.stringify(b);

export class WardrobeSystem {
  constructor(private readonly c: WardrobeCtx) {}

  msg(p: PlayerEnt): WardrobeMsg {
    const c = p.char;
    return { owned: [...c.wardrobe].sort(), look: c.look };
  }

  /** Gửi lại tủ cho chủ khi có thay đổi (gọi từ vòng tick). */
  flush(p: PlayerEnt): void {
    const c = p.char;
    if (!c.wardrobeDirty || !p.connected) return;
    c.wardrobeDirty = false;
    p.client.send(S.WARDROBE, this.msg(p));
  }

  /** Chặn chung: đang chết, tỉ thí, tâm ma, giãn 200 ms (cùng chặn với mặc/tháo đồ). Trả khóa idem hoặc undefined nếu phải bỏ. */
  private gate(p: PlayerEnt, r: unknown): string | null | undefined {
    if (this.c.isDead(p)) return undefined;
    if (this.c.duel.inDuel(p)) return void this.c.warn(p, 'duel.no_items');
    if (p.trial) return void this.c.warn(p, 'sys.busy');
    const idem = this.c.idem(p, r);
    if (idem === undefined || this.c.now < (p.equipCdAt ?? 0)) return undefined;
    p.equipCdAt = this.c.now + 200;
    return idem;
  }

  /** Ghi `next` qua một transaction; look không đổi thì không ghi gì. */
  private apply(p: PlayerEnt, reason: string, idem: string | null, next: OutfitLook): void {
    const c = p.char;
    if (same(c.look, next)) return;
    c.tx(reason, idem, (d) => {
      d.look = isEmptyLook(next) ? emptyLook() : next;
      return true;
    });
  }

  onLookSet(p: PlayerEnt, raw: unknown): void {
    const m = parseLookSetMsg(raw);
    if (!m) return;
    const idem = this.gate(p, m.r);
    if (idem === undefined) return;
    const c = p.char;
    if (m.id !== null && !canShow(m.slot, m.id, c.appearance.g, (i) => ITEM.get(i), c.wardrobe)) {
      return this.c.warn(p, 'sys.wardrobe_locked');
    }
    const over = { ...c.look.over };
    if (m.id === null) delete over[m.slot];
    else over[m.slot] = m.id;
    this.apply(p, `look:${m.slot}:${m.id ?? '-'}`, idem, { ...c.look, over });
  }

  onLookDye(p: PlayerEnt, raw: unknown): void {
    const m = parseLookDyeMsg(DYE_IDS, raw);
    if (!m) return;
    const idem = this.gate(p, (raw as { r?: unknown }).r);
    if (idem === undefined) return;
    const next: OutfitLook = { over: p.char.look.over };
    if (m.dye) next.dye = m.dye;
    this.apply(p, `look:dye:${m.dye ? m.dye.join('/') : '-'}`, idem, next);
  }

  onLookReset(p: PlayerEnt, raw: unknown): void {
    const idem = this.gate(p, (raw as { r?: unknown } | null)?.r);
    if (idem === undefined) return;
    this.apply(p, 'look:reset', idem, emptyLook());
  }
}
