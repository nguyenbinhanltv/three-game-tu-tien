import {
  hasResonance,
  INVITE_GAP_MS,
  INVITE_PAIR_COOLDOWN_MS,
  INVITE_PENDING_MAX,
  INVITE_PER_MIN,
  INVITE_TTL_MS,
  type InviteMsg,
  type LootMode,
  type MethodRole,
  type PartyCmd,
  PARTY_MAX,
  PARTY_OFFLINE_GRACE_MS,
  type PartyMember,
  type PartyMsg,
  PF_DEAD,
  RESONANCE_RANGE,
  S,
  CHAT_MAX_LEN,
} from '@dtl/shared';
import { methodOf } from './method';
import type { PlayerEnt } from './entities';

/** Tổ đội: sống ở cấp tiến trình (qua mọi room và bí cảnh), không lưu DB (khởi động lại server thì giải tán). */
export class Party {
  members: number[] = [];
  leader = 0;
  loot: LootMode = 'turn';
  /** Chỉ số thành viên vừa nhận đồ ở lượt trước (chia đồ theo lượt). */
  lastTurn = -1;
  constructor(readonly id: number) {}
}

interface Pending {
  from: number;
  fromName: string;
  until: number;
}

interface Entry {
  p: PlayerEnt;
  /** Danh tính room đang giữ người này (so sánh `===` để biết cùng room). */
  room: object;
}

export class PartyManager {
  private nextId = 1;
  private byChar = new Map<number, Party>();
  private reg = new Map<number, Entry>();
  /** Thành viên đang ngoại tuyến → giờ bắt đầu. */
  private offline = new Map<number, number>();
  private invites = new Map<number, Pending[]>();
  private pairCd = new Map<string, number>();
  private rate = new Map<number, { last: number; times: number[] }>();
  private sayAt = new Map<number, number>();
  /** Đổi được để test; mặc định đồng hồ thật. */
  now = () => Date.now();

  // ---------- đăng ký người chơi đang ở trong một room ----------

  attach(p: PlayerEnt, room: object): void {
    this.reg.set(p.char.id, { p, room });
    this.offline.delete(p.char.id);
    const party = this.byChar.get(p.char.id);
    if (party) this.sendState(party);
    else this.send(p, S.PARTY, null);
  }

  /** Người chơi rời room (chuyển room, mất kết nối, thoát). Giữ chỗ trong tổ đội tới hết thời gian chờ. */
  detach(p: PlayerEnt): void {
    const cur = this.reg.get(p.char.id);
    if (!cur || cur.p !== p) return;
    this.reg.delete(p.char.id);
    this.dropInvitesOf(p.char.id);
    if (this.byChar.has(p.char.id)) this.offline.set(p.char.id, this.now());
    const party = this.byChar.get(p.char.id);
    if (party) this.sendState(party);
  }

  isOnline(charId: number): boolean {
    return this.reg.has(charId);
  }

  partyOf(charId: number): Party | undefined {
    return this.byChar.get(charId);
  }

  /** Hai người cùng tổ đội? */
  same(a: number, b: number): boolean {
    const pa = this.byChar.get(a);
    return !!pa && pa === this.byChar.get(b);
  }

  /** Thành viên (kể cả mình) đang ở cùng room với `room`, còn kết nối. */
  matesInRoom(charId: number, room: object): PlayerEnt[] {
    const party = this.byChar.get(charId);
    if (!party) return [];
    const out: PlayerEnt[] = [];
    for (const id of party.members) {
      const e = this.reg.get(id);
      if (e && e.room === room) out.push(e.p);
    }
    return out;
  }

  // ---------- cộng hưởng ----------

  roleOf(p: PlayerEnt): MethodRole | '' {
    return methodOf(p.char.meta)?.role ?? '';
  }

  /** Cộng hưởng của `p`: các thành viên còn sống ở cùng room, trong tầm của p, gồm đủ 3 vai trò. */
  resonance(p: PlayerEnt): boolean {
    const e = this.reg.get(p.char.id);
    if (!e || !this.byChar.has(p.char.id)) return false;
    const roles: MethodRole[] = [];
    for (const o of this.matesInRoom(p.char.id, e.room)) {
      if ((o.s.fl & PF_DEAD) !== 0 || o.trib || o.trial) continue;
      if (o !== p && Math.hypot(o.move.x - p.move.x, o.move.z - p.move.z) > RESONANCE_RANGE) continue;
      const r = this.roleOf(o);
      if (r) roles.push(r);
    }
    return hasResonance(roles);
  }

  // ---------- thao tác ----------

  command(p: PlayerEnt, msg: unknown): void {
    const m = msg as Partial<PartyCmd> | null;
    if (!m || typeof m !== 'object' || typeof m.a !== 'string') return;
    switch (m.a) {
      case 'inv':
        return this.invite(p, (m as { n?: unknown }).n);
      case 'acc':
        return this.accept(p, (m as { id?: unknown }).id);
      case 'dec':
        return this.decline(p, (m as { id?: unknown }).id);
      case 'leave':
        return this.leave(p.char.id, 'leave');
      case 'kick':
        return this.kick(p, (m as { id?: unknown }).id);
      case 'lead':
        return this.handover(p, (m as { id?: unknown }).id);
      case 'loot': {
        const mode = (m as { m?: unknown }).m;
        return this.setLoot(p, mode);
      }
      case 'say':
        return this.say(p, (m as { m?: unknown }).m);
    }
  }

  private msg(p: PlayerEnt, k: string, params?: Record<string, string | number>, type = 'info'): void {
    this.send(p, S.SYS, params ? { k, p: params, t: type } : { k, t: type });
  }

  private send(p: PlayerEnt, type: string, payload: unknown): void {
    try {
      p.client.send(type, payload);
    } catch {
      /* client đã đóng: bỏ qua */
    }
  }

  private findByName(name: string): PlayerEnt | null {
    const want = name.trim().toLowerCase();
    for (const e of this.reg.values()) if (e.p.char.name.toLowerCase() === want) return e.p;
    return null;
  }

  private pending(target: number): Pending[] {
    const now = this.now();
    const list = (this.invites.get(target) ?? []).filter((i) => i.until > now);
    this.invites.set(target, list);
    return list;
  }

  /** Chống spam: 1 lời mời / 2 giây, tối đa 8 / phút mỗi người gửi. Trả false nếu vượt. */
  rateOk(charId: number): boolean {
    const now = this.now();
    const r = this.rate.get(charId) ?? { last: 0, times: [] };
    r.times = r.times.filter((t) => now - t < 60_000);
    if (now - r.last < INVITE_GAP_MS || r.times.length >= INVITE_PER_MIN) {
      this.rate.set(charId, r);
      return false;
    }
    r.last = now;
    r.times.push(now);
    this.rate.set(charId, r);
    return true;
  }

  /** Cooldown theo cặp (người gửi → người nhận) cho cả lời mời tổ đội lẫn tỉ thí (khóa `kind`). */
  pairBlocked(kind: string, from: number, to: number): boolean {
    return (this.pairCd.get(`${kind}:${from}:${to}`) ?? 0) > this.now();
  }

  setPairCooldown(kind: string, from: number, to: number, ms: number): void {
    this.pairCd.set(`${kind}:${from}:${to}`, this.now() + ms);
  }

  private invite(p: PlayerEnt, rawName: unknown): void {
    if (typeof rawName !== 'string' || rawName.length > 40) return;
    const me = p.char.id;
    const mine = this.byChar.get(me);
    if (mine && mine.leader !== me) return this.msg(p, 'party.not_leader', undefined, 'bad');
    if (mine && mine.members.length >= PARTY_MAX) return this.msg(p, 'party.full', undefined, 'bad');
    const target = this.findByName(rawName);
    if (!target || target === p) return this.msg(p, 'party.no_such', undefined, 'bad');
    if (!this.rateOk(me)) return this.msg(p, 'party.invite_rate', undefined, 'bad');
    const tid = target.char.id;
    if (this.byChar.has(tid)) return this.msg(p, 'party.target_busy', { name: target.char.name }, 'bad');
    if (this.pairBlocked('party', me, tid)) return this.msg(p, 'party.pair_cd', { name: target.char.name }, 'bad');
    const list = this.pending(tid);
    if (list.some((i) => i.from === me)) return this.msg(p, 'party.already_invited', { name: target.char.name }, 'bad');
    if (list.length >= INVITE_PENDING_MAX) return this.msg(p, 'party.target_busy', { name: target.char.name }, 'bad');
    const until = this.now() + INVITE_TTL_MS;
    list.push({ from: me, fromName: p.char.name, until });
    const out: InviteMsg = { kind: 'party', id: me, name: p.char.name, until };
    this.send(target, S.INVITE, out);
    this.msg(p, 'party.invited', { name: target.char.name });
  }

  private takeInvite(target: number, from: number): Pending | null {
    const list = this.pending(target);
    const i = list.findIndex((x) => x.from === from);
    if (i < 0) return null;
    return list.splice(i, 1)[0];
  }

  private accept(p: PlayerEnt, rawId: unknown): void {
    if (typeof rawId !== 'number' || !Number.isInteger(rawId)) return;
    const me = p.char.id;
    const inv = this.takeInvite(me, rawId);
    if (!inv) return this.msg(p, 'party.invite_gone', undefined, 'bad');
    if (this.byChar.has(me)) return this.msg(p, 'party.you_busy', undefined, 'bad');
    const host = this.reg.get(rawId)?.p;
    if (!host) return this.msg(p, 'party.invite_gone', undefined, 'bad');
    let party = this.byChar.get(rawId);
    if (party && party.leader !== rawId) return this.msg(p, 'party.invite_gone', undefined, 'bad');
    if (party && party.members.length >= PARTY_MAX) return this.msg(p, 'party.full', undefined, 'bad');
    if (!party) {
      party = new Party(this.nextId++);
      party.members.push(rawId);
      party.leader = rawId;
      this.byChar.set(rawId, party);
    }
    party.members.push(me);
    this.byChar.set(me, party);
    this.broadcastMsg(party, 'party.joined', { name: p.char.name });
    this.sendState(party);
  }

  private decline(p: PlayerEnt, rawId: unknown): void {
    if (typeof rawId !== 'number') return;
    const inv = this.takeInvite(p.char.id, rawId);
    if (!inv) return;
    this.setPairCooldown('party', rawId, p.char.id, INVITE_PAIR_COOLDOWN_MS);
    const host = this.reg.get(rawId)?.p;
    if (host) this.msg(host, 'party.declined', { name: p.char.name }, 'bad');
  }

  /** Rời tổ đội (tự rời, bị đuổi, quá hạn ngoại tuyến). */
  leave(charId: number, why: 'leave' | 'kick' | 'timeout'): void {
    const party = this.byChar.get(charId);
    if (!party) return;
    const who = this.reg.get(charId)?.p;
    const name = who?.char.name ?? '';
    party.members = party.members.filter((m) => m !== charId);
    this.byChar.delete(charId);
    this.offline.delete(charId);
    if (who) {
      this.send(who, S.PARTY, null);
      this.msg(who, why === 'kick' ? 'party.you_kicked' : 'party.you_left', undefined, why === 'kick' ? 'bad' : 'info');
    }
    if (party.members.length <= 1) return this.disband(party);
    if (party.leader === charId) {
      party.leader = party.members[0];
      const nl = this.reg.get(party.leader)?.p;
      this.broadcastMsg(party, 'party.new_leader', { name: nl?.char.name ?? '' });
    }
    if (name) this.broadcastMsg(party, why === 'kick' ? 'party.kicked' : 'party.left', { name });
    party.lastTurn = -1;
    this.sendState(party);
  }

  private disband(party: Party): void {
    for (const id of party.members) {
      this.byChar.delete(id);
      this.offline.delete(id);
      const e = this.reg.get(id);
      if (e) {
        this.send(e.p, S.PARTY, null);
        this.msg(e.p, 'party.disbanded');
      }
    }
    party.members = [];
  }

  private kick(p: PlayerEnt, rawId: unknown): void {
    if (typeof rawId !== 'number') return;
    const party = this.byChar.get(p.char.id);
    if (!party || party.leader !== p.char.id) return this.msg(p, 'party.not_leader', undefined, 'bad');
    if (rawId === p.char.id || !party.members.includes(rawId)) return;
    this.leave(rawId, 'kick');
  }

  private handover(p: PlayerEnt, rawId: unknown): void {
    if (typeof rawId !== 'number') return;
    const party = this.byChar.get(p.char.id);
    if (!party || party.leader !== p.char.id) return this.msg(p, 'party.not_leader', undefined, 'bad');
    if (rawId === p.char.id || !party.members.includes(rawId) || !this.reg.has(rawId)) return;
    party.leader = rawId;
    this.broadcastMsg(party, 'party.new_leader', { name: this.reg.get(rawId)!.p.char.name });
    this.sendState(party);
  }

  private setLoot(p: PlayerEnt, mode: unknown): void {
    if (mode !== 'turn' && mode !== 'free') return;
    const party = this.byChar.get(p.char.id);
    if (!party || party.leader !== p.char.id) return this.msg(p, 'party.not_leader', undefined, 'bad');
    if (party.loot === mode) return;
    party.loot = mode;
    this.broadcastMsg(party, mode === 'turn' ? 'party.loot_turn' : 'party.loot_free');
    this.sendState(party);
  }

  private say(p: PlayerEnt, raw: unknown): void {
    if (typeof raw !== 'string') return;
    const party = this.byChar.get(p.char.id);
    if (!party) return;
    const text = raw
      .replace(/[\u0000-\u001f]/g, ' ')
      .trim()
      .slice(0, CHAT_MAX_LEN);
    if (!text) return;
    const now = this.now();
    if (now - (this.sayAt.get(p.char.id) ?? 0) < 800) return this.msg(p, 'sys.chat_rate', undefined, 'bad');
    this.sayAt.set(p.char.id, now);
    for (const id of party.members) {
      const e = this.reg.get(id);
      if (e) this.send(e.p, S.CHAT, { from: p.char.name, c: 'party', m: text });
    }
  }

  private broadcastMsg(party: Party, k: string, params?: Record<string, string | number>): void {
    for (const id of party.members) {
      const e = this.reg.get(id);
      if (e) this.msg(e.p, k, params);
    }
  }

  // ---------- đồng bộ ----------

  stateFor(party: Party, viewer: PlayerEnt): PartyMsg {
    const members: PartyMember[] = party.members.map((id) => {
      const e = this.reg.get(id);
      const o = e?.p;
      return {
        id,
        sid: o?.sid ?? '',
        name: o?.char.name ?? '',
        lv: o?.char.level ?? 0,
        hp: o ? Math.max(0, Math.ceil(o.char.hp)) : 0,
        mhp: o?.char.mhp ?? 0,
        mp: o ? Math.max(0, Math.floor(o.char.mp)) : 0,
        mmp: o?.char.mmp ?? 0,
        role: o ? this.roleOf(o) : '',
        lead: party.leader === id,
        room: e ? this.roomName(e) : '',
        dead: !!o && (o.s.fl & PF_DEAD) !== 0,
      };
    });
    return { members, loot: party.loot, res: this.resonance(viewer) };
  }

  private roomName(e: Entry): string {
    return (e.room as { roomName?: string }).roomName ?? 'world';
  }

  sendState(party: Party): void {
    for (const id of party.members) {
      const e = this.reg.get(id);
      if (e) this.send(e.p, S.PARTY, this.stateFor(party, e.p));
    }
  }

  /** Gọi mỗi ~500 ms: đẩy máu/linh lực, hết hạn lời mời, đuổi người ngoại tuyến quá lâu. */
  tick(): void {
    const now = this.now();
    for (const [id, since] of [...this.offline]) {
      if (now - since >= PARTY_OFFLINE_GRACE_MS) this.leave(id, 'timeout');
    }
    const seen = new Set<Party>();
    for (const party of this.byChar.values()) {
      if (seen.has(party)) continue;
      seen.add(party);
      this.sendState(party);
    }
    for (const [target, list] of this.invites) {
      const alive = list.filter((i) => i.until > now);
      if (alive.length !== list.length) {
        const e = this.reg.get(target);
        for (const i of list)
          if (i.until <= now && e)
            this.send(e.p, S.INVITE, { kind: 'party', id: i.from, name: i.fromName, until: i.until, gone: true } satisfies InviteMsg);
        for (const i of list) if (i.until <= now) this.setPairCooldown('party', i.from, target, INVITE_PAIR_COOLDOWN_MS);
      }
      if (alive.length) this.invites.set(target, alive);
      else this.invites.delete(target);
    }
    if (this.pairCd.size > 500) for (const [k, v] of this.pairCd) if (v < now) this.pairCd.delete(k);
    if (this.rate.size > 500) for (const [k, v] of this.rate) if (!v.times.length) this.rate.delete(k);
  }

  /** Người mời đi mất thì lời mời của họ không còn hiệu lực. */
  private dropInvitesOf(from: number): void {
    for (const [target, list] of this.invites) {
      const keep = list.filter((i) => i.from !== from);
      if (keep.length !== list.length) {
        const e = this.reg.get(target);
        const gone = list.filter((i) => i.from === from);
        if (e)
          for (const i of gone)
            this.send(e.p, S.INVITE, { kind: 'party', id: i.from, name: i.fromName, until: i.until, gone: true } satisfies InviteMsg);
        this.invites.set(target, keep);
      }
    }
  }

  /** Dùng cho test và kiểm tra: dọn sạch. */
  reset(): void {
    this.byChar.clear();
    this.reg.clear();
    this.offline.clear();
    this.invites.clear();
    this.pairCd.clear();
    this.rate.clear();
    this.sayAt.clear();
  }
}

export const parties = new PartyManager();
