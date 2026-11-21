import { beforeAll, describe, expect, it } from 'vitest';
import { allowSkillForTest } from './testkit';
import { groundAt, MF_STUN, unpackMarks } from '@dtl/shared';

// Lôi tu (Liệt Nhận Lôi Kinh). Server quyết định hết: lĩnh ngộ hướng tu, Lôi tích (đòn thường, chịu đòn), Lôi ấn, chém xả thế.
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
let sanitizeMethodMeta: typeof import('./method').sanitizeMethodMeta;
let sqlite: typeof import('../db').sqlite;

beforeAll(async () => {
  ({ GameSim } = await import('./sim'));
  ({ WorldState } = await import('../state'));
  ({ Character } = await import('./character'));
  ({ MONSTER, NPC, PATH } = await import('@dtl/content'));
  ({ sanitizeMethodMeta } = await import('./method'));
  ({ sqlite } = await import('../db'));
});

const X = 2040;
const Z = 2040;
const DAO = 'cuu_tieu_loi_kinh';
let nextAcc = 14000;

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
    combat: { liveRes(p: Ent): number };
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
  /** Người chơi mới; `method` rỗng = chưa chọn công pháp. Lôi tu thì coi như đã lĩnh ngộ sẵn. */
  const join = (method = DAO, lv = level): Ent => {
    const char = Character.create(nextAcc++, 'dt' + nextAcc);
    char.level = lv;
    char.recalc();
    char.hp = char.mhp;
    char.mp = char.mmp;
    const p = sim.addPlayer({ sessionId: 'c' + nextAcc, send: () => undefined } as never, char, true, 's' + nextAcc);
    p.move.x = X;
    p.move.z = Z;
    p.move.y = groundAt(X, Z);
    if (method === DAO) char.meta.paths = ['loi_tu'];
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
  /** Đặt Lôi tích thẳng (không chờ tích). */
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
  sqlite.prepare("SELECT kind, delta FROM ledger WHERE char_id = ? AND reason = 'path:unlock:loi_tu'").all(charId) as {
    kind: string;
    delta: number;
  }[];

describe('lĩnh ngộ Lôi tu', () => {
  it('thiếu cảnh giới hay linh thạch không chọn được; đủ thì trừ đúng một lần, ghi ledger, gửi lại cùng khóa không trừ nữa', () => {
    const { sim, join } = setup();
    const u = PATH.get('loi_tu')!.unlock!;
    const low = join('', u.level - 1);
    nearNpc(low);
    low.char.gold = 9999;
    sim.onMethod(low, { method: DAO, r: 'dt-000001' });
    expect(low.char.meta.method).toBeUndefined();
    const p = join('', u.level);
    p.char.gold = u.gold - 1;
    nearNpc(p);
    sim.onMethod(p, { method: DAO, r: 'dt-000002' });
    expect(p.char.meta.method).toBeUndefined();
    expect(unlockRows(p.char.id)).toEqual([]);
    p.char.gold = 1000;
    sim.onMethod(p, { method: DAO, r: 'dt-000003' });
    expect(p.char.meta.method).toBe(DAO);
    expect(p.char.meta.paths).toEqual(['loi_tu']);
    expect(p.char.gold).toBe(1000 - u.gold);
    expect(unlockRows(p.char.id)).toEqual([{ kind: 'gold', delta: -u.gold }]);
    sim.onMethod(p, { method: DAO, r: 'dt-000003' });
    expect(p.char.gold).toBe(1000 - u.gold);
    expect(unlockRows(p.char.id)).toHaveLength(1);
  });
  it('meta hỏng (tu Lôi tu mà chưa lĩnh ngộ) được làm sạch; người chưa tu không dùng được chiêu Lôi tu', () => {
    const { sim, join, mon, fresh } = setup();
    const bad = { method: DAO, paths: ['khong_co'] as string[] };
    sanitizeMethodMeta(bad);
    expect(bad.method).toBeUndefined();
    const p = join('lac_kiem_quyet');
    const m = mon();
    fresh(p);
    const hp = m.s.hp;
    sim.onSkill(p, { id: 'skl_loi_an_kich', t: m.id });
    expect(m.s.hp).toBe(hp);
    expect(m.s.mk).toBe(0);
  });
});

describe('Lôi tích và Lôi ấn', () => {
  it('Lôi Ấn Kích khắc Lôi ấn (tối đa 3 tầng) và tích 8 Lôi tích mỗi nhát', () => {
    const { join, mon, fresh, use, names, res } = setup();
    const p = join();
    const m = mon();
    for (let i = 1; i <= 4; i++) {
      fresh(p);
      use(p, 'skl_loi_an_kich', m.id);
      expect(names(m)).toEqual([`loi_an:${Math.min(3, i)}`]);
    }
    expect(res(p)).toBe(32);
  });
  it('chịu đòn KHÔNG tích Lôi tích; Lôi tích không vượt 100, giữ 6 giây rồi tan nhanh (8/giây)', () => {
    const { sim, join, pass, res, setRes } = setup();
    const p = join();
    expect(res(p)).toBe(0);
    for (let i = 0; i < 20; i++) sim.damagePlayer(p, Math.floor(p.char.mhp / 40), 'mon_x');
    expect(res(p)).toBe(0);
    setRes(p, 100);
    expect(res(p)).toBeLessThanOrEqual(100);
    pass(6);
    expect(res(p)).toBe(100);
    pass(5);
    const after = res(p);
    expect(after).toBeLessThan(100);
    expect(after).toBeLessThanOrEqual(100 - 8 * 4);
  });
  it('Thiểm Lôi Bộ mở chuỗi: Lôi Ấn Kích ngay sau lướt mạnh hơn bấm lẻ', () => {
    const { join, mon, fresh, use, sim } = setup();
    const p = join();
    const m = mon();
    const hit = (dash: boolean): number => {
      fresh(p);
      m.s.hp = m.s.mhp;
      p.move.x = X;
      p.move.z = Z;
      if (dash) {
        use(p, 'skl_thiem_loi_bo', m.id);
        sim.now += 100;
        p.gcdAt = 0;
      } else {
        sim.now += 4000;
      }
      const hp = m.s.hp;
      use(p, 'skl_loi_an_kich', m.id);
      return hp - m.s.hp;
    };
    // cộng nhiều nhát để bỏ dao động sát thương
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

describe('chiêu xả Lôi tích', () => {
  it('Cửu Tiêu Thiên Lôi xả hết Lôi tích và thu hết Lôi ấn của mình; nhiều thế + nhiều ấn thì chém nặng hơn rõ', () => {
    const { join, mon, fresh, use, names, res, setRes } = setup();
    const p = join();
    const m = mon();
    const cast = (khi: number, marks: number): number => {
      m.s.hp = m.s.mhp;
      for (let i = 0; i < marks; i++) {
        fresh(p);
        use(p, 'skl_loi_an_kich', m.id);
      }
      fresh(p);
      setRes(p, khi);
      p.mth.charge = 100; // chiêu tối thượng cần vòng sạc đầy
      const hp = m.s.hp;
      use(p, 'skl_cuu_tieu_thien_loi', m.id);
      return hp - m.s.hp;
    };
    // cộng nhiều nhát xen kẽ để bỏ dao động sát thương (bạo kích)
    let low = 0;
    let high = 0;
    for (let i = 0; i < 30; i++) {
      low += cast(0, 0);
      expect(res(p)).toBe(0);
      high += cast(100, 3);
      expect(res(p)).toBe(0);
    }
    expect(names(m)).toEqual([]);
    expect(low).toBeGreaterThan(0);
    expect(high).toBeGreaterThan(low * 1.5);
  });
  it('Lôi Phạt ghìm mục tiêu; đủ 40 Lôi tích thì xả 40 và đánh mạnh thêm (cộng nhiều nhát để bỏ dao động)', () => {
    const { join, mon, fresh, use, res, setRes } = setup();
    const p = join();
    const m = mon();
    const total = (khi: number): number => {
      let sum = 0;
      for (let i = 0; i < 60; i++) {
        fresh(p);
        m.s.mf = 0;
        setRes(p, khi);
        const hp = m.s.hp;
        use(p, 'skl_loi_phat', m.id);
        sum += hp - m.s.hp;
        expect(m.s.mf & MF_STUN).not.toBe(0);
        expect(res(p)).toBe(khi >= 40 ? khi - 40 : khi);
      }
      return sum;
    };
    const without = total(0);
    const withRes = total(40);
    expect(withRes).toBeGreaterThan(without * 1.1);
  });
  it('Lôi Hải đánh mọi quái trong 7 mét, xả hết Lôi tích và thu Lôi ấn trên từng con', () => {
    const { join, mon, fresh, use, names, res, setRes } = setup();
    const p = join();
    const a = mon(X + 3, Z);
    const b = mon(X + 3, Z + 3);
    const far = mon(X + 3, Z + 30);
    for (const m of [a, b]) {
      fresh(p);
      use(p, 'skl_loi_an_kich', m.id);
    }
    fresh(p);
    setRes(p, 60);
    const hp = [a.s.hp, b.s.hp, far.s.hp];
    use(p, 'skl_loi_hai', a.id);
    expect(hp[0]! - a.s.hp).toBeGreaterThan(0);
    expect(hp[1]! - b.s.hp).toBeGreaterThan(0);
    expect(far.s.hp).toBe(hp[2]);
    expect(res(p)).toBe(0);
    expect(names(a)).toEqual([]);
    expect(names(b)).toEqual([]);
  });
  it('Phích Lịch Tuyến khắc Lôi ấn lên mọi quái trên đường chém', () => {
    const { join, mon, fresh, use, names } = setup();
    const p = join();
    const a = mon(X + 4, Z);
    const b = mon(X + 8, Z);
    fresh(p);
    use(p, 'skl_phich_lich', a.id);
    expect(names(a)).toEqual(['loi_an:1']);
    expect(names(b)).toEqual(['loi_an:1']);
  });
});

describe('Lôi Võng và Lôi Thể', () => {
  it('Lôi Võng tích ngay 20 Lôi tích khi vào thế', () => {
    const { join, fresh, use, res } = setup();
    const p = join();
    fresh(p);
    use(p, 'skl_loi_vong');
    expect(res(p)).toBe(20);
  });
  it('Lôi Thể vào tư thế và giữ Lôi tích không tan', () => {
    const { join, fresh, use, pass, res, setRes } = setup();
    const p = join();
    fresh(p);
    use(p, 'skl_loi_the');
    expect(p.mth.stance?.id).toBe('skl_loi_the');
    setRes(p, 50);
    pass(6);
    expect(res(p)).toBe(50);
  });
});
