import { beforeAll, describe, expect, it } from 'vitest';
import { allowSkillForTest } from './testkit';
import { branchMods, groundAt, skillGate } from '@dtl/shared';
import { METHOD } from '@dtl/content';

// Nhánh công pháp mốc 24/28 của ba hướng tu mới (Đao tu, Cổ tu, Cấm chế sư). Server quyết định: chiêu theo nhánh đã chọn, luật nhánh mốc 28
// lên tài nguyên/ấn, và cơ chế từng chiêu (thuấn di, giậm đất, xả tài nguyên, trận đặt lên đất). Đo sát thương bằng cách cộng nhiều nhát để bỏ dao động bạo kích.
process.env.DB_FILE = ':memory:';

type Sim = import('./sim').GameSim;
type Ent = import('./sim').PlayerEnt;
type Mon = import('./entities').MonEnt;
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

const X = 2040;
const Z = 2040;
const DAO = 'liet_nhan_dao_kinh';
const CO = 'duong_co_kinh';
const CCK = 'cam_che_kinh';
const PATH_OF: Record<string, string> = { [DAO]: 'dao_tu', [CO]: 'co_tu', [CCK]: 'cam_che_su' };
let nextAcc = 21000;

function setup() {
  const sim: Sim = new GameSim(new WorldState(), { broadcast: () => undefined } as never, {
    levelId: 'van_lam',
    roomName: 'test',
    spawn: { x: X, z: Z },
    respawn: { x: X, z: Z },
    persistPosition: false,
  });
  const raw = sim.onSkill.bind(sim);
  const priv = sim as unknown as {
    resolvePending(p: Ent): void;
    tickMethods(): void;
    tickMonster(m: Mon, dt: number): void;
    combat: { liveRes(p: Ent): number; formations: { sid: string; skill: string; mode: string; x: number; z: number; r: number }[] };
  };
  /** Bấm chiêu rồi xả đòn chờ ngay; `gated` = không bỏ qua cổng nhánh (thử luật chọn nhánh thật). */
  const use = (p: Ent, id: string, t?: string, gated = false) => {
    if (!gated) allowSkillForTest(p.char, id);
    raw(p, { id, t });
    const st = p.flow.pending;
    if (st) {
      st.at = sim.now;
      priv.resolvePending(p);
    }
  };
  const join = (method: string, lv = 28): Ent => {
    const char = Character.create(nextAcc++, 't28' + nextAcc);
    char.level = lv;
    char.recalc();
    char.hp = char.mhp;
    char.mp = char.mmp;
    const p = sim.addPlayer({ sessionId: 'c' + nextAcc, send: () => undefined } as never, char, true, 's' + nextAcc);
    p.move.x = X;
    p.move.z = Z;
    p.move.y = groundAt(X, Z);
    char.meta.paths = [PATH_OF[method]!];
    char.meta.method = method;
    char.recalc();
    return p;
  };
  const mon = (x = X + 5, z = Z, hp = 50_000_000): Mon => {
    const m = sim.spawnMonster(MONSTER.get('mon_soi_xam')!, 10, x, z, null);
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
  const res = (p: Ent) => priv.combat.liveRes(p);
  const setRes = (p: Ent, v: number) => {
    p.mth.res = v;
    p.mth.resAt = sim.now;
  };
  const marks = (m: Mon, id: string) => m.marks.find((x) => x.id === id)?.n ?? 0;
  return { sim, priv, join, mon, fresh, use, pass, res, setRes, marks };
}

const NEW = {
  [DAO]: { t24: ['skl_thuan_dao_tram', 'skl_huyet_chien_the'], t28: 'skl_doan_thien_dao', b28: ['cuong_dao', 'luu_ngan'] },
  [CO]: { t24: ['skl_phan_co_thuat', 'skl_kim_thien_co'], t28: 'skl_van_co_phe_the', b28: ['bach_co', 'doc_to'] },
  [CCK]: { t24: ['skl_dia_sat_tran', 'skl_thai_hu_ho_tran'], t28: 'skl_lac_thu_dai_tran', b28: ['cuu_cung', 'phong_an'] },
} as const;

describe('khung nhánh 16/20/24/28 của ba hướng', () => {
  for (const [mid, cfg] of Object.entries(NEW)) {
    const m = METHOD.get(mid)!;
    it(`${mid}: đủ 4 mốc, mốc 24 hai chiêu khác nhau, mốc 28 một chiêu chung hai nhánh luật khác nhau`, () => {
      expect([...new Set(m.branches.map((b) => b.tier))]).toEqual([16, 20, 24, 28]);
      const t24 = m.branches.filter((b) => b.tier === 24);
      expect(t24.map((b) => b.grants[0]).sort()).toEqual([...cfg.t24].sort());
      const t28 = m.branches.filter((b) => b.tier === 28);
      expect(t28.map((b) => b.id)).toEqual([...cfg.b28]);
      expect(t28.every((b) => b.grants.length === 1 && b.grants[0] === cfg.t28)).toBe(true);
      expect(JSON.stringify(t28[0]!.mods)).not.toBe(JSON.stringify(t28[1]!.mods));
    });
    it(`${mid}: chiêu mốc 24 bị chặn theo nhánh (chưa chọn: cần chọn; chọn nhánh kia: bị loại)`, () => {
      const [a, b] = cfg.t24;
      expect(skillGate(m, undefined, a)).toBe('need');
      const ba = m.branches.find((x) => x.grants.includes(a))!;
      expect(skillGate(m, { 24: ba.id }, a)).toBe('ok');
      expect(skillGate(m, { 24: ba.id }, b)).toBe('other');
      // chiêu mốc 28 chọn nhánh nào cũng dùng được
      for (const id of cfg.b28) expect(skillGate(m, { 28: id }, cfg.t28)).toBe('ok');
    });
  }
  it('luật nhánh mốc 28 cộng dồn với nhánh thấp và chỉ có hiệu lực khi đủ cảnh giới', () => {
    const co = METHOD.get(CO)!;
    expect(branchMods(co, { 28: 'bach_co' }, 28).res).toEqual({ max: 2 });
    expect(branchMods(co, { 28: 'bach_co' }, 27).res).toBeUndefined();
    expect(branchMods(co, { 28: 'doc_to' }, 28).markDurMul).toBe(1.5);
    expect(branchMods(METHOD.get(CCK)!, { 28: 'cuu_cung' }, 28).res).toEqual({ max: 50 });
    expect(branchMods(METHOD.get(DAO)!, { 28: 'cuong_dao' }, 28).res).toEqual({ gainMul: 1.3 });
  });
});

describe('server chặn chiêu theo nhánh thật (không bỏ qua cổng)', () => {
  it('chưa chọn nhánh thì Thuấn Đao Trảm không ra đòn; chọn đúng nhánh thì ra; chọn nhánh kia thì không', () => {
    const { join, mon, fresh, use } = setup();
    const p = join(DAO);
    const m = mon();
    const hit = () => {
      fresh(p);
      const hp = m.s.hp;
      use(p, 'skl_thuan_dao_tram', m.id, true);
      return hp - m.s.hp;
    };
    expect(hit()).toBe(0);
    p.char.branches[DAO] = { 24: 'thuan_dao' };
    let sum = 0;
    for (let i = 0; i < 10; i++) sum += hit();
    expect(sum).toBeGreaterThan(0);
    p.char.branches[DAO] = { 24: 'huyet_chien' };
    expect(hit()).toBe(0);
  });
});

describe('Đao tu mốc 24/28', () => {
  it('Thuấn Đao Trảm thuấn di tới sát mục tiêu, thu Đao ngấn: nhiều ấn thì chém nặng hơn rõ', () => {
    const { join, mon, fresh, use, marks } = setup();
    const p = join(DAO);
    const m = mon(X + 12, Z);
    const cast = (n: number): number => {
      for (let i = 0; i < n; i++) {
        fresh(p);
        p.move.x = X;
        p.move.z = Z;
        use(p, 'skl_bao_nhan', m.id);
      }
      fresh(p);
      p.move.x = X;
      p.move.z = Z;
      const hp = m.s.hp;
      use(p, 'skl_thuan_dao_tram', m.id);
      expect(Math.hypot(p.move.x - m.s.x, p.move.z - m.s.z)).toBeLessThan(3);
      expect(marks(m, 'dao_ngan')).toBe(0);
      return hp - m.s.hp;
    };
    // +10%/tầng chỉ cộng 30% so với dao động bạo kích: lấy 200 mẫu để sai số nhỏ hơn hẳn ngưỡng 1,15 (30 mẫu từng đỏ trên CI; các phép so cộng dồn khác cũng ≥ 60 mẫu).
    let low = 0;
    let high = 0;
    for (let i = 0; i < 200; i++) {
      low += cast(0);
      high += cast(3);
    }
    expect(low).toBeGreaterThan(0);
    expect(high).toBeGreaterThan(low * 1.15);
  });
  it('Huyết Chiến Thể tích ngay 30 Khí thế và giậm đất mỗi giây quanh thân (quái trong 5 m bị đánh, ngoài thì không)', () => {
    const { join, mon, fresh, use, pass, res, setRes } = setup();
    const p = join(DAO);
    const near = mon(X + 3, Z);
    const far = mon(X + 20, Z);
    fresh(p);
    setRes(p, 0);
    use(p, 'skl_huyet_chien_the');
    expect(res(p)).toBe(30);
    const hp = [near.s.hp, far.s.hp];
    pass(3, near, far);
    expect(near.s.hp).toBeLessThan(hp[0]!);
    expect(far.s.hp).toBe(hp[1]);
  });
  it('Đoạn Thiên Đao đánh mọi quái trong 12 m, xả hết Khí thế, thu Đao ngấn trên từng con; đủ thế + đủ ấn thì nặng hơn rõ', () => {
    const { join, mon, fresh, use, res, setRes, marks } = setup();
    const p = join(DAO);
    const a = mon(X + 3, Z);
    const b = mon(X + 3, Z + 9);
    const far = mon(X + 3, Z + 40);
    const run = (khi: number, n: number): number => {
      for (const m of [a, b]) {
        m.s.hp = m.s.mhp;
        for (let i = 0; i < n; i++) {
          fresh(p);
          use(p, 'skl_bao_nhan', m.id);
        }
      }
      fresh(p);
      setRes(p, khi);
      p.mth.charge = 100;
      const hp = [a.s.hp, b.s.hp, far.s.hp];
      use(p, 'skl_doan_thien_dao', a.id);
      expect(hp[0]! - a.s.hp).toBeGreaterThan(0);
      expect(hp[1]! - b.s.hp).toBeGreaterThan(0);
      expect(far.s.hp).toBe(hp[2]);
      expect(res(p)).toBe(0);
      expect(marks(a, 'dao_ngan')).toBe(0);
      expect(marks(b, 'dao_ngan')).toBe(0);
      return hp[0]! - a.s.hp;
    };
    let low = 0;
    let high = 0;
    for (let i = 0; i < 200; i++) {
      low += run(0, 0);
      high += run(100, 3);
    }
    expect(high).toBeGreaterThan(low * 1.3);
  });
  it('nhánh Cuồng Đao tích Khí thế nhanh hơn 30%; nhánh Lưu Ngấn giữ Đao ngấn lâu hơn 50%', () => {
    const { join, mon, fresh, use, res, setRes, sim } = setup();
    const gain = (branch: string): number => {
      const p = join(DAO);
      p.char.branches[DAO] = { 28: branch };
      const m = mon();
      fresh(p);
      setRes(p, 0);
      use(p, 'skl_bao_nhan', m.id);
      return res(p);
    };
    const normal = gain('luu_ngan');
    expect(normal).toBe(8);
    expect(gain('cuong_dao')).toBeCloseTo(8 * 1.3, 5);
    const life = (branch: string): number => {
      const p = join(DAO);
      p.char.branches[DAO] = { 28: branch };
      const m = mon();
      fresh(p);
      use(p, 'skl_bao_nhan', m.id);
      return m.marks.find((x) => x.id === 'dao_ngan')!.until - sim.now;
    };
    expect(life('cuong_dao')).toBe(8000);
    expect(life('luu_ngan')).toBe(12000);
  });
});

describe('Cổ tu mốc 24/28', () => {
  it('Phân Cổ Thuật đánh mọi quái trong 8 m quanh mục tiêu, gieo Cổ độc lên từng con và tích 2 Cổ', () => {
    const { join, mon, fresh, use, res, setRes, marks } = setup();
    const p = join(CO);
    const a = mon(X + 4, Z);
    const b = mon(X + 4, Z + 6);
    const far = mon(X + 4, Z + 30);
    fresh(p);
    setRes(p, 0);
    const hp = [a.s.hp, b.s.hp, far.s.hp];
    use(p, 'skl_phan_co_thuat', a.id);
    expect(hp[0]! - a.s.hp).toBeGreaterThan(0);
    expect(hp[1]! - b.s.hp).toBeGreaterThan(0);
    expect(far.s.hp).toBe(hp[2]);
    expect(marks(a, 'co_doc')).toBe(1);
    expect(marks(b, 'co_doc')).toBe(1);
    expect(marks(far, 'co_doc')).toBe(0);
    expect(res(p)).toBeCloseTo(2, 5);
  });
  it('Kim Thiền Cổ tích 2 Cổ, giảm 30% sát thương nhận và phản 25% về quái đánh mình', () => {
    const { sim, join, mon, fresh, use, res, setRes } = setup();
    const p = join(CO);
    const m = mon(X + 2, Z);
    fresh(p);
    setRes(p, 0);
    use(p, 'skl_kim_thien_co');
    expect(res(p)).toBeCloseTo(2, 5);
    const before = m.s.hp;
    const hp0 = p.char.hp;
    sim.damagePlayer(p, 100, m.id);
    expect(hp0 - p.char.hp).toBe(70);
    expect(before - m.s.hp).toBe(Math.round(70 * 0.25));
  });
  it('Vạn Cổ Phệ Thể xả hết Cổ, thu Cổ độc trên từng quái trong 12 m; đủ Cổ + đủ ấn thì nặng hơn rõ', () => {
    const { join, mon, fresh, use, res, setRes, marks } = setup();
    const p = join(CO);
    const a = mon(X + 3, Z);
    const b = mon(X + 3, Z + 9);
    const far = mon(X + 3, Z + 40);
    const run = (co: number, n: number): number => {
      for (const m of [a, b]) {
        m.s.hp = m.s.mhp;
        for (let i = 0; i < n; i++) {
          fresh(p);
          use(p, 'skl_tha_co', m.id);
        }
      }
      fresh(p);
      setRes(p, co);
      const hp = [a.s.hp, b.s.hp, far.s.hp];
      use(p, 'skl_van_co_phe_the', a.id);
      expect(hp[0]! - a.s.hp).toBeGreaterThan(0);
      expect(hp[1]! - b.s.hp).toBeGreaterThan(0);
      expect(far.s.hp).toBe(hp[2]);
      expect(res(p)).toBe(0);
      expect(marks(a, 'co_doc')).toBe(0);
      expect(marks(b, 'co_doc')).toBe(0);
      return hp[0]! - a.s.hp;
    };
    let low = 0;
    let high = 0;
    for (let i = 0; i < 200; i++) {
      low += run(0, 0);
      high += run(6, 3);
    }
    expect(high).toBeGreaterThan(low * 1.3);
  });
  it('nhánh Bách Cổ nâng trần Cổ lên 8; nhánh Độc Tổ giữ Cổ độc lâu hơn 50%', () => {
    const { join, mon, fresh, use, res, setRes, sim } = setup();
    const cap = (branch: string): number => {
      const p = join(CO);
      p.char.branches[CO] = { 28: branch };
      setRes(p, 100);
      p.mth.res = 100;
      return res(p);
    };
    expect(cap('doc_to')).toBe(6);
    expect(cap('bach_co')).toBe(8);
    const life = (branch: string): number => {
      const p = join(CO);
      p.char.branches[CO] = { 28: branch };
      const m = mon();
      fresh(p);
      setRes(p, 0);
      use(p, 'skl_tha_co', m.id);
      return m.marks.find((x) => x.id === 'co_doc')!.until - sim.now;
    };
    expect(life('bach_co')).toBe(10_000);
    expect(life('doc_to')).toBe(15_000);
  });
});

describe('Cấm chế sư mốc 24/28', () => {
  it('Địa Sát Trận đặt trận Sát 8 m cách người 4 m theo hướng nhìn; sau khi dựng đánh quái trong trận và gieo Cấm ấn', () => {
    const { join, mon, fresh, use, pass, priv, marks } = setup();
    const p = join(CCK);
    p.s.yaw = 0;
    const inside = mon(X, Z + 6);
    const outside = mon(X + 30, Z + 4);
    fresh(p);
    use(p, 'skl_dia_sat_tran');
    const f = priv.combat.formations.find((x) => x.sid === p.sid)!;
    expect(f.skill).toBe('skl_dia_sat_tran');
    expect(f.mode).toBe('sat');
    expect(f.r).toBe(8);
    expect(f.z).toBeCloseTo(Z + 4, 5);
    const hp = [inside.s.hp, outside.s.hp];
    pass(3, inside, outside);
    expect(inside.s.hp).toBeLessThan(hp[0]!);
    expect(outside.s.hp).toBe(hp[1]);
    expect(marks(inside, 'cam_an')).toBeGreaterThan(0);
  });
  it('Thái Hư Hộ Trận hồi 9% khí huyết tối đa mỗi nhịp cho đạo hữu trong 8 m (kể cả người đặt), không hồi người ngoài', () => {
    const { join, fresh, use, pass } = setup();
    const p = join(CCK);
    const ally = join(CCK);
    ally.move.x = X + 6;
    ally.move.z = Z;
    const far = join(CCK);
    far.move.x = X + 40;
    far.move.z = Z;
    for (const o of [p, ally, far]) o.char.hp = Math.floor(o.char.mhp / 2);
    fresh(p);
    use(p, 'skl_thai_hu_ho_tran');
    const h0 = [p.char.hp, ally.char.hp, far.char.hp];
    pass(2);
    expect(ally.char.hp).toBeGreaterThan(h0[1]!);
    expect(p.char.hp).toBeGreaterThan(h0[0]!);
    expect(far.char.hp).toBe(h0[2]);
    const before = ally.char.hp;
    pass(1);
    expect(ally.char.hp - before).toBe(Math.round(ally.char.mhp * 0.09));
  });
  it('Lạc Thư Đại Trận xả hết Cấm lực, dựng trận Sát 11 m dưới chân; nhiều Cấm lực thì trận đánh mạnh hơn', () => {
    const { join, mon, fresh, use, pass, res, setRes, priv } = setup();
    const total = (cam: number): number => {
      const p = join(CCK);
      const m = mon(X + 9, Z);
      fresh(p);
      setRes(p, cam);
      use(p, 'skl_lac_thu_dai_tran');
      const f = priv.combat.formations.find((x) => x.sid === p.sid)!;
      expect(f.r).toBe(11);
      expect(f.x).toBeCloseTo(X, 5);
      expect(res(p)).toBe(0);
      const hp = m.s.hp;
      pass(13, m);
      return hp - m.s.hp;
    };
    let low = 0;
    let high = 0;
    for (let i = 0; i < 60; i++) {
      low += total(0);
      high += total(100);
    }
    expect(low).toBeGreaterThan(0);
    expect(high).toBeGreaterThan(low * 1.1);
  });
  it('nhánh Cửu Cung nâng trần Cấm lực lên 150', () => {
    const { join, res, setRes } = setup();
    const cap = (branch: string): number => {
      const p = join(CCK);
      p.char.branches[CCK] = { 28: branch };
      setRes(p, 1000);
      return res(p);
    };
    expect(cap('phong_an')).toBe(100);
    expect(cap('cuu_cung')).toBe(150);
  });
});
