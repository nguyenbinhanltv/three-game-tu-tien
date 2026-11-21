import { beforeAll, describe, expect, it } from 'vitest';
import { groundAt, S, type MethodMsg } from '@dtl/shared';

// VS-2a: tài nguyên riêng của công pháp (Kiếm ý / Huyết khí / Đan hỏa). Server tích, xả, rụng; client chỉ nhận số.
process.env.DB_FILE = ':memory:';

type Sim = import('./sim').GameSim;
type Ent = import('./sim').PlayerEnt;
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
let nextAcc = 7000;

function setup(level = 10) {
  const sent: { to: string; type: string; msg: unknown }[] = [];
  const host = { broadcast: () => undefined };
  const sim: Sim = new GameSim(new WorldState(), host as never, {
    levelId: 'van_lam',
    roomName: 'test',
    spawn: { x: X, z: Z },
    respawn: { x: X, z: Z },
    persistPosition: false,
  });
  // Chiêu không niệm áp tại `hitAt`: test "xả" đòn chờ ngay lúc bấm (như method.test.ts).
  const raw = sim.onSkill.bind(sim);
  sim.onSkill = (pl: Ent, msg: unknown) => {
    raw(pl, msg);
    const st = pl.flow.pending;
    if (st) {
      st.at = sim.now;
      (sim as unknown as { resolvePending(p: Ent): void }).resolvePending(pl);
    }
  };
  const join = (name: string, method?: string, lv = level): Ent => {
    const char = Character.create(nextAcc++, name + nextAcc);
    char.level = lv;
    char.recalc();
    char.hp = char.mhp;
    char.mp = char.mmp;
    const client = { sessionId: name + nextAcc, send: (type: string, msg: unknown) => sent.push({ to: name, type, msg }) };
    const p = sim.addPlayer(client as never, char, true, 's' + nextAcc);
    p.move.x = X;
    p.move.z = Z;
    p.move.y = groundAt(X, Z);
    if (method) sim.onMethod(p, { method });
    return p;
  };
  const mon = (x = X + 6, z = Z) => {
    const m = sim.spawnMonster(MONSTER.get('mon_soi_xam')!, 10, x, z, null);
    m.s.hp = m.s.mhp = 1_000_000;
    return m;
  };
  const fresh = (e: Ent) => {
    e.gcdAt = 0;
    e.cds.clear();
    e.char.mp = e.char.mmp;
    e.lastCombatAt = 0;
    e.skillCount = 0;
  };
  const finishCast = (e: Ent) => (sim as unknown as { finishCast(p: Ent): void }).finishCast(e);
  const tickMethods = () => (sim as unknown as { tickMethods(): void }).tickMethods();
  const live = (e: Ent) => (sim as unknown as { combat: { liveRes(p: Ent): number } }).combat.liveRes(e);
  return { sim, sent, join, mon, fresh, finishCast, tickMethods, live };
}

describe('Kiếm ý (Lạc Kiếm Quyết)', () => {
  it('chỉ đòn thường trúng đích mới tích; chiêu khác không tích', () => {
    const { sim, join, mon, fresh } = setup();
    const p = join('a', 'lac_kiem_quyet');
    const m = mon();
    fresh(p);
    sim.onSkill(p, { id: 'skl_kiem_khi_tram', t: m.id });
    expect(p.mth.res).toBe(0);
    for (let i = 0; i < 3; i++) {
      fresh(p);
      sim.onSkill(p, { id: 'skl_phi_kiem', t: m.id });
    }
    expect(p.mth.res).toBe(3);
  });
  it('Lôi Đình xả hết, sát thương tăng theo số ô đã xả', () => {
    const { sim, join, mon, fresh, finishCast } = setup();
    const p = join('a', 'lac_kiem_quyet');
    const cast = (res: number) => {
      const m = mon();
      p.mth.res = res;
      p.mth.resAt = sim.now;
      fresh(p);
      // Bỏ ngẫu nhiên của sát thương: lấy trung bình nhiều lần.
      let sum = 0;
      for (let i = 0; i < 300; i++) {
        p.mth.res = res;
        p.mth.resAt = sim.now;
        fresh(p);
        const hp = m.s.hp;
        sim.onSkill(p, { id: 'skl_loi_dinh_nhat_kiem', t: m.id });
        finishCast(p);
        sum += hp - m.s.hp;
        expect(p.mth.res).toBe(0);
      }
      return sum / 300;
    };
    const base = cast(0);
    const full = cast(5);
    // 5 ô × 15% = +75% (bạo kích lúc đầy ô làm lệch thêm một chút về phía trên).
    expect(full / base).toBeGreaterThan(1.6);
    expect(full / base).toBeLessThan(2.1);
  });
  it('rụng hết sau 10 giây không tích; tick dọn về 0 và báo client', () => {
    const { sim, join, mon, fresh, tickMethods, live } = setup();
    const p = join('a', 'lac_kiem_quyet');
    const m = mon();
    fresh(p);
    sim.onSkill(p, { id: 'skl_phi_kiem', t: m.id });
    expect(live(p)).toBe(1);
    sim.now += 9000;
    expect(live(p)).toBe(1);
    sim.now += 1500;
    expect(live(p)).toBe(0);
    p.mth.dirty = false;
    tickMethods();
    expect(p.mth.res).toBe(0);
    expect(p.mth.dirty).toBe(true);
  });
  it('chưa chọn công pháp thì không có tài nguyên', () => {
    const { sim, join, mon, fresh } = setup();
    const p = join('a');
    const m = mon();
    fresh(p);
    sim.onSkill(p, { id: 'skl_phi_kiem', t: m.id });
    expect(p.mth.res).toBe(0);
  });
});

describe('Huyết khí (Bất Động Kim Thân)', () => {
  it('nhận đòn tích theo phần khí huyết mất; Trấn Sơn Ấn tích thêm mà không xả', () => {
    const { sim, join, fresh } = setup();
    const p = join('a', 'bat_dong_kim_than');
    p.char.hp = p.char.mhp = 10_000;
    sim.damagePlayer(p, 1000, 'mon_x');
    expect(p.mth.res).toBeCloseTo(25);
    fresh(p);
    sim.onSkill(p, { id: 'skl_tran_son_an' });
    expect(p.mth.res).toBeCloseTo(45);
  });
  it('không vượt 100; chiêu gây sát thương có hồi chiêu xả hết, đòn thường thì không', () => {
    const { sim, join, mon, fresh } = setup();
    const p = join('a', 'bat_dong_kim_than');
    const m = mon();
    p.char.hp = p.char.mhp = 10_000;
    p.god = true;
    for (let i = 0; i < 8; i++) sim.damagePlayer(p, 2000, 'mon_x');
    expect(p.mth.res).toBe(100);
    fresh(p);
    sim.onSkill(p, { id: 'skl_phi_kiem', t: m.id });
    expect(p.mth.res).toBe(100);
    fresh(p);
    sim.onSkill(p, { id: 'skl_kiem_khi_tram', t: m.id });
    expect(p.mth.res).toBe(0);
  });
  it('đòn bị khiên đỡ hết không cho Huyết khí', () => {
    const { sim, join } = setup();
    const p = join('a', 'bat_dong_kim_than');
    p.shield = { amount: 1_000_000, until: sim.now + 60_000 };
    sim.damagePlayer(p, 500, 'mon_x');
    expect(p.mth.res).toBe(0);
  });
});

describe('Đan hỏa (Thanh Mộc Đan Kinh)', () => {
  it('chỉ phần hồi thật mới tích: đầy khí huyết thì không được gì', () => {
    const { sim, join, fresh } = setup();
    const p = join('a', 'thanh_moc_dan_kinh');
    fresh(p);
    sim.onSkill(p, { id: 'skl_hoi_nguyen_thuat' });
    expect(p.mth.res).toBe(0);
    p.char.hp = Math.round(p.char.mhp * 0.5);
    fresh(p);
    sim.onSkill(p, { id: 'skl_hoi_nguyen_thuat' });
    // Hồi 35% × 1,2 (nội tại) = 42% khí huyết → +42 Đan hỏa.
    expect(p.mth.res).toBeGreaterThan(38);
    expect(p.mth.res).toBeLessThan(46);
  });
  it('đủ 40 Đan hỏa thì Hồi Nguyên Thuật xả ra và hồi gấp rưỡi; thiếu thì hồi thường, không trừ', () => {
    const { sim, join, fresh } = setup();
    const p = join('a', 'thanh_moc_dan_kinh');
    const heal = (res: number) => {
      p.mth.res = res;
      p.mth.resAt = sim.now;
      p.char.hp = 1;
      fresh(p);
      sim.onSkill(p, { id: 'skl_hoi_nguyen_thuat' });
      return p.char.hp - 1;
    };
    const plain = heal(39);
    // Không trừ 39 điểm; còn được cộng phần tích từ lượng hồi.
    expect(p.mth.res).toBeGreaterThan(39);
    const big = heal(40);
    expect(big / plain).toBeCloseTo(1.5, 1);
  });
  it('xả khi Đan hỏa đang rụng dần: còn lại đúng bằng trước trừ 40, không rụng hai lần', () => {
    const { sim, join, fresh, live } = setup();
    const p = join('a', 'thanh_moc_dan_kinh');
    p.mth.res = 100;
    p.mth.resAt = sim.now;
    // Quá `after` (12 giây) 4 giây, rụng 5 mỗi giây: còn 80.
    sim.now += 16_000;
    expect(live(p)).toBeCloseTo(80);
    // Đầy khí huyết nên lượng hồi không tích thêm Đan hỏa: chỉ còn phần xả.
    fresh(p);
    sim.onSkill(p, { id: 'skl_hoi_nguyen_thuat' });
    expect(live(p)).toBeCloseTo(40);
    // Xả không làm mới thời gian giữ: 2 giây sau rụng tiếp 10.
    sim.now += 2000;
    expect(live(p)).toBeCloseTo(30);
  });
  it('xả hết Huyết khí lúc đang rụng rồi tích lại: không bị trừ phần rụng cũ', () => {
    const { sim, join, mon, fresh, live } = setup();
    const p = join('b', 'bat_dong_kim_than');
    const m = mon();
    p.mth.res = 100;
    p.mth.resAt = sim.now;
    sim.now += 10_000;
    fresh(p);
    sim.onSkill(p, { id: 'skl_kiem_khi_tram', t: m.id });
    expect(live(p)).toBe(0);
    p.char.hp = p.char.mhp = 10_000;
    sim.damagePlayer(p, 1000, 'mon_x');
    expect(live(p)).toBeCloseTo(25);
  });
  it('mộc độc phát tác tích Đan hỏa cho người gieo', () => {
    const { sim, join, mon, fresh } = setup();
    const p = join('a', 'thanh_moc_dan_kinh');
    const m = mon(X + 3, Z);
    fresh(p);
    sim.onSkill(p, { id: 'skl_hoi_xuan_quyet' });
    expect(m.poison?.sid).toBe(p.sid);
    const before = p.mth.res;
    m.poison!.nextAt = sim.now;
    sim.tick(50);
    expect(p.mth.res).toBeGreaterThanOrEqual(before + 2);
  });
  it('hồi cho đạo hữu cũng tích cho người hồi, không tích cho người được hồi', () => {
    const { sim, join, fresh, tickMethods } = setup();
    const p = join('a', 'thanh_moc_dan_kinh');
    const ally = join('b', 'lac_kiem_quyet');
    ally.char.hp = Math.round(ally.char.mhp * 0.3);
    fresh(p);
    sim.onSkill(p, { id: 'skl_hoi_xuan_quyet' });
    sim.now += 1100;
    tickMethods();
    expect(p.mth.res).toBeGreaterThan(0);
    expect(ally.mth.res).toBe(0);
  });
});

describe('đồng bộ', () => {
  it('tin `mth` mang `res` và `resAt`; đổi công pháp thì tài nguyên về 0', () => {
    const { sim, sent, join, mon, fresh } = setup();
    const p = join('a', 'lac_kiem_quyet');
    const m = mon();
    fresh(p);
    sim.onSkill(p, { id: 'skl_phi_kiem', t: m.id });
    const msg = p.mth.toMsg(p.char.meta, sim.now) satisfies MethodMsg;
    expect(msg.res).toBe(1);
    expect(msg.resAt).toBe(sim.now);
    p.mth.sentAt = 0;
    sim.tick(50);
    const last = sent.filter((s) => s.type === S.METHOD).at(-1)?.msg as MethodMsg;
    expect(last.res).toBe(1);
    p.mth.reset();
    expect(p.mth.res).toBe(0);
  });
});
