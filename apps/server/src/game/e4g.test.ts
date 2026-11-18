import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { groundAt, MS_DEAD, PF_DEAD, S } from '@dtl/shared';

// E4-G: chiêu Nguyên Anh (24/26) và biến thức cấp 28. Dựng sim như e2g.test.ts.
process.env.DB_FILE = ':memory:';

type Sim = import('./sim').GameSim;
type Ent = import('./sim').PlayerEnt;
let GameSim: typeof import('./sim').GameSim;
let WorldState: typeof import('../state').WorldState;
let Character: typeof import('./character').Character;
let MONSTER: typeof import('@dtl/content').MONSTER;
let METHOD_SKILLS: typeof import('@dtl/content').METHOD_SKILLS;

beforeAll(async () => {
  ({ GameSim } = await import('./sim'));
  ({ WorldState } = await import('../state'));
  ({ Character } = await import('./character'));
  ({ MONSTER, METHOD_SKILLS } = await import('@dtl/content'));
});

const X = 2040;
const Z = 2040;
let nextAcc = 5000;

// Đồng hồ giả: `sim.tick` đọc Date.now(), các chiêu có độ trễ (hitAt nhiều mốc, kiếm đan, hồi dần) chạy theo đó.
afterEach(() => vi.useRealTimers());

function setup(method: string, level = 22) {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(1_800_000_000_000);
  const sent: { type: string; msg: Record<string, unknown> }[] = [];
  const host = { broadcast: (type: string, msg: unknown) => sent.push({ type, msg: msg as Record<string, unknown> }) };
  const sim: Sim = new GameSim(new WorldState(), host as never, { levelId: 'van_lam', roomName: 'test', spawn: { x: X, z: Z }, respawn: { x: X, z: Z }, persistPosition: false });
  sim.now = Date.now();
  const raw = sim.onSkill.bind(sim);
  // Xả đòn chờ `hitAt` ngay lúc bấm (như method.test.ts); các mốc sau của chiêu nhiều nhát chạy qua `sim.tick`.
  sim.onSkill = (pl: Ent, msg: unknown) => {
    raw(pl, msg);
    const st = pl.flow.pending;
    if (st) {
      st.at = sim.now;
      (sim as unknown as { resolvePending(p: Ent): void }).resolvePending(pl);
    }
  };
  const join = (name: string): Ent => {
    // Linh căn cố định: mặc định `Character.create` roll ngẫu nhiên, làm chỉ số lệch giữa hai nhân vật đem so trong cùng một phép thử.
    const char = Character.create(nextAcc++, name + nextAcc, null, 'kim');
    char.level = level;
    char.meta.method = method;
    char.recalc();
    char.hp = char.mhp;
    char.mp = char.mmp;
    const client = { sessionId: name + nextAcc, send: () => {} };
    const p = sim.addPlayer(client as never, char, true, 's' + nextAcc);
    p.move.x = X;
    p.move.z = Z;
    p.move.y = groundAt(X, Z);
    return p;
  };
  const p = join('a');
  const mon = (x = X + 6, z = Z, hp = 1_000_000) => {
    const m = sim.spawnMonster(MONSTER.get('mon_soi_xam')!, 10, x, z, null);
    m.s.hp = m.s.mhp = hp;
    return m;
  };
  const fresh = (e: Ent) => {
    e.gcdAt = 0;
    e.cds.clear();
    e.flow.lastDashAt = -1e9;
    e.char.mp = e.char.mmp;
    e.lastCombatAt = 0;
  };
  /** Đẩy đồng hồ sim qua `ms` rồi chạy các đòn trễ/tick. */
  const wait = (ms: number) => {
    for (let t = 0; t < ms; t += 50) {
      vi.setSystemTime(Date.now() + 50);
      sim.tick(50);
    }
  };
  const setVar = (skill: string, v: 'a' | 'b') => {
    p.char.meta.skillLv = { ...(p.char.meta.skillLv ?? {}), [skill]: 3 };
    p.char.meta.skillVar = { ...(p.char.meta.skillVar ?? {}), [skill]: v };
  };
  /** Đếm số lần `hitMonster` được gọi. */
  const countHits = () => {
    const box = { n: 0 };
    const o = sim as unknown as { hitMonster: (...a: unknown[]) => void };
    const orig = o.hitMonster.bind(sim);
    o.hitMonster = (...args: unknown[]) => {
      box.n++;
      orig(...args);
    };
    return box;
  };
  return { sim, sent, p, join, mon, fresh, wait, setVar, countHits };
}

const lost = (m: { s: { hp: number; mhp: number } }) => m.s.mhp - m.s.hp;
const dist = (a: Ent, b: { move: { x: number; z: number } }) => Math.hypot(a.move.x - b.move.x, a.move.z - b.move.z);

describe('E4-G: chiêu Nguyên Anh', () => {
  it('sáu chiêu cấp 24/26 đã mở khóa', () => {
    for (const id of ['skl_phan_anh_kiem_anh', 'skl_thuan_di_tram', 'skl_anh_thiet_than', 'skl_thuan_di_ho_the', 'skl_anh_duoc_hoa_than', 'skl_thuan_di_cuu_vien']) {
      const sk = METHOD_SKILLS.find((x) => x.id === id)!;
      expect(sk.locked, id).toBeFalsy();
    }
  });

  it('Phân Anh Kiếm Ảnh: kiếm ảnh lặp lại chiêu có hồi chiêu tiếp theo', () => {
    const run = (withEcho: boolean) => {
      const { sim, p, mon, fresh, wait, countHits } = setup('lac_kiem_quyet', 28);
      const m = mon();
      fresh(p);
      if (withEcho) {
        sim.onSkill(p, { id: 'skl_phan_anh_kiem_anh' });
        wait(1100);
        fresh(p);
      }
      const hits = countHits();
      sim.onSkill(p, { id: 'skl_hoanh_kiem_pha_mach', t: m.id });
      wait(1500);
      return { n: hits.n, lost: lost(m) };
    };
    // Cố định ngẫu nhiên (bạo kích, dao động sát thương): không thì đòn của lần có kiếm ảnh có thể yếu hơn lần không có.
    const rnd = vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const a = run(false);
    const b = run(true);
    rnd.mockRestore();
    expect(b.n).toBe(a.n + 1);
    expect(b.lost).toBeGreaterThan(a.lost);
  });

  it('Phân Anh biến thức B: hai kiếm ảnh', () => {
    const { sim, p, mon, fresh, wait, countHits, setVar } = setup('lac_kiem_quyet', 28);
    const m = mon();
    setVar('skl_phan_anh_kiem_anh', 'b');
    fresh(p);
    sim.onSkill(p, { id: 'skl_phan_anh_kiem_anh' });
    wait(1100);
    fresh(p);
    const hits = countHits();
    sim.onSkill(p, { id: 'skl_hoanh_kiem_pha_mach', t: m.id });
    wait(1500);
    expect(hits.n).toBe(3);
  });

  it('Thuấn Di Trảm: thuấn di tới sát mục tiêu rồi chém; A hạ gục thì hoàn nửa hồi chiêu', () => {
    const { sim, p, mon, fresh } = setup('lac_kiem_quyet', 28);
    const m = mon(X + 16, Z);
    fresh(p);
    sim.onSkill(p, { id: 'skl_thuan_di_tram', t: m.id });
    expect(dist(p, { move: { x: m.s.x, z: m.s.z } })).toBeLessThan(3.5);
    expect(lost(m)).toBeGreaterThan(0);
    const full = (p.cds.get('skl_thuan_di_tram') ?? 0) - sim.now;

    const r = setup('lac_kiem_quyet', 28);
    const m2 = r.mon(X + 16, Z, 1);
    r.setVar('skl_thuan_di_tram', 'a');
    r.fresh(r.p);
    r.sim.onSkill(r.p, { id: 'skl_thuan_di_tram', t: m2.id });
    expect(m2.state).toBe(MS_DEAD);
    const left = (r.p.cds.get('skl_thuan_di_tram') ?? 0) - r.sim.now;
    expect(left).toBeLessThan(full * 0.7);
  });

  it('Thuấn Di Hộ Thế: cần đồng đội; thuấn di tới và khiên cả hai', () => {
    const solo = setup('bat_dong_kim_than', 28);
    solo.fresh(solo.p);
    const mp0 = solo.p.char.mp;
    solo.sim.onSkill(solo.p, { id: 'skl_thuan_di_ho_the' });
    expect(solo.p.char.mp).toBe(mp0);

    const { sim, p, join, fresh } = setup('bat_dong_kim_than', 28);
    const mate = join('b');
    mate.move.x = X + 20;
    fresh(p);
    sim.onSkill(p, { id: 'skl_thuan_di_ho_the' });
    expect(dist(p, mate)).toBeLessThan(3);
    expect(p.shield?.amount ?? 0).toBeGreaterThan(0);
    expect(mate.shield?.amount ?? 0).toBeGreaterThan(0);
  });

  it('Thuấn Di Hộ Thế A: quái quanh chỗ tới bị khiêu khích', () => {
    const { sim, p, join, fresh, mon, setVar } = setup('bat_dong_kim_than', 28);
    const mate = join('b');
    mate.move.x = X + 20;
    const m = mon(X + 24, Z);
    setVar('skl_thuan_di_ho_the', 'a');
    fresh(p);
    sim.onSkill(p, { id: 'skl_thuan_di_ho_the' });
    expect(m.taunt?.sid).toBe(p.sid);
  });

  it('Anh Dược Hóa Thân chỉ chữa mình và một đồng đội mất nhiều máu nhất (A: hai)', () => {
    const run = (v?: 'a') => {
      const { sim, p, join, fresh, wait, setVar } = setup('thanh_moc_dan_kinh', 28);
      const mates = [join('b'), join('c'), join('d')];
      mates.forEach((o, i) => (o.char.hp = Math.floor(o.char.mhp * (0.2 + i * 0.1))));
      const before = mates.map((o) => o.char.hp);
      if (v) setVar('skl_anh_duoc_hoa_than', v);
      fresh(p);
      sim.onSkill(p, { id: 'skl_anh_duoc_hoa_than' });
      wait(4200);
      return mates.map((o, i) => o.char.hp - before[i] > o.char.mhp * 0.35);
    };
    expect(run()).toEqual([true, false, false]);
    expect(run('a')).toEqual([true, true, false]);
  });

  it('Thuấn Di Cứu Viện: thuấn di tới người ngã và hồi sinh; B hồi sinh hai người', () => {
    const run = (v?: 'b') => {
      const { sim, p, join, fresh, setVar } = setup('thanh_moc_dan_kinh', 28);
      const a = join('b');
      const b = join('c');
      a.move.x = X + 15;
      b.move.x = X + 14;
      for (const o of [a, b]) {
        o.char.hp = 0;
        o.s.fl |= PF_DEAD;
      }
      if (v) setVar('skl_thuan_di_cuu_vien', v);
      fresh(p);
      sim.onSkill(p, { id: 'skl_thuan_di_cuu_vien' });
      return { near: dist(p, b) < 3.5, alive: [a, b].map((o) => (o.s.fl & PF_DEAD) === 0) };
    };
    const one = run();
    expect(one.near).toBe(true);
    expect(one.alive.filter(Boolean).length).toBe(1);
    expect(run('b').alive).toEqual([true, true]);
  });
});

describe('E4-G: biến thức cấp 28 (chiêu do E4-K đưa vào ô 10)', () => {
  const ids = ['skl_thien_kiem_hoa_hinh', 'skl_thien_dan_phap_gioi', 'skl_thien_kim_phap_tuong'];
  const was: (boolean | undefined)[] = [];
  beforeAll(() => {
    ids.forEach((id, i) => {
      const sk = METHOD_SKILLS.find((x) => x.id === id) as { locked?: boolean };
      was[i] = sk.locked;
      sk.locked = false;
    });
  });
  afterAll(() => ids.forEach((id, i) => ((METHOD_SKILLS.find((x) => x.id === id) as { locked?: boolean }).locked = was[i])));

  it('Thiên Kiếm Hóa Hình B: ba dư chấn đánh thêm; A: một đòn', () => {
    const hitsOf = (v: 'a' | 'b') => {
      const { sim, p, mon, fresh, wait, countHits, setVar } = setup('lac_kiem_quyet', 28);
      const m = mon();
      setVar('skl_thien_kiem_hoa_hinh', v);
      fresh(p);
      const h = countHits();
      sim.onSkill(p, { id: 'skl_thien_kiem_hoa_hinh', t: m.id });
      wait(2000);
      return h.n;
    };
    expect(hitsOf('b')).toBe(4);
    expect(hitsOf('a')).toBe(1);
  });

  it('Thiên Đan Pháp Giới: A tăng công, B tăng phòng cho đạo hữu', () => {
    for (const [v, kind] of [['a', 'atk'], ['b', 'def']] as const) {
      const { sim, p, join, fresh, setVar } = setup('thanh_moc_dan_kinh', 28);
      const mate = join('b');
      setVar('skl_thien_dan_phap_gioi', v);
      fresh(p);
      sim.onSkill(p, { id: 'skl_thien_dan_phap_gioi' });
      expect(mate.char.skillBuff[kind]?.m, v).toBeGreaterThan(0.1);
      expect(mate.char.meta.buffs?.[kind], 'không ghi vào buff đan').toBeUndefined();
    }
  });

  it('Pháp Giới không kéo dài buff đan: đan công thấp 9 phút + Pháp Giới 12 s, hết 12 s về lại mức đan', () => {
    const { sim, p, join, fresh, setVar, wait } = setup('thanh_moc_dan_kinh', 28);
    const mate = join('b');
    const until = Date.now() + 9 * 60_000;
    mate.char.meta.buffs = { atk: { m: 0.08, until } };
    mate.char.recalc();
    const base = mate.char.atk;
    setVar('skl_thien_dan_phap_gioi', 'a');
    fresh(p);
    sim.onSkill(p, { id: 'skl_thien_dan_phap_gioi' });
    expect(mate.char.atk).toBeGreaterThan(base);
    expect(mate.char.meta.buffs?.atk).toEqual({ m: 0.08, until });
    wait(12_500);
    expect(mate.char.skillBuff.atk).toBeUndefined();
    expect(mate.char.atk).toBe(base);
    expect(mate.char.meta.buffs?.atk).toEqual({ m: 0.08, until });
  });
});

describe('E4-F: hiệu ứng 4 món bộ bậc 5 nối vào chiêu 26', () => {
  it('Thuấn Di Trảm gây thêm thuanTramPower', () => {
    const dmg = (boost: number) => {
      const { sim, p, mon, fresh } = setup('lac_kiem_quyet', 28);
      p.char.stats.setFx.thuanTramPower = boost;
      const m = mon(X + 8, Z);
      fresh(p);
      sim.onSkill(p, { id: 'skl_thuan_di_tram', t: m.id });
      return lost(m);
    };
    // Cố định ngẫu nhiên (bạo kích, dao động sát thương) để hai lần đo so được với nhau.
    const rnd = vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const [hi, lo] = [dmg(0.3), dmg(0)];
    rnd.mockRestore();
    expect(hi).toBeGreaterThan(lo * 1.15);
  });

  it('Thuấn Di Hộ Thế: khiên dày thêm thuanHoBoost', () => {
    const shield = (boost: number) => {
      const { sim, p, join, fresh } = setup('bat_dong_kim_than', 28);
      const mate = join('b');
      mate.move.x = X + 10;
      p.char.stats.setFx.thuanHoBoost = boost;
      fresh(p);
      sim.onSkill(p, { id: 'skl_thuan_di_ho_the' });
      return p.shield?.amount ?? 0;
    };
    expect(shield(0.3)).toBe(Math.round(shield(0) * 1.3));
  });

  it('Thuấn Di Cứu Viện: người được cứu sống lại với thêm cuuVienBoost khí huyết', () => {
    const hp = (boost: number) => {
      const { sim, p, join, fresh } = setup('thanh_moc_dan_kinh', 28);
      const a = join('b');
      a.move.x = X + 10;
      a.char.hp = 0;
      a.s.fl |= PF_DEAD;
      p.char.stats.setFx.cuuVienBoost = boost;
      fresh(p);
      sim.onSkill(p, { id: 'skl_thuan_di_cuu_vien' });
      return a.char.hp / a.char.mhp;
    };
    expect(hp(0.15) - hp(0)).toBeCloseTo(0.15, 1);
  });
});

describe('E4-G: soát netcode #211', () => {
  const rec = (sim: Sim) => {
    const calls: { power: number }[] = [];
    const o = sim as unknown as { hitMonster: (...a: unknown[]) => void };
    const orig = o.hitMonster.bind(sim);
    o.hitMonster = (...a: unknown[]) => {
      calls.push({ power: a[2] as number });
      orig(...a);
    };
    return calls;
  };

  it('Thuấn Di Trảm không thuấn di tới bóng của người khác hay quái đang evade', () => {
    for (const mark of ['owner', 'evade'] as const) {
      const { sim, p, mon, fresh } = setup('lac_kiem_quyet', 28);
      const m = mon(X + 20, Z);
      if (mark === 'owner') m.owner = 'someone-else';
      else m.evadeUntil = sim.now + 60_000;
      fresh(p);
      sim.onSkill(p, { id: 'skl_thuan_di_tram', t: m.id });
      expect(p.move.x, mark).toBe(X);
    }
  });

  it('dư chấn và kiếm ảnh không đánh khi người ra chiêu đã bay lên', () => {
    const run = (fly: boolean) => {
      const a = setup('lac_kiem_quyet', 28);
      const m = a.mon();
      a.setVar('skl_thien_kiem_hoa_hinh', 'b');
      a.fresh(a.p);
      const calls = rec(a.sim);
      a.sim.onSkill(a.p, { id: 'skl_thien_kiem_hoa_hinh', t: m.id });
      if (fly) a.p.move.y += 30;
      a.wait(2000);
      return calls.length;
    };
    expect(run(false)).toBe(4);
    expect(run(true)).toBe(1);

    const echo = (fly: boolean) => {
      const a = setup('lac_kiem_quyet', 28);
      const m = a.mon();
      a.fresh(a.p);
      a.sim.onSkill(a.p, { id: 'skl_phan_anh_kiem_anh' });
      a.wait(1100);
      a.fresh(a.p);
      const calls = rec(a.sim);
      a.sim.onSkill(a.p, { id: 'skl_hoanh_kiem_pha_mach', t: m.id });
      if (fly) a.p.move.y += 30;
      a.wait(1500);
      return calls.length;
    };
    expect(echo(false)).toBe(2);
    expect(echo(true)).toBe(1);
  });

  it('kiếm ảnh không đánh khi mục tiêu đã ra ngoài tầm', () => {
    const a = setup('lac_kiem_quyet', 28);
    const m = a.mon();
    a.fresh(a.p);
    a.sim.onSkill(a.p, { id: 'skl_phan_anh_kiem_anh' });
    a.wait(1100);
    a.fresh(a.p);
    const calls = rec(a.sim);
    a.sim.onSkill(a.p, { id: 'skl_hoanh_kiem_pha_mach', t: m.id });
    a.p.move.x = X - 80;
    a.p.move.y = groundAt(X - 80, Z);
    a.wait(1500);
    expect(calls.length).toBe(1);
  });

  it('kiếm ảnh không nhân thêm thưởng riêng của chiêu (Hoành Kiếm 4 món bậc 2)', () => {
    const echoPower = (boost: number) => {
      const a = setup('lac_kiem_quyet', 28);
      const m = a.mon();
      a.p.char.stats.setFx.hoanhKiemPower = boost;
      a.fresh(a.p);
      a.sim.onSkill(a.p, { id: 'skl_phan_anh_kiem_anh' });
      a.wait(1100);
      a.fresh(a.p);
      const calls = rec(a.sim);
      a.sim.onSkill(a.p, { id: 'skl_hoanh_kiem_pha_mach', t: m.id });
      a.wait(1500);
      return calls.map((c) => c.power);
    };
    const [m0, e0] = echoPower(0);
    const [m1, e1] = echoPower(1);
    expect(m1).toBeCloseTo(m0 * 2, 5);
    expect(e1).toBeCloseTo(e0, 5);
  });
});
