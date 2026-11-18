import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { groundAt, MS_DEAD, S } from '@dtl/shared';

import { at } from '@dtl/shared';
// E2-G: chiêu bậc 2–3 (Lạc Kiếm Quyết / Bất Động Kim Thân / Thanh Mộc Đan Kinh). Server áp sát thương tại hitAt như K-2.
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
  const sim: Sim = new GameSim(new WorldState(), host as never, {
    levelId: 'van_lam',
    roomName: 'test',
    spawn: { x: X, z: Z },
    respawn: { x: X, z: Z },
    persistPosition: false,
  });
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

describe('E2-G: dữ liệu chiêu', () => {
  it('21 chiêu bậc 2–3, mỗi công pháp 7 chiêu; chiêu từ Nguyên Anh (24+) khóa, Trúc Cơ/Kết Đan chơi được', () => {
    const tier = METHOD_SKILLS.filter((s) => s.unlock >= 16);
    expect(tier.length).toBe(21);
    for (const m of ['lac_kiem_quyet', 'bat_dong_kim_than', 'thanh_moc_dan_kinh']) {
      const mine = tier.filter((s) => s.method === m);
      expect(mine.length, m).toBe(7);
      for (const s of mine) expect(!!s.locked, s.id).toBe(false);
    }
  });
  it('chiêu khóa bị server từ chối', () => {
    const { sim, p, mon, fresh } = setup('lac_kiem_quyet', 28);
    const m = mon();
    fresh(p);
    const sk = METHOD_SKILLS.find((x) => x.id === 'skl_phan_anh_kiem_anh') as { locked?: boolean };
    const was = sk.locked;
    sk.locked = true;
    sim.onSkill(p, { id: 'skl_phan_anh_kiem_anh', t: m.id });
    sk.locked = was;
    expect(lost(m)).toBe(0);
  });
  it('chưa đủ cấp thì không dùng được', () => {
    const { sim, p, mon, fresh } = setup('lac_kiem_quyet', 15);
    const m = mon();
    fresh(p);
    sim.onSkill(p, { id: 'skl_hoanh_kiem_pha_mach', t: m.id });
    expect(lost(m)).toBe(0);
  });
});

describe('E2-G: Lạc Kiếm Quyết', () => {
  it('Hoành Kiếm Phá Mạch trúng mọi quái trong vệt 12×3 m, không trúng quái ngoài vệt', () => {
    const { sim, p, mon, fresh } = setup('lac_kiem_quyet', 16);
    const a = mon(X + 5, Z);
    const b = mon(X + 10, Z + 1);
    const off = mon(X + 6, Z + 6);
    const far = mon(X + 14, Z);
    fresh(p);
    sim.onSkill(p, { id: 'skl_hoanh_kiem_pha_mach', t: a.id });
    expect(lost(a)).toBeGreaterThan(0);
    expect(lost(b)).toBeGreaterThan(0);
    expect(lost(off)).toBe(0);
    expect(lost(far)).toBe(0);
  });
  it('Cuồng Mạch (B) đánh hai đợt', () => {
    const { sim, p, mon, fresh, wait, setVar, countHits } = setup('lac_kiem_quyet', 16);
    setVar('skl_hoanh_kiem_pha_mach', 'b');
    const a = mon(X + 5, Z);
    fresh(p);
    const hits = countHits();
    sim.onSkill(p, { id: 'skl_hoanh_kiem_pha_mach', t: a.id });
    wait(500);
    expect(hits.n).toBe(2);
  });
  it('Kiếm Vũ Tam Điệp đánh ba nhát liền trong một lần bấm; B bốn nhát', () => {
    const { sim, p, mon, fresh, wait, setVar, countHits } = setup('lac_kiem_quyet', 18);
    const a = mon(X + 4, Z);
    fresh(p);
    const hits = countHits();
    sim.onSkill(p, { id: 'skl_kiem_vu_tam_diep', t: a.id });
    wait(700);
    expect(hits.n).toBe(3);
    setVar('skl_kiem_vu_tam_diep', 'b');
    fresh(p);
    hits.n = 0;
    sim.onSkill(p, { id: 'skl_kiem_vu_tam_diep', t: a.id });
    wait(700);
    expect(hits.n).toBe(4);
  });
  it('Kiếm Đan Bản Mệnh đâm quái gần nhất mỗi giây trong 10 giây, rồi tan', () => {
    const { sim, sent, p, mon, fresh, wait } = setup('lac_kiem_quyet', 20);
    const a = mon(X + 5, Z);
    fresh(p);
    sim.onSkill(p, { id: 'skl_kiem_dan_ban_menh' });
    wait(3100);
    const l3 = lost(a);
    expect(l3).toBeGreaterThan(0);
    wait(8000);
    const l11 = lost(a);
    wait(3000);
    expect(lost(a)).toBe(l11);
    expect(l11).toBeGreaterThan(l3);
    expect(sent.some((x) => x.type === S.FX && x.msg.t === 'kiemdan')).toBe(true);
  });
  it('Kiếm Đan B ưu tiên quái đã mang dấu ấn', () => {
    const { sim, p, mon, fresh, wait, setVar } = setup('lac_kiem_quyet', 20);
    setVar('skl_kiem_dan_ban_menh', 'b');
    const near = mon(X + 3, Z);
    const marked = mon(X + 9, Z);
    marked.mark = { sid: p.sid, until: Date.now() + 60000, mul: 0.2 };
    fresh(p);
    sim.onSkill(p, { id: 'skl_kiem_dan_ban_menh' });
    wait(1100);
    expect(lost(marked)).toBeGreaterThan(0);
    expect(lost(near)).toBe(0);
  });
  it('Nghịch Kiếm Chuyển Phong lao xuyên 10 m, chém mọi quái sát đường; biến thức A về chỗ cũ', () => {
    const { sim, p, mon, fresh, setVar, wait } = setup('lac_kiem_quyet', 22);
    p.s.yaw = Math.PI / 2; // hướng +x
    const a = mon(X + 3, Z + 1);
    const b = mon(X + 8, Z - 1);
    const off = mon(X + 5, Z + 8);
    fresh(p);
    const x0 = p.move.x;
    sim.onSkill(p, { id: 'skl_nghich_kiem_chuyen_phong' });
    expect(p.move.x).toBeGreaterThan(x0 + 6);
    expect(lost(a)).toBeGreaterThan(0);
    expect(lost(b)).toBeGreaterThan(0);
    expect(lost(off)).toBe(0);
    setVar('skl_nghich_kiem_chuyen_phong', 'a');
    p.move.x = x0;
    p.move.z = Z;
    wait(2000);
    fresh(p);
    sim.onSkill(p, { id: 'skl_nghich_kiem_chuyen_phong' });
    expect(Math.abs(p.move.x - x0)).toBeLessThan(0.01);
  });
});

describe('E2-G: Bất Động Kim Thân', () => {
  it('Thiết Quyền Chấn Địa đánh quanh mình không cần mục tiêu, choáng quái thường', () => {
    const { sim, p, mon, fresh } = setup('bat_dong_kim_than', 16);
    const a = mon(X + 3, Z);
    const out = mon(X + 9, Z);
    fresh(p);
    sim.onSkill(p, { id: 'skl_thiet_quyen_chan_dia' });
    expect(lost(a)).toBeGreaterThan(0);
    expect(a.stunUntil).toBeGreaterThan(sim.now);
    expect(lost(out)).toBe(0);
  });
  it('Thiết Quyền B làm chậm; A bán kính 8 không choáng', () => {
    const { sim, p, mon, fresh, setVar } = setup('bat_dong_kim_than', 16);
    setVar('skl_thiet_quyen_chan_dia', 'b');
    const a = mon(X + 3, Z);
    fresh(p);
    sim.onSkill(p, { id: 'skl_thiet_quyen_chan_dia' });
    expect(!!a.slow && a.slow.until > sim.now).toBe(true);
    const s2 = setup('bat_dong_kim_than', 16);
    s2.setVar('skl_thiet_quyen_chan_dia', 'a');
    const c = s2.mon(X + 7.5, Z);
    s2.fresh(s2.p);
    s2.sim.onSkill(s2.p, { id: 'skl_thiet_quyen_chan_dia' });
    expect(lost(c)).toBeGreaterThan(0);
    expect(c.stunUntil).toBeLessThanOrEqual(s2.sim.now);
  });
  it('Kim Chung Trấn giảm sát thương và phản 20% về quái đánh mình', () => {
    const { sim, p, mon, fresh } = setup('bat_dong_kim_than', 18);
    const m = mon(X + 2, Z);
    fresh(p);
    sim.onSkill(p, { id: 'skl_kim_chung_tran' });
    const before = m.s.hp;
    sim.damagePlayer(p, 100, m.id);
    // Sau giảm 30%: 70 sát thương; phản 20% = 14.
    expect(before - m.s.hp).toBe(14);
    expect(p.char.mhp - p.char.hp).toBe(70);
  });
  it('Kim Chung B che đồng đội trong 8 m', () => {
    const { sim, p, join, fresh, setVar } = setup('bat_dong_kim_than', 18);
    setVar('skl_kim_chung_tran', 'b');
    const ally = join('b');
    ally.move.x = X + 4;
    fresh(p);
    sim.onSkill(p, { id: 'skl_kim_chung_tran' });
    expect(ally.mth.guardReduce).toBeCloseTo(0.1);
  });
  it('Sơn Nhạc Hóa Thân giảm sát thương; biến thức B giậm gây sát thương quanh mình', () => {
    const { sim, p, mon, fresh, wait, setVar } = setup('bat_dong_kim_than', 20);
    setVar('skl_son_nhac_hoa_than', 'b');
    const m = mon(X + 4, Z);
    fresh(p);
    sim.onSkill(p, { id: 'skl_son_nhac_hoa_than' });
    expect(p.mth.guardReduce).toBeCloseTo(0.2);
    wait(4500);
    expect(lost(m)).toBeGreaterThan(0);
  });
  it('Dịch Sơn Xung đẩy mục tiêu ra xa; B kéo sát lại', () => {
    const { sim, p, mon, fresh } = setup('bat_dong_kim_than', 22);
    p.s.yaw = Math.PI / 2;
    const a = mon(X + 6, Z);
    fresh(p);
    sim.onSkill(p, { id: 'skl_dich_son_xung', t: a.id });
    expect(Math.hypot(a.s.x - p.move.x, a.s.z - p.move.z)).toBeGreaterThan(5);
    expect(lost(a)).toBeGreaterThan(0);
    const s2 = setup('bat_dong_kim_than', 22);
    s2.setVar('skl_dich_son_xung', 'b');
    // B: không lướt; kéo mục tiêu ở xa (và quái cạnh nó) về sát người.
    const c = s2.mon(X + 14, Z);
    const side = s2.mon(X + 14, Z + 2.5);
    const far = s2.mon(X + 14, Z + 12);
    s2.fresh(s2.p);
    const px = s2.p.move.x;
    s2.sim.onSkill(s2.p, { id: 'skl_dich_son_xung', t: c.id });
    expect(s2.p.move.x).toBe(px);
    expect(Math.hypot(c.s.x - px, c.s.z - Z)).toBeLessThan(9);
    expect(side.s.x).toBeLessThan(X + 14);
    expect(far.s.x).toBe(X + 14);
    expect(lost(c)).toBeGreaterThan(0);
  });
});

describe('E2-G: Thanh Mộc Đan Kinh', () => {
  it('Mộc Linh Trận hồi cho người trong 8 m và độc quái trong trận', () => {
    const { sim, p, mon, fresh, wait } = setup('thanh_moc_dan_kinh', 16);
    const m = mon(X + 4, Z);
    p.char.hp = Math.floor(p.char.mhp * 0.3);
    fresh(p);
    const hp0 = p.char.hp;
    sim.onSkill(p, { id: 'skl_moc_linh_tran' });
    wait(3100);
    expect(p.char.hp).toBeGreaterThan(hp0);
    expect(lost(m)).toBeGreaterThan(0);
  });
  it('Dược Vũ hồi theo thời gian; A thêm khiên', () => {
    const { sim, p, fresh, wait, setVar } = setup('thanh_moc_dan_kinh', 18);
    setVar('skl_duoc_vu', 'a');
    p.char.hp = Math.floor(p.char.mhp * 0.3);
    fresh(p);
    const hp0 = p.char.hp;
    sim.onSkill(p, { id: 'skl_duoc_vu' });
    expect(p.shield?.amount ?? 0).toBeGreaterThan(0);
    wait(4200);
    expect(p.char.hp).toBeGreaterThan(hp0);
  });
  it('Ngưng Đan Hộ Thế khiên cả đội trong 12 m, không với người xa', () => {
    const { sim, p, join, fresh } = setup('thanh_moc_dan_kinh', 20);
    const near = join('b');
    near.move.x = X + 5;
    const far = join('c');
    far.move.x = X + 30;
    fresh(p);
    sim.onSkill(p, { id: 'skl_ngung_dan_ho_the' });
    expect(p.shield?.amount ?? 0).toBeGreaterThan(0);
    expect(near.shield?.amount ?? 0).toBeGreaterThan(0);
    expect(far.shield).toBeFalsy();
    expect(near.shield!.amount).toBe(Math.round(near.char.mhp * 0.15));
  });
  it('Đan Hỏa Phong Tràn nổ 6 m quanh mục tiêu và thiêu đốt', () => {
    const { sim, p, mon, fresh, wait } = setup('thanh_moc_dan_kinh', 22);
    const a = mon(X + 10, Z);
    const b = mon(X + 14, Z);
    const out = mon(X + 20, Z);
    fresh(p);
    sim.onSkill(p, { id: 'skl_dan_hoa_phong_tran', t: a.id });
    expect(lost(a)).toBeGreaterThan(0);
    expect(lost(b)).toBeGreaterThan(0);
    expect(lost(out)).toBe(0);
    const l0 = lost(a);
    wait(2100);
    expect(lost(a)).toBeGreaterThan(l0);
  });
  it('quái chết bởi vệt chém thì chuyển sang trạng thái chết', () => {
    const { sim, p, mon, fresh } = setup('lac_kiem_quyet', 16);
    const a = mon(X + 5, Z, 1);
    fresh(p);
    sim.onSkill(p, { id: 'skl_hoanh_kiem_pha_mach', t: a.id });
    expect(a.state).toBe(MS_DEAD);
  });
});

describe('E2-G: Tâm Ma (quái có chủ) — chiêu vùng chỉ chạm bóng của chính mình', () => {
  /** Bóng tâm ma của `owner` đặt tại (x, z). */
  const shadow = (m: { s: { hp: number; mhp: number }; owner: string }, owner: string) => {
    m.owner = owner;
    m.s.hp = m.s.mhp = 1_000_000;
  };
  it('aoe quanh mình (Thiết Quyền) đánh bóng của mình, bỏ qua bóng của người khác', () => {
    const { sim, p, join, mon, fresh } = setup('bat_dong_kim_than', 16);
    const other = join('b');
    const mine = mon(X + 3, Z);
    const theirs = mon(X - 3, Z);
    shadow(mine, p.sid);
    shadow(theirs, other.sid);
    fresh(p);
    sim.onSkill(p, { id: 'skl_thiet_quyen_chan_dia' });
    expect(lost(mine)).toBeGreaterThan(0);
    expect(lost(theirs)).toBe(0);
  });
  it('vệt chém (Hoành Kiếm) trúng bóng của mình khi nhắm vào nó, bỏ qua bóng của người khác trong vệt', () => {
    const { sim, p, join, mon, fresh } = setup('lac_kiem_quyet', 16);
    const other = join('b');
    const mine = mon(X + 5, Z);
    const theirs = mon(X + 9, Z);
    shadow(mine, p.sid);
    shadow(theirs, other.sid);
    fresh(p);
    sim.onSkill(p, { id: 'skl_hoanh_kiem_pha_mach', t: mine.id });
    expect(lost(mine)).toBeGreaterThan(0);
    expect(lost(theirs)).toBe(0);
  });
  it('lướt xuyên (Nghịch Kiếm) chém bóng của mình, bỏ qua bóng của người khác', () => {
    const { sim, p, join, mon, fresh } = setup('lac_kiem_quyet', 22);
    p.s.yaw = Math.PI / 2;
    const other = join('b');
    const mine = mon(X + 3, Z);
    const theirs = mon(X + 6, Z);
    shadow(mine, p.sid);
    shadow(theirs, other.sid);
    fresh(p);
    sim.onSkill(p, { id: 'skl_nghich_kiem_chuyen_phong' });
    expect(lost(mine)).toBeGreaterThan(0);
    expect(lost(theirs)).toBe(0);
  });
});

describe('E2-G: hiệu ứng 4 món của bộ bậc 2 (E2-F) nối vào chiêu', () => {
  it('Hoành Kiếm: tầm và sát thương thêm theo hoanhKiemReach/Power', () => {
    const base = setup('lac_kiem_quyet', 16);
    const b = base.mon(X + 5, Z);
    const b2 = base.mon(X + 14.6, Z);
    base.fresh(base.p);
    base.sim.onSkill(base.p, { id: 'skl_hoanh_kiem_pha_mach', t: b.id });
    expect(lost(b2)).toBe(0);
    const set = setup('lac_kiem_quyet', 16);
    set.p.char.stats.setFx.hoanhKiemReach = 3;
    set.p.char.stats.setFx.hoanhKiemPower = 0.2;
    const a = set.mon(X + 5, Z);
    const a2 = set.mon(X + 14.6, Z);
    set.fresh(set.p);
    set.sim.onSkill(set.p, { id: 'skl_hoanh_kiem_pha_mach', t: a.id });
    expect(lost(a2)).toBeGreaterThan(0);
    expect(lost(a)).toBeGreaterThan(0);
  });
  it('Kim Chung Trấn phản thêm kimChungReflect', () => {
    const { sim, p, mon, fresh } = setup('bat_dong_kim_than', 18);
    p.char.stats.setFx.kimChungReflect = 0.1;
    const m = mon(X + 2, Z);
    fresh(p);
    sim.onSkill(p, { id: 'skl_kim_chung_tran' });
    const before = m.s.hp;
    sim.damagePlayer(p, 100, m.id);
    // 70 sát thương sau giảm; phản (20% + 10%) = 21.
    expect(before - m.s.hp).toBe(21);
  });
  it('bộ 4 món chỉ làm Kim Chung Trấn phản thêm: Kim Cương Bất Hoại không phản', () => {
    const { sim, p, mon, fresh } = setup('bat_dong_kim_than', 20);
    p.char.stats.setFx.kimChungReflect = 0.1;
    const m = mon(X + 2, Z);
    p.mth.charge = 100;
    fresh(p);
    sim.onSkill(p, { id: 'skl_kim_cuong_bat_hoai' });
    expect(p.mth.reflectUntil).toBe(0);
    const before = m.s.hp;
    sim.damagePlayer(p, 100, m.id);
    expect(m.s.hp).toBe(before);
  });
  it('Mộc Linh Trận kéo dài thêm mocLinhDur: còn hồi ở giây 9 (gốc 8 giây)', () => {
    const run = (dur: number) => {
      const { sim, p, fresh, wait } = setup('thanh_moc_dan_kinh', 16);
      p.char.stats.setFx.mocLinhDur = dur;
      p.char.hp = Math.floor(p.char.mhp * 0.2);
      fresh(p);
      sim.onSkill(p, { id: 'skl_moc_linh_tran' });
      wait(8200);
      // Hạ máu lại trước khi đo: lượt nào hồi mạnh thì tới giây 8 đã đầy máu, 2 giây kéo dài không còn chỗ để hồi.
      p.char.hp = Math.floor(p.char.mhp * 0.2);
      const h8 = p.char.hp;
      wait(2000);
      return p.char.hp - h8;
    };
    // Hết 8 giây thì dừng hồi; kéo dài thêm 50% thì còn hồi tiếp (mỗi giây hàng trăm máu).
    expect(run(0.5)).toBeGreaterThan(run(0) + 100);
  });
});

describe('E3-F: hiệu ứng 4 món của bộ bậc 3 nối vào chiêu', () => {
  it('Nghịch Kiếm Chuyển Phong hoàn nghichKiemRefund hồi chiêu khi hạ được mục tiêu, không hạ thì không hoàn', () => {
    const remain = (refund: number, hp: number) => {
      const { sim, p, mon, fresh } = setup('lac_kiem_quyet', 22);
      p.s.yaw = Math.PI / 2;
      p.char.stats.setFx.nghichKiemRefund = refund;
      mon(X + 3, Z, hp);
      fresh(p);
      sim.onSkill(p, { id: 'skl_nghich_kiem_chuyen_phong' });
      return (p.cds.get('skl_nghich_kiem_chuyen_phong') ?? 0) - sim.now;
    };
    const full = remain(0, 1);
    expect(full).toBeGreaterThan(1000);
    expect(remain(0.4, 1)).toBeCloseTo(full * 0.6, -1);
    expect(remain(0.4, 1_000_000)).toBeCloseTo(full, -1);
  });
  it('Dịch Sơn Xung choáng thêm dichSonStun giây (gốc không choáng)', () => {
    const stunned = (extra: number) => {
      const { sim, p, mon, fresh } = setup('bat_dong_kim_than', 22);
      p.s.yaw = Math.PI / 2;
      p.char.stats.setFx.dichSonStun = extra;
      const a = mon(X + 6, Z);
      fresh(p);
      sim.onSkill(p, { id: 'skl_dich_son_xung', t: a.id });
      return a.stunUntil - sim.now;
    };
    expect(stunned(0)).toBeLessThanOrEqual(0);
    expect(stunned(0.5)).toBeGreaterThan(0);
  });
  it('Ngưng Đan Hộ Thế khiên mạnh thêm ngungDanBoost', () => {
    const shield = (boost: number) => {
      const { sim, p, fresh } = setup('thanh_moc_dan_kinh', 20);
      p.char.stats.setFx.ngungDanBoost = boost;
      fresh(p);
      sim.onSkill(p, { id: 'skl_ngung_dan_ho_the' });
      return p.shield?.amount ?? 0;
    };
    const base = shield(0);
    expect(base).toBeGreaterThan(0);
    expect(shield(0.05)).toBe(Math.round(base * 1.05));
  });
});

describe('SETS-4: hiệu ứng 4 món của bộ bậc 4 nối vào chiêu', () => {
  // Hai chiêu Nguyên Anh còn `locked` (chờ E2-G/E3-K bật): mở tạm trong test để kiểm hook, trả lại sau.
  const unlocked: { locked?: boolean }[] = [];
  beforeAll(() => {
    for (const id of ['skl_anh_duoc_hoa_than', 'skl_anh_thiet_than']) {
      const sk = METHOD_SKILLS.find((x) => x.id === id) as { locked?: boolean };
      unlocked.push({ locked: sk.locked });
      sk.locked = false;
    }
  });
  afterAll(() => {
    ['skl_anh_duoc_hoa_than', 'skl_anh_thiet_than'].forEach(
      (id, i) => ((METHOD_SKILLS.find((x) => x.id === id) as { locked?: boolean }).locked = at(unlocked, i).locked),
    );
  });
  it('Anh Dược Hóa Thân hồi thêm anhDuocBoost', () => {
    const healed = (boost: number) => {
      const { sim, p, fresh, wait } = setup('thanh_moc_dan_kinh', 28);
      p.char.stats.setFx.anhDuocBoost = boost;
      p.char.hp = Math.floor(p.char.mhp * 0.1);
      const h0 = p.char.hp;
      fresh(p);
      sim.onSkill(p, { id: 'skl_anh_duoc_hoa_than' });
      // Chỉ đo nửa đầu của hồi dần (4 s): chạy hết thì cả hai bản đều chạm trần đầy máu và không còn so được.
      wait(2100);
      return p.char.hp - h0;
    };
    const base = healed(0);
    expect(base).toBeGreaterThan(0);
    expect(healed(0.15)).toBeGreaterThan(base * 1.1);
  });
  it('Anh Thiết Thân: đồng đội trong 10 m cũng giảm anhThietShare sát thương nhận, ngoài tầm thì không', () => {
    const run = (share: number, far: boolean) => {
      const { sim, p, fresh, join } = setup('bat_dong_kim_than', 28);
      const mate = join('b');
      if (far) mate.move.x = X + 40;
      p.char.stats.setFx.anhThietShare = share;
      fresh(p);
      sim.onSkill(p, { id: 'skl_anh_thiet_than' });
      return mate.mth.guardUntil > sim.now;
    };
    expect(run(0, false)).toBe(false);
    expect(run(0.2, false)).toBe(true);
    expect(run(0.2, true)).toBe(false);
  });
});
