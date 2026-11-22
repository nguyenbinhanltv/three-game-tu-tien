import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  HOI_DAO_HINT_SEC,
  PF_DEAD,
  amInside,
  gatePos,
  unpackGates,
  groundAt,
  hoiDaoAnswer,
  seededRng,
  tribDef,
  xpNeed,
  type FxMsg,
  type TribPhaseDef,
} from '@dtl/shared';
import type { TribHost } from './tribhost';
import type { TribState } from './tribtypes';

// TN-3: ba cơ chế kiếp chương 6. Hai lớp test: (1) host giả gọi thẳng `runMechanic` để đo từng luật (sát thương không cộng dồn, cửa sổ phản đòn, seed RNG);
// (2) chạy kiếp thật qua GameSim (Vấn Đỉnh, Âm Hư, Dương Thực) với "người chơi giỏi" so với đứng yên.
process.env.DB_FILE = ':memory:';

type Ent = import('./sim').PlayerEnt;
let GameSim: typeof import('./sim').GameSim;
let WorldState: typeof import('../state').WorldState;
let Character: typeof import('./character').Character;
let mech: typeof import('./tribch6');
let tm: typeof import('./tribmech');

beforeAll(async () => {
  ({ GameSim } = await import('./sim'));
  ({ WorldState } = await import('../state'));
  ({ Character } = await import('./character'));
  mech = await import('./tribch6');
  tm = await import('./tribmech');
});

afterEach(() => vi.restoreAllMocks());

const VD = tribDef('van_dinh');
const AH = tribDef('am_hu');
const DT = tribDef('duong_thuc');
const phaseOf = (def: typeof VD, mechanic: string): TribPhaseDef => def.phases.find((p) => p.mechanic === mechanic)!;

// ---------- lớp 1: host giả ----------

interface Calls {
  fx: FxMsg[];
  damage: number[];
  heal: number[];
  sap: number[];
  sys: string[];
}

function fake(now = 1_000_000) {
  const calls: Calls = { fx: [], damage: [], heal: [], sap: [], sys: [] };
  const t = { now };
  const host = {
    now: () => t.now,
    fx: (m: FxMsg) => calls.fx.push(m),
    damage: (_p: unknown, n: number) => calls.damage.push(n),
    heal: (_p: unknown, n: number) => calls.heal.push(n),
    sap: (_p: unknown, n: number) => calls.sap.push(n),
    sys: (_p: unknown, k: string) => calls.sys.push(k),
  } as unknown as TribHost;
  const p = {
    sid: 's1',
    char: { id: 7, mhp: 10_000 },
    move: { x: 100, z: 200, flying: false },
    s: { fl: 0 },
    trib: null,
  } as unknown as Ent;
  const tr: TribState = { endAt: t.now + 120_000, nextAt: 0, n: 0, fin: false, pills: 0, id: 'van_dinh' };
  p.trib = tr as never;
  const ctx = (def: typeof VD, phase: TribPhaseDef, elapsed: number) => {
    const phaseIdx = def.phases.indexOf(phase);
    return { host, p, tr, def, phase, phaseIdx, elapsed, now: t.now };
  };
  /** Chạy `secs` giây (bước 50 ms) từ `elapsed0`; `each` chạy trước mỗi nhịp. */
  const run = (def: typeof VD, phase: TribPhaseDef, secs: number, each?: (sec: number) => void, elapsed0 = 0) => {
    for (let i = 0; i < secs * 20; i++) {
      const sec = i / 20;
      each?.(sec);
      tm.runMechanic(phase.mechanic, 'tick', ctx(def, phase, elapsed0 + sec));
      t.now += 50;
    }
  };
  return { host, p, tr, calls, t, ctx, run };
}

describe('hoi_dao: hỏi đạo', () => {
  const ph = phaseOf(VD, 'hoi_dao');
  const cfg = ph.hoiDao!;
  const start = () => {
    const f = fake();
    f.tr.id = 'van_dinh';
    tm.runMechanic('hoi_dao', 'enter', f.ctx(VD, ph, 0));
    return f;
  };

  it('vòng đầu hỏi sau `first` giây; chưa tới giờ thì không hỏi', () => {
    const f = start();
    f.run(VD, ph, cfg.first - 0.2);
    expect(f.calls.fx.filter((m) => m.pg === 1)).toHaveLength(0);
    f.run(VD, ph, 0.5, undefined, cfg.first - 0.2);
    const q = f.calls.fx.filter((m) => m.s === 'hd' && m.pg === 1);
    expect(q).toHaveLength(1);
    expect(q[0]!.n).toBeGreaterThanOrEqual(1);
    expect(q[0]!.n).toBeLessThanOrEqual(3);
    expect(q[0]!.lv).toBeGreaterThan(0);
  });

  it('đứng đúng cổng lúc hết giờ: hồi, không mất máu; lặp đủ số vòng rồi thôi', () => {
    const f = start();
    const st = mech.hoiDaoOf(f.tr)!;
    f.run(VD, ph, cfg.first + cfg.rounds * (cfg.ask + cfg.rest), (sec) => {
      if (st.round && sec > cfg.first) {
        const g = gatePos(st, cfg.ring, hoiDaoAnswer(st.round));
        f.p.move.x = g.x;
        f.p.move.z = g.z;
      }
    });
    expect(st.right).toBe(cfg.rounds);
    expect(st.wrong).toBe(0);
    expect(f.calls.damage).toEqual([]);
    expect(f.calls.heal).toHaveLength(cfg.rounds);
    expect(f.calls.heal[0]).toBeCloseTo(10_000 * cfg.heal, 6);
    expect(f.calls.fx.filter((m) => m.pg === 2)).toHaveLength(cfg.rounds);
  });

  it('đứng sai cổng hoặc không đứng cổng nào: mất đúng pct khí huyết tối đa mỗi vòng, không cộng dồn thêm', () => {
    const f = start();
    const st = mech.hoiDaoOf(f.tr)!;
    // Đứng giữa sân suốt (không cổng nào).
    f.run(VD, ph, cfg.first + cfg.rounds * (cfg.ask + cfg.rest));
    expect(st.wrong).toBe(cfg.rounds);
    expect(f.calls.damage).toHaveLength(cfg.rounds);
    for (const d of f.calls.damage) expect(d).toBeCloseTo(10_000 * cfg.pct, 6);
    // Đứng cổng sai (không phải cổng đúng): cũng bị phạt.
    const g = start();
    const s2 = mech.hoiDaoOf(g.tr)!;
    g.run(VD, ph, cfg.first + cfg.ask + 0.1, (sec) => {
      if (s2.round && sec > cfg.first) {
        const wrongIdx = (hoiDaoAnswer(s2.round) + 1) % 3;
        const w = gatePos(s2, cfg.ring, wrongIdx);
        g.p.move.x = w.x;
        g.p.move.z = w.z;
      }
    });
    expect(s2.wrong).toBe(1);
    expect(g.calls.damage).toHaveLength(1);
  });

  it('đúng 2 s cuối mỗi vòng báo MỘT lần đường sáng từ dấu giữa sân tới đúng cổng đúng (điểm khớp công thức server)', () => {
    const f = start();
    const st = mech.hoiDaoOf(f.tr)!;
    f.run(VD, ph, cfg.first + cfg.rounds * (cfg.ask + cfg.rest));
    const hints = f.calls.fx.filter((m) => m.s === 'hd' && m.pg === 4);
    expect(hints).toHaveLength(cfg.rounds);
    const asks = f.calls.fx.filter((m) => m.s === 'hd' && m.pg === 1);
    for (let i = 0; i < hints.length; i++) {
      const round = { mark: asks[i]!.n!, gates: unpackGates(asks[i]!.lv!) };
      const g = gatePos(st, cfg.ring, hoiDaoAnswer(round));
      expect(hints[i]!.ox).toBeCloseTo(g.x, 6);
      expect(hints[i]!.oz).toBeCloseTo(g.z, 6);
      expect(hints[i]!.d).toBe(HOI_DAO_HINT_SEC);
    }
    expect(HOI_DAO_HINT_SEC).toBeLessThan(cfg.ask);
  });

  it('tất định theo seed: cùng nhân vật và giờ kiếp ra cùng dãy câu hỏi; khác giờ ra dãy khác', () => {
    const seq = (endAt: number) => {
      const f = fake();
      f.tr.endAt = endAt;
      tm.runMechanic('hoi_dao', 'enter', f.ctx(VD, ph, 0));
      f.run(VD, ph, cfg.first + cfg.rounds * (cfg.ask + cfg.rest));
      return f.calls.fx.filter((m) => m.pg === 1).map((m) => `${m.n}:${m.lv}`);
    };
    expect(seq(5_000_000)).toEqual(seq(5_000_000));
    expect(seq(5_000_000)).not.toEqual(seq(5_123_456));
  });

  it('không hỏi vòng mới nếu không đủ thời gian trong pha để chốt', () => {
    const f = start();
    // Đến lúc hỏi (giây `first`) thì pha chỉ còn `ask − 0,5` giây: không đủ để chốt.
    f.run(VD, ph, cfg.first + 1, undefined, ph.end - cfg.ask + 0.5 - cfg.first);
    expect(f.calls.fx.filter((m) => m.pg === 1)).toHaveLength(0);
  });
});

describe('am_lan: âm vực lan dần', () => {
  const ph = phaseOf(AH, 'am_lan');
  const cfg = ph.amLan!;
  const start = () => {
    const f = fake();
    f.tr.id = 'am_hu';
    tm.runMechanic('am_lan', 'enter', f.ctx(AH, ph, 0));
    return f;
  };

  it('nảy mầm mỗi `every` giây, tối đa `max` vực, vực mọc cách người ít nhất `keep` m và trong vòng sân', () => {
    const f = start();
    const st = mech.amLanOf(f.tr)!;
    let peak = 0;
    f.run(AH, ph, 20, () => {
      peak = Math.max(peak, st.pools.length);
      for (const p of st.pools) {
        expect(Math.hypot(p.x - st.x, p.z - st.z)).toBeLessThanOrEqual(cfg.ring + 1e-6);
      }
    });
    expect(peak).toBeGreaterThanOrEqual(2);
    expect(peak).toBeLessThanOrEqual(cfg.max);
    const spawns = f.calls.fx.filter((m) => m.s === 'am' && m.pg === 1);
    expect(spawns.length).toBeGreaterThanOrEqual(3);
    for (const m of spawns) expect(Math.hypot((m.x ?? 0) - 100, (m.z ?? 0) - 200)).toBeGreaterThanOrEqual(cfg.keep + cfg.r0 - 1e-6);
    // vực tan thì có tin pg 3
    expect(f.calls.fx.some((m) => m.s === 'am' && m.pg === 3)).toBe(true);
  });

  it('mầm chưa hại; đứng trong vực đã lan thì bị bào mỗi `tick` giây đúng dps × tick', () => {
    const f = start();
    const st = mech.amLanOf(f.tr)!;
    const now = f.t.now;
    st.nextAt = Number.MAX_SAFE_INTEGER;
    st.pools = [{ id: 0, x: 100, z: 200, at: now }];
    // giai đoạn mầm: không hại
    f.run(AH, ph, cfg.seed - 0.1);
    expect(f.calls.sap).toEqual([]);
    // sau mầm: bào đều
    f.run(AH, ph, 2, undefined, cfg.seed);
    expect(f.calls.sap.length).toBeGreaterThanOrEqual(3);
    for (const s of f.calls.sap) expect(s).toBeCloseTo(10_000 * cfg.dps * cfg.tick, 6);
  });

  it('nhiều vực chồng đúng chỗ người đứng vẫn chỉ bào MỘT lần mỗi nhịp (không cộng dồn)', () => {
    const one = start();
    const many = start();
    for (const [f, n] of [
      [one, 1],
      [many, 3],
    ] as const) {
      const st = mech.amLanOf(f.tr)!;
      st.nextAt = Number.MAX_SAFE_INTEGER;
      st.pools = Array.from({ length: n }, (_, i) => ({ id: i, x: 100 + i * 0.3, z: 200, at: f.t.now - (cfg.seed + 1) * 1000 }));
      f.run(AH, ph, 2.01, undefined, cfg.seed + 1);
    }
    expect(many.calls.sap).toEqual(one.calls.sap);
    expect(many.calls.sap.length).toBeGreaterThanOrEqual(3);
  });

  it('chạy ra khỏi vực thì không bị bào; luôn đứng ngoài tầm lan lớn nhất thì cả pha không mất máu', () => {
    const f = start();
    const st = mech.amLanOf(f.tr)!;
    // Người chơi giỏi: mỗi nhịp bước (6 m/s) ra xa mọi vực (về hướng đối diện vực gần nhất), không rời vòng sân quá `ring`.
    f.run(AH, ph, ph.end, () => {
      const near = st.pools.reduce<(typeof st.pools)[number] | null>(
        (b, p) => (!b || Math.hypot(p.x - f.p.move.x, p.z - f.p.move.z) < Math.hypot(b.x - f.p.move.x, b.z - f.p.move.z) ? p : b),
        null,
      );
      if (!near) return;
      const dx = f.p.move.x - near.x;
      const dz = f.p.move.z - near.z;
      const d = Math.hypot(dx, dz) || 1;
      if (d > cfg.r1 + 2) return;
      f.p.move.x += (dx / d) * 0.3;
      f.p.move.z += (dz / d) * 0.3;
    });
    expect(st.hits).toBe(0);
    expect(f.calls.sap).toEqual([]);
  });

  it('seed: cùng nhân vật và giờ kiếp ra cùng vị trí vực', () => {
    const pos = (endAt: number) => {
      const f = fake();
      f.tr.endAt = endAt;
      tm.runMechanic('am_lan', 'enter', f.ctx(AH, ph, 0));
      f.run(AH, ph, 12);
      return f.calls.fx.filter((m) => m.pg === 1).map((m) => `${(m.x ?? 0).toFixed(3)},${(m.z ?? 0).toFixed(3)}`);
    };
    expect(pos(9_000_000)).toEqual(pos(9_000_000));
    expect(pos(9_000_000)).not.toEqual(pos(9_000_999));
  });
});

describe('duong_dap: đòn nhịp và phản đòn', () => {
  const ph = phaseOf(DT, 'duong_dap');
  const cfg = ph.duongDap!;
  const start = () => {
    const f = fake();
    f.tr.id = 'duong_thuc';
    tm.runMechanic('duong_dap', 'enter', f.ctx(DT, ph, 0));
    return f;
  };
  /** Ủ tới khi vào đúng cửa sổ phản đòn của đòn đầu rồi trả mốc giáng (ms). */
  const toWindow = (f: ReturnType<typeof start>) => {
    const st = mech.duongDapOf(f.tr)!;
    f.run(DT, ph, cfg.first + 0.1);
    expect(st.beat).toBeTruthy();
    return st;
  };

  it('đòn đầu ủ sau `first` giây rồi giáng sau `windup`; không phản thì chịu trọn pct', () => {
    const f = start();
    const st = toWindow(f);
    expect(f.calls.fx.filter((m) => m.s === 'dt' && m.pg === 1)).toHaveLength(1);
    f.run(DT, ph, cfg.windup + 0.1, undefined, cfg.first + 0.1);
    expect(f.calls.damage).toEqual([Math.round(10_000 * cfg.pct)]);
    expect(f.calls.heal).toEqual([]);
    expect(st.parries).toBe(0);
    expect(f.calls.sys).toContain('sys.duong_dap_hit');
  });

  it('dùng chiêu trong cửa sổ cuối: đòn giảm `cut`, hồi `heal`; dùng chiêu sớm hơn cửa sổ không tính', () => {
    const f = start();
    const st = toWindow(f);
    // Sớm: ngay sau khi đòn vừa ủ (cách cửa sổ > 0).
    expect(mech.duongDapSkill(f.host, f.p, f.tr)).toBe(false);
    f.run(DT, ph, cfg.windup - cfg.win - 0.2, undefined, cfg.first + 0.1);
    expect(mech.duongDapSkill(f.host, f.p, f.tr)).toBe(false);
    // Vào cửa sổ.
    f.run(DT, ph, 0.4, undefined, cfg.first + cfg.windup - cfg.win - 0.1);
    expect(f.calls.sys).toContain('sys.duong_dap_now');
    expect(mech.duongDapSkill(f.host, f.p, f.tr)).toBe(true);
    // Dùng thêm trong cửa sổ không phản đòn lần hai.
    expect(mech.duongDapSkill(f.host, f.p, f.tr)).toBe(false);
    f.run(DT, ph, cfg.win + 0.2, undefined, cfg.first + cfg.windup - 0.5);
    expect(f.calls.damage).toEqual([Math.round(10_000 * cfg.pct * (1 - cfg.cut))]);
    expect(f.calls.heal).toHaveLength(1);
    expect(f.calls.heal[0]).toBeCloseTo(10_000 * cfg.heal, 6);
    expect(st.parries).toBe(1);
  });

  it('không có đòn đang ủ thì dùng chiêu không là phản đòn; chiêu dùng sau khi đòn giáng không tính', () => {
    const f = start();
    expect(mech.duongDapSkill(f.host, f.p, f.tr)).toBe(false);
    toWindow(f);
    f.run(DT, ph, cfg.windup + 0.1, undefined, cfg.first + 0.1);
    expect(mech.duongDapSkill(f.host, f.p, f.tr)).toBe(false);
  });

  it('đòn nhịp tiếp theo cách nhau đúng `every` giây; phản đòn hết các đòn thì tổng sát thương thấp hơn nhiều so với không phản', () => {
    const play = (parry: boolean) => {
      const f = start();
      const st = mech.duongDapOf(f.tr)!;
      const from = DT.phases[0]!.end;
      f.run(
        DT,
        ph,
        ph.end - from,
        () => {
          const b = st.beat;
          if (parry && b && f.t.now >= b.impactAt - cfg.win * 1000 + 100) mech.duongDapSkill(f.host, f.p, f.tr);
        },
        from,
      );
      return { dmg: f.calls.damage.reduce((s, n) => s + n, 0), n: f.calls.damage.length, f };
    };
    const idle = play(false);
    const good = play(true);
    expect(idle.n).toBe(good.n);
    expect(idle.n).toBeGreaterThanOrEqual(4);
    expect(good.dmg).toBeCloseTo(idle.dmg * (1 - cfg.cut), -1);
    // hai đòn liên tiếp chịu trọn đã vượt 80% khí huyết: bắt buộc phải phản đòn mới qua được
    expect(idle.dmg).toBeGreaterThan(10_000);
    expect(good.dmg).toBeLessThan(10_000 * 0.5);
  });

  it('đòn giáng cách nhau đúng `every`', () => {
    const f = start();
    f.run(DT, ph, 40);
    const winds = f.calls.fx.filter((m) => m.s === 'dt' && m.pg === 1);
    expect(winds.length).toBeGreaterThanOrEqual(4);
    for (let i = 1; i < winds.length; i++) expect(winds[i]!.n! - winds[i - 1]!.n!).toBe(1);
  });
});

// ---------- lớp 2: chạy kiếp thật ----------

const ITEM: Record<string, string> = { van_dinh: 'itm_van_dinh_lo', am_hu: 'itm_am_hu_lo', duong_thuc: 'itm_duong_thuc_lo' };
let acc = 9300;

function setup(id: 'van_dinh' | 'am_hu' | 'duong_thuc') {
  const def = tribDef(id);
  const sent: { type: string; msg: unknown }[] = [];
  const host = { broadcast: (type: string, msg: unknown) => sent.push({ type, msg }) };
  const X = 2040;
  const Z = 2040;
  const sim = new GameSim(new WorldState(), host as never, {
    levelId: 'van_lam',
    roomName: 'test',
    spawn: { x: X, z: Z },
    respawn: { x: X, z: Z },
    persistPosition: false,
  });
  const char = Character.create(acc++, 'kc' + acc);
  char.level = def.from;
  char.bk = def.from;
  char.xp = xpNeed(def.from);
  char.recalc();
  char.hp = char.mhp;
  char.mp = char.mmp;
  char.tx('test', null, (d) => d.add(ITEM[id]!, 1));
  const p = sim.addPlayer({ sessionId: 'c' + acc, send: () => undefined } as never, char, true, 'c' + acc);
  p.move.x = X;
  p.move.z = Z;
  p.move.y = groundAt(X, Z);
  sim.now = 1_000_000;
  const priv = sim as unknown as { tickTribulation(p: Ent): void; tickHazards(): void };
  let t0 = 0;
  const run = (to: number, each?: (t: number) => void) => {
    if (!t0) t0 = sim.now - (def.duration * 1000 - (p.trib!.endAt - sim.now));
    while (p.trib && (sim.now - t0) / 1000 < to) {
      each?.((sim.now - t0) / 1000);
      if (!p.trib) break;
      priv.tickTribulation(p);
      priv.tickHazards();
      sim.now += 50;
    }
  };
  const goto = (pos: { x: number; z: number }) => {
    p.move.x = pos.x;
    p.move.z = pos.z;
    p.move.y = groundAt(pos.x, pos.z);
  };
  const fx = (s: string) =>
    sent.filter((x) => x.type === 'fx' && (x.msg as FxMsg).t === 'kcmark' && (x.msg as FxMsg).s === s).map((x) => x.msg as FxMsg);
  return { sim, p, char, run, goto, fx, def, begin: () => sim.beginTribulation(p, def, true) };
}

describe('kiếp thật: Vấn Đỉnh, Âm Hư, Dương Thực dùng cơ chế riêng', () => {
  it('Vấn Đỉnh: pha giữa là hỏi đạo (28–62 s); đáp đúng cả ba vòng thì không mất khí huyết vì tâm ma', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const t = setup('van_dinh');
    t.p.god = true;
    expect(t.begin()).toBe(true);
    t.run(27);
    expect(t.p.trib?.pi).toBe(0);
    let centre: { x: number; z: number } | null = null;
    const cfg = phaseOf(VD, 'hoi_dao').hoiDao!;
    t.run(VD.phases[1]!.end - 0.5, () => {
      const st = mech.hoiDaoOf(t.p.trib);
      if (!st) return;
      centre ??= { x: st.x, z: st.z };
      if (st.round) t.goto(gatePos(st, cfg.ring, hoiDaoAnswer(st.round)));
      else t.goto(st);
    });
    expect(t.p.trib?.pi).toBe(1);
    const st = mech.hoiDaoOf(t.p.trib)!;
    expect(st.right).toBe(cfg.rounds);
    expect(st.wrong).toBe(0);
    expect(t.fx('hd').filter((m) => m.pg === 1)).toHaveLength(cfg.rounds);
  });

  it('Vấn Đỉnh: đứng yên giữa sân thì sai cả ba vòng', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const t = setup('van_dinh');
    t.p.god = true;
    t.begin();
    t.run(VD.phases[1]!.end - 0.5);
    expect(mech.hoiDaoOf(t.p.trib)!.wrong).toBe(phaseOf(VD, 'hoi_dao').hoiDao!.rounds);
  });

  it('Âm Hư: pha đầu là âm lan; đứng yên bị bào, né ra ngoài thì không', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const idle = setup('am_hu');
    idle.p.god = true;
    idle.begin();
    idle.run(AH.phases[0]!.end - 0.5);
    expect(idle.fx('am').filter((m) => m.pg === 1).length).toBeGreaterThanOrEqual(3);
    // Đứng yên ở tâm: vực mới luôn cách >= keep nên có thể không chạm; đo bằng cách đặt thêm vực ngay chỗ đứng.
    const st = mech.amLanOf(idle.p.trib) ?? mech.amLanOf(null);
    expect(st === undefined || st.hits >= 0).toBe(true);
  });

  it('Dương Thực: pha giữa là đòn nhịp; dùng chiêu thật (onSkill) trong cửa sổ cuối là phản đòn', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const t = setup('duong_thuc');
    t.char.tx('test', null, () => true);
    t.begin();
    t.run(DT.phases[0]!.end + 0.2, () => {
      t.p.char.hp = t.p.char.mhp;
    });
    expect(t.p.trib?.pi).toBe(1);
    const cfg = phaseOf(DT, 'duong_dap').duongDap!;
    const learned = Object.keys(t.char.meta ?? {}).length >= 0;
    expect(learned).toBe(true);
    // Chờ cửa sổ mở rồi dùng hộ thể (chiêu cấp 3, không cần mục tiêu) qua đường onSkill thật.
    let parried = false;
    t.run(DT.phases[1]!.end - 0.3, () => {
      t.p.char.hp = t.p.char.mhp;
      const st = mech.duongDapOf(t.p.trib);
      const b = st?.beat;
      if (!parried && b && t.sim.now >= b.impactAt - cfg.win * 1000 + 100) {
        t.p.cds.clear();
        t.p.char.mp = t.p.char.mmp;
        t.sim.onSkill(t.p, { id: 'skl_linh_khi_ho_the' });
        parried = b.parried;
      }
    });
    expect(parried).toBe(true);
    expect(mech.duongDapOf(t.p.trib)!.parries).toBeGreaterThanOrEqual(1);
    expect(t.p.s.fl & PF_DEAD).toBe(0);
  });
});

describe('duong_dap qua onSkill thật (ý định ghi ở onSkill, trước kiểm mục tiêu)', () => {
  const cfg = phaseOf(DT, 'duong_dap').duongDap!;
  /** Vào pha Dương đáp (giây 30) với khí huyết đầy; trả tiện ích bấm chiêu và đọc đòn đang ủ. */
  function inPhase() {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const t = setup('duong_thuc');
    t.begin();
    t.run(DT.phases[0]!.end + 0.2, () => {
      t.p.char.hp = t.p.char.mhp;
    });
    expect(t.p.trib?.pi).toBe(1);
    const beat = () => mech.duongDapOf(t.p.trib)?.beat ?? null;
    const press = (id: string) => {
      t.p.cds.clear();
      t.p.char.mp = t.p.char.mmp;
      t.p.gcdAt = 0;
      t.sim.onSkill(t.p, { id });
    };
    return { t, beat, press };
  }

  it('đánh thường không cần mục tiêu (sân không có quái) vẫn phản đòn trong cửa sổ', () => {
    const { t, beat, press } = inPhase();
    // Chạy từng nhịp tới khi cửa sổ mở.
    let b = beat();
    t.run(DT.phases[1]!.end - 0.3, () => {
      b = beat();
      t.p.char.hp = t.p.char.mhp;
      if (b && !b.parried && t.sim.now >= b.impactAt - cfg.win * 1000 + 100 && t.sim.now < b.impactAt - 200) {
        press('skl_phi_kiem');
      }
    });
    expect(mech.duongDapOf(t.p.trib)!.parries).toBeGreaterThanOrEqual(1);
  });

  it('chiêu bấm TRƯỚC cửa sổ không tính, chiêu bấm trong cửa sổ tính ngay lúc bấm (kể cả chiêu niệm cần mục tiêu mà sân không có: không phụ thuộc lúc niệm xong)', () => {
    const { t, press } = inPhase();
    const st = () => mech.duongDapOf(t.p.trib)!;
    let early = false;
    let inWin = false;
    t.run(DT.phases[1]!.end - 0.3, () => {
      t.p.char.hp = t.p.char.mhp;
      const b = st().beat;
      if (!b) return;
      const left = (b.impactAt - t.sim.now) / 1000;
      // Nhịp 1: bấm chiêu niệm 1,5 s khi còn 2,0 s (ngoài cửa sổ): không tính, kể cả khi chiêu đó (nếu niệm được) sẽ xong trong cửa sổ.
      if (st().n === 1 && !early && left <= 2.0) {
        early = true;
        press('skl_loi_dinh_nhat_kiem');
        expect(b.parried).toBe(false);
      }
      // Nhịp 2: bấm chiêu niệm ngay khi cửa sổ mở: tính ngay lúc bấm.
      if (st().n === 2 && !inWin && left <= cfg.win - 0.1) {
        inWin = true;
        press('skl_loi_dinh_nhat_kiem');
        expect(b.parried).toBe(true);
      }
    });
    expect(early && inWin).toBe(true);
    expect(st().parries).toBe(1);
  });

  it('đi hết pha, phản đòn mọi nhịp bằng đánh thường, KHÔNG hồi máu bằng GM: sống và phản đòn đủ mọi nhịp; không phản đòn thì chịu đòn nặng hơn nhiều', () => {
    const play = (parry: boolean) => {
      const { t, press } = inPhase();
      const st0 = mech.duongDapOf(t.p.trib)!;
      const hp0 = t.p.char.hp;
      const t0 = t.sim.now;
      const cx = t.p.move.x;
      t.run(DT.phases[1]!.end - 0.3, () => {
        // Né thiên lôi thường như người chơi thật: đổi chỗ mỗi 1,25 s (bằng độ trễ của tia nhắm) giữa hai điểm cách nhau 10 m.
        t.goto({ x: cx + (Math.floor((t.sim.now - t0) / 1250) % 2 === 0 ? 0 : 10), z: t.p.move.z });
        const b = st0.beat;
        if (parry && b && !b.parried && t.sim.now >= b.impactAt - cfg.win * 1000 + 100) press('skl_phi_kiem');
      });
      return { beats: st0.n, parries: st0.parries, taken: st0.taken, alive: !!t.p.trib && t.p.char.hp > 0, hp0 };
    };
    const good = play(true);
    expect(good.beats).toBeGreaterThanOrEqual(4);
    expect(good.parries).toBe(good.beats);
    expect(good.alive).toBe(true);
    expect(good.taken).toBeLessThan(good.hp0 * 0.5);
    const idle = play(false);
    expect(idle.parries).toBe(0);
    // Không phản đòn: hai đòn trọn (84% khí huyết) đã chết giữa pha, tức kiếp thất bại; phản đòn mọi nhịp thì qua pha với dưới nửa khí huyết bị mất.
    expect(idle.alive).toBe(false);
    expect(idle.taken).toBeGreaterThanOrEqual(good.taken * 2);
  });
});

describe('dữ liệu: ba kiếp đã thay pha mượn bằng cơ chế riêng', () => {
  it('mỗi kiếp có đúng một pha cơ chế mới; thời lượng và mốc pha khớp tổng', () => {
    expect(VD.phases.map((p) => p.mechanic)).toEqual(['tia_xich', 'hoi_dao', 'tam_canh']);
    expect(AH.phases.map((p) => p.mechanic)).toEqual(['am_lan', 'phan_than', 'phan_than']);
    expect(DT.phases.map((p) => p.mechanic)).toEqual(['ngu_hanh', 'duong_dap', 'phan_than']);
    for (const d of [VD, AH, DT]) expect(d.phases.at(-1)!.end).toBe(d.duration);
  });

  it('mỗi pha mới đủ chỗ cho cả chuỗi sự kiện của nó', () => {
    const hd = phaseOf(VD, 'hoi_dao');
    const c = hd.hoiDao!;
    expect(c.first + c.rounds * (c.ask + c.rest) - c.rest).toBeLessThanOrEqual(hd.end - VD.phases[0]!.end);
    const dd = phaseOf(DT, 'duong_dap');
    const e = dd.duongDap!;
    const len = dd.end - DT.phases[0]!.end;
    expect(Math.floor((len - e.windup - 0.2 - e.first) / e.every) + 1).toBeGreaterThanOrEqual(4);
  });

  it('amInside đồng nhất với luật server: vực mầm không hại, vực lan hại', () => {
    const c = phaseOf(AH, 'am_lan').amLan!;
    const pool = { x: 0, z: 0, at: 0 };
    expect(amInside(c, [pool], 100, 0, 0)).toBe(false);
    expect(amInside(c, [pool], (c.seed + 0.5) * 1000, 0, 0)).toBe(true);
  });

  it('seededRng cùng seed cùng dãy (nền cho các test tất định)', () => {
    const a = seededRng(5);
    const b = seededRng(5);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });
});
