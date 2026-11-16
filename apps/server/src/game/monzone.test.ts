import { beforeAll, describe, expect, it } from 'vitest';
import { type HazardMsg, MS_CHASE, S, pullStep } from '@dtl/shared';
import { MonZones, POOL_MAX, type MonZoneHost, type ZoneMon, type ZonePlayer } from './monzone';

// E3-G: Nuốt (kéo người chơi) của Vân Hải Kình Vương và vũng độc khi chết của Bích Ngọc Kim Thiền.
process.env.DB_FILE = ':memory:';

type Sim = import('./sim').GameSim;
let GameSim: typeof import('./sim').GameSim;
let WorldState: typeof import('../state').WorldState;
let PlayerS: typeof import('../state').PlayerS;
let C: typeof import('@dtl/content');
let SH: typeof import('@dtl/shared');

beforeAll(async () => {
  ({ GameSim } = await import('./sim'));
  ({ WorldState, PlayerS } = await import('../state'));
  C = await import('@dtl/content');
  SH = await import('@dtl/shared');
});

const T0 = 1_000_000;
const DT = 50;
type Private = { tickHazards(): void; releaseChant(m: unknown, c: unknown): void };

function setup(monId: string, lv = 23) {
  const KN = SH.levelSpawns(C.LEVELS.van_hai).find((s) => s.mon === 'boss_van_hai_kinh_vuong')!;
  const X = KN.x;
  const Z = KN.z;
  const sent: { type: string; msg: unknown }[] = [];
  const sim: Sim = new GameSim(new WorldState(), { broadcast: (type: string, msg: unknown) => sent.push({ type, msg }) } as never, {
    levelId: 'van_hai',
    roomName: 'test',
    spawn: { x: X, z: Z },
    respawn: { x: X, z: Z },
    persistPosition: false,
  });
  const mon = sim.spawnMonster(C.MONSTER.get(monId)!, lv, X, Z, null);
  mon.state = MS_CHASE;
  mon.target = 'p1';
  mon.attackAt = Number.MAX_SAFE_INTEGER;
  const priv = sim as unknown as Private;
  let n = 0;
  const addPlayer = (dx: number, dz: number, flying = false) => {
    const sid = 'p' + ++n;
    const p = {
      sid,
      s: new PlayerS(),
      move: { x: X + dx, y: sim.terrain.groundAt(X + dx, Z + dz), z: Z + dz, vy: 0, grounded: true, flying },
      inputs: [] as unknown[],
      casting: null,
      char: { def: 5, hp: 100000, mhp: 100000, meta: {}, level: lv },
      mth: { guardUntil: 0, guardReduce: 0 },
      shield: null,
      meditating: false,
      lastCombatAt: 0,
      hazardWin: { until: 0, taken: 0 },
      client: { send: () => {} },
    };
    sim.players.set(sid, p as never);
    return p;
  };
  let t = T0;
  sim.now = t;
  const run = (ms: number) => {
    const end = t + ms;
    while (t < end) {
      t += DT;
      sim.now = t;
      priv.tickHazards();
      sim.zones.tick();
    }
  };
  const hazards = () => sent.filter((x) => x.type === S.HAZARD).map((x) => x.msg as HazardMsg);
  return { sim, mon, addPlayer, run, hazards, priv, X, Z };
}

const distTo = (p: { move: { x: number; z: number } }, m: { x: number; z: number }) => Math.hypot(p.move.x - m.x, p.move.z - m.z);

describe('pullStep (hàm thuần)', () => {
  it('kéo đều theo thời gian, không vượt chỗ còn lại, không kéo khi đã tới', () => {
    expect(pullStep(15, 15, 3, 1, 0.5)).toBeCloseTo(6);
    expect(pullStep(15, 4, 3, 1, 0.5)).toBeCloseTo(1);
    expect(pullStep(15, 3, 3, 1, 0.5)).toBe(0);
    expect(pullStep(15, 2, 3, 1, 0.5)).toBe(0);
    expect(pullStep(15, 10, 3, 0, 0.5)).toBe(0);
  });
});

describe('Nuốt: kéo người chơi', () => {
  const chantOf = (mon: { def: import('@dtl/shared').MonsterDef }) => mon.def.phases!.find((p) => p.ai?.chant)!.ai!.chant!;

  it('dữ liệu: boss pha 30% có pull; vòng báo mv=pull, vùng nổ chỉ nổ sau khi kéo xong', () => {
    const { mon, sim, priv, hazards, addPlayer } = setup('boss_van_hai_kinh_vuong');
    const c = chantOf(mon);
    expect(c.pull).toBeTruthy();
    addPlayer(0, 12);
    priv.releaseChant(mon, c);
    const hs = hazards();
    expect(hs.find((h) => h.mv === 'pull')).toMatchObject({ r: c.pull!.range, delay: c.pull!.delay });
    const blast = hs.find((h) => !h.mv)!;
    expect(blast.delay).toBeCloseTo(c.delay + c.pull!.delay + c.pull!.dur);
    expect(sim.zones.pullCount).toBe(1);
  });

  it('người trong vòng bị kéo tới cách boss `stop` m (chỉ sau giờ báo); người ngoài vòng đứng yên', () => {
    const { mon, priv, addPlayer, run } = setup('boss_van_hai_kinh_vuong');
    const c = chantOf(mon);
    const inside = addPlayer(0, 15);
    const outside = addPlayer(0, c.pull!.range + 6);
    const z0 = outside.move.z;
    priv.releaseChant(mon, c);
    run(c.pull!.delay * 1000 - 100);
    expect(distTo(inside, mon.s)).toBeCloseTo(15, 0);
    run((c.pull!.dur + 0.4) * 1000 + 100);
    expect(distTo(inside, mon.s)).toBeLessThanOrEqual(c.pull!.stop + 0.3);
    expect(distTo(inside, mon.s)).toBeGreaterThan(c.pull!.stop - 0.5);
    expect(outside.move.z).toBe(z0);
    expect(inside.move.y).toBeCloseTo(mon.s.y, 0);
  });

  it('người ngự kiếm (lơ lửng) kháng kéo', () => {
    const { mon, priv, addPlayer, run } = setup('boss_van_hai_kinh_vuong');
    const c = chantOf(mon);
    const flyer = addPlayer(0, 15, true);
    const walker = addPlayer(15, 0);
    priv.releaseChant(mon, c);
    run((c.pull!.delay + c.pull!.dur + 0.5) * 1000);
    expect(distTo(flyer, mon.s)).toBeCloseTo(15, 1);
    expect(distTo(walker, mon.s)).toBeLessThanOrEqual(c.pull!.stop + 0.3);
  });

  it('boss chết giữa chừng thì ngừng kéo', () => {
    const { mon, sim, priv, addPlayer, run } = setup('boss_van_hai_kinh_vuong');
    const c = chantOf(mon);
    const p = addPlayer(0, 15);
    priv.releaseChant(mon, c);
    run(c.pull!.delay * 1000 + 100);
    sim.damageMonster(mon, 1e12, null);
    const d = distTo(p, mon.s);
    run(1500);
    expect(distTo(p, mon.s)).toBeCloseTo(d, 5);
    expect(sim.zones.pullCount).toBe(0);
  });

  it('không kéo qua chỗ chặn: host báo đi ngắn thì người đó dừng kéo', () => {
    let now = 0;
    const p: ZonePlayer = { sid: 'a', move: { x: 0, y: 0, z: 10 } };
    const m: ZoneMon = { id: 'boss', s: { x: 0, z: 0 }, atk: 10, state: 1, stunUntil: 0 };
    const host: MonZoneHost = {
      now: () => now,
      players: () => [p],
      isDead: () => false,
      resists: () => false,
      active: () => true,
      // Vách ở z = 6: không đi qua.
      drag: (pl, _dx, _dz, dist) => {
        const d = Math.min(dist, Math.max(0, pl.move.z - 6));
        pl.move.z -= d;
        return d;
      },
      tooHigh: () => false,
      telegraph: () => {},
      poisonHit: () => {},
      notify: () => {},
    };
    const z = new MonZones(host);
    z.startPull(m, { range: 20, delay: 1, dur: 1, stop: 2 }, 'frost');
    for (now = 50; now <= 3000; now += 50) z.tick();
    expect(p.move.z).toBeGreaterThanOrEqual(6 - 1e-6);
    expect(p.move.z).toBeLessThan(10);
  });
});

describe('Bích Ngọc Kim Thiền: vũng độc khi chết', () => {
  it('dữ liệu: có deathPool, vạch báo ≥ 0,9 s, sát thương nhỏ', () => {
    const d = C.MONSTER.get('mon_bich_ngoc_kim_thien')!.deathPool!;
    expect(d.delay).toBeGreaterThanOrEqual(0.9);
    expect(d.mul).toBeLessThanOrEqual(0.5);
    expect(d.r).toBeLessThanOrEqual(6);
  });

  it('chết: vạch báo mv=pool kèm dur; chưa hết giờ báo thì chưa trúng; sau đó mỗi nhịp trúng người trong vũng', () => {
    const { sim, mon, addPlayer, hazards, run } = setup('mon_bich_ngoc_kim_thien', 21);
    const d = mon.def.deathPool!;
    const inside = addPlayer(0.5, 0.5);
    const outside = addPlayer(d.r + 3, 0);
    sim.damageMonster(mon, 1e12, null);
    const pool = hazards().find((h) => h.mv === 'pool')!;
    expect(pool).toMatchObject({ x: mon.s.x, z: mon.s.z, r: d.r, delay: d.delay, dur: d.dur });
    run(d.delay * 1000 - 100);
    expect(inside.char.hp).toBe(100000);
    run(d.tick * 1000 + 200);
    const afterOne = inside.char.hp;
    expect(afterOne).toBeLessThan(100000);
    expect(100000 - afterOne).toBeLessThan(100000 * 0.05);
    run(d.tick * 1000);
    expect(inside.char.hp).toBeLessThan(afterOne);
    expect(outside.char.hp).toBe(100000);
  });

  it('rời vũng thì hết sát thương; vũng tắt sau `dur` giây', () => {
    const { sim, mon, addPlayer, run } = setup('mon_bich_ngoc_kim_thien', 21);
    const d = mon.def.deathPool!;
    const p = addPlayer(0.3, 0.3);
    sim.damageMonster(mon, 1e12, null);
    run((d.delay + d.tick) * 1000 + 200);
    const hit = p.char.hp;
    expect(hit).toBeLessThan(100000);
    p.move.x += d.r + 4;
    run(3000);
    expect(p.char.hp).toBe(hit);
    p.move.x -= d.r + 4;
    run(d.dur * 1000);
    const end = p.char.hp;
    run(3000);
    expect(p.char.hp).toBe(end);
    expect(sim.zones.poolCount).toBe(0);
  });

  it('người ngự kiếm bay cao (> 8 m) phía trên vũng không ăn độc', () => {
    const { sim, mon, addPlayer, run } = setup('mon_bich_ngoc_kim_thien', 21);
    const d = mon.def.deathPool!;
    const high = addPlayer(0.3, 0.3, true);
    high.move.y += 12;
    const low = addPlayer(-0.3, -0.3);
    sim.damageMonster(mon, 1e12, null);
    run((d.delay + d.tick * 3) * 1000 + 200);
    expect(high.char.hp).toBe(100000);
    expect(low.char.hp).toBeLessThan(100000);
  });

  it('quái không có deathPool chết thì không để vũng; trần vũng cùng lúc', () => {
    const { sim, mon } = setup('mon_van_hac', 21);
    sim.damageMonster(mon, 1e12, null);
    expect(sim.zones.poolCount).toBe(0);
    const t = setup('mon_bich_ngoc_kim_thien', 21);
    for (let i = 0; i < POOL_MAX + 6; i++) t.sim.zones.onDeath({ id: 'x' + i, s: { x: t.X, z: t.Z }, atk: 10, state: 5, stunUntil: 0 }, t.mon.def.deathPool);
    expect(t.sim.zones.poolCount).toBe(POOL_MAX);
  });
});
