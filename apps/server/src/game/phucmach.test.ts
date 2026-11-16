import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { groundAt, MS_CHASE, MS_DEAD, PF_DEAD, S, xpNeed, type HazardMsg, type TransferMsg } from '@dtl/shared';

// E2-C: Phục Mạch Quật. Dữ liệu đợt, vé một lần, room theo dữ liệu (điểm sinh, khóa sau đợt 2, giới hạn hồi sinh), thưởng một lần mỗi
// ngày bằng transaction + idem + ledger, hút mạch của Thôn Mạch (phá chú ngừng hồi) và tự bạo mạch cuối trận.
process.env.DB_FILE = ':memory:';
process.env.AUTH_DEV_BYPASS = '1';

type Ent = import('./sim').PlayerEnt;
type Rooms = typeof import('../rooms');
let GameSim: typeof import('./sim').GameSim;
let WorldState: typeof import('../state').WorldState;
let PlayerS: typeof import('../state').PlayerS;
let Character: typeof import('./character').Character;
let parties: typeof import('./party').parties;
let rooms: Rooms;
let transfer: typeof import('../transfer');
let content: typeof import('@dtl/content');
let dbm: typeof import('../db');

beforeAll(async () => {
  ({ GameSim } = await import('./sim'));
  ({ WorldState, PlayerS } = await import('../state'));
  ({ Character } = await import('./character'));
  ({ parties } = await import('./party'));
  rooms = await import('../rooms');
  transfer = await import('../transfer');
  content = await import('@dtl/content');
  dbm = await import('../db');
});

afterEach(() => {
  vi.restoreAllMocks();
  parties.reset();
  transfer.tickets.clear();
  sent.length = 0;
});

interface Sent {
  type: string;
  msg: unknown;
  to: string;
}
const sent: Sent[] = [];
let acc = 52000;
const LV = 'phuc_mach';
const DEF = () => content.LEVELS[LV];
const keys = (p: Ent) => sent.filter((s) => s.type === S.SYS && s.to === p.char.name).map((s) => (s.msg as { k: string }).k);
const xfers = (p: Ent) => sent.filter((s) => s.type === S.TRANSFER && s.to === p.char.name).map((s) => s.msg as TransferMsg);

function mkChar(name: string, level: number) {
  const char = Character.create(acc++, name + acc);
  char.level = level;
  char.bk = level;
  char.xp = 0;
  char.recalc();
  char.hp = char.mhp;
  char.mp = char.mmp;
  return char;
}

type TestRoom = InstanceType<Rooms['GameRoom']> & { director(): void; onRespawn(p: Ent): void; payReward(): void; wave: number; nextWaveAt: number; clearedAt: number };

/** Dựng room (không qua Colyseus) đủ cho onJoin, director, onRespawn, onPortal. */
async function mkRoom(levelId: string, cls: { prototype: object }) {
  const { Aoi } = await import('../aoi');
  const room = Object.create(cls.prototype) as Record<string, unknown> & { sim: InstanceType<typeof GameSim> };
  const lv = content.LEVELS[levelId];
  const spawn = lv.dungeon?.spawn ?? lv.spawn!;
  room.broadcast = (type: string, msg: unknown) => sent.push({ type, msg, to: '*' });
  room.sim = new GameSim(new WorldState(), room as never, { levelId, roomName: levelId, spawn, respawn: spawn, persistPosition: !lv.dungeon });
  room.aoi = new Aoi(room.sim);
  room.clients = { getById: () => undefined };
  room.markers = { drop() {}, sync() {} };
  room.clock = { setTimeout: () => undefined, setInterval: () => undefined };
  Object.defineProperty(room, 'roomName', { value: levelId });
  const locked = { n: 0 };
  room.lock = () => void locked.n++;
  Object.assign(room, { wave: 0, nextWaveAt: 0, clearedAt: 0, revives: new Map() });
  const join = (char: InstanceType<typeof Character>, auth: Record<string, unknown> = {}): Ent => {
    const c = { sessionId: 'sid' + acc++, send: (type: string, msg: unknown) => sent.push({ type, msg, to: char.name }) };
    (room as unknown as { onJoin(c: unknown, o: unknown, a: unknown): void }).onJoin(c, {}, { accountId: 1, dev: true, charId: char.id, session: 's', ticket: true, ...auth });
    return [...room.sim.players.values()].find((q) => q.char.id === char.id)!;
  };
  return { room: room as unknown as TestRoom, sim: room.sim, join, locked };
}

/** onJoin nạp lại nhân vật từ DB: đặt cấp sau khi vào. */
const prime = (p: Ent, level: number): Ent => {
  p.char.level = level;
  p.char.bk = level;
  p.char.recalc();
  p.char.hp = p.char.mhp;
  return p;
};

describe('dữ liệu Phục Mạch Quật', () => {
  it('năm đợt đúng thiết kế mục 5.1; vào từ Đoạn Mạch, ra về Đoạn Mạch', () => {
    const d = DEF().dungeon!;
    expect(d.minLevel).toBe(17);
    expect(d.returnLevel).toBe('doan_mach');
    expect(d.waves).toHaveLength(5);
    const tally = (i: number) => d.waves[i].mons.map((m) => `${m.id}×${m.n}`);
    expect(tally(0)).toEqual(['mon_khai_mach_khoi_loi×8']);
    expect(tally(1)).toEqual(['mon_mach_thuong_ho_ve×4', 'elite_ho_mach_khoi_tuong×1']);
    expect(d.waves[2].mons.reduce((a, m) => a + m.n, 0)).toBe(10);
    expect(d.waves[2].points).toHaveLength(3);
    expect(d.waves[3].mons[0].id).toBe('boss_thach_tam_khoi_vuong');
    expect(d.waves[4].mons[0].id).toBe('boss_thon_mach_ngo_cong_vuong');
    expect(d.maxRevives).toBe(2);
    expect(content.LEVELS.doan_mach.portals).toContainEqual(expect.objectContaining({ to: LV }));
    expect(rooms.roomNameOf(LV)).toBe('dungeon-phuc_mach');
    expect(d.waves.flatMap((w) => w.mons).map((m) => m.level)).toEqual([18, 18, 18, 18, 18, 18, 18, 19]);
  });

  it('thưởng: 15% tu vi chặng, mảnh cả ba bộ bậc 2, Ngưng Đan Mạch Tinh (nguyên liệu Kết Đan Dịch)', () => {
    const r = DEF().dungeon!.reward!;
    expect(r.xpPct).toBe(0.15);
    expect(r.items.map((i) => i.item)).toContain('itm_ngung_dan_mach_tinh');
    expect(r.equip!.map((e) => e.set).sort()).toEqual(['set_dia_giap', 'set_liet_mach', 'set_phuc_mach']);
  });

  it('boss: Thôn Mạch có hút mạch/chui đất/gọi ấu/vạch dài/tự bạo; Thạch Tâm có tim ngọc (lộ yếu điểm)', () => {
    const b = content.MONSTER.get('boss_thon_mach_ngo_cong_vuong')!;
    expect(b.hpMul).toBe(75);
    expect(b.xpMul).toBe(22);
    expect(b.ai!.chant!.drain).toBeGreaterThan(0);
    expect(b.phases![0].hp).toBe(0.65);
    expect(b.phases![0].ai!.burrow).toMatchObject({ r: 4, n: 3, cone: { r: 14, delay: 1.5 } });
    expect(b.phases![0].ai!.summon).toMatchObject({ mon: 'mon_ngo_cong_au', n: 2 });
    expect(b.phases![1].hp).toBe(0.35);
    expect(b.phases![1].ai!.line).toMatchObject({ r: 22, w: 3, delay: 1.2 });
    expect(b.phases![1].speedMul).toBe(1.15);
    expect(b.phases![2].ai!.chant).toMatchObject({ r: 12 });
    expect(content.MONSTER.get('boss_thach_tam_khoi_vuong')!.ai!.reveal).toBeTruthy();
  });
});

describe('vé và vào room', () => {
  const Dg = () => rooms.defineDungeon(LV) as unknown as { levelId: string; onAuth(t: string, o: unknown): Promise<{ charId: number }> };
  const Home = () => rooms.WorldRoom as unknown as { onAuth(t: string, o: unknown): Promise<{ charId: number }> };

  it('onAuth: không vé bị từ chối; vé của level khác không dùng được và không bị đốt; vé đúng dùng một lần', async () => {
    expect(Dg().levelId).toBe(LV);
    const a = await Home().onAuth('', { dev: 'pmauth' });
    await expect(Dg().onAuth('', { dev: 'pmauth' })).rejects.toThrow(/no_ticket/);
    transfer.tickets.issue(a.charId, 'kiem_trung');
    await expect(Dg().onAuth('', { dev: 'pmauth' })).rejects.toThrow(/no_ticket/);
    expect(transfer.tickets.has(a.charId, 'kiem_trung')).toBe(true);
    transfer.tickets.issue(a.charId, LV, null, undefined, 'k');
    await expect(Dg().onAuth('', { dev: 'pmauth', dgKey: 'k' })).resolves.toMatchObject({ charId: a.charId });
    await expect(Dg().onAuth('', { dev: 'pmauth', dgKey: 'k' })).rejects.toThrow(/no_ticket/);
  });

  it('phó bản riêng: vé đúng level nhưng dgKey thiếu/sai bị no_ticket (vé không bị đốt); đúng khóa thì vào', async () => {
    const a = await Home().onAuth('', { dev: 'pmkey' });
    transfer.tickets.issue(a.charId, LV, null, undefined, 'khoa-nhom');
    await expect(Dg().onAuth('', { dev: 'pmkey' })).rejects.toThrow(/no_ticket/);
    await expect(Dg().onAuth('', { dev: 'pmkey', dgKey: 'khoa-khac' })).rejects.toThrow(/no_ticket/);
    await expect(Dg().onAuth('', { dev: 'pmkey', dgKey: 123 })).rejects.toThrow(/no_ticket/);
    expect(transfer.tickets.has(a.charId, LV)).toBe(true);
    await expect(Dg().onAuth('', { dev: 'pmkey', dgKey: 'khoa-nhom' })).resolves.toMatchObject({ charId: a.charId });
    // vé không mang khóa (cấp kiểu cũ) cũng không vào được phó bản riêng
    transfer.tickets.issue(a.charId, LV);
    await expect(Dg().onAuth('', { dev: 'pmkey', dgKey: 'khoa-nhom' })).rejects.toThrow(/no_ticket/);
  });

  it('cổng Đoạn Mạch: đủ cấp trong tầm mới có vé; đồng đội cùng tổ đội trong tầm được kéo theo cùng khóa room', async () => {
    const w = await mkRoom('doan_mach', rooms.defineWorld('doan_mach'));
    const portal = content.LEVELS.doan_mach.portals![0];
    const lead = prime(w.join(mkChar('pmdan', 19), { ticket: false }), 19);
    const near = prime(w.join(mkChar('pmgan', 18), { ticket: false }), 18);
    const far = prime(w.join(mkChar('pmxa', 18), { ticket: false }), 18);
    const low = prime(w.join(mkChar('pmthap', 12), { ticket: false }), 12);
    for (const m of [lead, near, far, low]) {
      m.move.x = portal.x;
      m.move.z = portal.z;
      m.move.y = groundAt(portal.x, portal.z);
    }
    far.move.x += 200;
    const party = { members: [lead, near, far, low].map((m) => m.char.id), leader: lead.char.id };
    for (const m of [lead, near, far, low]) (parties as unknown as { byChar: Map<number, unknown> }).byChar.set(m.char.id, party);
    lead.move.x += 100; // quá xa cổng
    w.room.onPortal(lead);
    expect(transfer.tickets.has(lead.char.id, LV)).toBe(false);
    lead.move.x -= 100;
    w.room.onPortal(low); // thiếu cấp
    expect(transfer.tickets.has(low.char.id, LV)).toBe(false);
    expect(keys(low)).toContain('sys.dungeon_level');
    w.room.onPortal(lead);
    expect(transfer.tickets.has(lead.char.id, LV)).toBe(true);
    expect(transfer.tickets.has(near.char.id, LV)).toBe(true);
    expect(transfer.tickets.has(far.char.id, LV)).toBe(false);
    expect(transfer.tickets.has(low.char.id, LV)).toBe(false);
    const m = xfers(lead).at(-1)!;
    expect(m.room).toBe('dungeon-phuc_mach');
    expect(m.level).toBe(LV);
    expect(typeof m.options.dgKey).toBe('string');
    expect(xfers(near).at(-1)!.options.dgKey).toBe(m.options.dgKey);
    expect(transfer.tickets.peek(lead.char.id, LV)!.dg).toBe(m.options.dgKey);
    expect(transfer.tickets.peek(near.char.id, LV)!.dg).toBe(m.options.dgKey);
    // hai lượt vào khác nhau có hai khóa khác nhau (hai room riêng)
    transfer.tickets.clear();
    w.room.onPortal(lead);
    expect(xfers(lead).at(-1)!.options.dgKey).not.toBe(m.options.dgKey);
  });

  it('vào room: đặt ở điểm vào, nhận lời chào có tên phó bản, sự kiện nhiệm vụ `dungeon` chạy', async () => {
    const r = await mkRoom(LV, rooms.defineDungeon(LV));
    const events: string[] = [];
    const orig = r.sim.questEvent.bind(r.sim);
    vi.spyOn(r.sim, 'questEvent').mockImplementation((p, type, target, n) => {
      events.push(type);
      orig(p, type, target, n);
    });
    const p = prime(r.join(mkChar('pmvao', 19)), 19);
    const d = DEF().dungeon!;
    expect(Math.hypot(p.move.x - d.spawn.x, p.move.z - d.spawn.z)).toBeLessThan(1);
    expect(keys(p)).toContain('sys.dungeon_enter');
    expect(events).toContain('dungeon');
  });
});

describe('đợt, điểm sinh, khóa room, thưởng', () => {
  it('sinh đúng số quái từng đợt; đợt 3 ở ba điểm riêng; khóa room khi vào đợt 2; chỉ sang đợt sau khi sạch quái', async () => {
    const r = await mkRoom(LV, rooms.defineDungeon(LV));
    prime(r.join(mkChar('pmdot', 19)), 19);
    let now = 10_000_000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    const d = DEF().dungeon!;
    const alive = () => r.sim.monsters.filter((m) => m.state !== MS_DEAD);
    r.room.nextWaveAt = now + 8000;
    r.room.director();
    expect(alive()).toHaveLength(0); // chưa tới giờ
    now += 8100;
    r.room.director();
    expect(alive().map((m) => m.def.id)).toEqual(Array(8).fill('mon_khai_mach_khoi_loi'));
    expect(r.locked.n).toBe(0);
    now += 60_000; // còn quái thì chưa sang đợt
    r.room.director();
    expect(alive()).toHaveLength(8);
    const step = () => {
      r.sim.monsters.forEach((m) => (m.state = MS_DEAD));
      r.room.director(); // hẹn giờ
      now += 7000;
      r.room.director();
    };
    step();
    expect(r.locked.n).toBe(1);
    expect(alive().map((m) => m.def.id).sort()).toEqual([...Array(4).fill('mon_mach_thuong_ho_ve'), 'elite_ho_mach_khoi_tuong'].sort());
    step();
    const au = alive();
    expect(au).toHaveLength(10);
    for (const pt of d.waves[2].points!) expect(au.filter((m) => Math.hypot(m.s.x - pt.x, m.s.z - pt.z) < 4.5).length).toBeGreaterThanOrEqual(3);
    step();
    expect(alive().map((m) => m.def.id)).toEqual(['boss_thach_tam_khoi_vuong']);
    step();
    expect(alive().map((m) => m.def.id)).toEqual(['boss_thon_mach_ngo_cong_vuong']);
    expect(alive()[0].level).toBe(19);
    expect(r.locked.n).toBe(1);
  });

  it('dẹp xong: thưởng chỉ phát một lần mỗi ngày (ledger idem); người đã nhận hôm nay không nhận lại; sau 20 s về Đoạn Mạch', async () => {
    const r = await mkRoom(LV, rooms.defineDungeon(LV));
    const p = prime(r.join(mkChar('pmthuong', 19)), 19);
    const q = prime(r.join(mkChar('pmdanhan', 19)), 19);
    q.noLoot = true;
    let now = 20_000_000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    const gold0 = p.char.gold;
    const xp0 = p.char.xp;
    r.room.wave = 5;
    r.room.nextWaveAt = now;
    r.sim.monsters.forEach((m) => (m.state = MS_DEAD));
    r.room.director();
    expect(r.room.clearedAt).toBe(now);
    expect(keys(p)).toContain('sys.dungeon_reward');
    expect(p.char.gold).toBeGreaterThan(gold0);
    expect(p.char.xp - xp0).toBeGreaterThanOrEqual(Math.round(xpNeed(19) * 0.15) - 1);
    expect(keys(q)).not.toContain('sys.dungeon_reward');
    const idem = `dungeon:${LV}:${p.char.id}:${new Date().toISOString().slice(0, 10)}`;
    const rows = dbm.db.select().from(dbm.ledger).all().filter((x) => x.idem === idem);
    expect(rows).toHaveLength(1);
    // gọi lại (director chạy lại / vào lại cùng ngày) không phát thêm
    const gold1 = p.char.gold;
    r.room.payReward();
    expect(p.char.gold).toBe(gold1);
    // nán lại 20 s rồi đưa mọi người về Đoạn Mạch
    now += 20_500;
    r.room.director();
    expect(xfers(p).at(-1)!.level).toBe('doan_mach');
    expect(transfer.tickets.has(p.char.id, 'doan_mach')).toBe(true);
  });

  it('thưởng không phát cho người chết; túi đầy thì bỏ món không vừa nhưng vẫn nhận vàng và tu vi', async () => {
    const r = await mkRoom(LV, rooms.defineDungeon(LV));
    const reward = DEF().dungeon!.reward!;
    const dead = prime(r.join(mkChar('pmchet', 19)), 19);
    dead.s.fl |= PF_DEAD;
    expect(r.sim.grantDungeonReward(dead, reward, 'k-dead', LV)).toBe(false);
    const full = prime(r.join(mkChar('pmday', 19)), 19);
    full.char.tx('fill', null, (dr) => {
      while (dr.freeSlots() > 0) dr.add('itm_linh_thao', 1);
      return true;
    });
    const gold0 = full.char.gold;
    expect(r.sim.grantDungeonReward(full, reward, 'k-full', LV)).toBe(true);
    expect(full.char.gold).toBeGreaterThan(gold0);
    expect(keys(full)).toContain('sys.inv_full');
  });
});

describe('giới hạn hồi sinh', () => {
  it('hai lần hồi sinh ở điểm vào; lần thứ ba được hồi sinh rồi bị đưa ra ngoài', async () => {
    const r = await mkRoom(LV, rooms.defineDungeon(LV));
    const p = prime(r.join(mkChar('pmhoisinh', 19)), 19);
    const die = () => {
      p.s.fl |= PF_DEAD;
      p.char.hp = 0;
    };
    die();
    r.room.onRespawn(p);
    expect(p.s.fl & PF_DEAD).toBe(0);
    const left = sent.filter((s) => s.to === p.char.name && s.type === S.SYS && (s.msg as { k: string }).k === 'sys.dungeon_revive').map((s) => (s.msg as { p: { n: number } }).p.n);
    expect(left).toEqual([1]);
    die();
    r.room.onRespawn(p);
    expect(xfers(p)).toHaveLength(0);
    die();
    r.room.onRespawn(p);
    expect(keys(p)).toContain('sys.dungeon_revive_out');
    expect(xfers(p).at(-1)!.level).toBe('doan_mach');
    const o = prime(r.join(mkChar('pmkhac', 19)), 19); // người khác có lượt riêng
    o.s.fl |= PF_DEAD;
    r.room.onRespawn(o);
    expect(xfers(o)).toHaveLength(0);
  });

  it('Kiếm Trủng không bị giới hạn hồi sinh', async () => {
    const r = await mkRoom('kiem_trung', rooms.DungeonRoom);
    const p = prime(r.join(mkChar('ktkhonggh', 12)), 12);
    for (let i = 0; i < 5; i++) {
      p.s.fl |= PF_DEAD;
      r.room.onRespawn(p);
    }
    expect(xfers(p)).toHaveLength(0);
  });
});

describe('Thôn Mạch Ngô Công Vương', () => {
  type Private = { tickMonster(m: unknown, dt: number): void; tickHazards(): void; checkPhase(m: unknown): void; tryInterrupt(p: unknown, m: unknown, e?: number): void };
  const T0 = 5_000_000;
  const DT = 50;

  function fight(playerHp = 1_000_000, dist = 5) {
    const hz: HazardMsg[] = [];
    const d = DEF().dungeon!;
    const sim = new GameSim(new WorldState(), { broadcast: (type: string, msg: unknown) => type === S.HAZARD && hz.push(msg as HazardMsg) } as never, {
      levelId: LV,
      roomName: LV,
      spawn: d.spawn,
      respawn: d.spawn,
      persistPosition: false,
    });
    const c = d.center;
    const def = content.MONSTER.get('boss_thon_mach_ngo_cong_vuong')!;
    const mon = sim.spawnMonster(def, 19, c.x, c.z, null);
    mon.state = MS_CHASE;
    mon.target = 'p1';
    mon.attackAt = Number.MAX_SAFE_INTEGER;
    const x = c.x + dist;
    const p = {
      sid: 'p1',
      s: new PlayerS(),
      move: { x, y: groundAt(x, c.z), z: c.z },
      char: { def: 5, hp: playerHp, mhp: playerHp, meta: {}, name: 'pmboss' },
      mth: { guardUntil: 0, guardReduce: 0 },
      shield: null,
      meditating: false,
      lastCombatAt: 0,
      hazardWin: { until: 0, taken: 0 },
      client: { send: () => {} },
    };
    sim.players.set('p1', p as never);
    return { sim, mon, p, hz, priv: sim as unknown as Private };
  }

  it('hút mạch: trong lúc niệm hồi ~2%/s máu tối đa; phá chú (ngắt) thì ngừng hồi và boss mất thế', () => {
    const f = fight();
    let t = T0;
    f.sim.now = t;
    f.mon.s.hp = Math.round(f.mon.s.mhp * 0.8);
    f.mon.chantAt = 1;
    const step = (ms: number) => {
      const end = t + ms;
      while (t < end) {
        t += DT;
        f.sim.now = t;
        f.priv.tickMonster(f.mon, DT / 1000);
      }
    };
    step(DT); // bắt đầu niệm
    expect(f.mon.chant).not.toBeNull();
    const hp0 = f.mon.s.hp;
    step(2000);
    const gained = f.mon.s.hp - hp0;
    expect(gained).toBeGreaterThan(f.mon.s.mhp * 0.02 * 1.7);
    expect(gained).toBeLessThan(f.mon.s.mhp * 0.02 * 2.3);
    f.priv.tryInterrupt(f.p, f.mon); // đã qua đoạn hộ chú (open 0,3 của 2,6 s)
    expect(f.mon.chant).toBeNull();
    const hp1 = f.mon.s.hp;
    step(1500);
    expect(f.mon.s.hp).toBe(hp1);
    expect(f.mon.stunUntil).toBeGreaterThan(f.sim.now);
  });

  it('vào pha theo máu: 65% chui đất + gọi ấu; 35% tăng tốc 1,15 và vạch dài; 10% tự bạo', () => {
    const f = fight();
    const at = (frac: number) => {
      f.mon.s.hp = Math.round(f.mon.s.mhp * frac);
      f.priv.checkPhase(f.mon);
    };
    expect(f.mon.rules.ai.burrow).toBeUndefined();
    at(0.64);
    expect(f.mon.phase).toBe(1);
    expect(f.mon.rules.ai.burrow).toBeTruthy();
    expect(f.mon.rules.ai.summon).toBeTruthy();
    expect(f.mon.rules.ai.chant!.drain).toBeGreaterThan(0);
    at(0.34);
    expect(f.mon.phase).toBe(2);
    expect(f.mon.rules.ai.line).toMatchObject({ r: 22, w: 3 });
    expect(f.mon.rules.ai.burrow).toBeTruthy();
    at(0.09);
    expect(f.mon.phase).toBe(3);
    expect(f.mon.rules.ai.chant!.drain).toBeUndefined();
    expect(f.mon.rules.ai.chant).toMatchObject({ r: 12 });
  });

  it('tự bạo mạch: đứng trong vòng 12 m mất phần lớn máu (cấp 19), đứng ngoài thì không mất', () => {
    const hit = (dist: number, hp = 2000) => {
      const f = fight(hp, dist);
      f.mon.s.hp = Math.round(f.mon.s.mhp * 0.09);
      f.priv.checkPhase(f.mon);
      f.mon.chantAt = 1;
      let t = T0;
      f.sim.now = t;
      for (let i = 0; i < 200; i++) {
        t += DT;
        f.sim.now = t;
        f.priv.tickMonster(f.mon, DT / 1000);
        f.priv.tickHazards();
        if (f.hz.some((h) => h.r === 12) && t > T0 + 6000) break;
      }
      return { lost: hp - f.p.char.hp, hz: f.hz };
    };
    const inside = hit(4, 1_000_000);
    // mul 4,6 ≈ 63% khí huyết tối đa của người cấp 19 chưa mặc đồ (thiết kế: ~65%)
    const frac = inside.lost / mkChar('pmdbg', 19).mhp;
    expect(frac).toBeGreaterThan(0.55);
    expect(frac).toBeLessThan(0.75);
    expect(inside.hz.some((h) => h.r === 12)).toBe(true);
    expect(inside.lost).toBeGreaterThan(0);
    const outside = hit(20);
    expect(outside.hz.some((h) => h.r === 12)).toBe(true);
    expect(outside.lost).toBe(0);
  });
});
