import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { MS_DEAD, type MonsterRift } from '@dtl/shared';

// DV-3D: Xích Tẫn Khích. Dữ liệu đợt, hàm thuần giữ bia/khe mạch, SteleHold + RiftVeins với host giả,
// và một lượt DungeonRoom thật đi qua đợt 4 (giữ bia), đợt 6 (khe mạch gột boss).
process.env.DB_FILE = ':memory:';
process.env.AUTH_DEV_BYPASS = '1';

type Ent = import('./sim').PlayerEnt;
type Rooms = typeof import('../rooms');
let GameSim: typeof import('./sim').GameSim;
let WorldState: typeof import('../state').WorldState;
let Character: typeof import('./character').Character;
let rooms: Rooms;
let transfer: typeof import('../transfer');
let content: typeof import('@dtl/content');
let xt: typeof import('./xichtan');

beforeAll(async () => {
  ({ GameSim } = await import('./sim'));
  ({ WorldState } = await import('../state'));
  ({ Character } = await import('./character'));
  rooms = await import('../rooms');
  transfer = await import('../transfer');
  content = await import('@dtl/content');
  xt = await import('./xichtan');
});

afterEach(() => {
  vi.restoreAllMocks();
  transfer.tickets.clear();
  sent.length = 0;
});

const sent: { type: string; msg: unknown; to: string }[] = [];
let acc = 74000;
const LV = 'xich_tan_khich';
const DEF = () => content.LEVELS[LV];

describe('dữ liệu Xích Tẫn Khích', () => {
  it('sáu đợt đúng thiết kế mục 5.1, vào từ Bắc Hoang, cấp 28 (trần cấp hiện tại)', () => {
    const d = DEF().dungeon!;
    expect(d.minLevel).toBe(28);
    expect(d.returnLevel).toBe('bac_hoang');
    expect(d.private).toBe(true);
    expect(d.maxRevives).toBe(2);
    expect(d.waves).toHaveLength(6);
    expect(d.waves.map((w) => w.mons[0].id)).toEqual(['mon_giac_kiem_trong_binh', 'mon_liet_hoa_ma_nguu', 'boss_xich_tan_cu_khoi', 'mon_u_anh_cot_loc', 'boss_tu_nhan_ma_tuong', 'boss_tu_quang_duc_chu']);
    expect(d.waves[0].mons[0].n).toBe(10);
    expect(d.waves[1].mons[0].n).toBe(6);
    expect(d.waves[3].steles!.secs).toBe(60);
    expect(content.LEVELS.bac_hoang.portals).toContainEqual(expect.objectContaining({ to: LV }));
    expect(rooms.roomNameOf(LV)).toBe('dungeon-xich_tan_khich');
  });

  it('thưởng: 15% tu vi, Tẫn Giác + Tịnh Quang Vũ, mảnh cả ba bộ bậc 5', () => {
    const r = DEF().dungeon!.reward!;
    expect(r.xpPct).toBe(0.15);
    expect(r.items.map((i) => i.item)).toEqual(expect.arrayContaining(['itm_tan_giac', 'itm_tinh_vu']));
    expect([...new Set(r.equip!.map((e) => e.set))].sort()).toEqual(['set_tan_thiet', 'set_tinh_dan_bao', 'set_tran_khich']);
  });

  it('Tử Quang Dực Chủ: bay 2,5 m, pha 3 niệm chú hút mạch, ba khe mạch ba tầng cháy', () => {
    const b = content.MONSTER.get('boss_tu_quang_duc_chu')!;
    expect(b.hover).toBe(2.5);
    expect(b.phases![1].ai!.chant!.drain).toBeGreaterThan(0);
    expect(b.rift).toMatchObject({ phase: 2, burn: 3, weak: 6 });
    expect(b.rift!.veins).toHaveLength(3);
  });
});

describe('hàm thuần', () => {
  it('occupied / stepStele: có người thì cộng, trống thì đếm rồi tắt (không cộng)', () => {
    expect(xt.occupied([{ x: 3, z: 0 }], 0, 0, 5)).toBe(true);
    expect(xt.occupied([{ x: 6, z: 0 }], 0, 0, 5)).toBe(false);
    expect(xt.stepStele(10, 3, 1, true, 6, 60)).toEqual({ held: 11, empty: 0, off: false });
    expect(xt.stepStele(59.5, 0, 1, true, 6, 60).held).toBe(60);
    expect(xt.stepStele(10, 5.5, 1, false, 6, 60)).toEqual({ held: 10, empty: 6.5, off: true });
    expect(xt.stepStele(10, 1, 1, false, 6, 60).off).toBe(false);
  });
  it('dueReinforce: chỉ trả mốc chưa phát mà tiến độ đã qua', () => {
    const l = [{ at: 0 }, { at: 20 }, { at: 40 }];
    expect(xt.dueReinforce(0, 0, l)).toEqual([0]);
    expect(xt.dueReinforce(25, 1, l)).toEqual([1]);
    expect(xt.dueReinforce(45, 1, l)).toEqual([1, 2]);
    expect(xt.dueReinforce(45, 3, l)).toEqual([]);
  });
  it('veinUnder: chỉ số khe boss đứng lên, -1 nếu ngoài', () => {
    const r: MonsterRift = { phase: 1, burn: 3, weak: 6, veins: [{ x: 0, z: 0, r: 5 }, { x: 20, z: 0, r: 5 }] };
    expect(xt.veinUnder(r, 21, 2)).toBe(1);
    expect(xt.veinUnder(r, 10, 0)).toBe(-1);
  });
});

describe('SteleHold với host giả', () => {
  function mk(secs = 10) {
    let now = 1000;
    const pl = { move: { x: 0, z: 0 }, s: { mhp: 1000 }, dead: false };
    const log = { dmg: 0, spawn: [] as string[], say: [] as string[], marks: 0 };
    const h = {
      now: () => now,
      players: () => [pl as unknown as Ent],
      isDead: () => pl.dead,
      isGhost: () => false,
      damagePlayer: (_p: Ent, n: number) => void (log.dmg += n),
      marker: () => void log.marks++,
      spawn: (mon: string) => void log.spawn.push(mon),
      sysAll: (k: string) => void log.say.push(k),
    };
    const def = { x: 0, z: 0, r: 5, secs, grace: 3, press: 0.05, reinforce: [{ at: 0, mon: 'a', level: 1, n: 2 }, { at: 5, mon: 'b', level: 1, n: 1 }] };
    const st = new xt.SteleHold(h, def);
    const adv = (sec: number) => {
      for (let i = 0; i < sec * 4; i++) {
        now += 250;
        st.tick();
      }
    };
    return { st, pl, log, adv };
  }
  it('giữ đủ giây thì xong, tiếp viện đúng mốc', () => {
    const { st, log, adv } = mk();
    adv(1);
    expect(log.spawn).toEqual(['a', 'a']);
    adv(5);
    expect(log.spawn).toEqual(['a', 'a', 'b']);
    expect(st.complete).toBe(false);
    adv(5);
    expect(st.complete).toBe(true);
    expect(log.say).toContain('sys.xt_stele_done');
    expect(log.dmg).toBe(0);
  });
  it('trống quá grace: bia tắt, giới áp 5%/giây, tiến độ đứng; về lại thì tiếp tục', () => {
    const { st, pl, log, adv } = mk();
    adv(2);
    const held = st.held;
    pl.move.x = 50;
    adv(3);
    expect(log.dmg).toBe(0);
    adv(3);
    expect(log.say).toContain('sys.xt_stele_off');
    expect(log.dmg).toBeGreaterThan(100);
    expect(log.dmg).toBeLessThanOrEqual(160);
    expect(st.held).toBe(held);
    pl.move.x = 0;
    adv(1);
    expect(st.held).toBeGreaterThan(held);
  });
  it('tin "bia sáng" chỉ phát khi có người đứng vào, không phải tick đầu', () => {
    const { pl, log, adv } = mk();
    pl.move.x = 50;
    adv(1);
    expect(log.say).not.toContain('sys.xt_stele_on');
    pl.move.x = 0;
    adv(1);
    expect(log.say.filter((k) => k === 'sys.xt_stele_on')).toHaveLength(1);
  });
  it('người chết không giữ được bia', () => {
    const { st, pl, adv } = mk();
    pl.dead = true;
    adv(4);
    expect(st.held).toBe(0);
  });
});

describe('RiftVeins với host giả', () => {
  it('chú trên khe: mất thế + mất tầng; chú ngoài khe không tính; hết tầng thì gột', () => {
    const rift: MonsterRift = { phase: 1, burn: 3, weak: 6, veins: [{ x: 0, z: 0, r: 5 }] };
    const boss = { def: { rift }, state: 1, phase: 1, s: { hp: 100, x: 0, z: 0 }, chant: null as null | { startAt: number; endAt: number } } as never as import('./sim').MonEnt;
    const log = { stagger: [] as number[], purified: 0, say: [] as string[] };
    const rv = new xt.RiftVeins({
      now: () => 5000,
      monsters: () => [boss],
      stagger: (_m, s) => void log.stagger.push(s),
      purify: () => void log.purified++,
      marker: () => undefined,
      sysAll: (k) => void log.say.push(k),
    });
    const chant = (t: number, x: number) => {
      (boss.s as { x: number }).x = x;
      boss.chant = { startAt: t, endAt: t + 3500 };
      rv.tick();
    };
    chant(1, 30);
    expect(rv.burn).toBe(3);
    chant(2, 1);
    expect(log.stagger).toEqual([6]);
    expect(rv.burn).toBe(2);
    rv.tick();
    expect(rv.burn).toBe(2);
    chant(3, 0);
    expect(rv.burn).toBe(1);
    expect(log.purified).toBe(0);
    chant(4, 2);
    expect(log.purified).toBe(1);
    expect(log.say).toContain('sys.xt_purified');
  });
  it('chưa vào pha thì chưa có khe', () => {
    const rift: MonsterRift = { phase: 2, burn: 3, weak: 6, veins: [{ x: 0, z: 0, r: 5 }] };
    const boss = { def: { rift }, state: 1, phase: 1, s: { hp: 100, x: 0, z: 0 }, chant: { startAt: 1, endAt: 9 } } as never as import('./sim').MonEnt;
    let marks = 0;
    const rv = new xt.RiftVeins({ now: () => 1, monsters: () => [boss], stagger: () => undefined, purify: () => undefined, marker: () => void marks++, sysAll: () => undefined });
    rv.tick();
    expect(marks).toBe(0);
    expect(rv.burn).toBe(3);
  });
});

describe('room thật', () => {
  type TestRoom = InstanceType<Rooms['GameRoom']> & { director(): void; wave: number; nextWaveAt: number; clearedAt: number; stele: { held: number; complete: boolean } | null; veins: { burn: number; tick(): void } | null };

  async function mkRoom() {
    const { Aoi } = await import('../aoi');
    const room = Object.create(rooms.defineDungeon(LV).prototype) as Record<string, unknown> & { sim: InstanceType<typeof GameSim> };
    const spawn = DEF().dungeon!.spawn;
    room.broadcast = (type: string, msg: unknown) => sent.push({ type, msg, to: '*' });
    room.sim = new GameSim(new WorldState(), room as never, { levelId: LV, roomName: LV, spawn, respawn: spawn, persistPosition: false });
    room.aoi = new Aoi(room.sim);
    room.clients = Object.assign([] as unknown[], { getById: () => undefined });
    room.markers = { drop() {}, sync() {} };
    room.clock = { setTimeout: () => undefined, setInterval: () => undefined };
    Object.defineProperty(room, 'roomName', { value: LV });
    room.lock = () => undefined;
    Object.assign(room, { wave: 0, nextWaveAt: 0, clearedAt: 0, revives: new Map(), stele: null, veins: null, seals: null, puzzle: null });
    const char = Character.create(acc++, 'xt' + acc);
    char.level = 30;
    char.bk = 30;
    char.recalc();
    char.hp = char.mhp;
    const c = { sessionId: 'sid' + acc++, send: (type: string, msg: unknown) => sent.push({ type, msg, to: char.name }) };
    (room as unknown as { onJoin(c: unknown, o: unknown, a: unknown): void }).onJoin(c, {}, { accountId: 1, dev: true, charId: char.id, session: 's', ticket: true });
    const p = [...room.sim.players.values()][0];
    return { room: room as unknown as TestRoom, sim: room.sim, p };
  }

  const clear = (sim: InstanceType<typeof GameSim>) => {
    for (const m of sim.monsters) {
      m.state = MS_DEAD;
      m.s.st = MS_DEAD;
      m.s.hp = 0;
    }
  };
  const step = (r: TestRoom) => {
    r.nextWaveAt = 0;
    r.director();
    r.nextWaveAt = 1;
    r.director();
  };

  it('đi đủ sáu đợt: giữ bia chặn đợt 5, khe mạch gột boss, rồi hoàn thành', async () => {
    const { room, sim, p } = await mkRoom();
    const alive = () => sim.monsters.filter((m) => m.state !== MS_DEAD);
    for (let w = 1; w <= 3; w++) {
      step(room);
      expect(room.wave).toBe(w);
      clear(sim);
    }
    step(room);
    expect(room.wave).toBe(4);
    expect(room.stele).toBeTruthy();
    clear(sim);
    step(room);
    expect(room.wave).toBe(4);
    room.stele!.held = 60;
    clear(sim);
    step(room);
    expect(room.wave).toBe(5);
    expect(room.stele).toBeNull();
    clear(sim);
    step(room);
    expect(room.wave).toBe(6);
    const boss = alive().find((m) => m.def.id === 'boss_tu_quang_duc_chu')!;
    expect(boss).toBeTruthy();
    expect(room.veins).toBeTruthy();
    boss.phase = 2;
    // Sàn 1 máu: sát thương dồn không giết được boss còn khe mạch, bỏ qua cơ chế không đi vòng được.
    const hpBefore = p.char.xp;
    sim.damageMonster(boss, boss.s.mhp * 5, p);
    expect(boss.state).not.toBe(MS_DEAD);
    expect(boss.s.hp).toBe(1);
    sim.addHazard({ x: 1, z: 1, r: 3 }, 5, 0, false, 'fire', boss.id, 100);
    expect(sim.hazards.some((h) => h.mon === boss)).toBe(true);
    const rift = boss.def.rift!;
    for (let i = 0; i < 3; i++) {
      boss.s.x = rift.veins[i].x;
      boss.s.z = rift.veins[i].z;
      boss.chant = { startAt: 100 + i, endAt: 9999 };
      room.veins!.tick();
    }
    // Gột qua đường giết chung: chết, hủy vùng đã thả, tính tu vi cho người đã đánh.
    expect(boss.state).toBe(MS_DEAD);
    expect(sim.hazards.some((h) => h.mon === boss)).toBe(false);
    expect(boss.removeAt).toBeGreaterThan(0);
    expect(p.char.xp).toBeGreaterThan(hpBefore);
    step(room);
    expect(room.wave).toBe(7);
    expect(room.clearedAt).toBeGreaterThan(0);
  });
});
