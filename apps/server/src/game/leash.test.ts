import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { MS_ATTACK, MS_CHASE, MS_IDLE, MS_RETURN } from '@dtl/shared';

// Quái bỏ đuổi rồi về nhà (phép thử `leash:check`): về tới nơi thì đứng yên, đầy máu; nhà sát vật cản cũng không được kẹt ở trạng thái "đang về".
process.env.DB_FILE = ':memory:';

type Sim = import('./sim').GameSim;
let GameSim: typeof import('./sim').GameSim;
let WorldState: typeof import('../state').WorldState;
let Character: typeof import('./character').Character;
let MONSTER: typeof import('@dtl/content').MONSTER;

beforeAll(async () => {
  ({ GameSim } = await import('./sim'));
  ({ WorldState } = await import('../state'));
  ({ Character } = await import('./character'));
  ({ MONSTER } = await import('@dtl/content'));
});

afterEach(() => vi.useRealTimers());

let acc = 98000;

/** Kéo một con sói có nhà ở (hx, hz) chạy 14 giây về phía đông rồi đứng yên; trả về trạng thái sau tối đa 60 giây. */
function pull(hx: number, hz: number) {
  const sim: Sim = new GameSim(new WorldState(), { broadcast: () => {} } as never, {
    levelId: 'van_lam',
    roomName: 'test',
    spawn: { x: hx, z: hz },
    respawn: { x: hx, z: hz },
    persistPosition: false,
  });
  const char = Character.create(acc++, 'Leash' + acc);
  char.level = 30;
  char.recalc();
  char.hp = char.mhp;
  const p = sim.addPlayer({ sessionId: 'le' + acc, send: () => {} } as never, char, true, 's' + acc);
  p.god = true;
  const m = sim.spawnMonster(MONSTER.get('mon_soi_xam')!, 5, hx, hz, null);
  const put = (x: number) => {
    p.move.x = x;
    p.move.z = hz;
    p.move.y = sim.terrain.groundAt(x, hz);
  };
  put(hx + 4);
  sim.damageMonster(m, 1, p);
  vi.useFakeTimers({ toFake: ['Date'] });
  let x = hx + 4;
  let gave = false;
  let far = 0;
  for (let t = 0; t < 600; t++) {
    if (!gave && t < 140) put((x += 0.9));
    vi.setSystemTime(Date.now() + 100);
    sim.tick(100);
    far = Math.max(far, Math.hypot(m.s.x - hx, m.s.z - hz));
    if (m.state !== MS_CHASE && m.state !== MS_ATTACK) gave = true;
    if (gave && m.state === MS_IDLE) break;
  }
  return { m, gave, far, home: Math.hypot(m.s.x - hx, m.s.z - hz) };
}

describe('quái bỏ đuổi và về nhà', () => {
  it('chỗ trống: bỏ ở mép tầm, về tới nhà, đứng yên, đầy máu', () => {
    const { m, gave, far, home } = pull(2040, 2040);
    expect(gave).toBe(true);
    expect(far).toBeGreaterThan(30);
    expect(far).toBeLessThan(60);
    expect(m.state).toBe(MS_IDLE);
    expect(home).toBeLessThan(1);
    expect(m.s.hp).toBe(m.s.mhp);
  });

  it('nhà sát vật rắn (Vân Lam 2091, 2463): không kẹt ở trạng thái đang về, đứng yên gần nhà, đầy máu', () => {
    const { m, gave, home } = pull(2091, 2463);
    expect(gave).toBe(true);
    expect(m.state).not.toBe(MS_RETURN);
    expect(m.state).toBe(MS_IDLE);
    expect(home).toBeLessThan(4.5);
    expect(m.s.hp).toBe(m.s.mhp);
  });
});
