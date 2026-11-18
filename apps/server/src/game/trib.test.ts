import { beforeAll, describe, expect, it } from 'vitest';
import {
  canFlyAt,
  freeFlight,
  groundAt,
  S,
  TRIB_FINAL,
  TRIB_NET,
  TRIB_PHASE_END,
  TRIB_PILL_MAX,
  TRIBULATION_DURATION,
  TRUC_CO_FREE_FLY_ALT,
  TRUC_CO_LEVEL,
  type DmgMsg,
  type HazardMsg,
} from '@dtl/shared';

// Độ kiếp ba pha (S2-C): lôi võng, tia cuối khóa mệnh, giới hạn đan, và quyền bay miễn linh lực của Trúc Cơ.
process.env.DB_FILE = ':memory:';

type Ent = import('./sim').PlayerEnt;
let GameSim: typeof import('./sim').GameSim;
let WorldState: typeof import('../state').WorldState;
let Character: typeof import('./character').Character;
let ITEM: typeof import('@dtl/content').ITEM;

beforeAll(async () => {
  ({ GameSim } = await import('./sim'));
  ({ WorldState } = await import('../state'));
  ({ Character } = await import('./character'));
  ({ ITEM } = await import('@dtl/content'));
});

const X = 2040;
const Z = 2040;
let acc = 9000;

function setup(level = 15) {
  const sent: { type: string; msg: unknown }[] = [];
  const host = { broadcast: (type: string, msg: unknown) => sent.push({ type, msg }) };
  const sim = new GameSim(new WorldState(), host as never, {
    levelId: 'van_lam',
    roomName: 'test',
    spawn: { x: X, z: Z },
    respawn: { x: X, z: Z },
    persistPosition: false,
  });
  const char = Character.create(acc++, 'trb' + acc);
  char.level = level;
  char.recalc();
  char.hp = char.mhp;
  char.mp = char.mmp;
  const client = { sessionId: 'c' + acc, send: () => undefined };
  const p = sim.addPlayer(client as never, char, true, 'c' + acc);
  p.move.x = X;
  p.move.z = Z;
  p.move.y = groundAt(X, Z);
  const priv = sim as unknown as {
    tickTribulation(p: Ent): void;
    tickHazards(): void;
    hazards: { at: number; lock?: boolean; sh?: string }[];
  };
  const begin = (elapsed: number) => {
    sim.now = 1_000_000;
    p.trib = { endAt: sim.now + (TRIBULATION_DURATION - elapsed) * 1000, nextAt: sim.now, n: 0, fin: false, pills: 0 };
  };
  const hazards = () => sent.filter((x) => x.type === S.HAZARD).map((x) => x.msg as HazardMsg);
  const dmg = () => sent.filter((x) => x.type === S.DMG && (x.msg as DmgMsg).dst === p.sid).map((x) => x.msg as DmgMsg);
  return { sim, p, priv, begin, hazards, dmg, sent };
}

describe('độ kiếp ba pha', () => {
  it('pha 1: không có vạch lôi võng; pha 2: cứ hai đợt thả ba vạch (mỗi vạch một chuỗi vòng sét)', () => {
    const t = setup();
    t.begin(5);
    t.priv.tickTribulation(t.p);
    t.sim.now += 5000;
    t.priv.tickTribulation(t.p);
    expect(t.hazards().length).toBeLessThan(TRIB_NET.lines * TRIB_NET.count);
    t.begin(TRIB_PHASE_END[0] + 1);
    for (let i = 0; i < 4; i++) {
      t.priv.tickTribulation(t.p);
      t.sim.now += 2500;
    }
    const net = t.hazards().filter((h) => h.r === TRIB_NET.r && h.delay === TRIB_NET.delay);
    expect(net.length).toBe(TRIB_NET.lines * TRIB_NET.count * 2);
  });

  it('pha 3: một tia cuối khóa mệnh, chỉ thả một lần, đánh chủ kiếp dù đứng ngoài vòng', () => {
    const t = setup();
    t.begin(TRIB_PHASE_END[1] + 0.1);
    t.priv.tickTribulation(t.p);
    t.priv.tickTribulation(t.p);
    const big = t.hazards().filter((h) => h.big);
    expect(big.length).toBe(1);
    expect(big[0].r).toBe(TRIB_FINAL.r);
    expect(big[0].delay).toBe(TRIB_FINAL.delay);
    // Chạy ra ngoài vòng 9 m trong 3 giây, tia vẫn trúng.
    const mhp = t.p.char.mhp;
    t.p.move.x += 40;
    t.priv.hazards.length = 0;
    t.priv.hazards.push({
      x: X,
      z: Z,
      r: TRIB_FINAL.r,
      at: t.sim.now,
      dmg: TRIB_FINAL.pct,
      pct: true,
      atk: 0,
      mon: null,
      src: t.p.sid,
      lock: true,
    } as never);
    t.priv.tickHazards();
    expect(t.p.char.hp).toBeCloseTo(mhp * (1 - TRIB_FINAL.pct), 0);
  });

  it('đan Kim Cương (buff phòng ngự) giảm tia cuối; khiên hấp thụ trước', () => {
    const t = setup();
    t.begin(TRIB_PHASE_END[1] + 0.1);
    t.p.char.meta.buffs = { def: { m: 0.15, until: Date.now() + 60_000 } };
    const mhp = t.p.char.mhp;
    t.priv.hazards.push({
      x: X,
      z: Z,
      r: TRIB_FINAL.r,
      at: t.sim.now,
      dmg: TRIB_FINAL.pct,
      pct: true,
      atk: 0,
      mon: null,
      src: t.p.sid,
      lock: true,
    } as never);
    t.priv.tickHazards();
    const cut = 1 - Math.min(TRIB_FINAL.defMaxCut, 0.15 * TRIB_FINAL.defMul);
    expect(mhp - t.p.char.hp).toBeCloseTo(mhp * TRIB_FINAL.pct * cut, 0);
    expect(t.dmg().length).toBe(1);
  });

  it('vòng chồng nhau của cùng một vạch chỉ đánh một lần; hai vạch khác nhau đánh riêng', () => {
    const t = setup();
    t.begin(15);
    t.p.char.hp = t.p.char.mhp;
    const h = (grp: number) => ({ x: X, z: Z, r: 3, at: t.sim.now, dmg: 0.1, pct: true, atk: 0, mon: null, src: t.p.sid, grp }) as never;
    t.priv.hazards.push(h(1), h(1), h(1));
    t.priv.tickHazards();
    expect(t.dmg().length).toBe(1);
    t.priv.hazards.push(h(2), h(3));
    t.priv.tickHazards();
    expect(t.dmg().length).toBe(3);
  });

  it('hết kiếp (chết, hồi sinh ở chỗ khác) trước lúc tia cuối nổ thì không bị khóa mệnh', () => {
    const t = setup();
    t.begin(TRIB_PHASE_END[1] + 0.1);
    t.priv.tickTribulation(t.p);
    const mhp = t.p.char.mhp;
    t.p.trib = null; // kiếp đã kết thúc
    t.p.move.x += 60; // hồi sinh ở tông môn, xa vòng
    t.priv.hazards.length = 0;
    t.priv.hazards.push({
      x: X,
      z: Z,
      r: TRIB_FINAL.r,
      at: t.sim.now,
      dmg: TRIB_FINAL.pct,
      pct: true,
      atk: 0,
      mon: null,
      src: t.p.sid,
      lock: true,
    } as never);
    t.priv.tickHazards();
    expect(t.p.char.hp).toBe(mhp);
  });

  it('tia cuối của người khác: người đứng xem trong vòng không chết, dừng ở 1 khí huyết', () => {
    const t = setup();
    t.begin(TRIB_PHASE_END[1] + 0.1);
    t.p.char.hp = 5;
    t.priv.hazards.push({
      x: X,
      z: Z,
      r: TRIB_FINAL.r,
      at: t.sim.now,
      dmg: TRIB_FINAL.pct,
      pct: true,
      atk: 0,
      mon: null,
      src: 'nguoi-khac',
      lock: true,
    } as never);
    t.priv.tickHazards();
    expect(t.p.char.hp).toBe(1);
  });

  it(`chỉ dùng được ${TRIB_PILL_MAX} đan hồi phục trong một lần độ kiếp`, () => {
    const t = setup();
    t.begin(5);
    const pill = [...ITEM.values()].find((i) => i.use?.hpPct && i.stack > 1)!;
    expect(pill).toBeTruthy();
    expect(t.p.char.tx('t', null, (d) => d.add(pill.id, 6))).toBe(true);
    t.p.char.hp = 1;
    let r = 0;
    const use = () => {
      t.p.itemCdAt = 0;
      const slot = t.p.char.inv.findIndex((it) => it?.id === pill.id);
      t.sim.onUse(t.p, { slot, r: 'use' + r++ + 'xx' });
    };
    const have = () => t.p.char.inv.reduce((n, it) => n + (it?.id === pill.id ? it.n : 0), 0);
    for (let i = 0; i < 5; i++) use();
    expect(have()).toBe(6 - TRIB_PILL_MAX);
    expect(t.p.trib!.pills).toBe(TRIB_PILL_MAX);
  });
});

describe('Trúc Cơ bay thấp miễn linh lực', () => {
  const y = (alt: number) => groundAt(X, Z) + alt;
  it('Ngưng Khí cạn linh lực không bay được; Trúc Cơ bay được dưới ngưỡng, không bay lên cao', () => {
    expect(canFlyAt(10, 0, X, y(5), Z)).toBe(false);
    expect(canFlyAt(10, 5, X, y(5), Z)).toBe(true);
    expect(canFlyAt(TRUC_CO_LEVEL, 0, X, y(TRUC_CO_FREE_FLY_ALT - 1), Z)).toBe(true);
    expect(canFlyAt(TRUC_CO_LEVEL, 0, X, y(TRUC_CO_FREE_FLY_ALT + 5), Z)).toBe(false);
    expect(freeFlight(10, X, y(3), Z)).toBe(false);
  });

  it('server không trừ linh lực khi Trúc Cơ bay thấp, vẫn trừ khi bay cao hoặc chưa Trúc Cơ', () => {
    for (const [level, alt, drains] of [
      [TRUC_CO_LEVEL, 5, false],
      [TRUC_CO_LEVEL, 60, true],
      [12, 5, true],
    ] as const) {
      const t = setup(level);
      t.p.move.flying = true;
      t.p.move.y = y(alt);
      t.p.char.mp = 50;
      const tick = t.sim as unknown as { tickPlayer(p: Ent, dt: number): void };
      tick.tickPlayer(t.p, 1);
      expect(t.p.char.mp < 50).toBe(drains);
    }
  });
});

describe('nhiệm vụ dẫn khí nhập thể (q_dan_khi)', () => {
  it('đả tọa đủ số giây thì mục tiêu hoàn thành; không đả tọa thì không tiến', () => {
    const t = setup(1);
    const tick = t.sim as unknown as { tickPlayer(p: Ent, dt: number): void };
    t.p.char.quests.active.q_dan_khi = [0];
    for (let i = 0; i < 20; i++) tick.tickPlayer(t.p, 1);
    expect(t.p.char.quests.active.q_dan_khi[0]).toBe(0);
    t.p.meditating = true;
    for (let i = 0; i < 10; i++) tick.tickPlayer(t.p, 1);
    expect(t.p.char.questComplete('q_dan_khi')).toBe(true);
  });
});
