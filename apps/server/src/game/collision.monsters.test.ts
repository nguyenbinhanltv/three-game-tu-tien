import { beforeAll, describe, expect, it } from 'vitest';
import { collisionOf, groundAt, MS_CHASE, type Shape, VALLEY } from '@dtl/shared';

// COL-1 / C-2: quái bị vật rắn chặn không được đứng ép mãi (không hồi máu, không miễn sát thương) trong khi người đánh an toàn:
// kẹt quá 4 s mà không tiến gần thì coi là không với tới → bỏ đuổi, hồi đầy, miễn sát thương (`evadeUntil`).
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

const X = VALLEY.x + 40;
const Z = VALLEY.z + 40;
const T0 = 2_000_000;

function setup(shapes: Shape[], playerLift = 0) {
  const set = collisionOf('van_lam');
  set.clear();
  set.add(shapes);
  const sim: Sim = new GameSim(new WorldState(), { broadcast: () => undefined } as never, {
    levelId: 'van_lam',
    roomName: 'test',
    spawn: { x: X, z: Z },
    respawn: { x: X, z: Z },
    persistPosition: false,
  });
  const def = MONSTER.get('mon_hoa_van_ho')!;
  const mon = sim.spawnMonster({ ...def, ai: { ...def.ai, caster: undefined } }, 10, X, Z, null);
  mon.state = MS_CHASE;
  const p = {
    sid: 'p1',
    s: new PlayerS(),
    move: { x: X, y: groundAt(X, Z + 8) + playerLift, z: Z + 8 },
    char: { def: 5, hp: 1000, mhp: 1000, meta: {} },
    mth: { guardUntil: 0, guardReduce: 0 },
    shield: null,
    meditating: false,
    lastCombatAt: 0,
    hazardWin: { until: 0, taken: 0 },
    connected: true,
    lastInputAt: T0,
  };
  sim.players.set('p1', p as never);
  mon.target = 'p1';
  mon.threat.set('p1', 100);
  mon.s.hp = 50;
  return { sim, mon, set };
}

/** Chạy `secs` giây mô phỏng, 20 Hz. */
function run(sim: Sim, mon: ReturnType<typeof setup>['mon'], secs: number): void {
  for (let t = 0; t < secs * 20; t++) {
    sim.now = T0 + (t + 1) * 50;
    (sim as unknown as { tickMonster(m: unknown, dt: number): void }).tickMonster(mon, 0.05);
  }
}

describe('quái kẹt sau vật rắn (COL-1)', () => {
  it('không có vật chắn: quái tới gần người, không bỏ đuổi', () => {
    const { sim, mon } = setup([]);
    run(sim, mon, 6);
    expect(mon.evadeUntil).toBe(0);
    expect(Math.hypot(mon.s.x - X, mon.s.z - (Z + 8))).toBeLessThan(4);
  });

  it('tường dài chắn giữa quái và người: sau ~4 s kẹt thì bỏ đuổi, hồi đầy, miễn sát thương', () => {
    const { sim, mon } = setup([
      { k: 'box', x: X, z: Z + 4, hx: 40, hz: 0.6, yaw: 0, y0: groundAt(X, Z) - 1, y1: groundAt(X, Z) + 6, walk: false },
    ]);
    run(sim, mon, 8);
    expect(mon.evadeUntil).toBeGreaterThan(T0);
    expect(mon.s.hp).toBe(mon.s.mhp);
    expect(mon.target).toBe(''); // bỏ đuổi
  });

  it('người đứng trên phiến đá cao 1 m (quái chỉ bước lên ≤ 0,5 m): quái kẹt dưới chân thì bỏ đuổi', () => {
    const g = groundAt(X, Z + 8);
    const { sim, mon } = setup([{ k: 'box', x: X, z: Z + 8, hx: 4, hz: 4, yaw: 0, y0: g - 1, y1: g + 1, walk: true }], 1);
    run(sim, mon, 8);
    expect(mon.evadeUntil).toBeGreaterThan(T0);
    expect(mon.s.hp).toBe(mon.s.mhp);
  });
});
