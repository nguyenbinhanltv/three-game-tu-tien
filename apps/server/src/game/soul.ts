// Nguyên anh xuất khiếu (E3-K). Server giữ hết trạng thái; client chỉ gửi ý định (phím X) và vẽ bóng anh.
//  - Thám thính (X): nguyên anh rời thân xác tối đa SOUL_SCOUT_MS, bay tự do xuyên kiến trúc trong SOUL_RANGE quanh thân xác,
//    không ra chiêu, quái không thấy và không đánh trúng được; nhập lại bằng X, hết giờ, hoặc khi rời room/lưu nhân vật.
//  - Cứu mạng: chết ở Nguyên Anh trở lên thì nguyên anh thoát ra SOUL_DEATH_MS rồi hồi sinh ở nơi an toàn với 30% khí huyết,
//    không mất tu vi; mỗi SOUL_DEATH_CD_MS một lần. Không áp dụng ở phó bản giới hạn lượt hồi sinh (sẽ qua mặt giới hạn đó).
// Sim chỉ nối (xem `GameSim.soul`). Không đụng túi/tiền nên không có ledger.

import {
  PF_DEAD,
  PF_SOUL,
  S,
  SOUL_CMD_GAP_MS,
  SOUL_COMBAT_BLOCK_MS,
  SOUL_DEATH,
  SOUL_DEATH_CD_MS,
  SOUL_DEATH_MS,
  SOUL_RANGE,
  SOUL_SCOUT,
  SOUL_SCOUT_CD_MS,
  SOUL_SCOUT_MS,
  soulUnlocked,
  type FxMsg,
  type MoveCtx,
  type SoulCmd,
  type SoulKind,
  type SoulStateMsg,
} from '@dtl/shared';
import type { PlayerEnt } from './sim';

export interface SoulHost {
  now(): number;
  warn(p: PlayerEnt, k: string, params?: Record<string, string | number>): void;
  sys(p: PlayerEnt, k: string, params?: Record<string, string | number>, type?: string): void;
  fx(m: FxMsg): void;
  groundAt(x: number, z: number): number;
  inDuel(p: PlayerEnt): boolean;
  stopMeditate(p: PlayerEnt): void;
  /** Điểm hồi sinh của room. */
  respawnPoint(): { x: number; z: number };
  /** Chết có được cứu bằng xuất khiếu không (không ở phó bản giới hạn lượt hồi sinh). */
  allowDeathEscape(): boolean;
  /** Hồi sinh người đang trong dạng nguyên anh (hết giờ). */
  respawn(p: PlayerEnt): void;
  players(): Iterable<PlayerEnt>;
}

interface Soul {
  k: SoulKind;
  until: number;
  bx: number;
  by: number;
  bz: number;
  /** Thân xác đang ngự kiếm/không lúc xuất khiếu (để trả lại đúng trạng thái). */
  bFlying: boolean;
  to?: { x: number; z: number };
}

/** Hồi chiêu theo nhân vật, sống ở cấp tiến trình để đổi room không xóa được hồi chiêu. */
const scoutCd = new Map<number, number>();
const deathCd = new Map<number, number>();

export class SoulSystem {
  private souls = new Map<string, Soul>();
  private cmdAt = new Map<string, number>();

  constructor(private h: SoulHost) {}

  /** Đang ở dạng thám thính: bay xuyên vật cản, quái không thấy, không nhận sát thương. */
  isScouting(p: PlayerEnt): boolean {
    return this.souls.size > 0 && this.souls.get(p.sid)?.k === SOUL_SCOUT;
  }

  /** Vừa thoát ra khi tử vong (đang đợi hồi sinh). */
  isDeathSoul(p: PlayerEnt): boolean {
    return this.souls.get(p.sid)?.k === SOUL_DEATH;
  }

  /** Tham số `MoveCtx.ghost` cho `stepMove` khi đang thám thính. */
  ghostOf(p: PlayerEnt): MoveCtx['ghost'] {
    const s = this.souls.get(p.sid);
    return s?.k === SOUL_SCOUT ? { x: s.bx, z: s.bz, r: SOUL_RANGE } : undefined;
  }

  sendState(p: PlayerEnt): void {
    if (!p.connected) return;
    const now = this.h.now();
    const s = this.souls.get(p.sid);
    const msg: SoulStateMsg = {
      open: soulUnlocked(p.char.level),
      k: s?.k ?? 0,
      left: s ? Math.max(0, s.until - now) : 0,
      bx: s?.bx ?? 0,
      by: s?.by ?? 0,
      bz: s?.bz ?? 0,
      cd: Math.max(0, (scoutCd.get(p.char.id) ?? 0) - now),
      dcd: Math.max(0, (deathCd.get(p.char.id) ?? 0) - now),
    };
    if (s?.to) msg.to = s.to;
    p.client.send(S.SOUL_STATE, msg);
  }

  /** Lệnh GM `cd`: xóa hồi chiêu xuất khiếu. */
  resetCooldown(p: PlayerEnt): void {
    scoutCd.delete(p.char.id);
    deathCd.delete(p.char.id);
    this.sendState(p);
  }

  /** Rời room / chuyển room / lưu nhân vật: nhập lại thân xác để vị trí lưu là của thân xác. */
  drop(p: PlayerEnt): void {
    if (this.souls.get(p.sid)?.k === SOUL_SCOUT) this.end(p, 'drop');
    this.souls.delete(p.sid);
    this.cmdAt.delete(p.sid);
  }

  private blocker(p: PlayerEnt): string {
    if (!soulUnlocked(p.char.level)) return 'sys.soul_locked';
    if ((p.s.fl & PF_DEAD) !== 0) return 'sys.dead';
    if (p.trib || p.trial || this.h.inDuel(p) || p.casting) return 'sys.soul_busy';
    return '';
  }

  /** Phím X: nhập/xuất khiếu. Thiếu `on` thì đảo trạng thái. */
  command(p: PlayerEnt, msg: unknown): void {
    const m = (msg ?? {}) as Partial<SoulCmd>;
    const now = this.h.now();
    if (now - (this.cmdAt.get(p.sid) ?? 0) < SOUL_CMD_GAP_MS) return;
    this.cmdAt.set(p.sid, now);
    const cur = this.souls.get(p.sid);
    if (cur?.k === SOUL_DEATH) return;
    const want = typeof m.on === 'boolean' ? m.on : !cur;
    if (!want) {
      if (cur?.k === SOUL_SCOUT) this.end(p, 'recall');
      return;
    }
    if (cur) return;
    const why = this.blocker(p);
    if (why) return this.h.warn(p, why);
    if (now - p.lastCombatAt < SOUL_COMBAT_BLOCK_MS) return this.h.warn(p, 'sys.soul_combat');
    const left = (scoutCd.get(p.char.id) ?? 0) - now;
    if (left > 0) return this.h.warn(p, 'sys.soul_cd', { s: Math.ceil(left / 1000) });
    this.h.stopMeditate(p);
    this.souls.set(p.sid, { k: SOUL_SCOUT, until: now + SOUL_SCOUT_MS, bx: p.move.x, by: p.move.y, bz: p.move.z, bFlying: p.move.flying });
    p.s.fl |= PF_SOUL;
    // Nguyên anh bay ngay (stepMove với `ghost` ép bay).
    p.move.flying = true;
    p.move.grounded = false;
    p.move.vy = 0;
    this.h.fx({ t: 'soul_out', src: p.sid, x: p.move.x, y: p.move.y, z: p.move.z, d: 0.6 });
    this.h.sys(p, 'sys.soul_out', undefined, 'info');
    this.sendState(p);
  }

  /** Nhập lại thân xác: trả vị trí và trạng thái bay, vào hồi chiêu. */
  private end(p: PlayerEnt, why: 'recall' | 'time' | 'drop'): void {
    const s = this.souls.get(p.sid);
    if (!s || s.k !== SOUL_SCOUT) return;
    this.souls.delete(p.sid);
    const from = { x: p.move.x, y: p.move.y, z: p.move.z };
    p.move.x = s.bx;
    p.move.z = s.bz;
    p.move.vy = 0;
    p.move.flying = s.bFlying;
    const g = this.h.groundAt(s.bx, s.bz);
    p.move.y = s.bFlying ? Math.max(s.by, g) : g;
    p.move.grounded = !s.bFlying;
    p.inputs.length = 0;
    p.s.fl &= ~PF_SOUL;
    scoutCd.set(p.char.id, this.h.now() + SOUL_SCOUT_CD_MS);
    if (why === 'drop') return;
    this.h.fx({ t: 'soul_in', src: p.sid, x: from.x, y: from.y, z: from.z, d: 0.5 });
    this.h.sys(p, why === 'time' ? 'sys.soul_time' : 'sys.soul_in', undefined, 'info');
    this.sendState(p);
  }

  /**
   * Gọi từ `killPlayer` khi người chơi hết máu (chưa mất tu vi). Trả true nếu nguyên anh thoát ra cứu mạng:
   * caller bỏ phạt tu vi; hết SOUL_DEATH_MS (hoặc bấm hồi sinh sớm) thì hồi sinh với `SOUL_DEATH_HP`.
   */
  onDeath(p: PlayerEnt): boolean {
    const now = this.h.now();
    if (!soulUnlocked(p.char.level) || !this.h.allowDeathEscape()) return false;
    if ((deathCd.get(p.char.id) ?? 0) > now) return false;
    deathCd.set(p.char.id, now + SOUL_DEATH_CD_MS);
    const to = this.h.respawnPoint();
    this.souls.set(p.sid, { k: SOUL_DEATH, until: now + SOUL_DEATH_MS, bx: p.move.x, by: p.move.y, bz: p.move.z, bFlying: false, to });
    p.s.fl |= PF_SOUL;
    this.h.fx({ t: 'soul_flee', src: p.sid, x: to.x, y: this.h.groundAt(to.x, to.z), z: to.z, d: SOUL_DEATH_MS / 1000 });
    this.h.sys(p, 'sys.soul_escape', { s: SOUL_DEATH_MS / 1000 }, 'good');
    this.sendState(p);
    return true;
  }

  /** Hồi sinh (hết giờ hoặc bấm sớm): true nếu đây là hồi sinh sau xuất khiếu (khí huyết `SOUL_DEATH_HP`). */
  consumeDeath(p: PlayerEnt): boolean {
    if (this.souls.get(p.sid)?.k !== SOUL_DEATH) return false;
    this.souls.delete(p.sid);
    return true;
  }

  tick(): void {
    if (this.souls.size === 0) return;
    const now = this.h.now();
    for (const [sid, s] of this.souls) {
      if (now < s.until) continue;
      const p = [...this.h.players()].find((o) => o.sid === sid);
      if (!p) {
        this.souls.delete(sid);
        continue;
      }
      if (s.k === SOUL_DEATH) this.h.respawn(p);
      else this.end(p, 'time');
    }
  }
}
