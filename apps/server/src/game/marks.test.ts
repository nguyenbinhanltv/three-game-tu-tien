import { beforeAll, describe, expect, it } from 'vitest';
import { allowSkillForTest } from './testkit';
import { groundAt, MF_STUN, MS_DEAD, unpackMarks } from '@dtl/shared';

// VS-2c: ấn trên mục tiêu. Server đặt, tiêu, tính thưởng và đồng bộ gói bit `mk`; client chỉ vẽ.
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
let nextAcc = 9000;

function setup(level = 28) {
  const sim: Sim = new GameSim(new WorldState(), { broadcast: () => undefined } as never, {
    levelId: 'van_lam',
    roomName: 'test',
    spawn: { x: X, z: Z },
    respawn: { x: X, z: Z },
    persistPosition: false,
  });
  const raw0 = sim.onSkill.bind(sim);
  // VS-2d: test cơ chế chiêu, không đi qua bước chọn nhánh công pháp.
  const raw = (pl: Ent, msg: { id: string; t?: string }) => {
    allowSkillForTest(pl.char, msg.id);
    raw0(pl, msg);
  };
  const priv = sim as unknown as {
    resolvePending(p: Ent): void;
    tickMethods(): void;
    combat: { delayed: { at: number; fn: () => void }[]; liveRes(p: Ent): number };
    monSys: { killMonster(m: Mon): void };
  };
  /** Bấm rồi "xả" đòn chờ ngay (hiệu quả áp liền). */
  const use = (pl: Ent, id: string, t?: string) => {
    raw(pl, { id, t });
    const st = pl.flow.pending;
    if (st) {
      st.at = sim.now;
      priv.resolvePending(pl);
    }
  };
  const join = (method: string, x = X, z = Z): Ent => {
    const char = Character.create(nextAcc++, 'mk' + nextAcc);
    char.level = level;
    char.recalc();
    char.hp = char.mhp;
    char.mp = char.mmp;
    const p = sim.addPlayer({ sessionId: 'c' + nextAcc, send: () => undefined } as never, char, true, 's' + nextAcc);
    p.move.x = x;
    p.move.z = z;
    p.move.y = groundAt(x, z);
    sim.onMethod(p, { method });
    return p;
  };
  const mon = (x = X + 5, z = Z, id = 'mon_soi_xam') => {
    const m = sim.spawnMonster(MONSTER.get(id)!, 10, x, z, null);
    m.s.hp = m.s.mhp = 50_000_000;
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
  /** Chạy mọi việc hẹn giờ của chiêu (nhát bắn thêm...) như thể đã tới giờ. */
  const flush = (sec = 2) => {
    sim.now += sec * 1000;
    priv.tickMethods();
  };
  const names = (m: { s: { mk: number } }) => unpackMarks(m.s.mk).map((x) => `${x.id}:${x.n}`);
  return { sim, priv, join, mon, fresh, use, flush, names };
}

describe('Kiếm ấn và Truy hồn (Kiếm tu)', () => {
  it('Kiếm Khí Trảm khắc Kiếm ấn tới 3 tầng; gói bit đồng bộ theo', () => {
    const { join, mon, fresh, use, names } = setup();
    const p = join('lac_kiem_quyet');
    const m = mon();
    for (let i = 1; i <= 4; i++) {
      fresh(p);
      use(p, 'skl_kiem_khi_tram', m.id);
      expect(names(m)).toEqual([`kiem_an:${Math.min(3, i)}`]);
    }
  });
  it('phái khác dùng Kiếm Khí Trảm (chiêu chung) không khắc được Kiếm ấn', () => {
    const { join, mon, fresh, use } = setup();
    const p = join('bat_dong_kim_than');
    const m = mon();
    fresh(p);
    use(p, 'skl_kiem_khi_tram', m.id);
    expect(m.marks).toHaveLength(0);
    expect(m.s.mk).toBe(0);
  });
  it('Phi Kiếm Truy Hồn tiêu Kiếm ấn: mỗi tầng một nhát bắn thêm; đặt Truy hồn', () => {
    const { priv, join, mon, fresh, use, flush, names } = setup();
    const p = join('lac_kiem_quyet');
    const m = mon();
    for (let i = 0; i < 3; i++) {
      fresh(p);
      use(p, 'skl_kiem_khi_tram', m.id);
    }
    fresh(p);
    const before = priv.combat.delayed.length;
    use(p, 'skl_phi_kiem_truy_hon', m.id);
    expect(priv.combat.delayed.length - before).toBe(3);
    expect(names(m)).toEqual(['truy_hon:1']);
    const hp = m.s.hp;
    flush();
    expect(m.s.hp).toBeLessThan(hp);
    // Không còn ấn để tiêu: lần sau không có nhát thêm.
    fresh(p);
    const b2 = priv.combat.delayed.length;
    use(p, 'skl_phi_kiem_truy_hon', m.id);
    expect(priv.combat.delayed.length).toBe(b2);
  });
  it('Vạn Kiếm Quy Tông: kẻ mang 3 Kiếm ấn chịu nhiều hơn 60%, ấn bị tiêu', () => {
    const { join, mon, fresh, use, names } = setup();
    const p = join('lac_kiem_quyet');
    const a = mon(X + 5, Z);
    const b = mon(X + 5, Z + 3);
    let da = 0;
    let db = 0;
    for (let i = 0; i < 40; i++) {
      a.marks.length = 0;
      a.marks.push({ id: 'kiem_an', sid: p.sid, n: 3, until: p.gcdAt + 1e12 });
      fresh(p);
      p.mth.res = 0;
      p.mth.charge = 100;
      const ha = a.s.hp;
      const hb = b.s.hp;
      use(p, 'skl_van_kiem_quy_tong', a.id);
      da += ha - a.s.hp;
      db += hb - b.s.hp;
    }
    expect(da / db).toBeGreaterThan(1.45);
    expect(da / db).toBeLessThan(1.75);
    expect(names(a)).toEqual([]);
  });
  it('ấn hết hạn: tick quái dọn và gói bit về 0', () => {
    const { sim, join, mon, fresh, use } = setup();
    const p = join('lac_kiem_quyet');
    const m = mon();
    fresh(p);
    use(p, 'skl_kiem_khi_tram', m.id);
    expect(m.s.mk).not.toBe(0);
    // `tick` đặt lại giờ sim theo đồng hồ thật nên cho ấn hết hạn bằng cách lùi hạn của nó.
    m.marks[0]!.until = sim.now - 1;
    sim.tick(50);
    expect(m.s.mk).toBe(0);
    expect(m.marks).toHaveLength(0);
  });
  it('không đặt lên quái đang miễn sát thương hay bóng của người khác; quái chết thì hết ấn', () => {
    const { sim, priv, join, mon, fresh, use } = setup();
    const p = join('lac_kiem_quyet');
    const m = mon();
    m.evadeUntil = sim.now + 60_000;
    fresh(p);
    use(p, 'skl_kiem_khi_tram', m.id);
    expect(m.marks).toHaveLength(0);
    m.evadeUntil = 0;
    m.owner = 'nguoi-khac';
    fresh(p);
    use(p, 'skl_kiem_khi_tram', m.id);
    expect(m.marks).toHaveLength(0);
    m.owner = '';
    fresh(p);
    use(p, 'skl_kiem_khi_tram', m.id);
    expect(m.marks).toHaveLength(1);
    priv.monSys.killMonster(m);
    expect(m.state).toBe(MS_DEAD);
    expect(m.marks).toHaveLength(0);
    expect(m.s.mk).toBe(0);
  });
});

describe('Trấn ấn và Mất thế (Hộ pháp)', () => {
  it('Trấn Sơn Ấn trấn mọi quái bị khiêu khích', () => {
    const { join, mon, fresh, use, names } = setup();
    const p = join('bat_dong_kim_than');
    const a = mon(X + 4, Z);
    const b = mon(X - 4, Z);
    const far = mon(X + 40, Z);
    fresh(p);
    use(p, 'skl_tran_son_an');
    expect(names(a)).toEqual(['tran_an:1']);
    expect(names(b)).toEqual(['tran_an:1']);
    expect(names(far)).toEqual([]);
  });
  it('Thiết Bích Xung tiêu Trấn ấn: tích 10 Huyết khí; thiếu 40 Huyết khí thì quái chưa mất thế', () => {
    const { priv, join, mon, fresh, use, names } = setup();
    const p = join('bat_dong_kim_than');
    const m = mon(X + 3, Z);
    fresh(p);
    use(p, 'skl_tran_son_an');
    // Trấn Sơn Ấn tích 20, húc tích thêm 10: 30 < 40.
    p.gcdAt = 0;
    use(p, 'skl_thiet_bich_xung', m.id);
    expect(names(m)).toEqual([]);
    expect(priv.combat.liveRes(p)).toBeCloseTo(30);
  });
  it('đủ 40 Huyết khí: xả đúng 40, quái mất thế và choáng; người khác đánh nó mạnh hơn 15%', () => {
    const { sim, priv, join, mon, fresh, use, names } = setup();
    const p = join('bat_dong_kim_than');
    const other = join('lac_kiem_quyet');
    const m = mon(X + 3, Z);
    fresh(p);
    use(p, 'skl_tran_son_an');
    p.mth.res = 60;
    p.mth.resAt = sim.now;
    p.gcdAt = 0;
    use(p, 'skl_thiet_bich_xung', m.id);
    expect(names(m)).toEqual(['mat_the:1']);
    expect(priv.combat.liveRes(p)).toBeCloseTo(60 + 10 - 40);
    expect(m.s.mf & MF_STUN).toBe(MF_STUN);
    // So sát thương đòn thường của người khác khi có và không có Mất thế (bỏ choáng để chỉ còn phần ấn).
    const avg = (withMark: boolean) => {
      let sum = 0;
      for (let i = 0; i < 80; i++) {
        m.stunUntil = 0;
        m.marks.length = 0;
        if (withMark) m.marks.push({ id: 'mat_the', sid: p.sid, n: 1, until: sim.now + 1e9 });
        fresh(other);
        other.flow.comboIdx = -1;
        other.mth.res = 0;
        const hp = m.s.hp;
        use(other, 'skl_phi_kiem', m.id);
        sum += hp - m.s.hp;
      }
      return sum / 80;
    };
    const base = avg(false);
    const marked = avg(true);
    expect(marked / base).toBeGreaterThan(1.07);
    expect(marked / base).toBeLessThan(1.24);
  });
  it('thủ lĩnh mất thế không choáng mà bị dồn thanh phá thế', () => {
    const { sim, join, mon, fresh, use, names } = setup();
    const p = join('bat_dong_kim_than');
    const boss = mon(X + 3, Z, 'boss_han_giao');
    boss.state = 2;
    fresh(p);
    use(p, 'skl_tran_son_an');
    p.mth.res = 80;
    p.mth.resAt = sim.now;
    p.gcdAt = 0;
    const stun0 = boss.stunUntil;
    const pz0 = boss.posture;
    use(p, 'skl_thiet_bich_xung', boss.id);
    expect(names(boss)).toEqual(['mat_the:1']);
    expect(boss.stunUntil).toBe(stun0);
    expect(boss.posture).toBeGreaterThan(pz0);
  });
  it('Thiết Quyền Chấn Địa: xả từ 40 Huyết khí thì mọi quái mang Trấn ấn trúng đòn đều mất thế', () => {
    const { sim, join, mon, fresh, use, names } = setup();
    const p = join('bat_dong_kim_than');
    const a = mon(X + 3, Z);
    const b = mon(X - 3, Z);
    fresh(p);
    use(p, 'skl_tran_son_an');
    p.gcdAt = 0;
    p.mth.res = 30;
    p.mth.resAt = sim.now;
    use(p, 'skl_thiet_quyen_chan_dia');
    // Xả 30 < 40: tiêu Trấn ấn nhưng không ai mất thế.
    expect(names(a)).toEqual([]);
    fresh(p);
    use(p, 'skl_tran_son_an');
    p.gcdAt = 0;
    p.cds.clear();
    p.mth.res = 70;
    p.mth.resAt = sim.now;
    use(p, 'skl_thiet_quyen_chan_dia');
    expect(names(a)).toEqual(['mat_the:1']);
    expect(names(b)).toEqual(['mat_the:1']);
  });
});

describe('Mộc ấn (Đan sư)', () => {
  it('Hồi Xuân Quyết gieo Mộc ấn lên mình và đạo hữu trong tầm; phái khác không gieo được', () => {
    const { join, fresh, use, names } = setup();
    const p = join('thanh_moc_dan_kinh');
    const ally = join('lac_kiem_quyet', X + 4, Z);
    const far = join('lac_kiem_quyet', X + 60, Z);
    fresh(p);
    use(p, 'skl_hoi_xuan_quyet');
    expect(names(p)).toEqual(['moc_an:1']);
    expect(names(ally)).toEqual(['moc_an:1']);
    expect(names(far)).toEqual([]);
  });
  it('Hồi Nguyên Thuật tiêu Mộc ấn: đạo hữu mang ấn được hồi 60% lượng hồi; ấn mất', () => {
    const { priv, join, fresh, use, names } = setup();
    const p = join('thanh_moc_dan_kinh');
    const ally = join('lac_kiem_quyet', X + 4, Z);
    const noMark = join('lac_kiem_quyet', X - 4, Z);
    fresh(p);
    use(p, 'skl_hoi_xuan_quyet');
    noMark.marks.length = 0;
    (priv.combat as unknown as { hots: unknown[] }).hots.length = 0;
    p.char.hp = 1;
    ally.char.hp = 1;
    noMark.char.hp = 1;
    fresh(p);
    p.mth.res = 0;
    use(p, 'skl_hoi_nguyen_thuat');
    const self = p.char.hp - 1;
    const got = ally.char.hp - 1;
    expect(self).toBeGreaterThan(0);
    // Tỉ lệ theo khí huyết tối đa của người ra chiêu; hai người cùng cấp, đan sư ít khí huyết hơn 12%.
    expect(got / self).toBeGreaterThan(0.5);
    expect(got / self).toBeLessThan(0.7);
    expect(noMark.char.hp).toBe(1);
    expect(names(p)).toEqual([]);
    expect(names(ally)).toEqual([]);
  });
  it('Đan Hỏa Phong Tràn: Mộc ấn trên đạo hữu nổ, quái quanh họ (ngoài vùng chiêu) cũng trúng', () => {
    const { join, mon, fresh, use, names } = setup();
    const p = join('thanh_moc_dan_kinh');
    const ally = join('lac_kiem_quyet', X - 10, Z);
    const target = mon(X + 12, Z);
    const nearAlly = mon(X - 12, Z);
    fresh(p);
    use(p, 'skl_hoi_xuan_quyet');
    expect(names(ally)).toEqual(['moc_an:1']);
    fresh(p);
    const hp = nearAlly.s.hp;
    use(p, 'skl_dan_hoa_phong_tran', target.id);
    expect(target.s.hp).toBeLessThan(target.s.mhp);
    expect(nearAlly.s.hp).toBeLessThan(hp);
    expect(names(ally)).toEqual([]);
  });
  it('Mộc ấn trên người chơi hết hạn sau 10 giây', () => {
    const { sim, priv, join, fresh, use } = setup();
    const p = join('thanh_moc_dan_kinh');
    fresh(p);
    use(p, 'skl_hoi_xuan_quyet');
    expect(p.s.mk).not.toBe(0);
    sim.now += 10_500;
    priv.tickMethods();
    expect(p.s.mk).toBe(0);
  });
});
