import { beforeAll, describe, expect, it } from 'vitest';
import { groundAt, MS_CHASE, VALLEY } from '@dtl/shared';

// Bảng tổng kết trận (U5): bộ đếm chỉ cộng dồn tại điểm sát thương/hồi máu thật của server.
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

const X = VALLEY.x + 40;
const Z = VALLEY.z + 40;

function setup() {
  const sim: Sim = new GameSim(new WorldState(), { broadcast: () => undefined } as never, {
    levelId: 'van_lam',
    roomName: 'test',
    spawn: { x: X, z: Z },
    respawn: { x: X, z: Z },
    persistPosition: false,
  });
  // `rift`: quái không chết vì sát thương (chỉ về 1 máu), để thử phần vượt máu mà không chạy đường rơi đồ.
  const mon = sim.spawnMonster({ ...MONSTER.get('mon_hoa_van_ho')!, rift: true } as never, 10, X, Z, null);
  mon.state = MS_CHASE;
  const p = {
    sid: 'p1',
    client: { send: () => undefined },
    s: new PlayerS(),
    move: { x: X, y: groundAt(X, Z + 8), z: Z + 8 },
    char: { name: 'A', level: 10, def: 0, hp: 500, mhp: 1000, meta: {}, stats: { healRecv: 0 }, gainXp: () => undefined },
    mth: { guardUntil: 0, guardReduce: 0, reflectUntil: 0 },
    shield: null,
    meditating: false,
    lastCombatAt: 0,
    hazardWin: { until: 0, taken: 0 },
  };
  sim.players.set('p1', p as never);
  return { sim, mon, p };
}

describe('số liệu trận (U5)', () => {
  it('sát thương gây ra chỉ tính phần thật (quái còn 100 máu, chỉ rơi về 1)', async () => {
    const { statOf } = await import('./matchstats');
    const { sim, mon, p } = setup();
    mon.s.hp = 100;
    sim.damageMonster(mon, 60, p as never);
    sim.damageMonster(mon, 500, p as never);
    expect(statOf(p as never).dealt).toBe(99);
  });
  it('sát thương nhận không vượt máu còn lại; hồi tính phần thật', async () => {
    const { statOf } = await import('./matchstats');
    const { sim, p } = setup();
    sim.damagePlayer(p as never, 80, '');
    expect(statOf(p as never).taken).toBe(80);
    expect(p.char.hp).toBe(420);
    (sim as unknown as { healPlayer(p: unknown, n: number): void }).healPlayer(p, 100);
    expect(statOf(p as never).heal).toBe(100);
    (sim as unknown as { healPlayer(p: unknown, n: number): void }).healPlayer(p, 10_000);
    expect(statOf(p as never).heal).toBe(100 + 480);
  });
  it('bản tổng hợp xếp theo sát thương và gồm cả người chết', async () => {
    const { recapOf, statOf } = await import('./matchstats');
    const { p } = setup();
    statOf(p as never).dealt = 40;
    const r = recapOf([p as never], 'dungeon', 75.4, () => true);
    expect(r.secs).toBe(75);
    expect(r.rows[0]).toMatchObject({ name: 'A', dealt: 40, dead: true, reflect: 0 });
  });
});
