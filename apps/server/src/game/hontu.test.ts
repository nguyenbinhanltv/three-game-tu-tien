import { beforeAll, describe, expect, it } from 'vitest';
import { allowSkillForTest } from './testkit';
import { groundAt, MF_STUN, MS_CHASE, MS_DEAD, unpackMarks } from '@dtl/shared';

// TN-2: Hồn tu (Dẫn Hồn Kinh). Server quyết định hết: lĩnh ngộ hướng tu, Hồn lực (thu hồn), Hồn ấn (bào mòn + rút máu), hồn binh.
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
const HON = 'dan_hon_kinh';
let nextAcc = 12000;

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
    combat: {
      delayed: { at: number; fn: () => void }[];
      liveRes(p: Ent): number;
      summons: { sid: string; power: number; count: number }[];
    };
    monSys: { damageMonster(m: Mon, dmg: number, p: Ent | null): void };
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
  /** Người chơi mới; `method` rỗng = chưa chọn công pháp. Hồn tu thì coi như đã lĩnh ngộ sẵn. */
  const join = (method = HON, lv = level): Ent => {
    const char = Character.create(nextAcc++, 'ht' + nextAcc);
    char.level = lv;
    char.recalc();
    char.hp = char.mhp;
    char.mp = char.mmp;
    const p = sim.addPlayer({ sessionId: 'c' + nextAcc, send: () => undefined } as never, char, true, 's' + nextAcc);
    p.move.x = X;
    p.move.z = Z;
    p.move.y = groundAt(X, Z);
    if (method === HON) char.meta.paths = ['hon_tu'];
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
  /** Trôi `sec` giây, mỗi giây tick quái `m` một lần (nhịp Hồn ấn) và các việc hẹn giờ của chiêu. */
  const pass = (sec: number, ...ms: Mon[]) => {
    for (let i = 0; i < sec; i++) {
      sim.now += 1000;
      priv.tickMethods();
      for (const m of ms) priv.tickMonster(m, 1);
    }
  };
  const names = (m: { s: { mk: number } }) => unpackMarks(m.s.mk).map((x) => `${x.id}:${x.n}`);
  const res = (p: Ent) => priv.combat.liveRes(p);
  return { sim, priv, join, mon, fresh, use, pass, names, res };
}

const nearNpc = (p: Ent) => {
  const npc = NPC.get('npc_chuong_mon')!;
  p.move.x = npc.x;
  p.move.z = npc.z;
};
const unlockRows = (charId: number) =>
  sqlite.prepare("SELECT kind, delta FROM ledger WHERE char_id = ? AND reason = 'path:unlock:hon_tu'").all(charId) as {
    kind: string;
    delta: number;
  }[];

describe('lĩnh ngộ Hồn tu', () => {
  it('chưa lĩnh ngộ: thiếu cảnh giới, đứng xa, thiếu linh thạch đều không chọn được Dẫn Hồn Kinh', () => {
    const { sim, join } = setup();
    const u = PATH.get('hon_tu')!.unlock!;
    const low = join('', u.level - 1);
    nearNpc(low);
    low.char.gold = 9999;
    sim.onMethod(low, { method: HON, r: 'ht-000001' });
    expect(low.char.meta.method).toBeUndefined();
    const p = join('', u.level);
    p.char.gold = 9999;
    p.move.x = 100;
    sim.onMethod(p, { method: HON, r: 'ht-000002' });
    expect(p.char.meta.method).toBeUndefined();
    nearNpc(p);
    p.char.gold = u.gold - 1;
    sim.onMethod(p, { method: HON, r: 'ht-000003' });
    expect(p.char.meta.method).toBeUndefined();
    expect(p.char.meta.paths).toBeUndefined();
    expect(p.char.gold).toBe(u.gold - 1);
    expect(unlockRows(p.char.id)).toEqual([]);
  });
  it('lĩnh ngộ: trừ đúng linh thạch một lần, ghi ledger, chuyển sang Dẫn Hồn Kinh; gửi lại cùng khóa không trừ nữa', () => {
    const { sim, join } = setup();
    const u = PATH.get('hon_tu')!.unlock!;
    const p = join('', u.level);
    nearNpc(p);
    p.char.gold = 1000;
    sim.onMethod(p, { method: HON, r: 'ht-000010' });
    expect(p.char.meta.method).toBe(HON);
    expect(p.char.meta.paths).toEqual(['hon_tu']);
    expect(p.char.gold).toBe(1000 - u.gold);
    // Một giao dịch: trừ linh thạch và phát hồn phiên, cùng ghi sổ cái.
    const rows = unlockRows(p.char.id);
    expect(rows).toHaveLength(2);
    expect(rows).toContainEqual({ kind: 'gold', delta: -u.gold });
    expect(rows.find((r) => r.kind !== 'gold')?.delta).toBe(1);
    expect(p.char.inv.filter((x) => x?.id === u.grant)).toHaveLength(1);
    sim.onMethod(p, { method: HON, r: 'ht-000010' });
    expect(p.char.gold).toBe(1000 - u.gold);
    expect(unlockRows(p.char.id)).toHaveLength(2);
    expect(p.char.inv.filter((x) => x?.id === u.grant)).toHaveLength(1);
  });
  it('đã lĩnh ngộ: đổi đi rồi đổi về chỉ tốn phí đổi công pháp, không trả phí lĩnh ngộ lần hai', () => {
    const { sim, join } = setup();
    const p = join(HON, 12);
    nearNpc(p);
    p.char.gold = 5000;
    p.lastCombatAt = 0;
    sim.onMethod(p, { method: 'lac_kiem_quyet', r: 'ht-000020' });
    expect(p.char.meta.method).toBe('lac_kiem_quyet');
    p.char.meta.methodAt = 0;
    sim.onMethod(p, { method: HON, r: 'ht-000021' });
    expect(p.char.meta.method).toBe(HON);
    expect(unlockRows(p.char.id)).toEqual([]);
    expect(p.char.meta.paths).toEqual(['hon_tu']);
  });
  it('ba hướng đầu không cần lĩnh ngộ; meta hỏng (tu Hồn tu mà chưa lĩnh ngộ, id hướng lạ) được làm sạch', () => {
    const { sim, join } = setup();
    const p = join('', 5);
    sim.onMethod(p, { method: 'lac_kiem_quyet' });
    expect(p.char.meta.method).toBe('lac_kiem_quyet');
    const bad = { method: HON, paths: ['kiem_tu', 'khong_co', 7] as unknown as string[] };
    sanitizeMethodMeta(bad);
    expect(bad.method).toBeUndefined();
    expect(bad.paths).toBeUndefined();
    const ok = { method: HON, paths: ['hon_tu', 'hon_tu'] };
    sanitizeMethodMeta(ok);
    expect(ok).toMatchObject({ method: HON, paths: ['hon_tu'] });
  });
  it('người chưa tu Dẫn Hồn Kinh không dùng được chiêu Hồn tu và không đặt được Hồn ấn', () => {
    const { sim, join, mon, fresh } = setup();
    const p = join('lac_kiem_quyet');
    const m = mon();
    fresh(p);
    const hp = m.s.hp;
    sim.onSkill(p, { id: 'skl_phe_hon', t: m.id });
    expect(m.s.hp).toBe(hp);
    expect(m.s.mk).toBe(0);
  });
});

describe('Hồn ấn', () => {
  it('Phệ Hồn đặt Hồn ấn (tối đa 3 tầng) và tích Hồn lực; gói bit đồng bộ', () => {
    const { join, mon, fresh, use, names, res } = setup();
    const p = join();
    const m = mon();
    for (let i = 1; i <= 4; i++) {
      fresh(p);
      use(p, 'skl_phe_hon', m.id);
      expect(names(m)).toEqual([`hon_an:${Math.min(3, i)}`]);
    }
    expect(res(p)).toBe(24);
  });
  it('mỗi giây ấn bào mòn theo số tầng, người đặt rút máu và tích Hồn lực; hết hạn thì thôi', () => {
    const { join, mon, fresh, use, pass, res } = setup();
    const p = join();
    const m = mon();
    fresh(p);
    use(p, 'skl_phe_hon', m.id);
    const per = m.marks[0]!.per!;
    const dot = MARK.get('hon_an')!.dot!;
    expect(per).toBe(Math.max(1, Math.round(p.char.atk * dot.per)));
    p.char.hp = Math.floor(p.char.mhp / 2);
    const hp0 = m.s.hp;
    const php = p.char.hp;
    const r0 = res(p);
    pass(1, m);
    const d1 = hp0 - m.s.hp;
    expect(d1).toBeGreaterThan(0);
    expect(p.char.hp).toBe(php + Math.max(1, Math.round(d1 * dot.leech!)));
    expect(res(p)).toBe(r0 + 2);
    // Ba tầng: mỗi nhịp gấp ba một tầng (cùng công thức sát thương, không bạo kích).
    fresh(p);
    use(p, 'skl_phe_hon', m.id);
    fresh(p);
    use(p, 'skl_phe_hon', m.id);
    expect(m.marks[0]!.n).toBe(3);
    const hp1 = m.s.hp;
    pass(1, m);
    expect(hp1 - m.s.hp).toBe(d1 * 3);
    // Hết 8 giây không đặt thêm: ấn tan, không còn nhịp.
    pass(9, m);
    expect(m.s.mk).toBe(0);
    const hp2 = m.s.hp;
    pass(3, m);
    expect(m.s.hp).toBe(hp2);
  });
  it('đặt thêm tầng không dồn nhịp: một giây vẫn chỉ nổ một nhịp', () => {
    const { join, mon, fresh, use, sim, priv } = setup();
    const p = join();
    const m = mon();
    fresh(p);
    use(p, 'skl_phe_hon', m.id);
    const next = m.marks[0]!.nextAt!;
    sim.now += 400;
    fresh(p);
    use(p, 'skl_phe_hon', m.id);
    expect(m.marks[0]!.nextAt).toBe(next);
    const hp = m.s.hp;
    priv.tickMonster(m, 0.4);
    expect(m.s.hp).toBe(hp);
  });
  it('người đặt đã ngã hoặc rời room: ấn không gây sát thương, không hồi cho ai', () => {
    const { sim, join, mon, fresh, use, pass } = setup();
    const p = join();
    const m = mon();
    fresh(p);
    use(p, 'skl_phe_hon', m.id);
    sim.removePlayer(p.sid);
    const hp = m.s.hp;
    pass(2, m);
    // Không còn ai đánh nên quái có thể tự hồi; điều cần giữ là ấn mồ côi không trừ thêm máu.
    expect(m.s.hp).toBeGreaterThanOrEqual(hp);
  });
  it('quái chết vì nhịp Hồn ấn: tính công cho người đặt và thu hồn', () => {
    const { join, mon, fresh, use, pass, res } = setup();
    const p = join();
    const m = mon(X + 5, Z, 1_000_000);
    fresh(p);
    use(p, 'skl_phe_hon', m.id);
    // Máu tối đa nhỏ để nhát Phệ Hồn vừa rồi đủ ngưỡng góp sát thương (5% máu tối đa).
    m.s.mhp = 1000;
    m.s.hp = 1;
    const r0 = res(p);
    pass(1, m);
    expect(m.state).toBe(MS_DEAD);
    expect(res(p)).toBeGreaterThanOrEqual(r0 + 12);
  });
});

describe('Hồn lực: thu hồn', () => {
  it('hạ quái trong tầm: +12 Hồn lực và hồi 2% khí huyết; ngoài 24 mét thì không', () => {
    const { join, mon, priv, res } = setup();
    const p = join();
    p.char.hp = Math.floor(p.char.mhp / 2);
    const hp = p.char.hp;
    const m = mon(X + 5, Z, 1000);
    priv.monSys.damageMonster(m, 5000, p);
    expect(m.state).toBe(MS_DEAD);
    expect(res(p)).toBe(12);
    expect(p.char.hp).toBe(hp + Math.round(p.char.mhp * 0.02));
    const far = mon(X + 40, Z, 1000);
    priv.monSys.damageMonster(far, 5000, p);
    expect(far.state).toBe(MS_DEAD);
    expect(res(p)).toBe(12);
  });
  it('phái khác hạ quái không có Hồn lực; Hồn lực không vượt trần và tan dần sau 15 giây', () => {
    const { sim, join, mon, priv, res } = setup();
    const k = join('lac_kiem_quyet');
    const m0 = mon(X + 5, Z, 1000);
    priv.monSys.damageMonster(m0, 5000, k);
    expect(res(k)).toBe(0);
    const p = join();
    for (let i = 0; i < 12; i++) priv.monSys.damageMonster(mon(X + 5, Z, 1000), 5000, p);
    expect(res(p)).toBe(100);
    sim.now += 15_000;
    expect(res(p)).toBe(100);
    sim.now += 5000;
    expect(res(p)).toBe(80);
  });
  it('không góp sát thương thì không thu được hồn của quái người khác hạ', () => {
    const { join, mon, priv, res } = setup();
    const p = join();
    const other = join('lac_kiem_quyet');
    const m = mon(X + 5, Z, 1000);
    priv.monSys.damageMonster(m, 5000, other);
    expect(res(p)).toBe(0);
  });
});

describe('chiêu Hồn tu', () => {
  it('Sưu Hồn Thuật thu Hồn ấn: mỗi tầng một nhát thêm và tích Hồn lực', () => {
    const { priv, join, mon, fresh, use, names, res } = setup();
    const p = join();
    const m = mon();
    for (let i = 0; i < 3; i++) {
      fresh(p);
      use(p, 'skl_phe_hon', m.id);
    }
    fresh(p);
    const r0 = res(p);
    const before = priv.combat.delayed.length;
    use(p, 'skl_suu_hon_thuat', m.id);
    expect(priv.combat.delayed.length - before).toBe(3);
    expect(names(m)).toEqual([]);
    expect(res(p)).toBe(r0 + 8);
  });
  it('Âm Hồn Triều đặt Hồn ấn lên mọi quái trên đường quét', () => {
    const { join, mon, fresh, use, names } = setup();
    const p = join();
    const a = mon(X + 4, Z);
    const b = mon(X + 9, Z);
    const off = mon(X, Z + 20);
    fresh(p);
    use(p, 'skl_am_hon_trieu', a.id);
    expect(names(a)).toEqual(['hon_an:1']);
    expect(names(b)).toEqual(['hon_an:1']);
    expect(names(off)).toEqual([]);
  });
  it('Định Thân Thuật ghìm quái thường; đủ 40 Hồn lực thì xả 40 để mạnh hơn', () => {
    const { sim, join, mon, fresh, use, res } = setup();
    const p = join();
    const m = mon();
    /** Một lượt Định Thân Thuật với `have` Hồn lực có sẵn; trả sát thương gây ra. */
    const cast = (have: number): number => {
      p.mth.res = have;
      p.mth.resAt = sim.now;
      fresh(p);
      const h = m.s.hp;
      use(p, 'skl_dinh_than_thuat', m.id);
      return h - m.s.hp;
    };
    cast(0);
    expect(m.s.mf & MF_STUN).toBeTruthy();
    expect(m.stunUntil).toBeGreaterThan(sim.now);
    cast(50);
    expect(res(p)).toBe(10);
    // Thiếu 40 điểm thì chiêu vẫn ra, không trừ, không thưởng.
    cast(39);
    expect(res(p)).toBe(39);
    // Thưởng ×1,5: cộng dồn nhiều lượt xen kẽ để bạo kích từng đòn không quyết định kết quả.
    let weak = 0;
    let strong = 0;
    for (let i = 0; i < 60; i++) {
      weak += cast(0);
      strong += cast(40);
    }
    expect(strong / weak).toBeGreaterThan(1.25);
    expect(strong / weak).toBeLessThan(1.75);
  });
  it('Hoàng Tuyền Dẫn xả hết Hồn lực và thu Hồn ấn: cùng một con, có 3 ấn thì chịu nhiều hơn không có ấn', () => {
    const { sim, join, mon, fresh, use, names, res } = setup();
    const p = join();
    const a = mon(X + 5, Z);
    const b = mon(X + 5, Z + 3);
    /** Một lượt Hoàng Tuyền Dẫn với Hồn lực đầy; `marks` tầng ấn đặt sẵn lên `a` bằng luật đặt ấn thật. Trả sát thương lên `a`. */
    const cast = (marks: number): number => {
      const priv = sim as unknown as { combat: { markMon(p: Ent, m: Mon, id: string, n?: number): void } };
      if (marks > 0) priv.combat.markMon(p, a, 'hon_an', marks);
      p.mth.res = 100;
      p.mth.resAt = sim.now;
      fresh(p);
      const ha = a.s.hp;
      const hb = b.s.hp;
      use(p, 'skl_hoang_tuyen_dan', a.id);
      expect(res(p)).toBe(0);
      expect(names(a)).toEqual([]);
      expect(hb - b.s.hp).toBeGreaterThan(0);
      return ha - a.s.hp;
    };
    let marked = 0;
    let plain = 0;
    // Xen kẽ và cộng dồn nhiều lượt trên cùng một con: trạng thái của quái và dao động từng đòn không quyết định kết quả.
    for (let round = 0; round < 60; round++) {
      marked += cast(3);
      plain += cast(0);
    }
    // 3 tầng × 12% = +36%; biên rộng vì bạo kích làm từng đòn lệch nhiều (60 lượt mỗi bên để trung bình ổn định).
    expect(marked / plain).toBeGreaterThan(1.15);
    expect(marked / plain).toBeLessThan(1.6);
  });
  it('Tát Đậu Thành Binh: cần vòng sạc đầy, xả Hồn lực làm hồn binh mạnh hơn, ba hồn mỗi nhịp', () => {
    const { sim, priv, join, mon, fresh, use, res } = setup();
    const p = join();
    const m = mon();
    fresh(p);
    use(p, 'skl_tat_dau_thanh_binh', m.id);
    expect(priv.combat.summons).toHaveLength(0);
    p.mth.charge = 100;
    fresh(p);
    use(p, 'skl_tat_dau_thanh_binh', m.id);
    const base = priv.combat.summons.find((s) => s.sid === p.sid)!;
    expect(base.count).toBe(3);
    const weak = base.power;
    p.mth.charge = 100;
    p.mth.res = 100;
    p.mth.resAt = sim.now;
    fresh(p);
    use(p, 'skl_tat_dau_thanh_binh', m.id);
    const strong = priv.combat.summons.filter((s) => s.sid === p.sid);
    expect(strong).toHaveLength(1);
    expect(strong[0]!.power).toBeCloseTo(weak * 1.6, 5);
    expect(res(p)).toBe(0);
    expect(p.mth.charge).toBe(0);
  });
  it('Tế Phiên: vào tư thế thì Hồn lực không tan; Âm Phong (chiêu tư thế) đặt Hồn ấn lên cả vùng', () => {
    const { sim, join, mon, fresh, use, names, res } = setup();
    const p = join();
    const a = mon(X + 5, Z);
    const b = mon(X + 7, Z + 2);
    p.mth.res = 60;
    p.mth.resAt = sim.now;
    fresh(p);
    use(p, 'skl_te_phien');
    expect(p.mth.stance?.id).toBe('skl_te_phien');
    fresh(p);
    use(p, 'skl_am_phong', a.id);
    expect(names(a)).toEqual(['hon_an:1']);
    expect(names(b)).toEqual(['hon_an:1']);
    sim.now += 9000;
    expect(res(p)).toBe(60);
  });
});

describe('hồn phiên', () => {
  it('túi đầy thì không lĩnh ngộ được: không trừ linh thạch, không ghi sổ, không đổi công pháp', () => {
    const { sim, join } = setup();
    const u = PATH.get('hon_tu')!.unlock!;
    const p = join('', u.level);
    nearNpc(p);
    p.char.gold = 1000;
    for (let i = 0; i < p.char.inv.length; i++) p.char.inv[i] = { id: 'itm_bi_tich_tan_quyen', n: 99 };
    sim.onMethod(p, { method: HON, r: 'ht-000030' });
    expect(p.char.meta.method).toBeUndefined();
    expect(p.char.meta.paths).toBeUndefined();
    expect(p.char.gold).toBe(1000);
    expect(unlockRows(p.char.id)).toEqual([]);
  });
  it('đã có hồn phiên từ trước (GM phát) thì lĩnh ngộ không phát thêm cái thứ hai', () => {
    const { sim, join } = setup();
    const u = PATH.get('hon_tu')!.unlock!;
    const p = join('', u.level);
    nearNpc(p);
    p.char.gold = 1000;
    p.char.inv[0] = { id: u.grant!, n: 1 };
    sim.onMethod(p, { method: HON, r: 'ht-000031' });
    expect(p.char.meta.method).toBe(HON);
    expect(p.char.inv.filter((x) => x?.id === u.grant)).toHaveLength(1);
  });
  it('Nhiếp Hồn: tối đa 5 quái đang giao chiến quanh mình nhận Hồn ấn, mỗi con +5 Hồn lực; nội tại làm Hồn lực tích nhanh hơn', () => {
    const { sim, join, mon, names, res } = setup();
    const p = join();
    p.char.equip.artifact = { id: 'itm_hon_phien', n: 1 };
    p.char.recalc();
    const ms = Array.from({ length: 7 }, (_, i) => mon(X + 4, Z + i - 3));
    for (const m of ms) {
      m.state = MS_CHASE;
      m.target = p.sid;
    }
    const idle = mon(X - 5, Z);
    sim.onArtifact(p);
    expect(ms.filter((m) => names(m).includes('hon_an:1'))).toHaveLength(5);
    expect(names(idle)).toEqual([]);
    // Cấp 1: nội tại +4% → 5 con × 5 × 1,04.
    expect(res(p)).toBeCloseTo(26, 5);
    // Đang hồi chiêu: bấm lại không có gì thêm.
    sim.onArtifact(p);
    expect(res(p)).toBeCloseTo(26, 5);
  });
  it('phái khác đeo hồn phiên: Nhiếp Hồn không ra, không tốn linh lực, không vào hồi chiêu', () => {
    const { sim, join, mon, names } = setup();
    const p = join('lac_kiem_quyet');
    p.char.equip.artifact = { id: 'itm_hon_phien', n: 1 };
    const m = mon(X + 4, Z);
    m.state = MS_CHASE;
    m.target = p.sid;
    const mp = p.char.mp;
    sim.onArtifact(p);
    expect(names(m)).toEqual([]);
    expect(p.char.mp).toBe(mp);
    expect(p.cds.get('art_phien')).toBeUndefined();
  });
});

describe('lệnh GM', () => {
  it('/gm method dan_hon_kinh ghi luôn hướng đã lĩnh ngộ: nạp lại không bị gỡ công pháp', () => {
    const { sim, join } = setup();
    const p = join('', 12);
    (sim as unknown as { gmSys: { run(p: Ent, a: string[]): void } }).gmSys.run(p, ['method', HON, '3']);
    expect(p.char.meta.method).toBe(HON);
    expect(p.char.meta.paths).toEqual(['hon_tu']);
    const copy = JSON.parse(JSON.stringify(p.char.meta)) as { method?: string; paths?: string[] };
    sanitizeMethodMeta(copy);
    expect(copy.method).toBe(HON);
  });
});
