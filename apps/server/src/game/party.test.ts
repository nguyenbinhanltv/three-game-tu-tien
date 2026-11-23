import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { DUEL_ARENA, DUEL_COUNTDOWN_MS, groundAt, INVITE_PENDING_MAX, MS_DEAD, PARTY_MAX, PARTY_OFFLINE_GRACE_MS, S } from '@dtl/shared';

// Tổ đội và tỉ thí (P3-9): server quyết định lời mời, chia tu vi/đồ, cộng hưởng, tỉ thí, và chặn đánh đồng đội.
process.env.DB_FILE = ':memory:';

type Sim = import('./sim').GameSim;
type Ent = import('./sim').PlayerEnt;
let GameSim: typeof import('./sim').GameSim;
let WorldState: typeof import('../state').WorldState;
let Character: typeof import('./character').Character;
let parties: typeof import('./party').parties;
let MONSTER: typeof import('@dtl/content').MONSTER;

beforeAll(async () => {
  ({ GameSim } = await import('./sim'));
  ({ WorldState } = await import('../state'));
  ({ Character } = await import('./character'));
  ({ parties } = await import('./party'));
  ({ MONSTER } = await import('@dtl/content'));
});

afterEach(() => {
  parties.reset();
  parties.now = () => Date.now();
});

const X = DUEL_ARENA.x;
const Z = DUEL_ARENA.z;
let nextAcc = 5000;

interface Sent {
  type: string;
  msg: unknown;
  to: string;
}

function setup() {
  const sent: Sent[] = [];
  const host = { broadcast: (type: string, msg: unknown) => sent.push({ type, msg, to: '*' }), roomName: 'world' };
  const sim: Sim = new GameSim(new WorldState(), host as never, {
    levelId: 'van_lam',
    roomName: 'world',
    spawn: { x: X, z: Z },
    respawn: { x: X, z: Z },
    persistPosition: false,
  });
  const names: string[] = [];
  const join = (name: string, method?: string, lv = 8): Ent => {
    const char = Character.create(nextAcc++, name + nextAcc);
    char.level = lv;
    if (method) char.meta.method = method;
    char.recalc();
    char.hp = char.mhp;
    char.mp = char.mmp;
    const client = { sessionId: 'sid' + name + nextAcc, send: (type: string, msg: unknown) => sent.push({ type, msg, to: char.name }) };
    const p = sim.addPlayer(client as never, char, true, 's' + nextAcc);
    p.move.x = X;
    p.move.z = Z;
    p.move.y = groundAt(X, Z);
    parties.attach(p, host);
    names.push(char.name);
    return p;
  };
  const last = (to: Ent, type: string) =>
    [...sent].reverse().find((s) => s.type === type && s.to === to.char.name)?.msg as Record<string, unknown> | undefined;
  const sys = (to: Ent) => sent.filter((s) => s.type === S.SYS && s.to === to.char.name).map((s) => (s.msg as { k: string }).k);
  const inv = (a: Ent, b: Ent) => parties.command(a, { a: 'inv', n: b.char.name });
  const team = (...ps: Ent[]) => {
    for (const q of ps.slice(1)) {
      parties.now = () => Date.now() + 10_000 * nextAcc++;
      inv(ps[0], q);
      parties.command(q, { a: 'acc', id: ps[0].char.id });
    }
    parties.now = () => Date.now();
  };
  return { sim, sent, join, last, sys, inv, team, host };
}

describe('lập tổ đội', () => {
  it('mời, nhận lời, tối đa 4 người', () => {
    const { join, team, inv, sys } = setup();
    const [a, b, c, d, e] = ['a', 'b', 'c', 'd', 'e'].map((n) => join(n));
    team(a, b, c, d);
    expect(parties.partyOf(a.char.id)!.members.length).toBe(PARTY_MAX);
    parties.now = () => Date.now() + 99_000;
    inv(a, e);
    expect(sys(a)).toContain('party.full');
    expect(parties.partyOf(e.char.id)).toBeUndefined();
  });

  it('nhận lời mà không có lời mời thì không vào được (giả mạo id)', () => {
    const { join } = setup();
    const [a, b] = [join('a'), join('b')];
    parties.command(b, { a: 'acc', id: a.char.id });
    expect(parties.partyOf(b.char.id)).toBeUndefined();
    expect(parties.partyOf(a.char.id)).toBeUndefined();
  });

  it('chỉ trưởng nhóm mời, đuổi, giao quyền, đổi chế độ chia đồ', () => {
    const { join, team, inv, sys } = setup();
    const [a, b, c, d] = [join('a'), join('b'), join('c'), join('d')];
    team(a, b);
    parties.now = () => Date.now() + 99_000;
    inv(b, c);
    expect(sys(b)).toContain('party.not_leader');
    parties.command(b, { a: 'kick', id: a.char.id });
    parties.command(b, { a: 'loot', m: 'free' });
    parties.command(b, { a: 'lead', id: b.char.id });
    expect(parties.partyOf(a.char.id)!.members.length).toBe(2);
    expect(parties.partyOf(a.char.id)!.loot).toBe('turn');
    expect(parties.partyOf(a.char.id)!.leader).toBe(a.char.id);
    parties.command(a, { a: 'loot', m: 'free' });
    expect(parties.partyOf(a.char.id)!.loot).toBe('free');
    parties.command(a, { a: 'loot', m: 'bậy' });
    expect(parties.partyOf(a.char.id)!.loot).toBe('free');
    void d;
  });

  it('chống spam mời: 1 lời mời / 2 giây, giới hạn lời chờ, cooldown sau từ chối, đã mời rồi', () => {
    const { join, inv, sys } = setup();
    const a = join('a');
    const t0 = 1_000_000;
    let now = t0;
    parties.now = () => now;
    const [b, c] = [join('b'), join('c')];
    inv(a, b);
    inv(a, c); // trong 2 giây
    expect(sys(a)).toContain('party.invite_rate');
    now += 2500;
    inv(a, b);
    expect(sys(a)).toContain('party.already_invited');
    // Từ chối → cặp này phải chờ.
    parties.command(b, { a: 'dec', id: a.char.id });
    now += 2500;
    inv(a, b);
    expect(sys(a)).toContain('party.pair_cd');
    // Nhiều người cùng mời một người: tối đa INVITE_PENDING_MAX lời chờ.
    const lone = join('lone');
    const spam = Array.from({ length: INVITE_PENDING_MAX + 2 }, (_, i) => join('s' + i));
    for (const s of spam) {
      now += 2500;
      inv(s, lone);
    }
    const pend = (parties as unknown as { pending(id: number): unknown[] }).pending(lone.char.id);
    expect(pend.length).toBe(INVITE_PENDING_MAX);
  });

  it('quá 8 lời mời mỗi phút thì chặn', () => {
    const { join, inv, sys } = setup();
    const a = join('a');
    let now = 5_000_000;
    parties.now = () => now;
    const targets = Array.from({ length: 10 }, (_, i) => join('t' + i));
    for (const t of targets) {
      now += 2100;
      inv(a, t);
    }
    expect(sys(a).filter((k) => k === 'party.invite_rate').length).toBeGreaterThan(0);
  });

  it('lời mời hết hạn thì không nhận được nữa', () => {
    const { join, inv } = setup();
    const [a, b] = [join('a'), join('b')];
    let now = 9_000_000;
    parties.now = () => now;
    inv(a, b);
    now += 31_000;
    parties.command(b, { a: 'acc', id: a.char.id });
    expect(parties.partyOf(b.char.id)).toBeUndefined();
  });

  it('rời tổ đội: trưởng nhóm chuyển người kế, còn 1 người thì giải tán', () => {
    const { join, team } = setup();
    const [a, b, c] = [join('a'), join('b'), join('c')];
    team(a, b, c);
    parties.command(a, { a: 'leave' });
    expect(parties.partyOf(b.char.id)!.leader).toBe(b.char.id);
    parties.command(c, { a: 'leave' });
    expect(parties.partyOf(b.char.id)).toBeUndefined();
  });

  it('ngoại tuyến quá hạn thì bị mời ra, quay lại kịp thì giữ chỗ', () => {
    const { join, team } = setup();
    const [a, b, c] = [join('a'), join('b'), join('c')];
    team(a, b, c);
    let now = Date.now();
    parties.now = () => now;
    parties.detach(b);
    now += PARTY_OFFLINE_GRACE_MS - 1000;
    parties.tick();
    expect(parties.partyOf(b.char.id)).toBeDefined();
    parties.attach(b, {});
    now += PARTY_OFFLINE_GRACE_MS * 2;
    parties.tick();
    expect(parties.partyOf(b.char.id)).toBeDefined();
    parties.detach(c);
    now += PARTY_OFFLINE_GRACE_MS + 1000;
    parties.tick();
    expect(parties.partyOf(c.char.id)).toBeUndefined();
  });
});

describe('qua room bí cảnh', () => {
  it('rời room thế giới rồi vào room bí cảnh vẫn giữ tổ đội và vẫn tính đồng đội cùng room', () => {
    const { join, team, host } = setup();
    const [a, b] = [join('a'), join('b')];
    team(a, b);
    // a chuyển sang room khác (bí cảnh): detach rồi attach với room mới.
    const dungeon = { roomName: 'dungeon' };
    parties.detach(a);
    expect(parties.partyOf(a.char.id)).toBeDefined();
    parties.attach(a, dungeon);
    expect(parties.partyOf(a.char.id)!.members.length).toBe(2);
    expect(parties.matesInRoom(a.char.id, dungeon)).toEqual([a]);
    expect(parties.matesInRoom(a.char.id, host)).toEqual([b]);
    parties.attach(b, dungeon);
    expect(parties.matesInRoom(a.char.id, dungeon).length).toBe(2);
  });
});

describe('cộng hưởng vai trò', () => {
  it('chỉ có khi đủ Kiếm tu, Hộ pháp, Đan sư đứng gần nhau', () => {
    const { join, team } = setup();
    const a = join('a', 'lac_kiem_quyet');
    const b = join('b', 'bat_dong_kim_than');
    const c = join('c', 'thanh_moc_dan_kinh');
    team(a, b, c);
    expect(parties.resonance(a)).toBe(true);
    expect(parties.resonance(c)).toBe(true);
    c.move.x += 200;
    expect(parties.resonance(a)).toBe(false);
    c.move.x -= 200;
    parties.command(c, { a: 'leave' });
    expect(parties.resonance(a)).toBe(false);
  });
});

describe('chia tu vi, đồ, nhiệm vụ khi hạ quái', () => {
  const kill = (sim: Sim, dealer: Ent, x = X + 4, z = Z) => {
    const m = sim.spawnMonster(MONSTER.get('mon_soi_xam')!, 8, x, z, null);
    m.threat.set(dealer.sid, m.s.mhp);
    m.s.hp = 1;
    (sim as unknown as { damageMonster(m: unknown, d: number, p: Ent): void }).damageMonster(m, 5, dealer);
    expect(m.state).toBe(MS_DEAD);
  };

  it('đồng đội gần cũng được tu vi dù không ra đòn; người đứng xa thì không', () => {
    const { sim, join, team } = setup();
    const [a, b, c] = [join('a'), join('b'), join('c')];
    team(a, b, c);
    c.move.x = X + 500;
    const xp0 = [a, b, c].map((p) => p.char.xp);
    kill(sim, a);
    expect(a.char.xp).toBeGreaterThan(xp0[0]);
    expect(b.char.xp).toBeGreaterThan(xp0[1]);
    expect(c.char.xp).toBe(xp0[2]);
  });

  it('thành viên ra đòn rồi lùi ra ngoài 45 m không né được phần chia để nhận trọn', () => {
    const { sim, join, team } = setup();
    const [a, b] = [join('a'), join('b')];
    team(a, b);
    const m = sim.spawnMonster(MONSTER.get('mon_soi_xam')!, 8, X + 4, Z, null);
    m.threat.set(a.sid, m.s.mhp);
    m.threat.set(b.sid, m.s.mhp);
    b.move.x = X + 70;
    const spy = vi.spyOn((sim as unknown as { monSys: { rollLoot(p: Ent, m: unknown, part?: string): void } }).monSys, 'rollLoot');
    const xb = b.char.xp;
    const xa = a.char.xp;
    m.s.hp = 1;
    (sim as unknown as { damageMonster(m: unknown, d: number, p: Ent): void }).damageMonster(m, 5, a);
    expect(b.char.xp).toBe(xb);
    expect(spy.mock.calls.every((c) => (c[0] as Ent) === a)).toBe(true);
    // Người kết liễu (một mình trong tầm) nhận phần chia của nhóm một người, không hơn.
    expect(a.char.xp - xa).toBeLessThanOrEqual(Math.round(12 + 7 * 8) * 1.3);
  });

  it('không tổ đội: chỉ người ra đòn nhận (hành vi cũ giữ nguyên)', () => {
    const { sim, join } = setup();
    const [a, b] = [join('a'), join('b')];
    const xp = b.char.xp;
    kill(sim, a);
    expect(b.char.xp).toBe(xp);
  });

  it('chia đồ theo lượt: một người nhận đồ, mọi người nhận linh thạch, lượt xoay vòng', () => {
    const { sim, join, team } = setup();
    const [a, b] = [join('a'), join('b')];
    team(a, b);
    const spy = vi.spyOn((sim as unknown as { monSys: { rollLoot(p: Ent, m: unknown, part?: string): void } }).monSys, 'rollLoot');
    kill(sim, a);
    kill(sim, a);
    const calls = spy.mock.calls.map((c) => `${(c[0] as Ent).char.name === a.char.name ? 'a' : 'b'}:${c[2] ?? 'all'}`);
    expect(calls.filter((x) => x.endsWith(':all')).length).toBe(2);
    expect(calls.filter((x) => x.endsWith(':gold')).length).toBe(2);
    const winners = spy.mock.calls.filter((c) => c[2] !== 'gold').map((c) => (c[0] as Ent).char.name);
    expect(new Set(winners).size).toBe(2);
  });

  it('chế độ tự do: ai cũng tự nhận phần đầy đủ', () => {
    const { sim, join, team } = setup();
    const [a, b] = [join('a'), join('b')];
    team(a, b);
    parties.command(a, { a: 'loot', m: 'free' });
    const spy = vi.spyOn((sim as unknown as { monSys: { rollLoot(p: Ent, m: unknown, part?: string): void } }).monSys, 'rollLoot');
    kill(sim, a);
    expect(spy.mock.calls.map((c) => c[2] ?? 'all')).toEqual(['all', 'all']);
  });
});

describe('không đánh đồng đội ngoài tỉ thí', () => {
  const FOE_HP = (p: Ent) => p.char.hp;

  it('chiêu nhắm đồng đội hoặc người lạ không gây sát thương', () => {
    const { sim, join, team } = setup();
    const [a, b, c] = [join('a'), join('b'), join('c')];
    team(a, b);
    for (const tgt of [b, c]) {
      const hp = FOE_HP(tgt);
      a.gcdAt = 0;
      sim.onSkill(a, { id: 'skl_phi_kiem', t: tgt.sid });
      expect(FOE_HP(tgt)).toBe(hp);
    }
  });

  it('chiêu diện rộng không chạm người chơi', () => {
    const { sim, join, team } = setup();
    const [a, b] = [join('a', undefined, 12), join('b')];
    team(a, b);
    const m = sim.spawnMonster(MONSTER.get('mon_soi_xam')!, 8, X + 3, Z, null);
    m.s.hp = m.s.mhp = 1_000_000;
    const hp = b.char.hp;
    a.gcdAt = 0;
    sim.onSkill(a, { id: 'skl_kiem_khi_tram', t: m.id });
    expect(b.char.hp).toBe(hp);
  });
});

describe('tỉ thí', () => {
  const duelUp = (s: ReturnType<typeof setup>) => {
    const a = s.join('a', undefined, 12);
    const b = s.join('b', undefined, 12);
    s.sim.duel.command(a, { a: 'inv', n: b.char.name });
    s.sim.duel.command(b, { a: 'acc', id: a.char.id });
    return { a, b };
  };
  const hit = (s: ReturnType<typeof setup>, from: Ent, to: Ent, n = 1) => {
    for (let i = 0; i < n; i++) {
      from.gcdAt = 0;
      from.cds.clear();
      from.char.mp = from.char.mmp;
      s.sim.onSkill(from, { id: 'skl_phi_kiem', t: to.sid });
      // K-2: đòn thường áp tại hitAt; xả đòn chờ ngay để kiểm hiệu quả.
      const st = from.flow.pending;
      if (st) {
        st.at = s.sim.now;
        (s.sim as unknown as { resolvePending(p: Ent): void }).resolvePending(from);
      }
    }
  };
  const startFight = (s: ReturnType<typeof setup>) => {
    s.sim.now += DUEL_COUNTDOWN_MS + 50;
    s.sim.duel.tick();
  };

  it('chỉ mời được khi cả hai đứng trong võ đài', () => {
    const s = setup();
    const a = s.join('a');
    const b = s.join('b');
    b.move.x = X + DUEL_ARENA.r + 40;
    s.sim.duel.command(a, { a: 'inv', n: b.char.name });
    expect(s.sys(a)).toContain('duel.target_busy');
    a.move.x = X + DUEL_ARENA.r + 40;
    s.sim.now += 1000; // warn có giới hạn 700 ms
    s.sim.duel.command(a, { a: 'inv', n: b.char.name });
    expect(s.sys(a)).toContain('duel.not_in_arena');
  });

  it('nhận lời giả mạo hoặc không có lời mời thì không bắt đầu', () => {
    const s = setup();
    const [a, b] = [s.join('a'), s.join('b')];
    s.sim.duel.command(b, { a: 'acc', id: a.char.id });
    expect(s.sim.duel.inDuel(a)).toBe(false);
    expect(s.sim.duel.inDuel(b)).toBe(false);
  });

  it('đếm ngược chưa được đánh; đánh được sau đó, không xuống dưới 1 máu, thắng thì kết thúc rõ ràng', () => {
    const s = setup();
    const { a, b } = duelUp(s);
    expect(s.sim.duel.inDuel(a) && s.sim.duel.inDuel(b)).toBe(true);
    const hp0 = b.char.hp;
    hit(s, a, b);
    expect(b.char.hp).toBe(hp0);
    startFight(s);
    hit(s, a, b);
    expect(b.char.hp).toBeLessThan(hp0);
    // Đánh tới khi một bên cạn máu: trận kết thúc, người thua còn ≥1 máu.
    b.char.hp = 3;
    hit(s, a, b);
    expect(s.sim.duel.inDuel(a)).toBe(false);
    expect(b.char.hp).toBeGreaterThanOrEqual(1);
    expect((b.s.fl & 2) === 0).toBe(true);
    expect(s.last(a, S.DUEL)).toMatchObject({ phase: 'end', won: true, why: 'win' });
    expect(s.last(b, S.DUEL)).toMatchObject({ phase: 'end', won: false });
  });

  it('không thưởng gì: không tu vi, không linh thạch, không mất máu/linh lực sau trận', () => {
    const s = setup();
    const { a, b } = duelUp(s);
    // Máu trước trận được trả lại sau trận.
    const before = { hp: a.char.hp, mp: a.char.mp, xp: a.char.xp, gold: a.char.gold };
    startFight(s);
    hit(s, b, a, 3);
    hit(s, a, b, 3);
    s.sim.duel.command(a, { a: 'yield' });
    expect(a.char.hp).toBe(before.hp);
    expect(a.char.mp).toBe(before.mp);
    expect(a.char.xp).toBe(before.xp);
    expect(a.char.gold).toBe(before.gold);
    expect(b.char.xp).toBe(0);
    expect(s.sim.duel.inDuel(b)).toBe(false);
  });

  it('né (khung bất tử) miễn cả đòn tỉ thí; hết khung thì trúng lại', () => {
    const s = setup();
    const { a, b } = duelUp(s);
    startFight(s);
    a.dodgeUntil = s.sim.now + 450;
    const hp = a.char.hp;
    hit(s, b, a, 3);
    expect(a.char.hp).toBe(hp);
    a.dodgeUntil = 0;
    hit(s, b, a, 3);
    expect(a.char.hp).toBeLessThan(hp);
  });

  it('người thứ ba không đánh được người đang tỉ thí, cũng không hồi máu cho họ', () => {
    const s = setup();
    const { a, b } = duelUp(s);
    const c = s.join('c', undefined, 12);
    startFight(s);
    const hp = a.char.hp;
    hit(s, c, a);
    expect(a.char.hp).toBe(hp);
    hit(s, a, c);
    expect(c.char.hp).toBe(c.char.mhp);
    expect((s.sim as unknown as { canAssist(p: Ent, o: Ent): boolean }).canAssist(c, b)).toBe(false);
  });

  it('ra khỏi võ đài quá lâu thì thua; đối thủ rời room thì hủy', () => {
    const s = setup();
    const { a, b } = duelUp(s);
    startFight(s);
    a.move.x = X + DUEL_ARENA.r + 100;
    s.sim.duel.tick();
    s.sim.now += 5000;
    s.sim.duel.tick();
    expect(s.sim.duel.inDuel(a)).toBe(false);
    expect(s.last(b, S.DUEL)).toMatchObject({ phase: 'end', won: true, why: 'leave' });
    const s2 = setup();
    const d2 = duelUp(s2);
    s2.sim.removePlayer(d2.a.sid);
    expect(s2.sim.duel.inDuel(d2.b)).toBe(false);
  });

  it('thoát giữa trận không giữ máu/linh lực đầy (không thành cách hồi miễn phí)', () => {
    const s = setup();
    const a = s.join('a', undefined, 12);
    const b = s.join('b', undefined, 12);
    a.char.hp = 40;
    a.char.mp = 5;
    s.sim.duel.command(a, { a: 'inv', n: b.char.name });
    s.sim.duel.command(b, { a: 'acc', id: a.char.id });
    expect(a.char.hp).toBe(a.char.mhp);
    s.sim.removePlayer(a.sid);
    expect(a.char.hp).toBe(40);
    expect(a.char.mp).toBe(5);
    expect(s.sim.duel.inDuel(b)).toBe(false);
  });

  it('đang tỉ thí không mở được tâm ma hay độ kiếp', () => {
    const s = setup();
    const { a } = duelUp(s);
    a.char.level = 15;
    a.char.xp = 1e9;
    s.sim.onBreakthrough(a);
    s.sim.onBottleneck(a, { m: 'trial' });
    expect(a.trib).toBeNull();
    expect(a.trial).toBeNull();
    expect(s.sys(a)).toContain('duel.busy');
  });

  it('trong trận không đổi trang bị hay dùng đan dược', () => {
    const s = setup();
    const { a } = duelUp(s);
    s.sim.onUse(a, { slot: 0 });
    s.sim.onEquip(a, { slot: 0 });
    expect(s.sys(a)).toContain('duel.no_items');
  });

  it('cùng một cặp phải nghỉ giữa hai trận', () => {
    const s = setup();
    const { a, b } = duelUp(s);
    startFight(s);
    s.sim.duel.command(a, { a: 'yield' });
    s.sim.duel.command(a, { a: 'inv', n: b.char.name });
    s.sim.duel.command(b, { a: 'acc', id: a.char.id });
    expect(s.sim.duel.inDuel(a)).toBe(false);
  });
});

describe('buff đồng đội trong khung tổ đội (U9)', () => {
  it('tổ đội gửi buff đan đang có hiệu lực của từng người, hết hạn thì bỏ', () => {
    const { join, team, last } = setup();
    const [a, b] = [join('a'), join('b')];
    team(a, b);
    b.char.meta.buffs = { atk: { m: 0.2, until: Date.now() + 60_000 } };
    parties.sendState(parties.partyOf(a.char.id)!);
    const msg = last(a, S.PARTY) as { members: { id: number; bf?: Record<string, [number, number]> }[] };
    const mb = msg.members.find((m) => m.id === b.char.id)!;
    expect(mb.bf?.atk?.[0]).toBeCloseTo(0.2);
    expect(msg.members.find((m) => m.id === a.char.id)!.bf).toBeUndefined();
    b.char.meta.buffs = { atk: { m: 0.2, until: Date.now() - 1 } };
    parties.sendState(parties.partyOf(a.char.id)!);
    const msg2 = last(a, S.PARTY) as { members: { id: number; bf?: unknown }[] };
    expect(msg2.members.find((m) => m.id === b.char.id)!.bf).toBeUndefined();
  });
});
