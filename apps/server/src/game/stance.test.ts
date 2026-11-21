import { beforeAll, describe, expect, it } from 'vitest';
import { groundAt, MF_STUN, S, type MethodMsg, type SysMsg } from '@dtl/shared';

// VS-2e: tư thế. Server giữ id + hạn, chỉ cho dùng chiêu tư thế khi đang giữ đúng tư thế; client chỉ đổi ô theo tin `mth`.
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
let nextAcc = 14_000;

function setup(method: string, level = 12) {
  const sent: { type: string; msg: unknown }[] = [];
  const sim: Sim = new GameSim(new WorldState(), { broadcast: () => undefined } as never, {
    levelId: 'van_lam',
    roomName: 'test',
    spawn: { x: X, z: Z },
    respawn: { x: X, z: Z },
    persistPosition: false,
  });
  const priv = sim as unknown as { resolvePending(p: Ent): void; tickMethods(): void; combat: { liveRes(p: Ent): number } };
  const char = Character.create(nextAcc++, 'st' + nextAcc);
  char.level = level;
  char.recalc();
  char.hp = char.mhp;
  char.mp = char.mmp;
  const p = sim.addPlayer(
    { sessionId: 'c' + nextAcc, send: (type: string, msg: unknown) => sent.push({ type, msg }) } as never,
    char,
    true,
    's' + nextAcc,
  );
  p.move.x = X;
  p.move.z = Z;
  p.move.y = groundAt(X, Z);
  if (method) sim.onMethod(p, { method });
  const mon = () => {
    const m = sim.spawnMonster(MONSTER.get('mon_soi_xam')!, 10, X + 4, Z, null);
    m.s.hp = m.s.mhp = 50_000_000;
    return m;
  };
  const use = (id: string, t?: string) => {
    p.gcdAt = 0;
    p.char.mp = p.char.mmp;
    p.skillCount = 0;
    p.warnAt = 0;
    sim.onSkill(p, { id, t });
    const st = p.flow.pending;
    if (st) {
      st.at = sim.now;
      priv.resolvePending(p);
    }
  };
  const warns = () => sent.filter((s) => s.type === S.SYS).map((s) => (s.msg as SysMsg).k);
  return { sim, priv, sent, p, mon, use, warns };
}

describe('vào và hết tư thế', () => {
  it('chưa vào tư thế thì chiêu tư thế không ra; vào rồi thì ra; hết 10 giây lại không ra', () => {
    const { sim, priv, p, mon, use, warns } = setup('lac_kiem_quyet');
    const m = mon();
    use('skl_tran_kiem_tram', m.id);
    expect(m.s.hp).toBe(m.s.mhp);
    expect(warns()).toContain('sys.stance_needed');
    use('skl_ngu_kiem_tran');
    expect(p.mth.stance).toEqual({ id: 'skl_ngu_kiem_tran', until: sim.now + 10_000 });
    expect(p.cds.get('skl_ngu_kiem_tran')).toBe(sim.now + 45_000);
    use('skl_tran_kiem_tram', m.id);
    expect(m.s.hp).toBeLessThan(m.s.mhp);
    sim.now += 10_001;
    priv.tickMethods();
    expect(p.mth.stance).toBeNull();
    const hp = m.s.hp;
    p.cds.delete('skl_tran_kiem_tram');
    use('skl_tran_kiem_tram', m.id);
    expect(m.s.hp).toBe(hp);
  });
  it('tin mth mang tư thế đang giữ; hết hạn thì không còn', () => {
    const { sim, priv, p, use } = setup('bat_dong_kim_than');
    use('skl_kim_than');
    const msg = p.mth.toMsg(p.char.meta, sim.now) satisfies MethodMsg;
    expect(msg.st).toEqual({ id: 'skl_kim_than', until: sim.now + 10_000 });
    sim.now += 11_000;
    p.mth.dirty = false;
    priv.tickMethods();
    expect(p.mth.dirty).toBe(true);
    expect(p.mth.toMsg(p.char.meta, sim.now).st).toBeUndefined();
  });
  it('chưa đủ Ngưng Khí 12, chưa có công pháp, hoặc tư thế của phái khác: không vào được', () => {
    const a = setup('lac_kiem_quyet', 11);
    a.use('skl_ngu_kiem_tran');
    expect(a.p.mth.stance).toBeNull();
    const b = setup('', 20);
    b.use('skl_ngu_kiem_tran');
    expect(b.p.mth.stance).toBeNull();
    const c = setup('lac_kiem_quyet', 20);
    c.use('skl_kim_than');
    expect(c.p.mth.stance).toBeNull();
    // Đang giữ tư thế của mình cũng không dùng được chiêu tư thế của phái khác.
    c.use('skl_ngu_kiem_tran');
    c.use('skl_kim_than_ho_the');
    expect(c.p.shield).toBeNull();
  });
  it('reset trạng thái công pháp (chết, đổi công pháp) thì mất tư thế', () => {
    const { p, use } = setup('lac_kiem_quyet');
    use('skl_ngu_kiem_tran');
    expect(p.mth.stance).not.toBeNull();
    p.mth.reset();
    expect(p.mth.stance).toBeNull();
  });
});

describe('hiệu quả trong tư thế', () => {
  it('Ngự Kiếm Trận: Trận Kiếm tích Kiếm ý, Trận Kiếm Trảm khắc Kiếm ấn, Kiếm ý không rụng trong trận', () => {
    const { sim, priv, p, mon, use } = setup('lac_kiem_quyet');
    const m = mon();
    use('skl_ngu_kiem_tran');
    use('skl_tran_kiem', m.id);
    use('skl_tran_kiem', m.id);
    expect(priv.combat.liveRes(p)).toBe(2);
    use('skl_tran_kiem_tram', m.id);
    expect(m.marks.find((x) => x.id === 'kiem_an')?.n).toBe(1);
    // Trận Kiếm Trảm cũng tích 1 ô (như Kiếm Khí Trảm ngoài trận tích sẵn Kiếm ý).
    expect(priv.combat.liveRes(p)).toBe(3);
    // Quá 10 giây kể từ lần tích cuối nhưng vẫn trong trận (kéo dài hạn tư thế để chỉ thử luật không rụng).
    p.mth.stance!.until = sim.now + 60_000;
    sim.now += 30_000;
    expect(priv.combat.liveRes(p)).toBe(3);
    p.mth.stance = null;
    expect(priv.combat.liveRes(p)).toBe(0);
  });
  it('Kim Thân: giảm 20% sát thương nhận; Kim Thân Quyền tích 8 Huyết khí; Chấn Sơn Quyền làm choáng', () => {
    const { sim, priv, p, mon, use } = setup('bat_dong_kim_than');
    const m = mon();
    use('skl_kim_than');
    p.char.hp = p.char.mhp = 10_000;
    sim.damagePlayer(p, 1000, 'mon_x');
    expect(p.char.hp).toBe(10_000 - 800);
    p.mth.res = 0;
    use('skl_kim_than_quyen', m.id);
    expect(priv.combat.liveRes(p)).toBeCloseTo(8);
    use('skl_chan_son_quyen', m.id);
    expect(m.s.mf & MF_STUN).toBe(MF_STUN);
  });
  it('Đan Lô: hồi tích Đan hỏa nhanh gấp rưỡi; Lô Hỏa Hồi Nguyên hồi theo thời gian', () => {
    // Đo trên CÙNG một nhân vật (linh căn ngẫu nhiên làm chỉ số mỗi nhân vật lệch nhau): một nhịp hồi ngoài và trong tư thế.
    const one = setup('thanh_moc_dan_kinh');
    const hots = () => (one.priv.combat as unknown as { hots: unknown[] }).hots;
    const tickGain = (stance: boolean) => {
      hots().length = 0;
      one.p.mth.stance = stance ? { id: 'skl_dan_lo', until: one.sim.now + 60_000 } : null;
      one.p.mth.res = 0;
      one.p.char.hp = Math.round(one.p.char.mhp * 0.3);
      one.p.cds.clear();
      one.use('skl_hoi_xuan_quyet');
      one.sim.now += 1100;
      one.priv.tickMethods();
      return one.priv.combat.liveRes(one.p);
    };
    const plain = tickGain(false);
    const boosted = tickGain(true);
    expect(plain).toBeGreaterThan(0);
    expect(boosted / plain).toBeCloseTo(1.5, 5);
    const { sim, priv, p, use } = setup('thanh_moc_dan_kinh');
    use('skl_dan_lo');
    p.char.hp = 1;
    use('skl_lo_hoa_hoi_nguyen');
    sim.now += 1100;
    priv.tickMethods();
    expect(p.char.hp).toBeGreaterThan(1);
  });
});
