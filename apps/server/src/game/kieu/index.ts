// Đạp Thiên Cửu Kiều (TN-7): xin vé vào cầu và ghi tiến độ. Server quyết định hết: client chỉ gửi `{ n }` ("tôi muốn vào cầu n");
// luật thuần ở `packages/shared/src/kieu.ts`. Phòng cầu (phó bản/kiếp chuỗi) gọi `onClear` khi chính server thấy điều kiện qua đã đạt,
// không có tin "đã qua" nào từ client. Thiết kế và chống gian: artifact tn7/thiet-ke.md mục 5.
import { randomUUID } from 'node:crypto';
import {
  KIEU_RETICKET_SEC,
  KIEU_XP_FRAC,
  kieuCleared,
  kieuClearOk,
  kieuEntryDeny,
  kieuGold,
  kieuIdem,
  kieuIsFirstClear,
  kieuLevelId,
  xpNeed,
} from '@dtl/shared';
import { LEVELS, realmName, t } from '@dtl/content';
import type { PlayerEnt } from '../entities';
import { log } from '../../log';

/** NPC cấp vé (Dẫn Kiều Nhân, ở Kiều Đầu). */
export const KIEU_NPC = 'npc_dan_kieu_nhan';
/** Số người tối đa một lượt qua cầu (người xin vé và đồng đội). */
export const KIEU_PARTY_MAX = 4;

/** Phần GameSim mà hệ Cửu Kiều cần. */
export interface KieuCtx {
  readonly now: number;
  warn(p: PlayerEnt, key: string, params?: Record<string, string | number>): void;
  sys(p: PlayerEnt, key: string, params?: Record<string, string | number>, type?: 'good' | 'bad' | 'info' | 'xp'): void;
  nearNpc(p: PlayerEnt, id: string): boolean;
  leaveBlocker(p: PlayerEnt): string;
  isDead(p: PlayerEnt): boolean;
  giveXp(p: PlayerEnt, n: number, announce?: boolean): void;
  savePlayer(p: PlayerEnt): void;
}

/** Kế hoạch vào cầu do server quyết: room chỉ việc cấp vé và chuyển các `members` (người xin vé đứng đầu) sang `level`. */
export interface KieuPlan {
  level: string;
  dgKey: string;
  members: PlayerEnt[];
}

export type KieuClearResult = 'ok' | 'dup' | 'practice' | 'anomaly' | 'db';

export class KieuSystem {
  /** Lần cấp vé gần nhất của từng nhân vật (ms theo `ctx.now`); chống xin vé dồn dập. */
  private readonly lastIssue = new Map<number, number>();

  constructor(private readonly c: KieuCtx) {}

  private waitLeft(charId: number): number {
    const last = this.lastIssue.get(charId);
    return last === undefined ? 0 : Math.max(0, Math.ceil(KIEU_RETICKET_SEC - (this.c.now - last) / 1000));
  }

  /**
   * Xin vào cầu `msg.n`. Trả kế hoạch nếu mọi điều kiện đều đạt, ngược lại báo lý do và trả null. `mates` là đồng đội cùng tổ đội, cùng room
   * và trong tầm (room lọc); mỗi người phải tự đủ điều kiện (`kieuEntryDeny`) và cùng chế độ (lần đầu hoặc luyện lại), người khác bị bỏ qua.
   */
  plan(p: PlayerEnt, msg: unknown, mates: readonly PlayerEnt[]): KieuPlan | null {
    const m = msg as { n?: unknown } | null;
    const c = p.char;
    if (!m || this.c.isDead(p) || p.trib || p.trial) return null;
    const n = m.n;
    const deny = kieuEntryDeny(c.level, c.meta.kieu, n);
    if (deny === 'bad' || typeof n !== 'number') return null;
    if (!this.c.nearNpc(p, KIEU_NPC)) return (this.c.warn(p, 'sys.kieu_far', { npc: t(`npc.${KIEU_NPC}.name`) }), null);
    if (deny === 'level') return (this.c.warn(p, 'sys.kieu_level', { n }), null);
    if (deny === 'order') return (this.c.warn(p, 'sys.kieu_order', { n: kieuCleared(c.meta.kieu) + 1 }), null);
    const level = kieuLevelId(n);
    if (!LEVELS[level]?.dungeon) return (this.c.warn(p, 'sys.kieu_closed', { n }), null);
    const busy = this.c.leaveBlocker(p);
    if (busy) return (this.c.warn(p, busy), null);
    const wait = this.waitLeft(c.id);
    if (wait > 0) return (this.c.warn(p, 'sys.kieu_wait', { s: wait }), null);
    const first = kieuIsFirstClear(c.meta.kieu, n);
    const members: PlayerEnt[] = [p];
    for (const q of mates) {
      if (members.length >= KIEU_PARTY_MAX) break;
      if (q === p || q.char.id === c.id) continue;
      const ok =
        kieuEntryDeny(q.char.level, q.char.meta.kieu, n) === null &&
        kieuIsFirstClear(q.char.meta.kieu, n) === first &&
        !this.c.leaveBlocker(q) &&
        this.waitLeft(q.char.id) === 0;
      if (ok) members.push(q);
      else this.c.warn(p, 'sys.kieu_mate_skip', { name: q.char.name });
    }
    for (const q of members) this.lastIssue.set(q.char.id, this.c.now);
    return { level, dgKey: randomUUID(), members };
  }

  /**
   * Cầu `n` đã qua với người chơi `p`; chỉ phòng cầu gọi, sau khi server tự xác nhận điều kiện qua. Chỉ ghi lần đầu qua cầu kế tiếp: luyện lại
   * (đã qua cầu này) không thưởng. Phải có mặt đến lúc xong, đã đóng góp và không nhanh hơn thời gian tối thiểu (bất thường: ghi log, không ghi).
   * Linh thạch thưởng ghi trong một transaction có khóa chống trùng `kieu:clear:<nhân vật>:<cầu>` (mỗi cầu thưởng đúng một lần trong đời nhân vật);
   * `meta.kieu` chỉ tăng sau khi transaction xong hoặc đã từng xong (`dup`).
   */
  onClear(p: PlayerEnt, n: number, o: { present: boolean; contributed: boolean; elapsedSec: number }): KieuClearResult {
    const c = p.char;
    if (!Number.isInteger(n) || n < 1 || n > 9) return 'anomaly';
    if (!kieuIsFirstClear(c.meta.kieu, n)) return 'practice';
    if (!kieuClearOk(n, o)) {
      log.warn(
        `[kieu] ${c.name} qua cầu ${n} không hợp lệ (có mặt ${o.present}, đóng góp ${o.contributed}, ${o.elapsedSec.toFixed(1)} s): không ghi`,
      );
      return 'anomaly';
    }
    const gold = kieuGold(n);
    const ok = c.tx('kieu:clear', kieuIdem(c.id, n), (d) => {
      d.addGold(gold);
      return true;
    });
    if (!ok && c.txFail !== 'dup') {
      log.error(`[kieu] không ghi được cầu ${n} cho ${c.name}: ${c.txFail}`);
      return 'db';
    }
    c.meta.kieu = n;
    c.recalc();
    c.hp = Math.min(c.hp, c.mhp);
    c.mp = Math.min(c.mp, c.mmp);
    c.charDirty = true;
    this.c.sys(p, 'sys.kieu_clear', { n, gold: ok ? gold : 0 }, 'good');
    // Cầu mới nâng trần cấp: tu vi đang đầy ở trần cũ thì lên cấp ngay; thưởng tu vi chạy sau khi đã nâng trần.
    if (c.gainXp(0) > 0) this.c.sys(p, 'sys.levelup', { realm: realmName(c.level) }, 'good');
    if (ok) this.c.giveXp(p, Math.floor(xpNeed(c.level) * KIEU_XP_FRAC), true);
    this.c.savePlayer(p);
    log.info(`[kieu] ${c.name} qua cầu ${n}/9`);
    return ok ? 'ok' : 'dup';
  }
}
