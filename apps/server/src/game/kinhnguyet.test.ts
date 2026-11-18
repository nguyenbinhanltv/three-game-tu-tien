import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { groundAt, MF_REAL, MF_SENSED, MS_CHASE, MS_DEAD, PF_DEAD, S, xpNeed, type FxMsg, type TransferMsg } from '@dtl/shared';

import { at } from '@dtl/shared';
// E3-M: Kính Nguyệt Cung. Dữ liệu đợt, vé, đố ba gương, bóng giả/lặp lại/đĩa gương/nguyệt phản của Kính Nguyệt Chân Quân,
// Định Thần Phù, thưởng một lần mỗi ngày (transaction + idem + ledger).
process.env.DB_FILE = ':memory:';
process.env.AUTH_DEV_BYPASS = '1';

type Ent = import('./sim').PlayerEnt;
type Rooms = typeof import('../rooms');
let GameSim: typeof import('./sim').GameSim;
let WorldState: typeof import('../state').WorldState;
let Character: typeof import('./character').Character;
let parties: typeof import('./party').parties;
let rooms: Rooms;
let transfer: typeof import('../transfer');
let content: typeof import('@dtl/content');
let dbm: typeof import('../db');
let mir: typeof import('./mirror');
let pzl: typeof import('./mirrorpuzzle');

beforeAll(async () => {
  ({ GameSim } = await import('./sim'));
  ({ WorldState } = await import('../state'));
  ({ Character } = await import('./character'));
  ({ parties } = await import('./party'));
  rooms = await import('../rooms');
  transfer = await import('../transfer');
  content = await import('@dtl/content');
  dbm = await import('../db');
  mir = await import('./mirror');
  pzl = await import('./mirrorpuzzle');
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
let acc = 58000;
const LV = 'kinh_nguyet';
const DEF = () => at(content.LEVELS, LV);
const keys = (p: Ent) =>
  sent.filter((s) => s.type === S.SYS && (s.to === p.char.name || s.to === '*')).map((s) => (s.msg as { k: string }).k);
const fxs = (t: string) => sent.filter((s) => s.type === S.FX && (s.msg as FxMsg).t === t).map((s) => s.msg as FxMsg);
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

type TestRoom = InstanceType<Rooms['GameRoom']> & {
  director(): void;
  onRespawn(p: Ent): void;
  payReward(): void;
  wave: number;
  nextWaveAt: number;
  clearedAt: number;
};

async function mkRoom(levelId: string, cls: { prototype: object }) {
  const { Aoi } = await import('../aoi');
  const room = Object.create(cls.prototype) as Record<string, unknown> & { sim: InstanceType<typeof GameSim> };
  const lv = at(content.LEVELS, levelId);
  const spawn = lv.dungeon?.spawn ?? lv.spawn!;
  room.broadcast = (type: string, msg: unknown) => sent.push({ type, msg, to: '*' });
  room.sim = new GameSim(new WorldState(), room as never, {
    levelId,
    roomName: levelId,
    spawn,
    respawn: spawn,
    persistPosition: !lv.dungeon,
  });
  room.aoi = new Aoi(room.sim);
  room.clients = { getById: () => undefined };
  room.markers = { drop() {}, sync() {} };
  room.clock = { setTimeout: () => undefined, setInterval: () => undefined };
  Object.defineProperty(room, 'roomName', { value: levelId });
  const locked = { n: 0 };
  room.lock = () => void locked.n++;
  Object.assign(room, { wave: 0, nextWaveAt: 0, clearedAt: 0, revives: new Map(), puzzle: null });
  const join = (char: InstanceType<typeof Character>, auth: Record<string, unknown> = {}): Ent => {
    const c = { sessionId: 'sid' + acc++, send: (type: string, msg: unknown) => sent.push({ type, msg, to: char.name }) };
    (room as unknown as { onJoin(c: unknown, o: unknown, a: unknown): void }).onJoin(
      c,
      {},
      { accountId: 1, dev: true, charId: char.id, session: 's', ticket: true, ...auth },
    );
    return [...room.sim.players.values()].find((q) => q.char.id === char.id)!;
  };
  return { room: room as unknown as TestRoom, sim: room.sim, join, locked };
}

const prime = (p: Ent, level: number): Ent => {
  p.char.level = level;
  p.char.bk = level;
  p.char.recalc();
  p.char.hp = p.char.mhp;
  return p;
};

describe('dữ liệu Kính Nguyệt Cung', () => {
  it('năm đợt đúng thiết kế mục 5.2; cấp 21+; ra về bản đồ thế giới', () => {
    const d = DEF().dungeon!;
    expect(d.minLevel).toBe(21);
    expect(d.waves).toHaveLength(5);
    const tally = (i: number) => at(d.waves, i).mons.map((m) => `${m.id}×${m.n}`);
    expect(tally(0)).toEqual(['mon_kinh_linh×8']);
    expect(tally(1)).toEqual(['elite_kinh_dien_ma_quan×1']);
    expect(at(d.waves, 2).puzzle!.points).toHaveLength(3);
    expect(at(d.waves, 2).puzzle!.secs).toBe(20);
    expect(at(d.waves, 2).puzzle!.bossCut).toBe(0.08);
    expect(tally(3)).toEqual(['mon_kinh_linh×6', 'mon_phu_dao_thach_quy×2']);
    expect(tally(4)).toEqual(['boss_kinh_nguyet_chan_quan×1']);
    expect(at(content.LEVELS, d.returnLevel).dungeon).toBeUndefined();
    expect(rooms.roomNameOf(LV)).toBe('dungeon-kinh_nguyet');
    expect(d.private).toBe(true);
  });

  it('boss: hpMul 90, xpMul 25, cấp 23; ba bóng một thật, lặp lại, đĩa gương ở 60%, nguyệt phản ở 30%', () => {
    const b = content.MONSTER.get('boss_kinh_nguyet_chan_quan')!;
    expect(b.hpMul).toBe(90);
    expect(b.xpMul).toBe(25);
    expect(b.ai!.sweep).toMatchObject({ shape: 'cone', r: 14, w: 35, cd: 9 });
    expect(b.phases!.map((p) => p.hp)).toEqual([0.6, 0.3]);
    expect(b.mirror!.decoys).toMatchObject({ n: 3, mon: 'mon_kinh_anh_gia' });
    expect(b.mirror!.disc).toMatchObject({ phase: 1, beams: 3, dur: 8 });
    expect(b.mirror!.veil).toMatchObject({ phase: 2, r: 14 });
    expect(content.MONSTER.get('mon_kinh_anh_gia')!.hpMul).toBeLessThanOrEqual(0.1);
    expect(at(at(DEF().dungeon!.waves, 4).mons, 0).level).toBe(23);
  });

  it('thưởng: 15% tu vi, Kính Hoa Sa, mảnh cả ba bộ bậc 3', () => {
    const r = DEF().dungeon!.reward!;
    expect(r.xpPct).toBe(0.15);
    expect(r.items.map((i) => i.item)).toContain('itm_kinh_hoa_sa');
    expect(r.equip!.map((e) => e.set).sort()).toEqual(['set_kinh_quang', 'set_luu_ly', 'set_van_kinh']);
  });

  it('Định Thần Phù: bùa giảm 40% trong 10 s, có công thức chế', () => {
    const it = content.ITEM.get('itm_dinh_than_phu')!;
    expect(it.use!.buff).toEqual({ kind: 'ward', pct: 0.4, sec: 10 });
    expect(content.RECIPES.some((r) => r.output.id === 'itm_dinh_than_phu')).toBe(true);
  });
});

describe('hàm thuần', () => {
  it('discAngle xoay đều, inBeam đúng hình chữ nhật', () => {
    expect(mir.discAngle(0, 1, 3, 0, 0)).toBeCloseTo((Math.PI * 2) / 3);
    expect(mir.discAngle(0, 0, 3, 90, 2)).toBeCloseTo(Math.PI);
    expect(mir.inBeam(0, 0, 0, 20, 3, 0, 10)).toBe(true);
    expect(mir.inBeam(0, 0, 0, 20, 3, 1.4, 10)).toBe(true);
    expect(mir.inBeam(0, 0, 0, 20, 3, 1.6, 10)).toBe(false);
    expect(mir.inBeam(0, 0, 0, 20, 3, 0, -1)).toBe(false);
    expect(mir.inBeam(0, 0, 0, 20, 3, 0, 21)).toBe(false);
  });
  it('wardMul', () => {
    expect(mir.wardMul(0.4)).toBeCloseTo(0.6);
    expect(mir.wardMul(0)).toBe(1);
    expect(mir.wardMul(5)).toBeCloseTo(0.1);
  });
});

describe('đố ba gương (MirrorPuzzle)', () => {
  const pts = [
    { x: 0, z: 0 },
    { x: 20, z: 0 },
    { x: 40, z: 0 },
  ];
  const mk = () => {
    let now = 1000;
    const log = { wrong: 0, cut: 0, say: [] as string[] };
    const pl = { sid: 'a', x: 100, z: 100, dead: false };
    const pz = new pzl.MirrorPuzzle(
      { points: pts, secs: 20, wrong: { mon: 'mon_kinh_linh', level: 21, n: 3 }, bossCut: 0.08 },
      {
        now: () => now,
        players: () => [pl],
        spawnWrong: () => void log.wrong++,
        fx: () => undefined,
        say: (k) => void log.say.push(k),
        colorName: (i) => 'c' + i,
        solved: (c) => void (log.cut = c),
      },
      () => 0,
    );
    pz.start();
    const order = () => (pz as unknown as { order: number[] }).order;
    const touch = (i: number) => {
      pl.x = at(pts, i).x;
      pl.z = at(pts, i).z;
      pz.tick();
    };
    const away = () => {
      pl.x = 100;
      pl.z = 100;
      pz.tick();
    };
    const wait = (s: number) => void (now += s * 1000);
    return { pz, log, order, touch, away, wait };
  };

  it('shuffle3 là hoán vị của 0,1,2', () => {
    for (const r of [() => 0, () => 0.5, () => 0.99]) expect([...pzl.shuffle3(r)].sort()).toEqual([0, 1, 2]);
  });

  it('chạm đúng thứ tự thì thắng, báo giảm sát thương boss', () => {
    const { pz, log, order, touch, away } = mk();
    for (const i of order()) {
      touch(i);
      away();
    }
    expect(pz.done).toBe(true);
    expect(log.cut).toBe(0.08);
    expect(log.say).toContain('sys.mirror_puzzle_ok');
    expect(log.wrong).toBe(0);
  });

  it('chạm sai rồi đứng yên trên cột: không bị tính chạm mới, chỉ một lần phạt', () => {
    const { pz, log, order, touch } = mk();
    touch(at(order(), 1));
    expect(log.wrong).toBe(1);
    for (let i = 0; i < 6; i++) pz.tick();
    expect(log.wrong).toBe(1);
    expect(pz.done).toBe(false);
  });

  it('chạm sai thứ tự hoặc hết giờ: quái phạt, đố lại; quá 3 lần thì bỏ đố không thưởng', () => {
    const { pz, log, order, touch, away, wait } = mk();
    touch(at(order(), 1));
    expect(log.wrong).toBe(1);
    expect(log.say).toContain('sys.mirror_puzzle_bad');
    away();
    wait(21);
    pz.tick();
    expect(log.wrong).toBe(2);
    expect(log.say).toContain('sys.mirror_puzzle_time');
    wait(21);
    pz.tick();
    expect(log.wrong).toBe(3);
    expect(pz.done).toBe(true);
    expect(pz.active).toBe(false);
    expect(log.cut).toBe(0);
  });
});

describe('vé và vào room', () => {
  const Dg = () => rooms.defineDungeon(LV) as unknown as { levelId: string; onAuth(t: string, o: unknown): Promise<{ charId: number }> };
  const Home = () => rooms.WorldRoom as unknown as { onAuth(t: string, o: unknown): Promise<{ charId: number }> };

  it('onAuth: không vé / sai khóa bị từ chối; đúng vé và khóa thì vào một lần', async () => {
    expect(Dg().levelId).toBe(LV);
    const a = await Home().onAuth('', { dev: 'knauth' });
    await expect(Dg().onAuth('', { dev: 'knauth' })).rejects.toThrow(/no_ticket/);
    transfer.tickets.issue(a.charId, LV, null, undefined, 'k');
    await expect(Dg().onAuth('', { dev: 'knauth', dgKey: 'sai' })).rejects.toThrow(/no_ticket/);
    await expect(Dg().onAuth('', { dev: 'knauth', dgKey: 'k' })).resolves.toMatchObject({ charId: a.charId });
    await expect(Dg().onAuth('', { dev: 'knauth', dgKey: 'k' })).rejects.toThrow(/no_ticket/);
  });

  it('cổng ở bản đồ trả về: đủ cấp 21 mới có vé, room riêng dungeon-kinh_nguyet', async () => {
    const ret = DEF().dungeon!.returnLevel;
    const w = await mkRoom(ret, rooms.defineWorld(ret));
    const portal = at(content.LEVELS, ret).portals!.find((q) => q.to === LV)!;
    const hi = prime(w.join(mkChar('knhi', 21), { ticket: false }), 21);
    const lo = prime(w.join(mkChar('knlo', 19), { ticket: false }), 19);
    for (const m of [hi, lo]) {
      m.move.x = portal.x;
      m.move.z = portal.z;
      m.move.y = groundAt(portal.x, portal.z);
    }
    w.room.onPortal(lo);
    expect(transfer.tickets.has(lo.char.id, LV)).toBe(false);
    expect(keys(lo)).toContain('sys.dungeon_level');
    w.room.onPortal(hi);
    expect(transfer.tickets.has(hi.char.id, LV)).toBe(true);
    expect(xfers(hi).at(-1)!.room).toBe('dungeon-kinh_nguyet');
  });

  it('vào room: nhận lời chào, sự kiện nhiệm vụ `dungeon` chạy', async () => {
    const r = await mkRoom(LV, rooms.defineDungeon(LV));
    const events: string[] = [];
    const orig = r.sim.questEvent.bind(r.sim);
    vi.spyOn(r.sim, 'questEvent').mockImplementation((p, type, target, n) => {
      events.push(type);
      orig(p, type, target, n);
    });
    const p = prime(r.join(mkChar('knvao', 21)), 21);
    expect(keys(p)).toContain('sys.dungeon_enter');
    expect(events).toContain('dungeon');
  });
});

describe('đợt trong room: đố gương chặn director', () => {
  it('đợt 2 ma quân; đợt 3 không quái mà chờ đố; giải xong mới sang đợt 4; bossDmgMul = 0,92', async () => {
    const r = await mkRoom(LV, rooms.defineDungeon(LV));
    const p = prime(r.join(mkChar('kndot', 21)), 21);
    let now = 30_000_000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    const alive = () => r.sim.monsters.filter((m) => m.state !== MS_DEAD);
    const step = () => {
      r.sim.monsters.forEach((m) => (m.state = MS_DEAD));
      r.room.director();
      now += 7000;
      r.room.director();
    };
    r.room.nextWaveAt = now;
    r.room.director();
    expect(alive()).toHaveLength(8);
    step();
    expect(alive().map((m) => m.def.id)).toEqual(['elite_kinh_dien_ma_quan']);
    step();
    expect(alive()).toHaveLength(0);
    expect(r.room.wave).toBe(3);
    expect(keys(p)).toContain('sys.mirror_puzzle');
    expect(fxs('mirror_pillar')).toHaveLength(3);
    now += 3000;
    r.room.director();
    expect(r.room.wave).toBe(3);
    const pz = (r.room as unknown as { puzzle: { order: number[] } }).puzzle;
    const pts = at(DEF().dungeon!.waves, 2).puzzle!.points;
    for (const i of pz.order) {
      p.move.x = at(pts, i).x;
      p.move.z = at(pts, i).z;
      r.room.director();
      p.move.x += 50;
      r.room.director();
    }
    expect(r.sim.bossDmgMul).toBeCloseTo(0.92);
    r.room.director();
    now += 7000;
    r.room.director();
    r.room.director();
    now += 7000;
    r.room.director();
    expect(r.room.wave).toBe(4);
    expect(alive().filter((m) => m.def.id === 'mon_phu_dao_thach_quy')).toHaveLength(2);
  });
});

describe('Kính Nguyệt Chân Quân (MirrorSystem)', () => {
  async function fight() {
    const r = await mkRoom(LV, rooms.defineDungeon(LV));
    const p = prime(r.join(mkChar('knboss', 23)), 23);
    const c = DEF().dungeon!.center;
    const def = content.MONSTER.get('boss_kinh_nguyet_chan_quan')!;
    const boss = r.sim.spawnMonster(def, 23, c.x, c.z, null);
    boss.state = MS_CHASE;
    boss.target = p.sid;
    boss.attackAt = Number.MAX_SAFE_INTEGER;
    p.move.x = c.x;
    p.move.z = c.z + 10;
    p.move.y = groundAt(p.move.x, p.move.z);
    p.char.mhp = 1_000_000;
    p.char.hp = 1_000_000;
    let now = 40_000_000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    const sim = r.sim as unknown as {
      now: number;
      hazards: { src: string; x: number; z: number }[];
      mirror: InstanceType<typeof mir.MirrorSystem>;
    };
    sim.now = now;
    const adv = (ms: number) => {
      now += ms;
      sim.now = now;
      sim.mirror.tick();
    };
    return { r, p, boss, sim, adv, c };
  }
  const decoys = (r: Awaited<ReturnType<typeof fight>>['r']) =>
    r.sim.monsters.filter((m) => m.def.id === 'mon_kinh_anh_gia' && m.state !== MS_DEAD);

  it('vào trận: ba bóng giả quanh boss, cờ thể thật; bóng giả chết thì nổ vòng báo trước', async () => {
    const { r, p, boss, sim, adv } = await fight();
    adv(0);
    const dec = decoys(r);
    expect(dec).toHaveLength(3);
    for (const d of dec) expect(Math.hypot(d.s.x - boss.s.x, d.s.z - boss.s.z)).toBeCloseTo(12, 0);
    expect(boss.s.mf & MF_REAL).toBe(MF_REAL);
    expect(at(dec, 0).s.mf & MF_REAL).toBe(0);
    expect(at(dec, 0).s.mhp).toBeLessThan(boss.s.mhp / 100);
    expect(keys(p)).toContain('sys.mirror_split');
    const before = sim.hazards.length;
    r.sim.damageMonster(at(dec, 0), at(dec, 0).s.mhp, p);
    expect(at(dec, 0).state).toBe(MS_DEAD);
    expect(sim.hazards.length).toBe(before + 1);
    expect(sim.hazards.at(-1)!.src).toBe(at(dec, 0).id);
    expect(fxs('mirror_shatter')).toHaveLength(1);
    expect(decoys(r)).toHaveLength(2);
  });

  it('boss chết thì bóng giả biến mất', async () => {
    const { r, p, boss, adv } = await fight();
    adv(0);
    expect(decoys(r)).toHaveLength(3);
    r.sim.damageMonster(boss, boss.s.mhp, p);
    expect(boss.state).toBe(MS_DEAD);
    expect(decoys(r)).toHaveLength(0);
    adv(100);
  });

  it('lặp lại: ra chiêu sát thương thì có vạch phản đúng chỗ người đó, mỗi người có hồi riêng', async () => {
    const { p, boss, sim, adv } = await fight();
    adv(0);
    const n0 = sim.hazards.length;
    sim.mirror.onSkill(p, 'skl_kiem_khi_tram');
    expect(sim.hazards.length).toBe(n0 + 1);
    const h = sim.hazards.at(-1)!;
    expect(h.src).toBe(boss.id);
    expect(Math.hypot(h.x - p.move.x, h.z - p.move.z)).toBeLessThan(0.01);
    expect(fxs('mirror_echo')).toHaveLength(1);
    sim.mirror.onSkill(p, 'skl_kiem_khi_tram');
    expect(sim.hazards.length).toBe(n0 + 1);
    adv(8000);
    sim.mirror.onSkill(p, 'skl_kiem_khi_tram');
    expect(sim.hazards.length).toBe(n0 + 2);
  });

  it('đĩa gương: không trúng lúc báo, trúng khi đứng trong tia, đứng giữa các tia thì không', async () => {
    const { p, boss, sim, adv, c } = await fight();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    adv(0);
    boss.phase = 1;
    sim.mirror.onPhase(boss, 1);
    adv(2600);
    expect(fxs('mirror_disc').filter((f) => (f.d ?? 0) > 0)).toHaveLength(1);
    p.move.x = c.x;
    p.move.z = c.z + 10;
    const hp0 = p.char.hp;
    adv(1000);
    expect(p.char.hp).toBe(hp0);
    adv(500);
    expect(p.char.hp).toBeLessThan(hp0);
    const hp1 = p.char.hp;
    const mid = mir.discAngle(0, 0, 3, 25, 0.1) + Math.PI / 3;
    p.move.x = c.x + Math.sin(mid) * 10;
    p.move.z = c.z + Math.cos(mid) * 10;
    adv(100);
    expect(p.char.hp).toBe(hp1);
    adv(9000);
    expect((sim.mirror as unknown as { rt: Map<string, { disc: unknown }> }).rt.get(boss.id)!.disc).toBeNull();
  });

  it('nguyệt phản: người trong vùng bị Tâm Ma Ảnh của chính mình đuổi; hết màn thì bóng tan', async () => {
    const { r, p, boss, sim, adv } = await fight();
    adv(0);
    boss.phase = 2;
    sim.mirror.onPhase(boss, 2);
    adv(6100);
    expect(r.sim.monsters.filter((m) => m.owner === p.sid && m.state !== MS_DEAD)).toHaveLength(1);
    expect(fxs('mirror_veil').filter((f) => (f.d ?? 0) > 0)).toHaveLength(1);
    expect(keys(p)).toContain('sys.mirror_veil');
    adv(3100);
    expect(fxs('tamma_cast').length).toBeGreaterThanOrEqual(1);
    adv(20_000);
    expect(r.sim.monsters.filter((m) => m.owner === p.sid && m.state !== MS_DEAD)).toHaveLength(0);
  });

  it('thần thức soi thể thật sáng 6 s rồi tắt', async () => {
    const { r, p, boss, sim, adv } = await fight();
    adv(0);
    sim.mirror.onScan(p, []);
    expect(boss.s.mf & MF_SENSED).toBe(MF_SENSED);
    adv(mir.SENSE_MS + 100);
    (r.sim as unknown as { monSkills: { tick(m: unknown, t: unknown, d: number, r: boolean, dt: number): boolean } }).monSkills.tick(
      boss,
      p,
      5,
      true,
      0.05,
    );
    expect(boss.s.mf & MF_SENSED).toBe(0);
    expect(boss.s.mf & MF_REAL).toBe(MF_REAL);
  });

  it('chat gần boss: boss lặp lại câu cuối của người chơi', async () => {
    const { sim, adv, p } = await fight();
    adv(0);
    expect(sim.mirror.echoLine('Ngươi là ai?', p)!.line).toBe('Ngươi là ai.');
  });

  it('Định Thần Phù giảm 40% sát thương gương, không giảm của quái thường; đố đúng giảm 8% sát thương boss', async () => {
    const { r, p, boss } = await fight();
    const wolf = r.sim.spawnMonster(content.MONSTER.get('mon_soi_xam')!, 1, p.move.x + 30, p.move.z, null);
    const hit = (src: string) => {
      const h0 = p.char.hp;
      r.sim.damagePlayer(p, 1000, src, true);
      return h0 - p.char.hp;
    };
    const plain = hit(wolf.id);
    expect(plain).toBeGreaterThan(0);
    const now = Date.now();
    p.char.meta.buffs = { ward: { m: 0.4, until: now + 10_000 } };
    expect(hit(boss.id) / plain).toBeCloseTo(0.6, 1);
    expect(hit(wolf.id) / plain).toBeCloseTo(1, 1);
    p.char.meta.buffs = { ward: { m: 0.4, until: now - 1 } };
    expect(hit(boss.id) / plain).toBeCloseTo(1, 1);
    p.char.meta.buffs = {};
    r.sim.bossDmgMul = 0.92;
    expect(hit(boss.id) / plain).toBeCloseTo(0.92, 1);
  });

  it('dùng Định Thần Phù: đặt buff ward 10 giây', async () => {
    const { r, p } = await fight();
    p.char.tx('give', null, (d) => {
      d.add('itm_dinh_than_phu', 2);
      return true;
    });
    const slot = p.char.inv.findIndex((i) => i?.id === 'itm_dinh_than_phu');
    expect(slot).toBeGreaterThanOrEqual(0);
    (r.sim as unknown as { onUse(p: Ent, m: unknown): void }).onUse(p, { slot, r: 'use-ward-01' });
    const b = p.char.meta.buffs?.ward;
    expect(b?.m).toBeCloseTo(0.4);
    expect(b!.until - Date.now()).toBeLessThanOrEqual(10_000);
    expect(keys(p)).toContain('sys.ward_buff');
  });
});

describe('thưởng', () => {
  it('dẹp xong: thưởng một lần mỗi ngày (ledger idem), Kính Hoa Sa vào túi, 15% tu vi; sau 20 s về bản đồ thế giới', async () => {
    const r = await mkRoom(LV, rooms.defineDungeon(LV));
    const p = prime(r.join(mkChar('knthuong', 23)), 23);
    let now = 50_000_000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    const xp0 = p.char.xp;
    r.room.wave = 5;
    r.room.nextWaveAt = now;
    r.sim.monsters.forEach((m) => (m.state = MS_DEAD));
    r.room.director();
    expect(keys(p)).toContain('sys.dungeon_reward');
    expect(p.char.xp - xp0).toBeGreaterThanOrEqual(Math.round(xpNeed(23) * 0.15) - 1);
    expect(p.char.inv.some((i) => i?.id === 'itm_kinh_hoa_sa')).toBe(true);
    const idem = `dungeon:${LV}:${p.char.id}:${new Date().toISOString().slice(0, 10)}`;
    expect(
      dbm.db
        .select()
        .from(dbm.ledger)
        .all()
        .filter((x) => x.idem === idem),
    ).toHaveLength(1);
    const gold1 = p.char.gold;
    r.room.payReward();
    expect(p.char.gold).toBe(gold1);
    now += 20_500;
    r.room.director();
    expect(xfers(p).at(-1)!.level).toBe(DEF().dungeon!.returnLevel);
  });

  it('người chết không nhận thưởng', async () => {
    const r = await mkRoom(LV, rooms.defineDungeon(LV));
    const dead = prime(r.join(mkChar('knchet', 23)), 23);
    dead.s.fl |= PF_DEAD;
    expect(r.sim.grantDungeonReward(dead, DEF().dungeon!.reward!, 'k-dead', LV)).toBe(false);
  });
});
