import { beforeAll, describe, expect, it, vi } from 'vitest';
import { BOLT_MAX_LIVE, type BoltEndMsg, type BoltMsg, COLLIDERS, FLY_MIN_CLEAR, groundAt, type MonsterCaster, MS_CHASE, MS_RETURN, S, VALLEY } from '@dtl/shared';

// Đạn đánh xa (D1): server mô phỏng và phán định theo vị trí người chơi server giữ.
// DB trong bộ nhớ: sim.ts kéo theo character.ts → db.ts.
process.env.DB_FILE = ':memory:';

type Sim = import('./sim').GameSim;
let GameSim: typeof import('./sim').GameSim;
let WorldState: typeof import('../state').WorldState;
let PlayerS: typeof import('../state').PlayerS;
let MONSTER: typeof import('@dtl/content').MONSTER;

beforeAll(async () => {
  ({ GameSim } = await import('./sim'));
  ({ WorldState, PlayerS } = await import('../state'));
  ({ MONSTER } = await import('@dtl/content'));
});

const BOLT: MonsterCaster = { range: 14, cast: 0.8, delay: 1, cd: 4, mul: 1.3, shape: 'bolt', r: 0.55, speed: 10, kind: 'fire' };
const X = VALLEY.x + 40;
const Z = VALLEY.z + 40;

interface Sent {
  type: string;
  msg: unknown;
}

function setup() {
  const sent: Sent[] = [];
  const sim: Sim = new GameSim(new WorldState(), { broadcast: (type: string, msg: unknown) => sent.push({ type, msg }) } as never, {
    levelId: 'van_lam',
    roomName: 'test',
    spawn: { x: X, z: Z },
    respawn: { x: X, z: Z },
    persistPosition: false,
  });
  const base = MONSTER.get('mon_hoa_van_ho')!;
  const def = { ...base, ai: { caster: BOLT } };
  const mon = sim.spawnMonster(def, 10, X, Z, null);
  mon.state = MS_CHASE;
  const s = new PlayerS();
  const p = {
    sid: 'p1',
    s,
    move: { x: X, y: groundAt(X, Z + 8), z: Z + 8 },
    char: { def: 5, hp: 1000, mhp: 1000, meta: {} },
    mth: { guardUntil: 0, guardReduce: 0 },
    shield: null,
    meditating: false,
    lastCombatAt: 0,
    hazardWin: { until: 0, taken: 0 },
  };
  sim.players.set('p1', p as never);
  const fire = (yaw = 0, lift = 0) =>
    (sim as unknown as { fireBolts(m: unknown, c: MonsterCaster, yaw: number, lift: number): void }).fireBolts(mon, BOLT, yaw, lift);
  const tickTo = (ms: number) => {
    sim.now = ms;
    (sim as unknown as { tickBolts(): void }).tickBolts();
  };
  return { sim, sent, mon, p, fire, tickTo };
}

const of = <T>(sent: Sent[], type: string) => sent.filter((x) => x.type === type).map((x) => x.msg as T);

describe('đạn đánh xa: server phán định', () => {
  it('bắn gửi S.BOLT với gốc/hướng/tốc độ/giờ server, không có sát thương', () => {
    const { sim, sent, fire } = setup();
    sim.now = 1_000_000;
    fire(0);
    const [b] = of<BoltMsg>(sent, S.BOLT);
    expect(b).toMatchObject({ yaw: 0, v: 10, r: 0.55, t: 1_000_000, kind: 'fire' });
    expect(b.life).toBeCloseTo((14 * 1.6) / 10);
    expect(b).not.toHaveProperty('dmg');
    expect(sim.bolts).toHaveLength(1);
  });

  it('đứng trên đường bay thì trúng: S.BOLT_END có hit, máu giảm', () => {
    const { sim, sent, p, fire, tickTo } = setup();
    sim.now = 1_000_000;
    fire(0);
    for (let t = 50; t <= 1500; t += 50) tickTo(1_000_000 + t);
    const ends = of<BoltEndMsg>(sent, S.BOLT_END);
    expect(ends).toHaveLength(1);
    expect(ends[0].hit).toBe('p1');
    expect(p.char.hp).toBeLessThan(1000);
    expect(sim.bolts).toHaveLength(0);
  });

  it('bước ngang ra khỏi đường bay thì né được, đạn hết hạn không gửi tin', () => {
    const { sim, sent, p, fire, tickTo } = setup();
    sim.now = 1_000_000;
    fire(0);
    tickTo(1_000_300);
    p.move.x = X + 1.5; // né sang ngang khi đạn còn đang bay
    for (let t = 350; t <= 3000; t += 50) tickTo(1_000_000 + t);
    expect(of(sent, S.BOLT_END)).toHaveLength(0);
    expect(p.char.hp).toBe(1000);
    expect(sim.bolts).toHaveLength(0);
  });

  it('không xuyên người giữa hai tick dù tick thưa (quét theo đoạn)', () => {
    const { sim, p, fire, tickTo } = setup();
    sim.now = 1_000_000;
    fire(0);
    tickTo(1_001_500); // một bước nhảy 15 m qua người đứng cách 8 m
    expect(p.char.hp).toBeLessThan(1000);
  });

  it('ngự kiếm lơ lửng sát đất vẫn trúng (đạn nâng theo độ cao lúc bắn)', () => {
    const { sim, sent, p, fire, tickTo } = setup();
    p.move.y += FLY_MIN_CLEAR + 0.3;
    sim.now = 1_000_000;
    fire(0, FLY_MIN_CLEAR + 0.3);
    expect(of<BoltMsg>(sent, S.BOLT)[0].h).toBeCloseTo(FLY_MIN_CLEAR + 0.3);
    for (let t = 50; t <= 1500; t += 50) tickTo(1_000_000 + t);
    expect(p.char.hp).toBeLessThan(1000);
  });

  it('không trúng người đứng sau vật cản dù tick dài', () => {
    const { sim, mon, p, fire, tickTo } = setup();
    const c = COLLIDERS[COLLIDERS.length - 1]; // cự kiếm Kiếm Trủng
    mon.s.x = c.x;
    mon.s.z = c.z - c.r - 3;
    p.move.x = c.x;
    p.move.z = c.z + c.r + 2;
    p.move.y = groundAt(p.move.x, p.move.z);
    sim.now = 1_000_000;
    fire(0);
    tickTo(1_002_000);
    expect(p.char.hp).toBe(1000);
    expect(sim.bolts).toHaveLength(0);
  });

  it('bay cao trên đầu đạn (ngự kiếm) thì không trúng', () => {
    const { sim, p, fire, tickTo } = setup();
    p.move.y += 6;
    sim.now = 1_000_000;
    fire(0);
    for (let t = 50; t <= 3000; t += 50) tickTo(1_000_000 + t);
    expect(p.char.hp).toBe(1000);
  });

  it('quái bỏ đuổi (evade) hay chết thì đạn tan, không gây sát thương', () => {
    const { sim, sent, mon, p, fire, tickTo } = setup();
    sim.now = 1_000_000;
    fire(0);
    tickTo(1_000_100);
    mon.state = MS_RETURN;
    tickTo(1_000_150);
    const ends = of<BoltEndMsg>(sent, S.BOLT_END);
    expect(ends).toHaveLength(1);
    expect(ends[0].hit).toBeUndefined();
    for (let t = 200; t <= 2000; t += 50) tickTo(1_000_000 + t);
    expect(p.char.hp).toBe(1000);
  });

  it('người đã chết không bị đạn chạm', () => {
    const { sim, p, fire, tickTo } = setup();
    p.s.fl = 2; // PF_DEAD
    sim.now = 1_000_000;
    fire(0);
    for (let t = 50; t <= 3000; t += 50) tickTo(1_000_000 + t);
    expect(p.char.hp).toBe(1000);
  });

  it('nhiều đạn trúng cùng lúc chỉ tính đòn mạnh nhất (chung cửa sổ miễn với vùng nổ)', () => {
    const { sim, sent, p, fire, tickTo } = setup();
    // Cố định RNG (chí mạng) để sáu đạn bằng nhau; đạn mạnh hơn thì chỉ gây phần chênh (hazardHit).
    const rnd = vi.spyOn(Math, 'random').mockReturnValue(0.5);
    sim.now = 1_000_000;
    for (let i = 0; i < 6; i++) fire(0);
    tickTo(1_001_500);
    rnd.mockRestore();
    expect(of<BoltEndMsg>(sent, S.BOLT_END).filter((e) => e.hit === 'p1')).toHaveLength(6);
    const dmg = of<{ dst: string; n: number }>(sent, S.DMG).filter((d) => d.dst === 'p1');
    expect(dmg).toHaveLength(6);
    expect(dmg.filter((d) => d.n > 0)).toHaveLength(1);
    expect(1000 - p.char.hp).toBe(dmg[0].n);
  });

  it('giới hạn số đạn đang bay trong room', () => {
    const { sim, fire } = setup();
    sim.now = 1_000_000;
    for (let i = 0; i < BOLT_MAX_LIVE + 10; i++) fire(Math.PI);
    expect(sim.bolts).toHaveLength(BOLT_MAX_LIVE);
  });
});
