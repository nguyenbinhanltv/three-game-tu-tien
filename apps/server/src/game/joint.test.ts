import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { allowSkillForTest } from './testkit';
import { groundAt, S, unpackMarks, type SysMsg } from '@dtl/shared';

// VS-2f: hợp kích tổ đội. Server tính qua ấn trên mục tiêu; chỉ giữa hai người khác nhau cùng tổ đội, có hồi nội bộ theo cặp.
process.env.DB_FILE = ':memory:';

type Sim = import('./sim').GameSim;
type Ent = import('./sim').PlayerEnt;
let GameSim: typeof import('./sim').GameSim;
let WorldState: typeof import('../state').WorldState;
let Character: typeof import('./character').Character;
let MONSTER: typeof import('@dtl/content').MONSTER;
let parties: typeof import('./party').parties;

beforeAll(async () => {
  ({ GameSim } = await import('./sim'));
  ({ WorldState } = await import('../state'));
  ({ Character } = await import('./character'));
  ({ MONSTER } = await import('@dtl/content'));
  ({ parties } = await import('./party'));
});
beforeEach(() => parties.reset());

const X = 2040;
const Z = 2040;
let nextAcc = 16_000;

function setup() {
  const sent: { to: number; type: string; msg: unknown }[] = [];
  const host = { broadcast: () => undefined };
  const sim: Sim = new GameSim(new WorldState(), host as never, {
    levelId: 'van_lam',
    roomName: 'test',
    spawn: { x: X, z: Z },
    respawn: { x: X, z: Z },
    persistPosition: false,
  });
  const priv = sim as unknown as {
    resolvePending(p: Ent): void;
    finishCast(p: Ent): void;
    combat: { liveRes(p: Ent): number; jointCd: Map<string, number> };
  };
  const join = (method: string, x = X): Ent => {
    const char = Character.create(nextAcc++, 'jt' + nextAcc);
    char.level = 28;
    char.recalc();
    char.hp = char.mhp;
    char.mp = char.mmp;
    const id = char.id;
    const p = sim.addPlayer(
      { sessionId: 'c' + nextAcc, send: (type: string, msg: unknown) => sent.push({ to: id, type, msg }) } as never,
      char,
      true,
      's' + nextAcc,
    );
    p.move.x = x;
    p.move.z = Z;
    p.move.y = groundAt(x, Z);
    sim.onMethod(p, { method });
    parties.attach(p, host);
    return p;
  };
  const team = (a: Ent, ...others: Ent[]) => {
    for (const o of others) {
      parties.command(a, { a: 'inv', n: o.char.name });
      parties.command(o, { a: 'acc', id: a.char.id });
    }
  };
  const mon = (x = X + 3, hp = 50_000_000) => {
    const m = sim.spawnMonster(MONSTER.get('mon_soi_xam')!, 10, x, Z, null);
    m.s.hp = m.s.mhp = hp;
    return m;
  };
  const use = (p: Ent, id: string, t?: string) => {
    allowSkillForTest(p.char, id);
    p.gcdAt = 0;
    p.cds.clear();
    p.flow.opened.clear();
    p.flow.lastDashAt = -1e9;
    p.char.mp = p.char.mmp;
    p.skillCount = 0;
    sim.onSkill(p, { id, t });
    if (p.casting) priv.finishCast(p);
    const st = p.flow.pending;
    if (st) {
      st.at = sim.now;
      priv.resolvePending(p);
    }
  };
  /** Hộ pháp khiến `m` mất thế (Trấn Sơn Ấn rồi húc khi đủ Huyết khí). */
  const breakPosture = (tank: Ent, m: { id: string }) => {
    use(tank, 'skl_tran_son_an');
    tank.mth.res = 80;
    tank.mth.resAt = sim.now;
    use(tank, 'skl_thiet_bich_xung', m.id);
  };
  const joints = (p: Ent) => sent.filter((s) => s.to === p.char.id && s.type === S.SYS && (s.msg as SysMsg).k === 'sys.joint').length;
  const has = (m: { s: { mk: number } }, id: string) => unpackMarks(m.s.mk).some((x) => x.id === id);
  return { sim, priv, join, team, mon, use, breakPosture, joints, has };
}

describe('Phá Thế Trảm', () => {
  it('đồng đội xả Kiếm ý lên quái mất thế: đòn mạnh gấp rưỡi, tiêu ấn, cả hai nhận 20 vòng sạc và được báo', () => {
    const { sim, join, team, mon, use, breakPosture, joints, has } = setup();
    const tank = join('bat_dong_kim_than');
    const sword = join('lac_kiem_quyet');
    team(tank, sword);
    const m = mon();
    // Đo sát thương Lôi Đình (xả 5 Kiếm ý) có và không có hợp kích; ấn Mất thế (+15%) có ở cả hai phép đo.
    const avg = (joint: boolean) => {
      let sum = 0;
      const N = 300;
      for (let i = 0; i < N; i++) {
        m.stunUntil = 0;
        m.marks.length = 0;
        // Ấn của người ngoài tổ đội (sid lạ) không mở hợp kích nhưng vẫn cho +15%.
        m.marks.push({ id: 'mat_the', sid: joint ? tank.sid : 'nguoi-la', n: 1, until: sim.now + 1e9 });
        (sim as unknown as { combat: { jointCd: Map<string, number> } }).combat.jointCd.clear();
        sword.mth.res = 5;
        sword.mth.resAt = sim.now;
        sword.mth.charge = 0;
        const hp = m.s.hp;
        use(sword, 'skl_loi_dinh_nhat_kiem', m.id);
        sum += hp - m.s.hp;
      }
      return sum / N;
    };
    const plain = avg(false);
    const joined = avg(true);
    expect(joined / plain).toBeGreaterThan(1.3);
    expect(joined / plain).toBeLessThan(1.7);
    // Một lần thật từ đầu tới cuối.
    const c0 = joints(sword);
    m.marks.length = 0;
    m.stunUntil = 0;
    (sim as unknown as { combat: { jointCd: Map<string, number> } }).combat.jointCd.clear();
    breakPosture(tank, m);
    expect(has(m, 'mat_the')).toBe(true);
    tank.mth.charge = 0;
    sword.mth.charge = 0;
    sword.mth.res = 5;
    sword.mth.resAt = sim.now;
    use(sword, 'skl_loi_dinh_nhat_kiem', m.id);
    expect(has(m, 'mat_the')).toBe(false);
    expect(tank.mth.charge).toBeGreaterThanOrEqual(20);
    expect(sword.mth.charge).toBeGreaterThanOrEqual(20);
    expect(joints(sword)).toBe(c0 + 1);
    expect(joints(tank)).toBeGreaterThan(0);
  });
  it('không nổ: người ngoài tổ đội, chính người mở, chiêu không xả tài nguyên, cặp còn hồi nội bộ', () => {
    const { sim, priv, join, team, mon, use, breakPosture, joints, has } = setup();
    const tank = join('bat_dong_kim_than');
    const sword = join('lac_kiem_quyet');
    const m = mon();
    // Chưa cùng tổ đội.
    breakPosture(tank, m);
    sword.mth.res = 5;
    sword.mth.resAt = sim.now;
    use(sword, 'skl_loi_dinh_nhat_kiem', m.id);
    expect(joints(sword)).toBe(0);
    expect(has(m, 'mat_the')).toBe(true);
    // Chính Hộ pháp xả Huyết khí lên ấn của mình: không tính.
    tank.mth.res = 60;
    tank.mth.resAt = sim.now;
    use(tank, 'skl_kiem_khi_tram', m.id);
    expect(joints(tank)).toBe(0);
    team(tank, sword);
    // Cùng tổ đội nhưng chiêu không xả gì (không có Kiếm ý).
    sword.mth.res = 0;
    use(sword, 'skl_loi_dinh_nhat_kiem', m.id);
    expect(joints(sword)).toBe(0);
    // Nổ một lần, rồi mở lại ngay: cặp còn hồi 6 giây.
    sword.mth.res = 5;
    sword.mth.resAt = sim.now;
    use(sword, 'skl_loi_dinh_nhat_kiem', m.id);
    expect(joints(sword)).toBe(1);
    m.marks.push({ id: 'mat_the', sid: tank.sid, n: 1, until: sim.now + 1e9 });
    sword.mth.res = 5;
    sword.mth.resAt = sim.now;
    use(sword, 'skl_loi_dinh_nhat_kiem', m.id);
    expect(joints(sword)).toBe(1);
    expect(priv.combat.jointCd.size).toBe(1);
    sim.now += 6001;
    sword.mth.res = 5;
    sword.mth.resAt = sim.now;
    use(sword, 'skl_loi_dinh_nhat_kiem', m.id);
    expect(joints(sword)).toBe(2);
  });
  it('chiêu vùng và chiêu vệt cũng kết được (Vạn Kiếm Quy Tông, Hoành Kiếm Phá Mạch)', () => {
    const { sim, priv, join, team, mon, use, joints } = setup();
    const tank = join('bat_dong_kim_than');
    const sword = join('lac_kiem_quyet');
    team(tank, sword);
    const m = mon(X + 5);
    for (const id of ['skl_van_kiem_quy_tong', 'skl_hoanh_kiem_pha_mach']) {
      priv.combat.jointCd.clear();
      m.marks.length = 0;
      m.marks.push({ id: 'mat_the', sid: tank.sid, n: 1, until: sim.now + 1e9 });
      sword.mth.res = 5;
      sword.mth.resAt = sim.now;
      sword.mth.charge = 100;
      const before = joints(sword);
      use(sword, id, m.id);
      expect(joints(sword), id).toBe(before + 1);
    }
  });
});

describe('Mộc Ấn Kết', () => {
  it('đồng đội mang Mộc ấn hạ gục quái: cả tổ đội gần đó hồi 8%, Đan sư +20 Đan hỏa, ấn mất', () => {
    const { priv, join, team, mon, use, joints } = setup();
    const healer = join('thanh_moc_dan_kinh');
    const sword = join('lac_kiem_quyet', X + 2);
    const far = join('lac_kiem_quyet', X + 60);
    team(healer, sword, far);
    use(healer, 'skl_hoi_xuan_quyet');
    expect(sword.marks.some((x) => x.id === 'moc_an' && x.sid === healer.sid)).toBe(true);
    (priv.combat as unknown as { hots: unknown[] }).hots.length = 0;
    healer.mth.res = 0;
    const weak = mon(X + 4, 5);
    healer.char.hp = Math.round(healer.char.mhp * 0.5);
    sword.char.hp = Math.round(sword.char.mhp * 0.5);
    far.char.hp = Math.round(far.char.mhp * 0.5);
    const h0 = healer.char.hp;
    const s0 = sword.char.hp;
    const f0 = far.char.hp;
    use(sword, 'skl_phi_kiem', weak.id);
    expect(joints(sword)).toBe(1);
    expect(joints(healer)).toBe(1);
    expect(sword.char.hp - s0).toBe(Math.round(sword.char.mhp * 0.08));
    expect(healer.char.hp - h0).toBe(Math.round(healer.char.mhp * 0.08));
    expect(far.char.hp).toBe(f0);
    expect(priv.combat.liveRes(healer)).toBeCloseTo(20);
    expect(sword.marks.some((x) => x.id === 'moc_an')).toBe(false);
  });
  it('tung chiêu tối thượng khi mang Mộc ấn cũng kết; Mộc ấn Đan sư tự đặt lên mình thì không', () => {
    const { join, team, mon, use, joints } = setup();
    const healer = join('thanh_moc_dan_kinh');
    const tank = join('bat_dong_kim_than', X + 2);
    team(healer, tank);
    mon();
    use(healer, 'skl_hoi_xuan_quyet');
    tank.mth.charge = 100;
    use(tank, 'skl_kim_cuong_bat_hoai');
    expect(joints(tank)).toBe(1);
    // Đan sư tự hạ quái khi mang ấn của chính mình: không có hợp kích.
    const weak = mon(X + 4, 5);
    use(healer, 'skl_hoi_xuan_quyet');
    use(healer, 'skl_phi_kiem', weak.id);
    expect(joints(healer)).toBe(1);
  });
  it('người ngoài tổ đội mang Mộc ấn hạ quái: không kết', () => {
    const { join, mon, use, joints } = setup();
    const healer = join('thanh_moc_dan_kinh');
    const sword = join('lac_kiem_quyet', X + 2);
    use(healer, 'skl_hoi_xuan_quyet');
    const weak = mon(X + 4, 5);
    use(sword, 'skl_phi_kiem', weak.id);
    expect(joints(sword)).toBe(0);
    expect(sword.marks.some((x) => x.id === 'moc_an')).toBe(true);
  });
});
