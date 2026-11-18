import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { MS_CHASE, MS_DEAD, MS_RETURN, type FxMsg } from '@dtl/shared';

// DV-3E: Kim Dạ Cung. Dữ liệu đợt, hàm thuần, KimDaSystem với host giả (Châm Bà, tinh anh đôi, mặc cả, Kim dạ),
// và một lượt DungeonRoom thật đi qua sáu đợt (kể cả đố đèn 4 cột).
process.env.DB_FILE = ':memory:';
process.env.AUTH_DEV_BYPASS = '1';

type Ent = import('./sim').PlayerEnt;
type MonEnt = import('./sim').MonEnt;
type Rooms = typeof import('../rooms');
let GameSim: typeof import('./sim').GameSim;
let WorldState: typeof import('../state').WorldState;
let Character: typeof import('./character').Character;
let rooms: Rooms;
let transfer: typeof import('../transfer');
let content: typeof import('@dtl/content');
let kd: typeof import('./kimda');
let pzl: typeof import('./mirrorpuzzle');

beforeAll(async () => {
  ({ GameSim } = await import('./sim'));
  ({ WorldState } = await import('../state'));
  ({ Character } = await import('./character'));
  rooms = await import('../rooms');
  transfer = await import('../transfer');
  content = await import('@dtl/content');
  kd = await import('./kimda');
  pzl = await import('./mirrorpuzzle');
});

afterEach(() => {
  vi.restoreAllMocks();
  transfer.tickets.clear();
  sent.length = 0;
});

const sent: { type: string; msg: unknown; to: string }[] = [];
let acc = 76000;
const LV = 'kim_da_cung';
const DEF = () => content.LEVELS[LV];

describe('dữ liệu Kim Dạ Cung', () => {
  it('sáu đợt đúng thiết kế mục 5.2, vào từ Bắc Hoang, cấp 28 (trần cấp hiện tại)', () => {
    const d = DEF().dungeon!;
    expect(d.minLevel).toBe(28);
    expect(d.returnLevel).toBe('bac_hoang');
    expect(d.private).toBe(true);
    expect(d.maxRevives).toBe(2);
    expect(d.waves).toHaveLength(6);
    expect(d.waves[0].mons.map((g) => [g.id, g.n])).toEqual([
      ['mon_giac_kiem_trong_binh', 8],
      ['mon_kd_trien_bo_cham_ba', 2],
    ]);
    expect(d.waves[1].mons[0]).toMatchObject({ id: 'mon_u_anh_cot_loc', n: 6 });
    expect(d.waves[2].mons[0]).toMatchObject({ id: 'elite_kd_huyet_giac_ma_tuong', n: 2 });
    expect(d.waves[3].puzzle!.points).toHaveLength(4);
    expect(d.waves[4].mons[0].id).toBe('boss_tan_hoa_kiem_co');
    expect(d.waves[5].mons[0].id).toBe('boss_kim_da_ma_hau');
    expect(content.LEVELS.bac_hoang.portals).toContainEqual(expect.objectContaining({ to: LV }));
    expect(rooms.roomNameOf(LV)).toBe('dungeon-kim_da_cung');
    expect(content.LEVEL_ASSETS[LV].palace).toBe('gilt');
  });

  it('thưởng: 15% tu vi, Kim Dạ Miện Phiến + Tẫn Giác, mảnh cả ba bộ bậc 5', () => {
    const r = DEF().dungeon!.reward!;
    expect(r.xpPct).toBe(0.15);
    expect(r.items.map((i) => i.item)).toEqual(expect.arrayContaining(['itm_kim_da_mien', 'itm_tan_giac']));
    expect([...new Set(r.equip!.map((e) => e.set))].sort()).toEqual(['set_tan_thiet', 'set_tinh_dan_bao', 'set_tran_khich']);
  });

  it('Ma Hậu: pha 2 mặc cả, pha 3 Kim dạ khớp hai bia; Kiếm Cơ có vệt lửa; hai Huyết Giác là đôi', () => {
    const boss = content.MONSTER.get('boss_kim_da_ma_hau')!;
    expect(boss.kd!.bargain).toMatchObject({ phase: 1, mon: 'mon_kd_bong_mac_ca' });
    expect(boss.kd!.night!.phase).toBe(2);
    expect(boss.kd!.night!.steles).toHaveLength(2);
    expect(boss.phases).toHaveLength(2);
    expect(JSON.stringify(content.MONSTER.get('boss_tan_hoa_kiem_co')!.ai)).toContain('"trail"');
    expect(content.MONSTER.get('elite_kd_huyet_giac_ma_tuong')!.kd!.twin!.mul).toBeGreaterThan(1);
    expect(content.MONSTER.get('mon_kd_trien_bo_cham_ba')!.kd!.mend!.pct).toBeGreaterThan(0);
  });
});

describe('hàm thuần', () => {
  it('inAny', () => {
    const cs = [
      { x: 0, z: 0, r: 5 },
      { x: 20, z: 0, r: 5 },
    ];
    expect(kd.inAny(cs, 3, 3)).toBe(true);
    expect(kd.inAny(cs, 20, 4)).toBe(true);
    expect(kd.inAny(cs, 10, 0)).toBe(false);
    expect(kd.inAny([], 0, 0)).toBe(false);
  });
  it('shadowSpot: đối xứng qua tâm, ít nhất sep mét; boss ở tâm thì ra +x', () => {
    expect(kd.shadowSpot({ x: -20, z: 0 }, { x: 0, z: 0 }, 10)).toEqual({ x: 20, z: 0 });
    const s = kd.shadowSpot({ x: 2, z: 0 }, { x: 0, z: 0 }, 18);
    expect(Math.hypot(s.x - 2, s.z)).toBeCloseTo(18);
    expect(kd.shadowSpot({ x: 0, z: 0 }, { x: 0, z: 0 }, 18)).toEqual({ x: 18, z: 0 });
  });
  it('shuffleN là hoán vị của 0..n-1 (đố đèn 4 cột)', () => {
    for (const r of [() => 0, () => 0.5, () => 0.99]) expect([...pzl.shuffleN(4, r)].sort()).toEqual([0, 1, 2, 3]);
  });
});

// ---- host giả ----
interface FakeMon {
  id: string;
  def: Record<string, unknown> & { id: string; kd?: Record<string, unknown> };
  state: number;
  level: number;
  atk: number;
  phase: number;
  stunUntil: number;
  evadeUntil: number;
  minionOf?: string;
  chant: { startAt: number; endAt: number } | null;
  s: { x: number; z: number; hp: number; mhp: number; st: number };
  removeAt: number;
}
const mon = (id: string, def: FakeMon['def'], x = 0, z = 0, hp = 100): FakeMon => ({
  id,
  def: { ...def, id: def.id ?? id },
  state: MS_CHASE,
  level: 28,
  atk: 100,
  phase: 0,
  stunUntil: 0,
  evadeUntil: 0,
  chant: null,
  s: { x, z, hp, mhp: 100, st: MS_CHASE },
  removeAt: 0,
});

function mk(mons: FakeMon[], center = { x: 0, z: 0 }) {
  const t = { now: 100000 };
  const pl = [{ move: { x: 0, z: 0 }, s: { mhp: 1000 }, dead: false }];
  const log = {
    dmg: [] as { src: string; n: number }[],
    say: [] as string[],
    marks: [] as number[],
    fx: [] as FxMsg[],
    smash: [] as number[],
    spawned: [] as string[],
    heal: 0,
  };
  const sys = new kd.KimDaSystem({
    now: () => t.now,
    monsters: () => mons as never,
    players: () => pl as never,
    isDead: (p) => (p as never as { dead: boolean }).dead,
    isGhost: () => false,
    damagePlayer: (_p, n, src) => void log.dmg.push({ src, n }),
    healMonster: (m, n) => {
      log.heal += n;
      m.s.hp = Math.min(m.s.mhp, m.s.hp + n);
    },
    spawn: (id, level, x, z, owner) => {
      log.spawned.push(id);
      const e = mon('sp' + log.spawned.length, { id }, x, z, 5);
      e.level = level;
      e.minionOf = (owner as never as FakeMon).id;
      mons.push(e);
      return e as never;
    },
    despawn: (m) => {
      m.state = MS_DEAD;
      m.s.hp = 0;
    },
    marker: (_x, _z, r) => void log.marks.push(r),
    smash: (_m, x) => void log.smash.push(x),
    fx: (m) => void log.fx.push(m),
    center: () => center,
    sysAll: (k) => void log.say.push(k),
  });
  const adv = (s: number) => {
    for (let i = 0; i < s * 4; i++) {
      t.now += 250;
      sys.tick();
    }
  };
  return { sys, t, pl, log, adv, mons };
}

describe('KimDaSystem với host giả', () => {
  it('Châm Bà hồi cho bầy, không hồi cho boss, bị choáng thì ngừng', () => {
    const cham = mon('cb', { id: 'cb', kd: { mend: { cd: 6, r: 14, pct: 0.1 } } }, 0, 0, 100);
    const a = mon('a', { id: 'a' }, 5, 0, 50);
    const far = mon('far', { id: 'far' }, 40, 0, 50);
    const boss = mon('boss', { id: 'boss', boss: true }, 3, 0, 50);
    const { adv, log, t } = mk([cham, a, far, boss]);
    adv(2);
    expect(a.s.hp).toBe(50);
    adv(6);
    expect(a.s.hp).toBeGreaterThanOrEqual(60);
    expect(far.s.hp).toBe(50);
    expect(boss.s.hp).toBe(50);
    expect(log.say.filter((k) => k === 'sys.kd_mend')).toHaveLength(1);
    const hp = a.s.hp;
    cham.stunUntil = t.now + 60000;
    adv(12);
    expect(a.s.hp).toBe(hp);
  });

  it('tinh anh đôi: chết một con thì con kia nổi giận đúng một lần', () => {
    const e1 = mon('e1', { id: 'twin', kd: { twin: { mul: 1.5 } } });
    const e2 = mon('e2', { id: 'twin', kd: { twin: { mul: 1.5 } } });
    const { adv, log } = mk([e1, e2]);
    adv(1);
    expect(e2.atk).toBe(100);
    e1.state = MS_DEAD;
    adv(1);
    expect(e2.atk).toBe(150);
    adv(2);
    expect(e2.atk).toBe(150);
    expect(log.say).toContain('sys.kd_twin_rage');
  });

  it('một Huyết Giác sống một mình từ đầu thì không nổi giận', () => {
    const e1 = mon('e1', { id: 'twin', kd: { twin: { mul: 1.5 } } });
    const { adv } = mk([e1]);
    adv(2);
    expect(e1.atk).toBe(100);
  });

  const maHau = () =>
    mon('mh', {
      id: 'mh',
      boss: true,
      kd: {
        bargain: { phase: 1, mon: 'bong', sep: 18, pen: 0.2 },
        night: {
          phase: 2,
          steles: [
            { x: -16, z: 0, r: 8 },
            { x: 16, z: 0, r: 8 },
          ],
          press: 0.04,
          cd: 16,
          warn: 2,
          mul: 2.4,
          dur: 7,
          grace: 6,
        },
      },
    });

  it('mặc cả: chú xong mà bóng còn sống thì cả đội chịu phạt; hạ bóng kịp thì không', () => {
    const boss = maHau();
    boss.phase = 1;
    boss.s.x = -20;
    const { adv, log, mons, t } = mk([boss]);
    adv(1);
    expect(log.spawned).toEqual([]);
    boss.chant = { startAt: t.now, endAt: t.now + 3000 };
    adv(0.25);
    expect(log.spawned).toEqual(['bong']);
    const sh = mons[1];
    expect(sh.s.x).toBeCloseTo(20);
    expect(log.say).toContain('sys.kd_bargain');
    adv(3);
    expect(log.dmg.filter((d) => d.src === 'kd_bargain')).toEqual([{ src: 'kd_bargain', n: 200 }]);
    expect(log.say).toContain('sys.kd_bargain_bad');
    expect(sh.state).toBe(MS_DEAD);
    // Lần chú sau: hạ bóng kịp.
    log.dmg.length = 0;
    boss.chant = { startAt: t.now + 1, endAt: t.now + 3000 };
    adv(0.25);
    expect(log.spawned).toHaveLength(2);
    mons[2].state = MS_DEAD;
    mons[2].s.hp = 0;
    adv(3);
    expect(log.dmg).toHaveLength(0);
    expect(log.say).toContain('sys.kd_bargain_ok');
  });

  it('mặc cả chỉ từ pha 2 (phase ≥ 1)', () => {
    const boss = maHau();
    const { adv, log, t } = mk([boss]);
    boss.chant = { startAt: t.now, endAt: t.now + 3000 };
    adv(1);
    expect(log.spawned).toEqual([]);
  });

  it('Kim dạ: ngoài vòng sáng mất 4%/giây, trong vòng thì không; bia trống quá grace tắt; boss dập luân phiên', () => {
    const boss = maHau();
    boss.phase = 2;
    const { adv, log, sys, pl } = mk([boss]);
    pl[0].move = { x: 16, z: 0 };
    adv(0.25);
    expect(log.say).toContain('sys.kd_night');
    expect(sys.litCount()).toBe(2);
    expect(log.dmg).toHaveLength(0);
    expect(log.fx.filter((f) => f.t === 'kd_stele').map((f) => f.pg)).toEqual([1, 1]);
    pl[0].move = { x: 0, z: 30 };
    log.dmg.length = 0;
    adv(1);
    const n = log.dmg.filter((d) => d.src === 'kd_night').reduce((s, d) => s + d.n, 0);
    expect(n).toBeGreaterThanOrEqual(36);
    expect(n).toBeLessThanOrEqual(44);
    // Người đứng bia phải: bia trái trống quá 6 s thì tắt; còn lại người đó vẫn an toàn.
    pl[0].move = { x: 16, z: 0 };
    log.dmg.length = 0;
    adv(8);
    // Trong 8 s boss đã dập bia trái (bia đầu tiên còn sáng): bia tắt, người ở bia phải vẫn không mất máu.
    expect(log.smash).toEqual([-16]);
    expect(log.say).toContain('sys.kd_stele_smash');
    expect(log.dmg.filter((d) => d.src === 'kd_night')).toHaveLength(0);
    expect(sys.litCount()).toBe(1);
  });

  it('Kim dạ: bia không người giữ quá grace thì tắt (báo số bia), có người giữ thì không', () => {
    const boss = maHau();
    boss.phase = 2;
    const { adv, log, pl } = mk([boss]);
    pl[0].move = { x: -16, z: 0 };
    adv(7);
    expect(log.say).not.toContain('sys.kd_stele_out');
    adv(3);
    expect(log.say).toContain('sys.kd_stele_out');
  });

  it('Ma Hậu chết giữa chú mặc cả thì bóng bị gỡ, không phạt đội', () => {
    const boss = maHau();
    boss.phase = 1;
    const { adv, log, mons, t } = mk([boss]);
    boss.chant = { startAt: t.now, endAt: t.now + 3000 };
    adv(0.25);
    const sh = mons[1];
    boss.state = MS_DEAD;
    adv(4);
    expect(sh.state).toBe(MS_DEAD);
    expect(log.dmg.filter((d) => d.src === 'kd_bargain')).toHaveLength(0);
  });

  it('boss rút lui về pha trước hoặc bỏ đuổi: Kim dạ và bóng mặc cả bị dọn', () => {
    const boss = maHau();
    boss.phase = 2;
    const { adv, log, sys, t, mons } = mk([boss]);
    adv(1);
    expect(sys.litCount()).toBe(2);
    boss.phase = 0;
    adv(0.25);
    expect(sys.litCount()).toBe(-1);
    expect(log.fx.filter((f) => f.t === 'kd_stele' && f.d === 0)).toHaveLength(2);
    boss.phase = 1;
    boss.chant = { startAt: t.now, endAt: t.now + 3000 };
    adv(0.25);
    const sh = mons[1];
    expect(sh.state).not.toBe(MS_DEAD);
    boss.evadeUntil = t.now + 10000;
    adv(0.25);
    expect(sh.state).toBe(MS_DEAD);
  });

  it('bóng mặc cả là đệ tử của boss (không thưởng, không tính hạ)', () => {
    const boss = maHau();
    boss.phase = 1;
    const { adv, mons, t } = mk([boss]);
    boss.chant = { startAt: t.now, endAt: t.now + 3000 };
    adv(0.25);
    expect(mons[1].minionOf).toBe('mh');
  });

  it('chú của boss bị ngắt giữa chừng: bóng gỡ, không phạt, không phạt lần sau cho chú cũ', () => {
    const boss = maHau();
    boss.phase = 1;
    const { adv, log, mons, t } = mk([boss]);
    boss.chant = { startAt: t.now, endAt: t.now + 3000 };
    adv(0.25);
    const sh = mons[1];
    boss.chant = null;
    boss.stunUntil = t.now + 5000;
    adv(4);
    expect(sh.state).toBe(MS_DEAD);
    expect(log.dmg.filter((d) => d.src === 'kd_bargain')).toHaveLength(0);
    expect(log.say).not.toContain('sys.kd_bargain_bad');
  });

  it('boss về chỗ (MS_RETURN, leash/wipe): bia Kim dạ và bóng mặc cả dọn ngay', () => {
    const boss = maHau();
    boss.phase = 2;
    const { adv, sys, log, mons, t } = mk([boss]);
    adv(1);
    expect(sys.litCount()).toBe(2);
    boss.state = MS_RETURN;
    adv(0.25);
    expect(sys.litCount()).toBe(-1);
    boss.state = MS_CHASE;
    boss.phase = 1;
    boss.chant = { startAt: t.now, endAt: t.now + 3000 };
    adv(0.25);
    const sh = mons[1];
    boss.state = MS_RETURN;
    adv(0.25);
    expect(sh.state).toBe(MS_DEAD);
    adv(4);
    expect(log.dmg.filter((d) => d.src === 'kd_bargain')).toHaveLength(0);
  });

  it('tinh anh đôi cuồng nộ rồi về chỗ: trả sức đánh gốc, đếm lại', () => {
    const e1 = mon('e1', { id: 'twin', kd: { twin: { mul: 1.5 } } });
    const e2 = mon('e2', { id: 'twin', kd: { twin: { mul: 1.5 } } });
    const { adv } = mk([e1, e2]);
    adv(1);
    e1.state = MS_DEAD;
    adv(1);
    expect(e2.atk).toBe(150);
    e2.state = MS_RETURN;
    adv(0.25);
    expect(e2.atk).toBe(100);
    e2.state = MS_CHASE;
    adv(2);
    expect(e2.atk).toBe(100);
  });

  it('Kim dạ dừng khi boss chết: gỡ cột bia, bóng', () => {
    const boss = maHau();
    boss.phase = 2;
    const { adv, log, sys } = mk([boss]);
    adv(1);
    log.fx.length = 0;
    boss.state = MS_DEAD;
    adv(0.25);
    expect(log.fx.filter((f) => f.t === 'kd_stele' && f.d === 0)).toHaveLength(2);
    expect(sys.litCount()).toBe(-1);
  });
});

describe('room thật', () => {
  type TestRoom = InstanceType<Rooms['GameRoom']> & {
    director(): void;
    wave: number;
    nextWaveAt: number;
    clearedAt: number;
    kimda: unknown;
    puzzle: { active: boolean; done: boolean; tick(): void } | null;
  };

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
    Object.assign(room, {
      wave: 0,
      nextWaveAt: 0,
      clearedAt: 0,
      revives: new Map(),
      stele: null,
      veins: null,
      kimda: null,
      seals: null,
      puzzle: null,
    });
    const char = Character.create(acc++, 'kd' + acc);
    char.level = 30;
    char.bk = 30;
    char.recalc();
    char.hp = char.mhp;
    const c = { sessionId: 'sid' + acc++, send: (type: string, msg: unknown) => sent.push({ type, msg, to: char.name }) };
    (room as unknown as { onJoin(c: unknown, o: unknown, a: unknown): void }).onJoin(
      c,
      {},
      { accountId: 1, dev: true, charId: char.id, session: 's', ticket: true },
    );
    const p = [...room.sim.players.values()][0] as Ent;
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

  it('đi đủ sáu đợt: Châm Bà đợt 1, đôi Huyết Giác đợt 3, đố đèn đợt 4 chặn tới khi giải, Kiếm Cơ, Ma Hậu', async () => {
    const { room, sim } = await mkRoom();
    const alive = () => sim.monsters.filter((m: MonEnt) => m.state !== MS_DEAD);
    step(room);
    expect(room.wave).toBe(1);
    expect(room.kimda).toBeTruthy();
    expect(alive().filter((m) => m.def.id === 'mon_kd_trien_bo_cham_ba')).toHaveLength(2);
    clear(sim);
    step(room);
    expect(room.wave).toBe(2);
    clear(sim);
    step(room);
    expect(room.wave).toBe(3);
    expect(alive().filter((m) => m.def.id === 'elite_kd_huyet_giac_ma_tuong')).toHaveLength(2);
    expect(room.kimda).toBeTruthy();
    clear(sim);
    step(room);
    expect(room.wave).toBe(4);
    expect(room.puzzle).toBeTruthy();
    expect(sent.some((s) => JSON.stringify(s.msg).includes('kd_lamp_puzzle'))).toBe(true);
    // Chưa giải xong đố đèn thì director không sang đợt sau.
    step(room);
    expect(room.wave).toBe(4);
    room.puzzle!.done = true;
    step(room);
    expect(room.wave).toBe(5);
    expect(alive().map((m) => m.def.id)).toEqual(['boss_tan_hoa_kiem_co']);
    clear(sim);
    step(room);
    expect(room.wave).toBe(6);
    const boss = alive().find((m) => m.def.id === 'boss_kim_da_ma_hau')!;
    expect(boss).toBeTruthy();
    expect(boss.def.rift).toBeUndefined();
    clear(sim);
    step(room);
    expect(room.wave).toBe(7);
    expect(room.clearedAt).toBeGreaterThan(0);
  });
});
