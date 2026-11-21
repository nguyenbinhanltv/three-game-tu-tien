import { beforeAll, describe, expect, it } from 'vitest';
import { allowSkillForTest } from './testkit';
import { groundAt, unpackMarks } from '@dtl/shared';

// Cổ tu (Dưỡng Cổ Kinh). Server quyết định hết: lĩnh ngộ hướng tu, số cổ đang nuôi, Cổ độc (bào mòn + rút máu), bầy cổ, Cổ Vương.
process.env.DB_FILE = ':memory:';

type Sim = import('./sim').GameSim;
type Ent = import('./sim').PlayerEnt;
type Mon = import('./entities').MonEnt;
let GameSim: typeof import('./sim').GameSim;
let WorldState: typeof import('../state').WorldState;
let Character: typeof import('./character').Character;
let MONSTER: typeof import('@dtl/content').MONSTER;
let NPC: typeof import('@dtl/content').NPC;
let PATH: typeof import('@dtl/content').PATH;
let MARK: typeof import('@dtl/content').MARK;
let sanitizeMethodMeta: typeof import('./method').sanitizeMethodMeta;
let sqlite: typeof import('../db').sqlite;

beforeAll(async () => {
  ({ GameSim } = await import('./sim'));
  ({ WorldState } = await import('../state'));
  ({ Character } = await import('./character'));
  ({ MONSTER, NPC, PATH, MARK } = await import('@dtl/content'));
  ({ sanitizeMethodMeta } = await import('./method'));
  ({ sqlite } = await import('../db'));
});

const X = 2040;
const Z = 2040;
const CO = 'duong_co_kinh';
let nextAcc = 16000;

function setup(level = 28) {
  const sim: Sim = new GameSim(new WorldState(), { broadcast: () => undefined } as never, {
    levelId: 'van_lam',
    roomName: 'test',
    spawn: { x: X, z: Z },
    respawn: { x: X, z: Z },
    persistPosition: false,
  });
  const raw0 = sim.onSkill.bind(sim);
  const priv = sim as unknown as {
    resolvePending(p: Ent): void;
    tickMethods(): void;
    tickMonster(m: Mon, dt: number): void;
    combat: { liveRes(p: Ent): number; summons: { sid: string; power: number; count: number }[] };
  };
  const use = (pl: Ent, id: string, t?: string) => {
    allowSkillForTest(pl.char, id);
    raw0(pl, { id, t });
    const st = pl.flow.pending;
    if (st) {
      st.at = sim.now;
      priv.resolvePending(pl);
    }
  };
  /** Người chơi mới; `method` rỗng = chưa chọn công pháp. Cổ tu thì coi như đã lĩnh ngộ sẵn. */
  const join = (method = CO, lv = level): Ent => {
    const char = Character.create(nextAcc++, 'ct' + nextAcc);
    char.level = lv;
    char.recalc();
    char.hp = char.mhp;
    char.mp = char.mmp;
    const p = sim.addPlayer({ sessionId: 'c' + nextAcc, send: () => undefined } as never, char, true, 's' + nextAcc);
    p.move.x = X;
    p.move.z = Z;
    p.move.y = groundAt(X, Z);
    if (method === CO) char.meta.paths = ['co_tu'];
    if (method) {
      char.meta.method = method;
      char.recalc();
    }
    return p;
  };
  const mon = (x = X + 5, z = Z, hp = 50_000_000, id = 'mon_soi_xam') => {
    const m = sim.spawnMonster(MONSTER.get(id)!, 10, x, z, null);
    m.s.hp = m.s.mhp = hp;
    return m;
  };
  const fresh = (p: Ent) => {
    p.gcdAt = 0;
    p.cds.clear();
    p.flow.lastDashAt = -1e9;
    p.flow.opened.clear();
    p.char.mp = p.char.mmp;
    p.lastCombatAt = 0;
    p.skillCount = 0;
  };
  const pass = (sec: number, ...ms: Mon[]) => {
    for (let i = 0; i < sec; i++) {
      sim.now += 1000;
      priv.tickMethods();
      for (const m of ms) priv.tickMonster(m, 1);
    }
  };
  const names = (m: { s: { mk: number } }) => unpackMarks(m.s.mk).map((x) => `${x.id}:${x.n}`);
  const res = (p: Ent) => priv.combat.liveRes(p);
  /** Đặt Khí thế thẳng (không chờ tích). */
  const setRes = (p: Ent, v: number) => {
    p.mth.res = v;
    p.mth.resAt = sim.now;
  };
  return { sim, priv, join, mon, fresh, use, pass, names, res, setRes };
}

const nearNpc = (p: Ent) => {
  const npc = NPC.get('npc_chuong_mon')!;
  p.move.x = npc.x;
  p.move.z = npc.z;
};
const unlockRows = (charId: number) =>
  sqlite.prepare("SELECT kind, delta FROM ledger WHERE char_id = ? AND reason = 'path:unlock:co_tu'").all(charId) as {
    kind: string;
    delta: number;
  }[];

describe('lĩnh ngộ Cổ tu', () => {
  it('thiếu cảnh giới hay linh thạch không chọn được; đủ thì trừ đúng một lần, ghi ledger, gửi lại cùng khóa không trừ nữa', () => {
    const { sim, join } = setup();
    const u = PATH.get('co_tu')!.unlock!;
    const low = join('', u.level - 1);
    nearNpc(low);
    low.char.gold = 9999;
    sim.onMethod(low, { method: CO, r: 'ct-000001' });
    expect(low.char.meta.method).toBeUndefined();
    const p = join('', u.level);
    p.char.gold = u.gold - 1;
    nearNpc(p);
    sim.onMethod(p, { method: CO, r: 'ct-000002' });
    expect(p.char.meta.method).toBeUndefined();
    expect(unlockRows(p.char.id)).toEqual([]);
    p.char.gold = 1000;
    sim.onMethod(p, { method: CO, r: 'ct-000003' });
    expect(p.char.meta.method).toBe(CO);
    expect(p.char.meta.paths).toEqual(['co_tu']);
    expect(p.char.gold).toBe(1000 - u.gold);
    expect(unlockRows(p.char.id)).toEqual([{ kind: 'gold', delta: -u.gold }]);
    sim.onMethod(p, { method: CO, r: 'ct-000003' });
    expect(p.char.gold).toBe(1000 - u.gold);
    expect(unlockRows(p.char.id)).toHaveLength(1);
  });
  it('meta hỏng được làm sạch; người chưa tu không dùng được chiêu Cổ tu', () => {
    const { sim, join, mon, fresh } = setup();
    const bad = { method: CO, paths: ['khong_co'] as string[] };
    sanitizeMethodMeta(bad);
    expect(bad.method).toBeUndefined();
    const p = join('lac_kiem_quyet');
    const m = mon();
    fresh(p);
    const hp = m.s.hp;
    sim.onSkill(p, { id: 'skl_tha_co', t: m.id });
    expect(m.s.hp).toBe(hp);
    expect(m.s.mk).toBe(0);
  });
});

describe('cổ và Cổ độc', () => {
  it('Thả Cổ gieo Cổ độc (tối đa 3 tầng) và nuôi thêm 1 cổ mỗi nhát', () => {
    const { join, mon, fresh, use, names, res } = setup();
    const p = join();
    const m = mon();
    for (let i = 1; i <= 4; i++) {
      fresh(p);
      use(p, 'skl_tha_co', m.id);
      expect(names(m)).toEqual([`co_doc:${Math.min(3, i)}`]);
    }
    expect(res(p)).toBe(4);
  });
  it('mỗi giây ấn bào mòn theo số tầng, người đặt rút máu và nuôi thêm cổ; hết hạn thì thôi', () => {
    const { join, mon, fresh, use, pass, res } = setup();
    const p = join();
    const m = mon();
    fresh(p);
    use(p, 'skl_tha_co', m.id);
    const dot = MARK.get('co_doc')!.dot!;
    expect(m.marks[0]!.per).toBe(Math.max(1, Math.round(p.char.atk * dot.per)));
    p.char.hp = Math.floor(p.char.mhp / 2);
    const php = p.char.hp;
    const hp0 = m.s.hp;
    const r0 = res(p);
    pass(1, m);
    const d1 = hp0 - m.s.hp;
    expect(d1).toBeGreaterThan(0);
    expect(p.char.hp).toBe(php + Math.max(1, Math.round(d1 * dot.leech!)));
    expect(res(p)).toBeCloseTo(r0 + 0.25, 5);
    pass(11, m);
    expect(m.s.mk).toBe(0);
    const hp2 = m.s.hp;
    pass(3, m);
    expect(m.s.hp).toBe(hp2);
  });
  it('cổ chết dần sau 20 giây không nuôi thêm; không vượt 6 con', () => {
    const { join, pass, res, setRes } = setup();
    const p = join();
    setRes(p, 6);
    pass(20);
    expect(res(p)).toBe(6);
    pass(5);
    expect(res(p)).toBeLessThan(6);
  });
  it('Cổ Ảnh Bộ mở chuỗi: Thả Cổ ngay sau lướt mạnh hơn bấm lẻ (cộng nhiều nhát)', () => {
    const { join, mon, fresh, use, sim } = setup();
    const p = join();
    const m = mon();
    const hit = (dash: boolean): number => {
      fresh(p);
      m.s.hp = m.s.mhp;
      m.marks.length = 0;
      p.move.x = X;
      p.move.z = Z;
      if (dash) {
        use(p, 'skl_co_anh_bo', m.id);
        sim.now += 100;
        p.gcdAt = 0;
      } else {
        sim.now += 4000;
      }
      const hp = m.s.hp;
      use(p, 'skl_tha_co', m.id);
      return hp - m.s.hp;
    };
    let alone = 0;
    let chained = 0;
    for (let i = 0; i < 60; i++) {
      alone += hit(false);
      chained += hit(true);
    }
    expect(alone).toBeGreaterThan(0);
    expect(chained).toBeGreaterThan(alone * 1.1);
  });
});

describe('chiêu thu và xả cổ', () => {
  it('Hút Máu Cổ thu hết Cổ độc của mình và nuôi thêm cổ theo số tầng thu', () => {
    const { join, mon, fresh, use, names, res } = setup();
    const p = join();
    const m = mon();
    for (let i = 0; i < 3; i++) {
      fresh(p);
      use(p, 'skl_tha_co', m.id);
    }
    expect(names(m)).toEqual(['co_doc:3']);
    const before = res(p);
    fresh(p);
    use(p, 'skl_hut_mau_co', m.id);
    expect(names(m)).toEqual([]);
    expect(res(p)).toBeGreaterThan(before);
  });
  it('Cổ Bạo đánh mọi quái trong 7 mét, thu Cổ độc trên từng con; quái xa không bị', () => {
    const { join, mon, fresh, use, names } = setup();
    const p = join();
    const a = mon(X + 3, Z);
    const b = mon(X + 3, Z + 3);
    const far = mon(X + 3, Z + 30);
    for (const m of [a, b]) {
      fresh(p);
      use(p, 'skl_tha_co', m.id);
    }
    fresh(p);
    const hp = [a.s.hp, b.s.hp, far.s.hp];
    use(p, 'skl_co_bao', a.id);
    expect(hp[0]! - a.s.hp).toBeGreaterThan(0);
    expect(hp[1]! - b.s.hp).toBeGreaterThan(0);
    expect(far.s.hp).toBe(hp[2]);
    expect(names(a)).toEqual([]);
    expect(names(b)).toEqual([]);
  });
  it('Thu Cổ nuôi ngay 3 cổ và đánh vùng quanh thân', () => {
    const { join, mon, fresh, use, res } = setup();
    const p = join();
    const m = mon(X + 4, Z);
    fresh(p);
    const hp = m.s.hp;
    use(p, 'skl_thu_co');
    expect(res(p)).toBe(3);
    expect(hp - m.s.hp).toBeGreaterThan(0);
  });
  it('Cổ Triều: cần vòng sạc đầy, bốn cổ mỗi nhịp, xả hết cổ làm bầy mạnh thêm 10% mỗi con', () => {
    const { join, mon, fresh, use, res, setRes, priv } = setup();
    const p = join();
    const m = mon();
    fresh(p);
    use(p, 'skl_co_trieu', m.id);
    expect(priv.combat.summons).toHaveLength(0);
    p.mth.charge = 100;
    fresh(p);
    use(p, 'skl_co_trieu', m.id);
    const base = priv.combat.summons.find((s) => s.sid === p.sid)!;
    expect(base.count).toBe(4);
    const weak = base.power;
    p.mth.charge = 100;
    setRes(p, 6);
    fresh(p);
    use(p, 'skl_co_trieu', m.id);
    const strong = priv.combat.summons.filter((s) => s.sid === p.sid);
    expect(strong).toHaveLength(1);
    expect(strong[0]!.power).toBeCloseTo(weak * 1.6, 5);
    expect(res(p)).toBe(0);
    expect(p.mth.charge).toBe(0);
  });
  it('Hóa Cổ Vương: đủ 3 cổ thì xả 3 và Cổ Vương mạnh thêm 50%; thiếu cổ vẫn gọi nhưng không mạnh thêm', () => {
    const { join, mon, fresh, use, res, setRes, priv } = setup();
    const p = join();
    const m = mon();
    fresh(p);
    use(p, 'skl_hoa_co_vuong', m.id);
    const weak = priv.combat.summons.find((s) => s.sid === p.sid)!;
    expect(weak.count).toBe(1);
    const wp = weak.power;
    fresh(p);
    setRes(p, 3);
    use(p, 'skl_hoa_co_vuong', m.id);
    const strong = priv.combat.summons.find((s) => s.sid === p.sid)!;
    expect(strong.power).toBeCloseTo(wp * 1.5, 5);
    expect(res(p)).toBe(0);
  });
  it('Nuôi Cổ vào tư thế và giữ cổ không chết', () => {
    const { join, fresh, use, pass, res, setRes } = setup();
    const p = join();
    fresh(p);
    use(p, 'skl_nuoi_co');
    expect(p.mth.stance?.id).toBe('skl_nuoi_co');
    setRes(p, 4);
    pass(8);
    expect(res(p)).toBe(4);
  });
});
