// Tỉ thí 1v1 ở võ đài tông môn (P3-9). Server phán định mọi thứ; đấu tập: không mất đồ/tu vi, không thưởng gì.
// Sim chỉ nối: lệnh `duel`, tick, rời room, chết, và chỗ tính sát thương lên người (xem GameSim.duelStrike).

import {
  DUEL_COUNTDOWN_MS,
  DUEL_LEAVE_GRACE_MS,
  DUEL_LEAVE_MARGIN,
  DUEL_MAX_MS,
  DUEL_PAIR_COOLDOWN_MS,
  type DuelCmd,
  type DuelEnd,
  type DuelMsg,
  inArena,
  INVITE_PAIR_COOLDOWN_MS,
  INVITE_TTL_MS,
  type InviteMsg,
  PF_DEAD,
  PF_DUEL,
  S,
} from '@dtl/shared';
import { parties } from './party';
import type { PlayerEnt } from './entities';

interface DuelHost {
  now(): number;
  /** Chỉ thế giới chính có võ đài. */
  inWorld(): boolean;
  players(): Iterable<PlayerEnt>;
  sys(p: PlayerEnt, k: string, params?: Record<string, string | number>, type?: string): void;
  warn(p: PlayerEnt, k: string, params?: Record<string, string | number>): void;
  setFlag(p: PlayerEnt, flag: number, on: boolean): void;
  cancelCast(p: PlayerEnt): void;
  stopMeditate(p: PlayerEnt): void;
  /** Ghi nhận sự kiện nhiệm vụ (M-5: hoàn tất một trận tỉ thí). */
  questEvent(p: PlayerEnt, type: 'duel', target: undefined, n: number): void;
}

interface Duel {
  a: PlayerEnt;
  b: PlayerEnt;
  fightAt: number;
  endAt: number;
  snap: Map<string, { hp: number; mp: number }>;
  leaveSince: Map<string, number>;
  over: boolean;
  fought: boolean;
}

interface Invite {
  from: PlayerEnt;
  until: number;
}

export class DuelSystem {
  private bySid = new Map<string, Duel>();
  /** id nhân vật người nhận → lời mời đang chờ (mỗi người nhận tối đa một lời mời tỉ thí). */
  private invites = new Map<number, Invite>();

  constructor(private h: DuelHost) {}

  inDuel(p: PlayerEnt): boolean {
    return this.bySid.has(p.sid);
  }

  /** Đối thủ nếu trận đang ở giai đoạn đánh nhau. */
  foeOf(p: PlayerEnt): PlayerEnt | null {
    const d = this.bySid.get(p.sid);
    if (!d || d.over || this.h.now() < d.fightAt) return null;
    return d.a === p ? d.b : d.a;
  }

  /** Đối thủ ở mọi giai đoạn (kể cả đếm ngược). */
  anyFoe(p: PlayerEnt): PlayerEnt | null {
    const d = this.bySid.get(p.sid);
    return d && !d.over ? (d.a === p ? d.b : d.a) : null;
  }

  command(p: PlayerEnt, msg: unknown): void {
    const m = msg as Partial<DuelCmd> | null;
    if (!m || typeof m !== 'object') return;
    switch (m.a) {
      case 'inv':
        return this.invite(p, (m as { n?: unknown }).n);
      case 'acc':
        return this.accept(p, (m as { id?: unknown }).id);
      case 'dec':
        return this.decline(p, (m as { id?: unknown }).id);
      case 'yield': {
        const d = this.bySid.get(p.sid);
        if (d && !d.over && this.h.now() >= d.fightAt) this.finish(d, d.a === p ? d.b : d.a, 'yield');
      }
    }
  }

  /** Điều kiện để vào võ đài/được mời: sống, đứng trong võ đài, không bận việc khác. */
  private ready(p: PlayerEnt): string | null {
    if (!this.h.inWorld()) return 'duel.not_here';
    if ((p.s.fl & PF_DEAD) !== 0 || p.trib || p.trial) return 'duel.busy';
    if (this.bySid.has(p.sid)) return 'duel.in_duel';
    if (p.move.flying) return 'duel.busy';
    if (!inArena(p.move.x, p.move.z)) return 'duel.not_in_arena';
    return null;
  }

  private find(name: string): PlayerEnt | null {
    const want = name.trim().toLowerCase();
    for (const o of this.h.players()) if (o.char.name.toLowerCase() === want) return o;
    return null;
  }

  private invite(p: PlayerEnt, rawName: unknown): void {
    if (typeof rawName !== 'string' || rawName.length > 40) return;
    const bad = this.ready(p);
    if (bad) return this.h.warn(p, bad);
    const o = this.find(rawName);
    if (!o || o === p) return this.h.warn(p, 'party.no_such');
    if (!parties.rateOk(p.char.id)) return this.h.warn(p, 'party.invite_rate');
    if (parties.pairBlocked('duel', p.char.id, o.char.id) || parties.pairBlocked('duel', o.char.id, p.char.id))
      return this.h.warn(p, 'duel.pair_cd', { name: o.char.name });
    const ob = this.ready(o);
    if (ob) return this.h.warn(p, 'duel.target_busy', { name: o.char.name });
    const cur = this.invites.get(o.char.id);
    if (cur && cur.until > this.h.now() && cur.from !== p) return this.h.warn(p, 'duel.target_busy', { name: o.char.name });
    const until = this.h.now() + INVITE_TTL_MS;
    this.invites.set(o.char.id, { from: p, until });
    o.client.send(S.INVITE, { kind: 'duel', id: p.char.id, name: p.char.name, until } satisfies InviteMsg);
    this.h.sys(p, 'duel.invited', { name: o.char.name });
  }

  private take(target: PlayerEnt, rawId: unknown): PlayerEnt | null {
    const inv = this.invites.get(target.char.id);
    if (!inv || typeof rawId !== 'number' || inv.from.char.id !== rawId) return null;
    this.invites.delete(target.char.id);
    if (inv.until <= this.h.now()) return null;
    return inv.from;
  }

  private decline(p: PlayerEnt, rawId: unknown): void {
    const from = this.take(p, rawId);
    if (!from) return;
    parties.setPairCooldown('duel', from.char.id, p.char.id, INVITE_PAIR_COOLDOWN_MS);
    this.h.sys(from, 'duel.declined', { name: p.char.name }, 'bad');
  }

  private accept(p: PlayerEnt, rawId: unknown): void {
    const from = this.take(p, rawId);
    if (!from) return this.h.warn(p, 'party.invite_gone');
    // Người mời phải còn trong room này và còn đủ điều kiện (đã dời khỏi võ đài thì thôi).
    if (!this.alive(from)) return this.h.warn(p, 'party.invite_gone');
    const bad = this.ready(p) ?? this.ready(from);
    if (bad) return this.h.warn(p, bad);
    const now = this.h.now();
    const d: Duel = {
      a: from,
      b: p,
      fightAt: now + DUEL_COUNTDOWN_MS,
      endAt: now + DUEL_COUNTDOWN_MS + DUEL_MAX_MS,
      snap: new Map(),
      leaveSince: new Map(),
      over: false,
      fought: false,
    };
    for (const x of [from, p]) {
      d.snap.set(x.sid, { hp: x.char.hp, mp: x.char.mp });
      this.bySid.set(x.sid, d);
      // Vào trận đầy máu đầy linh lực cho công bằng; kết thúc thì trả lại đúng như trước khi vào.
      x.char.hp = x.char.mhp;
      x.char.mp = x.char.mmp;
      this.h.cancelCast(x);
      this.h.stopMeditate(x);
      this.h.setFlag(x, PF_DUEL, true);
    }
    this.notify(d, 'count');
  }

  private alive(p: PlayerEnt): boolean {
    for (const o of this.h.players()) if (o === p) return true;
    return false;
  }

  private notify(d: Duel, phase: 'count' | 'fight' | 'end', won?: PlayerEnt, why?: DuelEnd): void {
    for (const [me, foe] of [
      [d.a, d.b],
      [d.b, d.a],
    ] as const) {
      const m: DuelMsg = { phase, foe: foe.sid, name: foe.char.name, at: phase === 'count' ? d.fightAt : d.endAt };
      if (phase === 'end') {
        m.won = won === me;
        m.why = why;
      }
      try {
        me.client.send(S.DUEL, m);
      } catch {
        /* ngắt kết nối */
      }
    }
  }

  /** Mỗi tick: bắt đầu đánh, hết giờ, ra khỏi võ đài, đối thủ rời đi. */
  tick(): void {
    const now = this.h.now();
    for (const [id, inv] of this.invites) {
      if (inv.until <= now) {
        this.invites.delete(id);
        for (const o of this.h.players()) {
          if (o.char.id === id)
            o.client.send(S.INVITE, {
              kind: 'duel',
              id: inv.from.char.id,
              name: inv.from.char.name,
              until: inv.until,
              gone: true,
            } satisfies InviteMsg);
        }
      }
    }
    const seen = new Set<Duel>();
    for (const d of this.bySid.values()) {
      if (seen.has(d) || d.over) continue;
      seen.add(d);
      if (!this.alive(d.a) || !this.alive(d.b)) {
        this.finish(d, null, 'abort');
        continue;
      }
      if (now >= d.fightAt && !d.fought) {
        d.fought = true;
        this.notify(d, 'fight');
      }
      if (now >= d.endAt) {
        this.finish(d, null, 'timeout');
        continue;
      }
      for (const x of [d.a, d.b]) {
        if ((x.s.fl & PF_DEAD) !== 0) {
          this.finish(d, null, 'abort');
          break;
        }
        if (inArena(x.move.x, x.move.z, DUEL_LEAVE_MARGIN) && !x.move.flying) {
          d.leaveSince.delete(x.sid);
        } else {
          const since = d.leaveSince.get(x.sid) ?? now;
          d.leaveSince.set(x.sid, since);
          if (now - since >= DUEL_LEAVE_GRACE_MS) {
            this.finish(d, x === d.a ? d.b : d.a, 'leave');
            break;
          }
        }
      }
    }
  }

  /**
   * Người chơi rời room (`dead` = false) hoặc chết thật do quái (`dead` = true): hủy trận, không ai thắng.
   * Người rời room vẫn được trả máu/linh lực như trước trận (trước khi lưu), nếu không mở trận rồi thoát
   * sẽ thành cách hồi đầy miễn phí. Chỉ người chết thật bỏ qua (cái chết tính như thường).
   */
  onGone(p: PlayerEnt, dead = false): void {
    const d = this.bySid.get(p.sid);
    if (d && !d.over) this.finish(d, null, 'abort', dead ? p : undefined);
    this.invites.delete(p.char.id);
    for (const [id, inv] of this.invites) if (inv.from === p) this.invites.delete(id);
  }

  /**
   * Kết thúc trận. `winner` null = hòa/hủy. Trả lại máu/linh lực như trước trận
   * (trừ `skipRestore`: người vừa chết thật hoặc rời room, trạng thái của họ do nơi khác lo).
   */
  finish(d: Duel, winner: PlayerEnt | null, why: DuelEnd, skipRestore?: PlayerEnt): void {
    if (d.over) return;
    d.over = true;
    for (const x of [d.a, d.b]) {
      this.bySid.delete(x.sid);
      this.h.setFlag(x, PF_DUEL, false);
      const s = d.snap.get(x.sid);
      // Đang độ kiếp/tâm ma (phòng hờ): không ghi đè máu, thử thách phải tự vượt.
      if (s && x !== skipRestore && (x.s.fl & PF_DEAD) === 0 && !x.trib && !x.trial) {
        x.char.hp = Math.min(x.char.mhp, Math.max(1, s.hp));
        x.char.mp = Math.min(x.char.mmp, s.mp);
        x.lastCombatAt = 0;
      }
    }
    parties.setPairCooldown('duel', d.a.char.id, d.b.char.id, DUEL_PAIR_COOLDOWN_MS);
    parties.setPairCooldown('duel', d.b.char.id, d.a.char.id, DUEL_PAIR_COOLDOWN_MS);
    this.notify(d, 'end', winner ?? undefined, why);
    // M-5: trận đã đánh thật (đã qua đếm ngược) thì cả hai tính là đã tỉ thí, thắng thua đều được.
    if (d.fought && (why === 'win' || why === 'yield' || why === 'timeout'))
      for (const x of [d.a, d.b]) this.h.questEvent(x, 'duel', undefined, 1);
    if (winner) {
      const loser = winner === d.a ? d.b : d.a;
      for (const x of [winner, loser])
        this.h.sys(
          x,
          x === winner ? 'duel.win' : 'duel.lose',
          { name: (x === winner ? loser : winner).char.name },
          x === winner ? 'good' : 'info',
        );
    } else {
      for (const x of [d.a, d.b]) this.h.sys(x, why === 'timeout' ? 'duel.timeout' : 'duel.abort');
    }
  }

  /** Gọi sau mỗi đòn trúng: hết máu (còn 1) thì người đánh thắng. Trả true nếu trận vừa kết thúc. */
  afterHit(attacker: PlayerEnt, victim: PlayerEnt): boolean {
    const d = this.bySid.get(victim.sid);
    if (!d || d.over) return false;
    if (victim.char.hp <= 1) {
      this.finish(d, attacker, 'win');
      return true;
    }
    return false;
  }
}
