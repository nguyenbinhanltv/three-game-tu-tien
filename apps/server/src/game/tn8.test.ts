import { beforeAll, describe, expect, it } from 'vitest';
import { allowSkillForTest } from './testkit';
import { groundAt, MF_STUN, unpackMarks } from '@dtl/shared';

// Cấm chế sư (Cấm Chế Kinh, TN-8). Server quyết định hết: lĩnh ngộ hướng tu, Cấm lực, Cấm ấn, thực thể trận (đặt trên đất, chờ dựng, nhịp, giới hạn, hết hạn).
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
const CCK = 'cam_che_kinh';
let nextAcc = 18000;

function setup(level = 28) {
  const sent: { t?: string }[] = [];
  const sim: Sim = new GameSim(new WorldState(), { broadcast: (_type: unknown, msg: { t?: string }) => sent.push(msg) } as never, {
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
    combat: {
      liveRes(p: Ent): number;
      formations: {
        id: number;
        sid: string;
        skill: string;
        mode: string;
        x: number;
        z: number;
        r: number;
        armAt: number;
        until: number;
        power: number;
      }[];
    };
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
  /** Người chơi mới; `method` rỗng = chưa chọn công pháp. Cấm chế sư thì coi như đã lĩnh ngộ sẵn. */
  const join = (method = CCK, lv = level): Ent => {
    const char = Character.create(nextAcc++, 'cc' + nextAcc);
    char.level = lv;
    char.recalc();
    char.hp = char.mhp;
    char.mp = char.mmp;
    const p = sim.addPlayer({ sessionId: 'c' + nextAcc, send: () => undefined } as never, char, true, 's' + nextAcc);
    p.move.x = X;
    p.move.z = Z;
    p.move.y = groundAt(X, Z);
    if (method === CCK) char.meta.paths = ['cam_che_su'];
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
  return { sim, priv, join, mon, fresh, use, pass, names, res, setRes, sent };
}

const nearNpc = (p: Ent) => {
  const npc = NPC.get('npc_chuong_mon')!;
  p.move.x = npc.x;
  p.move.z = npc.z;
};
const unlockRows = (charId: number) =>
  sqlite.prepare("SELECT kind, delta FROM ledger WHERE char_id = ? AND reason = 'path:unlock:cam_che_su'").all(charId) as {
    kind: string;
    delta: number;
  }[];

describe('lĩnh ngộ Cấm chế sư', () => {
  it('thiếu cảnh giới hay linh thạch không chọn được; đủ thì trừ đúng một lần, ghi ledger, gửi lại cùng khóa không trừ nữa', () => {
    const { sim, join } = setup();
    const u = PATH.get('cam_che_su')!.unlock!;
    const low = join('', u.level - 1);
    nearNpc(low);
    low.char.gold = 9999;
    sim.onMethod(low, { method: CCK, r: 'cc-000001' });
    expect(low.char.meta.method).toBeUndefined();
    const p = join('', u.level);
    p.char.gold = u.gold - 1;
    nearNpc(p);
    sim.onMethod(p, { method: CCK, r: 'cc-000002' });
    expect(p.char.meta.method).toBeUndefined();
    expect(unlockRows(p.char.id)).toEqual([]);
    p.char.gold = 1000;
    sim.onMethod(p, { method: CCK, r: 'cc-000003' });
    expect(p.char.meta.method).toBe(CCK);
    expect(p.char.meta.paths).toEqual(['cam_che_su']);
    expect(p.char.gold).toBe(1000 - u.gold);
    expect(unlockRows(p.char.id)).toEqual([{ kind: 'gold', delta: -u.gold }]);
    sim.onMethod(p, { method: CCK, r: 'cc-000003' });
    expect(p.char.gold).toBe(1000 - u.gold);
    expect(unlockRows(p.char.id)).toHaveLength(1);
  });
  it('meta hỏng được làm sạch; người chưa tu không dùng được chiêu Cấm chế sư và không đặt được trận', () => {
    const { sim, join, mon, fresh, priv } = setup();
    const bad = { method: CCK, paths: ['khong_co'] as string[] };
    sanitizeMethodMeta(bad);
    expect(bad.method).toBeUndefined();
    const p = join('lac_kiem_quyet');
    const m = mon();
    fresh(p);
    sim.onSkill(p, { id: 'skl_phong_cam', t: m.id });
    expect(m.s.mk).toBe(0);
    sim.onSkill(p, { id: 'skl_tue_nguyet_cam' });
    expect(priv.combat.formations).toHaveLength(0);
  });
});

describe('Cấm ấn và Cấm lực', () => {
  it('Phong Cấm khắc Cấm ấn (tối đa 3 tầng) và tích 8 Cấm lực mỗi nhát', () => {
    const { join, mon, fresh, use, names, res } = setup();
    const p = join();
    const m = mon();
    for (let i = 1; i <= 4; i++) {
      fresh(p);
      use(p, 'skl_phong_cam', m.id);
      expect(names(m)).toEqual([`cam_an:${Math.min(3, i)}`]);
    }
    expect(res(p)).toBe(32);
  });
  it('Độn Địa Bộ mở chuỗi: Phong Cấm ngay sau lướt mạnh hơn bấm lẻ (cộng nhiều nhát)', () => {
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
        use(p, 'skl_don_dia_bo', m.id);
        sim.now += 100;
        p.gcdAt = 0;
      } else sim.now += 4000;
      const hp = m.s.hp;
      use(p, 'skl_phong_cam', m.id);
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
  it('Phá Diệt Cấm thu hết Cấm ấn của mình, choáng quái thường, mạnh hơn khi có ấn (cộng nhiều nhát)', () => {
    const { join, mon, fresh, use, names } = setup();
    const p = join();
    const m = mon();
    const cast = (marks: number): number => {
      m.s.mf = 0;
      m.s.hp = m.s.mhp;
      for (let i = 0; i < marks; i++) {
        fresh(p);
        use(p, 'skl_phong_cam', m.id);
      }
      fresh(p);
      m.s.hp = m.s.mhp;
      const hp = m.s.hp;
      use(p, 'skl_pha_diet_cam', m.id);
      return hp - m.s.hp;
    };
    let none = 0;
    let three = 0;
    for (let i = 0; i < 30; i++) {
      none += cast(0);
      three += cast(3);
      expect(names(m)).toEqual([]);
    }
    expect(three).toBeGreaterThan(none * 1.3);
    // đòn nào cũng choáng quái thường
    m.s.mf = 0;
    fresh(p);
    use(p, 'skl_pha_diet_cam', m.id);
    expect(m.s.mf & MF_STUN).not.toBe(0);
  });
});

describe('thực thể trận', () => {
  it('Tuế Nguyệt Cấm đặt một trận cách người 4 m theo hướng nhìn, chưa có hiệu lực lúc đang dựng, có hiệu lực sau đó', () => {
    const { join, mon, fresh, use, pass, priv } = setup();
    const p = join();
    p.s.yaw = 0; // nhìn +Z
    const m = mon(X, Z + 4);
    fresh(p);
    use(p, 'skl_tue_nguyet_cam');
    const f = priv.combat.formations.find((x) => x.sid === p.sid)!;
    expect(f).toBeDefined();
    expect(f.mode).toBe('khon');
    expect(f.x).toBeCloseTo(X, 5);
    expect(f.z).toBeCloseTo(Z + 4, 5);
    expect(f.r).toBe(7);
    const hp = m.s.hp;
    pass(0, m); // vừa đặt, đang dựng (arm 0,8 s)
    expect(m.s.hp).toBe(hp);
    pass(3, m);
    expect(m.s.hp).toBeLessThan(hp);
    expect(m.slow?.mul).toBeCloseTo(0.35, 5);
    expect(m.marks.some((x) => x.id === 'cam_an')).toBe(true);
  });
  it('Khốn Trận làm chậm quái thường nhưng thủ lĩnh miễn; quái ngoài trận không bị', () => {
    const { join, mon, fresh, use, pass, sim } = setup();
    const p = join();
    p.s.yaw = 0;
    const inside = mon(X, Z + 4);
    const outside = mon(X + 30, Z + 4);
    const boss = mon(X + 1, Z + 4, 50_000_000, 'boss_huyet_lang_vuong');
    expect(boss.def.boss).toBe(true);
    p.mth.stance = { id: 'skl_bo_tran', until: sim.now + 60_000 };
    fresh(p);
    use(p, 'skl_khon_tran');
    pass(3, inside, outside, boss);
    expect(inside.slow?.mul).toBeCloseTo(0.4, 5);
    expect(outside.slow).toBeUndefined();
    expect(boss.slow).toBeUndefined();
  });
  it('Hộ Trận hồi đạo hữu trong trận (kể cả người đặt), không hồi người ngoài trận, mỗi nhịp đúng % khí huyết tối đa', () => {
    const { join, fresh, use, pass, sim } = setup();
    const p = join();
    const ally = join(CCK);
    ally.move.x = X + 2;
    ally.move.z = Z;
    const far = join(CCK);
    far.move.x = X + 40;
    far.move.z = Z;
    for (const o of [p, ally, far]) o.char.hp = Math.floor(o.char.mhp / 2);
    p.mth.stance = { id: 'skl_bo_tran', until: sim.now + 60_000 };
    fresh(p);
    use(p, 'skl_ho_tran');
    const h0 = [p.char.hp, ally.char.hp, far.char.hp];
    pass(2);
    expect(ally.char.hp).toBeGreaterThan(h0[1]!);
    expect(p.char.hp).toBeGreaterThan(h0[0]!);
    expect(far.char.hp).toBe(h0[2]);
    // một nhịp = 3% khí huyết tối đa
    const before = ally.char.hp;
    pass(1);
    expect(ally.char.hp - before).toBe(Math.round(ally.char.mhp * 0.03));
  });
  it('Sinh Tử Cấm vừa hồi đạo hữu vừa đánh quái trong trận mỗi nhịp', () => {
    const { join, mon, fresh, use, pass } = setup();
    const p = join();
    p.char.hp = Math.floor(p.char.mhp / 2);
    const m = mon(X + 3, Z);
    fresh(p);
    use(p, 'skl_sinh_tu_cam');
    const hp = m.s.hp;
    const php = p.char.hp;
    pass(3, m);
    expect(m.s.hp).toBeLessThan(hp);
    expect(p.char.hp).toBeGreaterThan(php);
    expect(m.marks.some((x) => x.id === 'cam_an')).toBe(true);
  });
  it('mỗi người tối đa 3 trận: đặt trận thứ tư thì trận cũ nhất tan; người khác không bị ảnh hưởng', () => {
    const { join, fresh, use, priv } = setup();
    const p = join();
    const q = join();
    fresh(q);
    use(q, 'skl_tue_nguyet_cam');
    const ids: number[] = [];
    for (let i = 0; i < 4; i++) {
      fresh(p);
      use(p, 'skl_tue_nguyet_cam');
      ids.push(Math.max(...priv.combat.formations.filter((x) => x.sid === p.sid).map((x) => x.id)));
    }
    const mine = priv.combat.formations.filter((x) => x.sid === p.sid).map((x) => x.id);
    expect(mine).toHaveLength(3);
    expect(mine).not.toContain(ids[0]);
    expect(mine).toEqual(ids.slice(1));
    expect(priv.combat.formations.filter((x) => x.sid === q.sid)).toHaveLength(1);
  });
  it('trận hết hạn thì tan; chủ ngã thì mọi trận của họ tan', () => {
    const { join, fresh, use, pass, priv, sim } = setup();
    const p = join();
    fresh(p);
    use(p, 'skl_tue_nguyet_cam');
    expect(priv.combat.formations).toHaveLength(1);
    pass(11);
    expect(priv.combat.formations).toHaveLength(0);
    fresh(p);
    use(p, 'skl_tue_nguyet_cam');
    fresh(p);
    use(p, 'skl_sinh_tu_cam');
    expect(priv.combat.formations).toHaveLength(2);
    sim.damagePlayer(p, p.char.mhp * 10, 'mon_x');
    pass(1);
    expect(priv.combat.formations).toHaveLength(0);
  });
  it('Mẫu Đơn Thập Bát Cấm: cần vòng sạc đầy, xả hết Cấm lực làm trận mạnh hơn', () => {
    const { join, fresh, use, res, setRes, priv } = setup();
    const p = join();
    fresh(p);
    use(p, 'skl_mau_don_cam');
    expect(priv.combat.formations).toHaveLength(0);
    p.mth.charge = 100;
    fresh(p);
    use(p, 'skl_mau_don_cam');
    const weak = priv.combat.formations.find((f) => f.sid === p.sid)!;
    expect(weak.mode).toBe('sat');
    expect(weak.r).toBe(9);
    const wp = weak.power;
    p.mth.charge = 100;
    setRes(p, 100);
    fresh(p);
    use(p, 'skl_mau_don_cam');
    const strong = priv.combat.formations.filter((f) => f.sid === p.sid);
    expect(strong).toHaveLength(2);
    expect(strong[1]!.power).toBeCloseTo(wp * 1.6, 5);
    expect(res(p)).toBe(0);
    expect(p.mth.charge).toBe(0);
  });
  it('trận có tác dụng thì chủ nhận Cấm lực (nguồn dot); trận không trúng ai thì không', () => {
    const { join, mon, fresh, use, pass, res } = setup();
    const p = join();
    p.s.yaw = 0;
    fresh(p);
    use(p, 'skl_tue_nguyet_cam');
    const r0 = res(p);
    pass(2);
    expect(res(p)).toBe(r0);
    const m = mon(X, Z + 4);
    pass(3, m);
    expect(res(p)).toBeGreaterThan(r0);
  });
  it('Phiên Thiên Ấn xả hết Cấm lực, thu Cấm ấn trên từng quái trong 8 m', () => {
    const { join, mon, fresh, use, names, res, setRes } = setup();
    const p = join();
    const a = mon(X + 3, Z);
    const b = mon(X + 3, Z + 3);
    for (const m of [a, b]) {
      fresh(p);
      use(p, 'skl_phong_cam', m.id);
    }
    fresh(p);
    setRes(p, 60);
    const hp = [a.s.hp, b.s.hp];
    use(p, 'skl_phien_thien_an', a.id);
    expect(hp[0]! - a.s.hp).toBeGreaterThan(0);
    expect(hp[1]! - b.s.hp).toBeGreaterThan(0);
    expect(res(p)).toBe(0);
    expect(names(a)).toEqual([]);
    expect(names(b)).toEqual([]);
  });
});
