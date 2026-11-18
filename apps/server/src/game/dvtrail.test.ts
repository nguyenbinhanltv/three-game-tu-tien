import { beforeAll, describe, expect, it } from 'vitest';
import { type HazardMsg, MS_CHASE, S, trailSpots } from '@dtl/shared';

// DV-2 đợt 4: vệt lửa Tẫn Hỏa Kiếm Cơ (`trail` của line/charge) và neo hồi máu của Thủ Khích Dực Chủ (`anchor`).
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
type Private = { tickHazards(): void };

function setup(monId: string, lv = 31) {
  const sp = SH.levelSpawns(C.LEVELS.bac_hoang).find((s) => s.mon === monId)!;
  const X = sp.x;
  const Z = sp.z;
  const sent: { type: string; msg: unknown }[] = [];
  const sim: Sim = new GameSim(new WorldState(), { broadcast: (type: string, msg: unknown) => sent.push({ type, msg }) } as never, {
    levelId: 'bac_hoang',
    roomName: 'test',
    spawn: { x: X, z: Z },
    respawn: { x: X, z: Z },
    persistPosition: false,
  });
  const mon = sim.spawnMonster(C.MONSTER.get(monId)!, lv, X, Z, null);
  mon.state = MS_CHASE;
  mon.target = 'p1';
  mon.attackAt = Number.MAX_SAFE_INTEGER;
  let n = 0;
  const addPlayer = (dx: number, dz: number) => {
    const sid = 'p' + ++n;
    const p = {
      sid,
      s: new PlayerS(),
      move: { x: X + dx, y: sim.terrain.groundAt(X + dx, Z + dz), z: Z + dz, vy: 0, grounded: true, flying: false },
      inputs: [] as unknown[],
      casting: null,
      char: { def: 5, hp: 1e9, mhp: 1e9, meta: {}, level: lv },
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
      (sim as unknown as Private).tickHazards();
      sim.zones.tick();
    }
  };
  const hazards = () => sent.filter((x) => x.type === S.HAZARD).map((x) => x.msg as HazardMsg);
  return { sim, mon, addPlayer, run, hazards, X, Z };
}

describe('trailSpots (hàm thuần)', () => {
  it('chia đều dọc vạch, theo hướng yaw, tối đa 8 vũng, ít nhất 1', () => {
    const a = trailSpots(0, 0, 0, 14, 1.8);
    expect(a.length).toBe(6);
    expect(a[0].z).toBeGreaterThan(0);
    expect(a[a.length - 1].z).toBeLessThan(14);
    expect(a.every((p) => Math.abs(p.x) < 1e-9)).toBe(true);
    expect(trailSpots(0, 0, Math.PI / 2, 40, 1).length).toBe(8);
    expect(trailSpots(0, 0, Math.PI / 2, 40, 1)[0].x).toBeGreaterThan(0);
    expect(trailSpots(5, 5, 0, 1, 4)).toHaveLength(1);
  });
});

describe('vệt lửa Tẫn Hỏa Kiếm Cơ', () => {
  it('dữ liệu: line (pha 65%) và charge đều để lại vệt lửa 8 s', () => {
    const def = C.MONSTER.get('boss_tan_hoa_kiem_co')!;
    expect(def.ai!.charge!.trail).toMatchObject({ dur: 8, kind: 'fire' });
    expect(def.phases!.find((p) => p.ai?.line)!.ai!.line!.trail).toMatchObject({ dur: 8, kind: 'fire' });
  });

  it('chuỗi vũng báo mv=trail đúng lúc vạch nổ; ai đứng trong vệt chịu sát thương mỗi nhịp, ngoài vệt thì không, hết 8 s thì tắt', () => {
    const { sim, mon, addPlayer, run, hazards, X, Z } = setup('boss_tan_hoa_kiem_co');
    const cfg = C.MONSTER.get('boss_tan_hoa_kiem_co')!.ai!.charge!.trail!;
    const inside = addPlayer(0, 6); // trên đường lao hướng +z
    const outside = addPlayer(6, 6);
    const hp0 = inside.char.hp;
    sim.zones.addTrail(mon, X, Z, 0, 14, cfg, 0.9);
    const hs = hazards().filter((h) => h.mv === 'trail');
    expect(hs.length).toBe(trailSpots(X, Z, 0, 14, cfg.r).length);
    expect(hs.every((h) => h.delay === 0.9 && h.dur === cfg.dur && h.kind === 'fire' && h.src === mon.id)).toBe(true);
    run(800);
    expect(inside.char.hp).toBe(hp0); // chưa nổ: chưa cháy
    run(2300);
    expect(inside.char.hp).toBeLessThan(hp0);
    expect(outside.char.hp).toBe(outside.char.mhp);
    run(cfg.dur * 1000 + 1500);
    const after = inside.char.hp;
    run(3000);
    expect(inside.char.hp).toBe(after);
    expect(sim.zones.poolCount).toBe(0);
  });
});

describe('Thủ Khích Dực Chủ: neo gốc khe', () => {
  it('dữ liệu: có giáng thương, dực tường, khai khích gọi Tẫn chủng, neo 10 m 1%/s; chuỗi mon_tan_chung tồn tại', () => {
    const def = C.MONSTER.get('boss_thu_khich_duc_chu')!;
    expect(def.ai!.line).toMatchObject({ r: 22, w: 4, delay: 1.3 });
    expect(def.ai!.reflect).toBeTruthy();
    expect(def.ai!.summon).toMatchObject({ mon: 'mon_tan_chung', n: 3, cd: 25 });
    expect(def.ai!.anchor).toEqual({ r: 10, pct: 0.01 });
    expect(C.MONSTER.has('mon_tan_chung')).toBe(true);
  });

  it('đứng trong 10 m quanh chỗ sinh ra thì hồi ~1%/s, kéo ra xa thì không hồi', () => {
    const { sim, mon, addPlayer } = setup('boss_thu_khich_duc_chu');
    const p = addPlayer(0, 4);
    mon.s.hp = Math.floor(mon.s.mhp * 0.5);
    const tick = (secs: number) => {
      for (let i = 0; i < secs * 20; i++) {
        sim.now += DT;
        sim.monSkills.tick(mon, p as never, 4, true, DT / 1000);
      }
    };
    const h0 = mon.s.hp;
    tick(10);
    expect(mon.s.hp - h0).toBeGreaterThan(mon.s.mhp * 0.09);
    expect(mon.s.hp - h0).toBeLessThan(mon.s.mhp * 0.11);
    mon.s.x = mon.homeX + 14;
    const h1 = mon.s.hp;
    tick(5);
    expect(mon.s.hp).toBe(h1);
  });
});
