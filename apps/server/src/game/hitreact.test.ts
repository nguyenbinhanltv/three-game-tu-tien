import { beforeAll, describe, expect, it } from 'vitest';
import {
  BOSS_STAGGER_GAP_MS,
  groundAt,
  HIT_TIER,
  MF_STUN,
  MS_CHASE,
  PF_STAGGER,
  PLAYER_KNOCK_MAX_M,
  PLAYER_STAGGER_GAP_MS,
  PLAYER_STAGGER_MAX_MS,
  registerCollision,
  VALLEY,
} from '@dtl/shared';

// Chân Cảnh S1: đẩy lùi / khựng / ngã do server quyết, kiểm va chạm; thủ lĩnh chống khựng nhẹ.
process.env.DB_FILE = ':memory:';

type Sim = import('./sim').GameSim;
let hitReactCfg: typeof import('./hitreactCfg').hitReactCfg;
let GameSim: typeof import('./sim').GameSim;
let WorldState: typeof import('../state').WorldState;
let PlayerS: typeof import('../state').PlayerS;
let MONSTER: typeof import('@dtl/content').MONSTER;

beforeAll(async () => {
  ({ hitReactCfg } = await import('./hitreactCfg'));
  hitReactCfg.enabled = true;
  ({ GameSim } = await import('./sim'));
  ({ WorldState, PlayerS } = await import('../state'));
  ({ MONSTER } = await import('@dtl/content'));
});

/** Chỗ phẳng quanh thung lũng (dốc < 0,3 trong bán kính 8 m), mỗi `n` một chỗ để cột chắn không lẫn nhau. */
function flatSpot(n: number): [number, number] {
  let found = 0;
  for (let r = 20; r < 400; r += 6) {
    for (let a = 0; a < 16; a++) {
      const x = VALLEY.x + Math.cos((a / 16) * Math.PI * 2) * r;
      const z = VALLEY.z + Math.sin((a / 16) * Math.PI * 2) * r;
      const y = groundAt(x, z);
      let ok = true;
      for (let b = 0; b < 8 && ok; b++) {
        const dx = Math.cos((b / 8) * Math.PI * 2) * 8;
        const dz = Math.sin((b / 8) * Math.PI * 2) * 8;
        ok = Math.abs(groundAt(x + dx, z + dz) - y) < 8 * 0.3;
      }
      if (ok && found++ === n) return [x, z];
    }
  }
  throw new Error('không tìm được chỗ phẳng');
}

// Mỗi test một chỗ riêng để cột chắn không lẫn nhau.
let slot = 0;
function setup(monId = 'mon_soi_xam', wall = false) {
  const [X, Z] = flatSpot(slot++);
  const sim: Sim = new GameSim(new WorldState(), { broadcast: () => {} } as never, {
    levelId: 'van_lam',
    roomName: 'test',
    spawn: { x: X, z: Z },
    respawn: { x: X, z: Z },
    persistPosition: false,
  });
  const mon = sim.spawnMonster({ ...MONSTER.get(monId)! }, 10, X, Z, null);
  mon.state = MS_CHASE;
  const p = {
    sid: 'p1',
    s: new PlayerS(),
    move: { x: X, y: groundAt(X, Z + 2), z: Z + 2, vy: 0, grounded: true, flying: false },
    inputs: [{ s: 1 }],
    char: { def: 5, hp: 1000, mhp: 1000, meta: {} },
    mth: { guardUntil: 0, guardReduce: 0 },
    shield: null,
    meditating: false,
    lastCombatAt: 0,
    hazardWin: { until: 0, taken: 0 },
    staggerUntil: 0,
    staggerOkAt: 0,
    dodgeUntil: 0,
    trib: null,
    trial: null,
  };
  sim.players.set('p1', p as never);
  // Cột chắn cách người chơi ~1 m về hướng bị đẩy (+z).
  if (wall) registerCollision('van_lam', [{ k: 'cyl', x: X, z: Z + 3.2, r: 0.8, y0: p.move.y - 5, y1: p.move.y + 6 }]);
  return { sim, mon, p, X, Z };
}

describe('người chơi trúng đòn quái', () => {
  it('đòn nhẹ không khựng, không lùi', () => {
    const { sim, p, mon } = setup();
    sim.now = 1_000_000;
    const z0 = p.move.z;
    sim.damagePlayer(p as never, 10, mon.id, false);
    expect(p.move.z).toBe(z0);
    expect(p.staggerUntil).toBe(0);
    expect(p.s.fl & PF_STAGGER).toBe(0);
  });

  it('đòn hv của thủ lĩnh: lùi theo hướng đẩy, khựng ≤ 0,6 s, cờ PF_STAGGER, xóa input chờ', () => {
    const { sim, p, mon } = setup('mon_thiet_boi_tru');
    (mon.def as { boss?: boolean }).boss = true;
    sim.now = 1_000_000;
    const z0 = p.move.z;
    sim.damagePlayer(p as never, 10, mon.id, true);
    expect(p.move.z - z0).toBeGreaterThan(0.5);
    expect(p.move.z - z0).toBeLessThanOrEqual(PLAYER_KNOCK_MAX_M + 1e-6);
    expect(p.staggerUntil - sim.now).toBe(HIT_TIER.heavy.staggerMs);
    expect(p.staggerUntil - sim.now).toBeLessThanOrEqual(PLAYER_STAGGER_MAX_MS);
    expect(p.s.fl & PF_STAGGER).toBe(PF_STAGGER);
    expect(p.inputs).toHaveLength(0);
  });

  it('không xuyên vật cản: cột sau lưng chặn đẩy lùi', () => {
    const { sim, p, mon, Z } = setup('mon_thiet_boi_tru', true);
    (mon.def as { boss?: boolean; tier?: string }).boss = true;
    (mon.def as { tier?: string }).tier = 'finisher';
    sim.now = 1_000_000;
    sim.damagePlayer(p as never, 10, mon.id, true);
    // Cột r 0,8 tại z + 3,2: người chơi không thể vượt qua tâm cột.
    expect(p.move.z).toBeLessThan(Z + 3.2);
  });

  it('chống khóa liên tục: đòn thứ hai ngay sau đó không khựng thêm', () => {
    const { sim, p, mon } = setup('mon_thiet_boi_tru');
    (mon.def as { boss?: boolean }).boss = true;
    sim.now = 1_000_000;
    sim.damagePlayer(p as never, 10, mon.id, true);
    const until = p.staggerUntil;
    const z1 = p.move.z;
    sim.now = 1_000_100;
    sim.damagePlayer(p as never, 10, mon.id, true);
    expect(p.staggerUntil).toBe(until);
    expect(p.move.z).toBe(z1);
    sim.now = until + PLAYER_STAGGER_GAP_MS + 10;
    sim.damagePlayer(p as never, 10, mon.id, true);
    expect(p.staggerUntil).toBeGreaterThan(until);
  });

  it('nguồn không phải quái (hố độc, kiếp...) không khựng', () => {
    const { sim, p } = setup();
    sim.now = 1_000_000;
    sim.damagePlayer(p as never, 10, 'kd_night', true);
    expect(p.staggerUntil).toBe(0);
  });
});

describe('quái bị người chơi đánh', () => {
  const hit = (sim: Sim, p: unknown, mon: unknown, power: number, tier?: string) =>
    (
      sim as unknown as { hitMonster(p: unknown, m: unknown, power: number, mul: number, elem: undefined, tier?: string): boolean }
    ).hitMonster(p, mon, power, 1, undefined, tier);

  function attacker(sim: Sim, X: number, Z: number) {
    const q = {
      sid: 'p1',
      move: { x: X, y: groundAt(X, Z - 2), z: Z - 2 },
      char: { atk: 50, stats: { critRate: 0, critMul: 1.5, setFx: { critSlowSec: 0 } }, meta: {}, equip: {}, level: 1 },
      mth: { lockCharge: true },
    };
    sim.players.set('p1', q as never);
    return q;
  }

  it('quái thường: đòn nặng đẩy lùi và khựng, không tính là choáng nhận thêm sát thương', () => {
    const { sim, mon, X, Z } = setup('mon_soi_xam');
    const q = attacker(sim, X, Z);
    mon.s.hp = mon.s.mhp = 1_000_000;
    sim.now = 1_000_000;
    const z0 = mon.s.z;
    expect(hit(sim, q, mon, 2.3)).toBe(true);
    expect(mon.s.z - z0).toBeGreaterThan(0.5);
    expect(mon.stunUntil - sim.now).toBe(HIT_TIER.heavy.staggerMs);
    expect(mon.staggerUntil).toBe(mon.stunUntil);
    expect(mon.s.mf & MF_STUN).toBe(MF_STUN);
  });

  it('chiêu cuối làm quái thường ngã lâu hơn khựng', () => {
    const { sim, mon, X, Z } = setup('mon_soi_xam');
    const q = attacker(sim, X, Z);
    mon.s.hp = mon.s.mhp = 1_000_000;
    sim.now = 1_000_000;
    hit(sim, q, mon, 4.6);
    expect(mon.stunUntil - sim.now).toBeGreaterThan(HIT_TIER.finisher.staggerMs);
  });

  it('thủ lĩnh: đòn vừa không khựng; đòn nặng khựng nhưng không lùi, có giãn giữa hai lần', () => {
    const { sim, mon, X, Z } = setup('mon_thiet_boi_tru');
    (mon.def as { boss?: boolean }).boss = true;
    const q = attacker(sim, X, Z);
    mon.s.hp = mon.s.mhp = 1_000_000;
    sim.now = 1_000_000;
    const z0 = mon.s.z;
    hit(sim, q, mon, 1.7);
    expect(mon.stunUntil).toBe(0);
    hit(sim, q, mon, 2.3);
    expect(mon.s.z).toBe(z0);
    expect(mon.stunUntil - sim.now).toBe(HIT_TIER.heavy.staggerMs);
    const until = mon.stunUntil;
    sim.now = until + 10;
    hit(sim, q, mon, 4.6);
    expect(mon.stunUntil).toBe(until);
    sim.now = 1_000_000 + BOSS_STAGGER_GAP_MS + 10;
    hit(sim, q, mon, 4.6);
    expect(mon.stunUntil).toBeGreaterThan(until);
  });

  it('dữ liệu `tier` của chiêu thắng suy theo hệ số', () => {
    const { sim, mon, X, Z } = setup('mon_soi_xam');
    const q = attacker(sim, X, Z);
    mon.s.hp = mon.s.mhp = 1_000_000;
    sim.now = 1_000_000;
    hit(sim, q, mon, 4.6, 'light');
    expect(mon.stunUntil).toBe(0);
  });
});

describe('chuỗi đòn thường và siêu giáp (sửa theo review)', () => {
  it('strikeTier: đòn kb của chuỗi tối thiểu vừa, đòn thường theo chiêu', async () => {
    const { strikeTier, SKILL } = await import('@dtl/content').then(async (c) => ({ ...(await import('@dtl/shared')), SKILL: c.SKILL }));
    const sk = SKILL.get('skl_phi_kiem')!;
    expect(strikeTier(sk, 0)).toBe('light');
    expect(strikeTier(sk, 2)).toBe('medium');
    expect(strikeTier({ tier: 'light', combo: { window: 1, hits: [{ power: 1, hitAt: 0, kb: true }] } }, 0)).toBe('medium');
    expect(strikeTier({ tier: 'heavy', combo: { window: 1, hits: [{ power: 1, hitAt: 0, kb: true }] } }, 0)).toBe('heavy');
    expect(strikeTier({ tier: 'light', combo: { window: 1, hits: [{ power: 1, hitAt: 0, tier: 'finisher' }] } }, 0)).toBe('finisher');
  });

  it('đòn 3 của chuỗi Phi Kiếm đẩy/khựng quái thường, đòn 1 thì không', () => {
    const { sim, mon, X, Z } = setup('mon_soi_xam');
    const q = {
      sid: 'p1',
      move: { x: X, y: groundAt(X, Z - 2), z: Z - 2 },
      char: { atk: 50, stats: { critRate: 0, critMul: 1.5, setFx: { critSlowSec: 0 } }, meta: {}, equip: {}, level: 1 },
      mth: { lockCharge: true },
    };
    sim.players.set('p1', q as never);
    mon.s.hp = mon.s.mhp = 1_000_000;
    sim.now = 1_000_000;
    const sk = (sim as unknown as { combat: { strike(p: unknown, m: unknown, s: unknown, pw: number, em: number, c?: number): void } })
      .combat;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const skill = {
      id: 'x',
      elem: undefined,
      tier: 'light',
      combo: {
        window: 2,
        hits: [
          { power: 0.9, hitAt: 0 },
          { power: 0.9, hitAt: 0 },
          { power: 1.4, hitAt: 0, kb: true },
        ],
      },
    };
    const z0 = mon.s.z;
    sk.strike(q, mon, skill, 0.9, 1, 0);
    expect(mon.stunUntil).toBe(0);
    sk.strike(q, mon, skill, 1.4, 1, 2);
    expect(mon.s.z - z0).toBeGreaterThan(0.3); // đòn vừa: đẩy nhẹ, quái thường không khựng (giữ nhịp đánh)
    expect(mon.stunUntil).toBe(0);
  });

  it('boss đang niệm chú trúng đòn nặng: không khựng, cờ chú nguyên vẹn', () => {
    const { sim, mon, X, Z } = setup('mon_thiet_boi_tru');
    (mon.def as { boss?: boolean }).boss = true;
    const q = {
      sid: 'p1',
      move: { x: X, y: groundAt(X, Z - 2), z: Z - 2 },
      char: { atk: 50, stats: { critRate: 0, critMul: 1.5, setFx: { critSlowSec: 0 } }, meta: {}, equip: {}, level: 1 },
      mth: { lockCharge: true },
    };
    sim.players.set('p1', q as never);
    mon.s.hp = mon.s.mhp = 1_000_000;
    sim.now = 1_000_000;
    mon.chant = { startAt: sim.now - 500, endAt: sim.now + 1500 };
    const h = (sim as unknown as { hitMonster(p: unknown, m: unknown, pw: number, mul: number): boolean }).hitMonster;
    h.call(sim, q, mon, 4.6, 1);
    expect(mon.stunUntil).toBe(0);
    expect(mon.chant).not.toBeNull();
  });

  it('khựng hết thì không cộng 600 ms nhịp đánh', () => {
    const { sim, mon, X, Z } = setup('mon_soi_xam');
    const q = {
      sid: 'p1',
      move: { x: X, y: groundAt(X, Z - 2), z: Z - 2 },
      char: { atk: 50, stats: { critRate: 0, critMul: 1.5, setFx: { critSlowSec: 0 } }, meta: {}, equip: {}, level: 1 },
      mth: { lockCharge: true },
    };
    sim.players.set('p1', q as never);
    mon.s.hp = mon.s.mhp = 1_000_000;
    sim.now = 1_000_000;
    mon.attackAt = 0;
    (sim as unknown as { hitMonster(p: unknown, m: unknown, pw: number, mul: number): boolean }).hitMonster(q, mon, 2.3, 1);
    expect(mon.stunUntil).toBeGreaterThan(sim.now);
    sim.players.clear();
    sim.now = mon.stunUntil + 1;
    (sim as unknown as { tickMonster(m: unknown, dt: number): void }).tickMonster(mon, 0.05);
    expect(mon.stunUntil).toBe(0);
    expect(mon.attackAt).toBeLessThan(sim.now + 600);
  });
});
