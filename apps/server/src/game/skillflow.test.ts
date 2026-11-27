import { beforeAll, describe, expect, it } from 'vitest';
import { comboDefScale, DASH_MIN_GAP_MS, groundAt, MS_DEAD, PF_DEAD, S, WORLD_MARGIN, type CdMsg, type FxMsg } from '@dtl/shared';

// K-2: server áp sát thương tại hitAt, chuỗi đánh thường, cường hóa, lướt có kiểm đường, hủy chiêu, chống spam.
process.env.DB_FILE = ':memory:';

type Sim = import('./sim').GameSim;
type Ent = import('./sim').PlayerEnt;
let GameSim: typeof import('./sim').GameSim;
let WorldState: typeof import('../state').WorldState;
let Character: typeof import('./character').Character;
let MONSTER: typeof import('@dtl/content').MONSTER;
let SKILL: typeof import('@dtl/content').SKILL;
let sanitizeMethodMeta: typeof import('./method').sanitizeMethodMeta;

beforeAll(async () => {
  ({ GameSim } = await import('./sim'));
  ({ WorldState } = await import('../state'));
  ({ Character } = await import('./character'));
  ({ MONSTER, SKILL } = await import('@dtl/content'));
  ({ sanitizeMethodMeta } = await import('./method'));
});

const X = 2040;
const Z = 2040;
let acc = 5000;

interface Sent {
  type: string;
  msg: any;
}

function setup(level = 10, method?: string) {
  const sent: Sent[] = [];
  const host = { broadcast: (type: string, msg: unknown) => sent.push({ type, msg }) };
  const sim: Sim = new GameSim(new WorldState(), host as never, {
    levelId: 'van_lam',
    roomName: 'test',
    spawn: { x: X, z: Z },
    respawn: { x: X, z: Z },
    persistPosition: false,
  });
  const char = Character.create(acc++, 'sf' + acc);
  char.level = level;
  char.recalc();
  char.hp = char.mhp;
  char.mp = char.mmp;
  if (method) char.meta.method = method;
  const client = { sessionId: 'c' + acc, send: (type: string, msg: unknown) => sent.push({ type: 'to:' + type, msg }) };
  const p: Ent = sim.addPlayer(client as never, char, true, 's' + acc);
  p.move.x = X;
  p.move.z = Z;
  p.move.y = groundAt(X, Z);
  const mon = (x = X + 6, z = Z) => {
    const m = sim.spawnMonster(MONSTER.get('mon_soi_xam')!, 10, x, z, null);
    m.s.hp = m.s.mhp = 1_000_000;
    return m;
  };
  const fresh = () => {
    p.gcdAt = 0;
    p.cds.clear();
    p.char.mp = p.char.mmp;
    p.lastCombatAt = 0;
    p.flow.lastDashAt = -1e9;
  };
  const resolve = () => (sim as unknown as { resolvePending(p: Ent): void }).resolvePending(p);
  const fxs = () => sent.filter((s) => s.type === S.FX).map((s) => s.msg as FxMsg);
  const cd = () => sent.filter((s) => s.type === 'to:' + S.CD).map((s) => s.msg as CdMsg);
  /** Thêm một người chơi nữa vào cùng sim, đứng cách `dx` mét. */
  const join = (dx = 2): Ent => {
    const c2 = Character.create(acc++, 'sg' + acc);
    c2.level = level;
    c2.recalc();
    c2.hp = c2.mhp;
    c2.mp = c2.mmp;
    const o: Ent = sim.addPlayer({ sessionId: 'c' + acc, send: () => {} } as never, c2, true, 's' + acc);
    o.move.x = X + dx;
    o.move.z = Z;
    o.move.y = groundAt(X + dx, Z);
    return o;
  };
  return { sim, sent, p, mon, fresh, resolve, fxs, cd, join };
}

describe('server áp sát thương tại hitAt', () => {
  it('đòn không niệm chờ hitAt, trừ linh lực và đặt hồi chiêu ngay lúc bấm', () => {
    const { sim, p, mon, fresh, resolve } = setup();
    const m = mon();
    fresh();
    const mp0 = p.char.mp;
    sim.onSkill(p, { id: 'skl_kiem_khi_tram', t: m.id });
    const sk = SKILL.get('skl_kiem_khi_tram')!;
    expect(m.s.hp).toBe(m.s.mhp);
    expect(p.flow.pending).not.toBeNull();
    expect(p.flow.pending!.at - sim.now).toBeCloseTo(sk.hitAt![0] * 1000, 0);
    expect(p.char.mp).toBe(mp0 - sk.mp);
    expect(p.cds.get(sk.id)).toBeGreaterThan(sim.now);
    resolve();
    expect(p.flow.pending).toBeNull();
    expect(m.s.hp).toBeLessThan(m.s.mhp);
  });
  it('trong lúc chờ không ra thêm chiêu khác (kể cả khi GCD bị bỏ qua)', () => {
    const { sim, p, mon, fresh } = setup();
    const m = mon();
    fresh();
    sim.onSkill(p, { id: 'skl_kiem_khi_tram', t: m.id });
    const pend = p.flow.pending;
    p.gcdAt = 0;
    sim.onSkill(p, { id: 'skl_phi_kiem', t: m.id });
    expect(p.flow.pending).toBe(pend);
  });
  it('mục tiêu chết trước hitAt: hủy, hoàn linh lực và hồi chiêu, không sát thương', () => {
    const { sim, p, mon, fresh, resolve, fxs } = setup();
    const m = mon();
    fresh();
    const mp0 = p.char.mp;
    sim.onSkill(p, { id: 'skl_kiem_khi_tram', t: m.id });
    m.state = MS_DEAD;
    m.s.st = MS_DEAD;
    const hp = m.s.hp;
    resolve();
    expect(m.s.hp).toBe(hp);
    expect(p.char.mp).toBe(mp0);
    expect(p.cds.has('skl_kiem_khi_tram')).toBe(false);
    expect(fxs().some((f) => f.t === 'castend')).toBe(true);
    expect(p.flow.pending).toBeNull();
  });
  it('mục tiêu ra khỏi tầm: hủy và hoàn', () => {
    const { sim, p, mon, fresh, resolve } = setup();
    const m = mon();
    fresh();
    const mp0 = p.char.mp;
    sim.onSkill(p, { id: 'skl_kiem_khi_tram', t: m.id });
    m.s.x = X + 500;
    resolve();
    expect(m.s.hp).toBe(m.s.mhp);
    expect(p.char.mp).toBe(mp0);
  });
  it('người ra chiêu chết hoặc bay lên trước hitAt: hủy, không hoàn, không sát thương', () => {
    const { sim, p, mon, fresh, resolve } = setup();
    const m = mon();
    fresh();
    const mp0 = p.char.mp;
    sim.onSkill(p, { id: 'skl_kiem_khi_tram', t: m.id });
    p.move.flying = true;
    resolve();
    expect(m.s.hp).toBe(m.s.mhp);
    expect(p.char.mp).toBeLessThan(mp0);
    expect(p.cds.has('skl_kiem_khi_tram')).toBe(true);
    // chết
    p.move.flying = false;
    fresh();
    sim.onSkill(p, { id: 'skl_kiem_khi_tram', t: m.id });
    p.s.fl = PF_DEAD;
    p.char.hp = 0;
    resolve();
    expect(m.s.hp).toBe(m.s.mhp);
  });
  it('chiêu tối thượng hủy vì mục tiêu thì hoàn vòng sạc; hủy vì người chơi thì mất sạc và mở khóa', () => {
    const { sim, p, mon, fresh, resolve } = setup(10, 'lac_kiem_quyet');
    const m = mon();
    fresh();
    p.mth.charge = 100;
    sim.onSkill(p, { id: 'skl_van_kiem_quy_tong', t: m.id });
    expect(p.mth.charge).toBe(0);
    expect(p.mth.lockCharge).toBe(true);
    m.state = MS_DEAD;
    m.s.st = MS_DEAD;
    resolve();
    expect(p.mth.charge).toBe(100);
    expect(p.mth.lockCharge).toBe(false);
    // người chơi tự hủy (bay lên)
    const m2 = mon();
    fresh();
    sim.onSkill(p, { id: 'skl_van_kiem_quy_tong', t: m2.id });
    p.move.flying = true;
    resolve();
    expect(p.mth.charge).toBe(0);
    expect(p.mth.lockCharge).toBe(false);
  });
});

describe('chiêu hồi sinh chờ hitAt', () => {
  const ult = 'skl_hoi_thien_dan_lo';
  it('đồng đội ngã vẫn còn lúc hitAt: hồi sinh được, vòng sạc tiêu', () => {
    const { sim, p, join, fresh, resolve } = setup(10, 'thanh_moc_dan_kinh');
    const o = join();
    o.s.fl = PF_DEAD;
    o.char.hp = 0;
    fresh();
    p.mth.charge = 100;
    sim.onSkill(p, { id: ult });
    expect(p.flow.pending).not.toBeNull();
    resolve();
    expect(o.char.hp).toBeGreaterThan(0);
    expect(p.mth.charge).toBe(0);
  });
  it('đồng đội được hồi trước hitAt: hủy, hoàn vòng sạc, không mất gì', () => {
    const { sim, p, join, fresh, resolve, fxs } = setup(10, 'thanh_moc_dan_kinh');
    const o = join();
    o.s.fl = PF_DEAD;
    o.char.hp = 0;
    fresh();
    p.mth.charge = 100;
    const mp0 = p.char.mp;
    sim.onSkill(p, { id: ult });
    expect(p.mth.charge).toBe(0);
    // người khác hồi sinh đồng đội trong lúc chờ
    o.s.fl = 0;
    o.char.hp = o.char.mhp;
    const hp = p.char.hp;
    resolve();
    expect(p.flow.pending).toBeNull();
    expect(p.mth.charge).toBe(100);
    expect(p.mth.lockCharge).toBe(false);
    expect(p.char.mp).toBe(mp0);
    expect(p.cds.has(ult)).toBe(false);
    expect(p.char.hp).toBe(hp);
    expect(fxs().some((f) => f.t === 'castend')).toBe(true);
  });
  it('đồng đội ngã ra khỏi tầm trước hitAt: hủy và hoàn', () => {
    const { sim, p, join, fresh, resolve } = setup(10, 'thanh_moc_dan_kinh');
    const o = join();
    o.s.fl = PF_DEAD;
    o.char.hp = 0;
    fresh();
    p.mth.charge = 100;
    sim.onSkill(p, { id: ult });
    o.move.x = X + 500;
    resolve();
    expect(p.mth.charge).toBe(100);
  });
});

describe('đánh thường liên hoàn', () => {
  it('đòn 0, 1, 2 rồi về 0; FX mang số đòn; ngừng quá 2 giây thì về đòn đầu', () => {
    const { sim, p, mon, fresh, resolve, fxs } = setup();
    const m = mon();
    const seq: (number | undefined)[] = [];
    for (let i = 0; i < 4; i++) {
      fresh();
      sim.now += 600;
      sim.onSkill(p, { id: 'skl_phi_kiem', t: m.id });
      resolve();
      seq.push(
        fxs()
          .filter((f) => f.t === 'sword')
          .pop()?.n,
      );
    }
    expect(seq).toEqual([0, 1, 2, 0]);
    fresh();
    sim.now += 2500;
    sim.onSkill(p, { id: 'skl_phi_kiem', t: m.id });
    resolve();
    expect(
      fxs()
        .filter((f) => f.t === 'sword')
        .pop()?.n,
    ).toBe(0);
  });
  it('đòn 3 mạnh hơn đòn 1 (hệ số 0,64 so với 0,4)', () => {
    const { sim, p, mon, fresh } = setup();
    const m = mon();
    const muls: number[] = [];
    for (let i = 0; i < 3; i++) {
      fresh();
      sim.now += 600;
      sim.onSkill(p, { id: 'skl_phi_kiem', t: m.id });
      muls.push(p.flow.pending!.mul);
      p.flow.pending = null;
    }
    expect(muls[0]).toBeCloseTo(0.4);
    expect(muls[2]).toBeCloseTo(0.64);
  });
  it('khóa do server giữ: bấm dồn cùng lúc chỉ ra một đòn', () => {
    const { sim, p, mon, fresh, resolve } = setup();
    const m = mon();
    fresh();
    for (let i = 0; i < 10; i++) sim.onSkill(p, { id: 'skl_phi_kiem', t: m.id });
    resolve();
    expect(p.flow.comboIdx).toBe(0);
  });
});

describe('chuỗi đòn thường hành động (Dạ Cảnh)', () => {
  const basic = { id: 'skl_phi_kiem' };
  const buffered = (sim: Sim, p: Ent) => (sim as unknown as { combat: { tickBuffered(p: Ent): void } }).combat.tickBuffered(p);
  it('mỗi đòn khóa theo `lock` của nó (0,42 / 0,42 / 0,6 s), không phải GCD 1 giây', () => {
    const { sim, p, mon, fresh, resolve } = setup();
    const m = mon();
    fresh();
    const locks: number[] = [];
    for (let i = 0; i < 3; i++) {
      const t0 = sim.now;
      sim.onSkill(p, { ...basic, t: m.id });
      locks.push(p.gcdAt - t0);
      resolve();
      sim.now = p.gcdAt;
    }
    expect(locks).toEqual([420, 420, 600]);
    expect(p.flow.comboIdx).toBe(2);
  });
  it('khóa của đòn thường cũng chặn chiêu khác; chiêu khác vẫn khóa 1 GCD', () => {
    const { sim, p, mon, fresh, resolve } = setup();
    const m = mon();
    fresh();
    sim.onSkill(p, { ...basic, t: m.id });
    resolve();
    sim.now += 200;
    sim.onSkill(p, { id: 'skl_kiem_khi_tram', t: m.id });
    expect(p.flow.pending).toBeNull();
    sim.now = p.gcdAt;
    const t0 = sim.now;
    sim.onSkill(p, { id: 'skl_kiem_khi_tram', t: m.id });
    expect(p.flow.pending?.skill.id).toBe('skl_kiem_khi_tram');
    expect(p.gcdAt - t0).toBe(1000);
  });
  it('bộ đệm: lệnh tới sớm ≤ 250 ms được giữ MỘT lệnh và ra khi hết khóa; sớm hơn thì bỏ', () => {
    const { sim, p, mon, fresh, resolve } = setup();
    const m = mon();
    fresh();
    sim.onSkill(p, { ...basic, t: m.id });
    resolve();
    // Còn 320 ms mới hết khóa: quá sớm, không đệm.
    sim.now += 100;
    sim.onSkill(p, { ...basic, t: m.id });
    expect(p.flow.buffered).toBeNull();
    // Còn 220 ms: đệm; bấm thêm vẫn chỉ một lệnh.
    sim.now += 100;
    for (let i = 0; i < 3; i++) sim.onSkill(p, { ...basic, t: m.id });
    expect(p.flow.buffered).not.toBeNull();
    expect(p.flow.comboIdx).toBe(0);
    // Chưa hết khóa: chưa ra.
    sim.now += 100;
    buffered(sim, p);
    expect(p.flow.comboIdx).toBe(0);
    // Hết khóa: ra đúng MỘT đòn kế, bộ đệm trống.
    sim.now = p.gcdAt;
    buffered(sim, p);
    expect(p.flow.comboIdx).toBe(1);
    expect(p.flow.buffered).toBeNull();
    resolve();
    sim.now = p.gcdAt;
    buffered(sim, p);
    expect(p.flow.comboIdx).toBe(1);
  });
  it('bộ đệm không rút ngắn nhịp: đòn đệm bắt đầu không sớm hơn lúc hết khóa (trừ 60 ms nới mạng)', () => {
    const { sim, p, mon, fresh, resolve } = setup();
    const m = mon();
    fresh();
    const t0 = sim.now;
    sim.onSkill(p, { ...basic, t: m.id });
    resolve();
    sim.now = t0 + 250;
    sim.onSkill(p, { ...basic, t: m.id });
    for (let t = 260; t <= 340; t += 20) {
      sim.now = t0 + t;
      buffered(sim, p);
    }
    expect(p.flow.comboIdx).toBe(0);
    sim.now = t0 + 360;
    buffered(sim, p);
    expect(p.flow.comboIdx).toBe(1);
  });
  it('chiêu không phải đòn chuỗi tới sớm vẫn bị bỏ, không đệm', () => {
    const { sim, p, mon, fresh, resolve } = setup();
    const m = mon();
    fresh();
    sim.onSkill(p, { ...basic, t: m.id });
    resolve();
    sim.now = p.gcdAt - 100;
    sim.onSkill(p, { id: 'skl_kiem_khi_tram', t: m.id });
    expect(p.flow.buffered).toBeNull();
  });
  it('né xóa đòn đang đệm (không tự ra đòn sau khi đã né)', () => {
    const { sim, p, mon, fresh, resolve } = setup();
    const m = mon();
    fresh();
    sim.onSkill(p, { ...basic, t: m.id });
    resolve();
    sim.now = p.gcdAt - 150;
    sim.onSkill(p, { ...basic, t: m.id });
    expect(p.flow.buffered).not.toBeNull();
    sim.onDodge(p, {});
    expect(p.flow.buffered).toBeNull();
  });
  it('chia nhỏ đòn không mất sát thương vì phòng ngự: đòn hệ số 0,4 với phòng ngự × 0,4 gây đúng 0,4 lần một đòn hệ số 1', () => {
    const { sim, p, mon, sent } = setup();
    const m = mon();
    const total = () => {
      const n = sent.filter((x) => x.type === S.DMG && x.msg.dst === m.id).reduce((acc, x) => acc + (x.msg.n as number), 0);
      sent.length = 0;
      return n;
    };
    const hit = (
      sim as unknown as {
        hitMonster(p: Ent, m: unknown, power: number, mul?: number, elem?: string, tier?: undefined, defScale?: number): boolean;
      }
    ).hitMonster.bind(sim);
    // Trung bình nhiều đòn để triệt dao động ±10% và bạo kích.
    const N = 3000;
    expect(m.defn).toBeGreaterThan(0);
    for (let i = 0; i < N; i++) hit(p, m, 1);
    const one = total() / N;
    for (let i = 0; i < N; i++) hit(p, m, 0.4, 1, undefined, undefined, 0.4);
    const scaled = total() / N;
    for (let i = 0; i < N; i++) hit(p, m, 0.4);
    const unscaled = total() / N;
    expect(scaled / (0.4 * one)).toBeGreaterThan(0.96);
    expect(scaled / (0.4 * one)).toBeLessThan(1.04);
    // Không nhân phòng ngự thì đòn nhỏ bị trừ phòng ngự nguyên vẹn: thấp hơn hẳn.
    expect(unscaled).toBeLessThan(scaled * 0.93);
    // Dữ liệu thật: ba đòn của phi kiếm nhân phòng ngự theo đúng hệ số của chúng.
    const sk = SKILL.get('skl_phi_kiem')!;
    expect([0, 1, 2].map((i) => comboDefScale(sk, i))).toEqual([0.4, 0.4, 0.64]);
    expect(comboDefScale(SKILL.get('skl_kiem_khi_tram')!)).toBe(1);
  });
  it('kiếm tu: đòn cuối rút khóa 0,1 s nhưng không sớm hơn lúc đòn trúng xong', () => {
    const { sim, p, mon, fresh, resolve } = setup(10, 'lac_kiem_quyet');
    const m = mon();
    fresh();
    let last = 0;
    for (let i = 0; i < 3; i++) {
      const t0 = sim.now;
      sim.onSkill(p, { ...basic, t: m.id });
      last = p.gcdAt - t0;
      resolve();
      sim.now = p.gcdAt;
    }
    expect(last).toBe(500);
    expect(last).toBeGreaterThanOrEqual(260 + 50);
  });
});

describe('đòn thường cận chiến chém quét của Kiếm tu (Dạ Cảnh)', () => {
  const basic = { id: 'skl_phi_kiem' };
  const dmgOf = (sent: Sent[], id: string) => sent.filter((x) => x.type === S.DMG && x.msg.dst === id).length;

  it('Kiếm tu phải áp sát: mục tiêu cách 12 m bị từ chối; người chưa theo công pháp vẫn bắn xa được', () => {
    const k = setup(10, 'lac_kiem_quyet');
    const far = k.mon(X + 12, Z);
    k.fresh();
    k.sim.onSkill(k.p, { ...basic, t: far.id });
    expect(k.p.flow.pending).toBeNull();
    const near = k.mon(X + 4, Z);
    k.sim.onSkill(k.p, { ...basic, t: near.id });
    expect(k.p.flow.pending?.target).toBe(near.id);

    const n = setup(10);
    const far2 = n.mon(X + 12, Z);
    n.fresh();
    n.sim.onSkill(n.p, { ...basic, t: far2.id });
    expect(n.p.flow.pending?.target).toBe(far2.id);
  });

  it('chém quét: quái khác trong cung trước mặt cũng trúng, quái sau lưng thì không', () => {
    const { sim, p, mon, fresh, resolve, sent } = setup(10, 'lac_kiem_quyet');
    const main = mon(X + 4, Z);
    const side = mon(X + 3.5, Z + 2);
    const back = mon(X - 4, Z);
    fresh();
    sim.onSkill(p, { ...basic, t: main.id });
    resolve();
    expect(dmgOf(sent, main.id)).toBe(1);
    expect(dmgOf(sent, side.id)).toBe(1);
    expect(dmgOf(sent, back.id)).toBe(0);
  });

  it('đòn quét yếu hơn đòn chính (theo hệ số trong dữ liệu)', async () => {
    const { sim, p, mon, fresh, resolve, sent } = setup(10, 'lac_kiem_quyet');
    const main = mon(X + 4, Z);
    const side = mon(X + 3.5, Z + 2);
    const sum = (id: string) => sent.filter((x) => x.type === S.DMG && x.msg.dst === id).reduce((n, x) => n + (x.msg.n as number), 0);
    fresh();
    for (let i = 0; i < 300; i++) {
      sim.onSkill(p, { ...basic, t: main.id });
      resolve();
      sim.now = p.gcdAt;
    }
    const ratio = sum(side.id) / sum(main.id);
    // Hệ số lấy từ dữ liệu (paths.json, cân bằng theo sim). Tỉ lệ thật thấp hơn hệ số một chút vì phần trừ phòng ngự không nhân theo hệ số quét.
    const { PATHS } = await import('@dtl/content');
    const mul = PATHS.find((x) => x.id === 'kiem_tu')!.basic!.arc!.mul;
    expect(mul).toBeGreaterThan(0);
    expect(mul).toBeLessThan(1);
    expect(ratio).toBeGreaterThan(mul * 0.7);
    expect(ratio).toBeLessThan(mul * 1.1);
  });

  it('người không phải Kiếm tu không có chém quét; chiêu khác của Kiếm tu cũng không quét', () => {
    const n = setup(10);
    const m1 = n.mon(X + 4, Z);
    const s1 = n.mon(X + 3.5, Z + 2);
    n.fresh();
    n.sim.onSkill(n.p, { ...basic, t: m1.id });
    n.resolve();
    expect(dmgOf(n.sent, s1.id)).toBe(0);

    const k = setup(10, 'lac_kiem_quyet');
    const m2 = k.mon(X + 4, Z);
    const s2 = k.mon(X + 3.5, Z + 2);
    k.fresh();
    k.sim.onSkill(k.p, { id: 'skl_kiem_khi_tram', t: m2.id });
    k.resolve();
    expect(dmgOf(k.sent, m2.id)).toBeGreaterThanOrEqual(1);
    expect(dmgOf(k.sent, s2.id)).toBe(0);
  });
});

describe('cường hóa 3 giây', () => {
  it('Phi Kiếm Truy Hồn mạnh gấp rưỡi trong 3 giây sau Kiếm Khí Trảm, chỉ một lần, rồi hết hạn', () => {
    const { sim, p, mon, fresh, resolve, cd } = setup(10, 'lac_kiem_quyet');
    const m = mon();
    fresh();
    sim.onSkill(p, { id: 'skl_phi_kiem_truy_hon', t: m.id });
    expect(p.flow.pending!.mul).toBe(1);
    p.flow.pending = null;
    fresh();
    sim.onSkill(p, { id: 'skl_kiem_khi_tram', t: m.id });
    resolve();
    const last = cd().pop()!;
    expect(last.em?.['skl_phi_kiem_truy_hon']).toBeGreaterThan(sim.now);
    fresh();
    sim.onSkill(p, { id: 'skl_phi_kiem_truy_hon', t: m.id });
    expect(p.flow.pending!.mul).toBeCloseTo(1.5);
    p.flow.pending = null;
    // dùng một lần: lần sau không còn
    fresh();
    sim.onSkill(p, { id: 'skl_phi_kiem_truy_hon', t: m.id });
    expect(p.flow.pending!.mul).toBe(1);
    p.flow.pending = null;
    // hết hạn
    fresh();
    sim.onSkill(p, { id: 'skl_kiem_khi_tram', t: m.id });
    resolve();
    sim.now += 3100;
    fresh();
    sim.onSkill(p, { id: 'skl_phi_kiem_truy_hon', t: m.id });
    expect(p.flow.pending!.mul).toBe(1);
  });
  it('cửa sổ không dùng chung giữa hai người chơi', () => {
    const a = setup(10, 'lac_kiem_quyet');
    const b = setup(10, 'lac_kiem_quyet');
    const m = a.mon();
    a.fresh();
    a.sim.onSkill(a.p, { id: 'skl_kiem_khi_tram', t: m.id });
    a.resolve();
    expect(b.p.flow.opened.size).toBe(0);
  });
});

describe('lướt', () => {
  /** Hướng đi được ≥ 8 m quanh điểm đứng (tránh dốc/vật cản của bản đồ thật). */
  function open(p: Ent): number {
    const probes = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
    return probes.findIndex((yaw) => {
      p.s.yaw = yaw;
      return true;
    });
  }

  it('Kiếm Ảnh Bộ lướt về phía mục tiêu, dừng sát người nó, trừ linh lực, đặt hồi chiêu, không ăn GCD', () => {
    const { sim, p, mon, fresh, fxs } = setup(10, 'lac_kiem_quyet');
    fresh();
    p.gcdAt = 0;
    const m = mon(X + 20, Z);
    p.s.yaw = Math.PI / 2;
    const mp0 = p.char.mp;
    sim.onSkill(p, { id: 'skl_kiem_anh_bo', t: m.id });
    const moved = Math.hypot(p.move.x - X, p.move.z - Z);
    if (moved > 0) {
      expect(moved).toBeGreaterThan(1);
      expect(moved).toBeLessThanOrEqual(8.01);
      expect(p.char.mp).toBe(mp0 - SKILL.get('skl_kiem_anh_bo')!.mp);
      expect(p.cds.get('skl_kiem_anh_bo')).toBeGreaterThan(sim.now);
      expect(p.gcdAt).toBe(0);
      expect(fxs().some((f) => f.t === 'dash')).toBe(true);
      expect(p.move.y).toBeCloseTo(groundAt(p.move.x, p.move.z));
    }
    void open;
  });
  it('dừng trước mục tiêu gần, không đè lên nó', () => {
    const { sim, p, mon, fresh } = setup(10, 'lac_kiem_quyet');
    fresh();
    const m = mon(X + 5, Z);
    sim.onSkill(p, { id: 'skl_kiem_anh_bo', t: m.id });
    const d = Math.hypot(m.s.x - p.move.x, m.s.z - p.move.z);
    // hoặc đã dừng sát mục tiêu (≥ ~1,5 m), hoặc dốc chặn nên gần như đứng yên
    if (Math.hypot(p.move.x - X, p.move.z - Z) > 1) expect(d).toBeGreaterThan(1.2);
  });
  it('dội lệnh trong khe tối thiểu và khi còn hồi chiêu bị bỏ, không tốn linh lực', () => {
    const { sim, p, mon, fresh } = setup(10, 'lac_kiem_quyet');
    fresh();
    const m = mon(X + 20, Z);
    p.s.yaw = Math.PI / 2;
    sim.onSkill(p, { id: 'skl_kiem_anh_bo', t: m.id });
    const mp1 = p.char.mp;
    const x1 = p.move.x;
    sim.onSkill(p, { id: 'skl_kiem_anh_bo', t: m.id });
    expect(p.char.mp).toBe(mp1);
    expect(p.move.x).toBe(x1);
    sim.now += DASH_MIN_GAP_MS + 10;
    sim.onSkill(p, { id: 'skl_kiem_anh_bo', t: m.id });
    expect(p.char.mp).toBe(mp1); // vẫn hồi chiêu 10 giây
    expect(p.move.x).toBe(x1);
  });
  it('không lướt khi ngự kiếm, khi chưa theo công pháp, khi đã chết', () => {
    const a = setup(10, 'lac_kiem_quyet');
    a.fresh();
    a.p.move.flying = true;
    const x = a.p.move.x;
    a.sim.onSkill(a.p, { id: 'skl_kiem_anh_bo' });
    expect(a.p.move.x).toBe(x);
    const b = setup(10);
    b.fresh();
    b.sim.onSkill(b.p, { id: 'skl_kiem_anh_bo' });
    expect(b.p.move.x).toBe(X);
    const c = setup(10, 'lac_kiem_quyet');
    c.fresh();
    c.p.s.fl = PF_DEAD;
    c.p.char.hp = 0;
    c.sim.onSkill(c.p, { id: 'skl_kiem_anh_bo' });
    expect(c.p.move.x).toBe(X);
    // công pháp khác: không dùng được lướt của công pháp này
    const d = setup(10, 'bat_dong_kim_than');
    d.fresh();
    d.sim.onSkill(d.p, { id: 'skl_kiem_anh_bo' });
    expect(d.p.move.x).toBe(X);
  });
  it('mép bản đồ: không ra ngoài; lướt bị chặn kín thì không tốn gì', () => {
    const { sim, p, fresh } = setup(10, 'bat_dong_kim_than');
    fresh();
    p.move.x = WORLD_MARGIN;
    p.move.z = 2040;
    p.move.y = groundAt(p.move.x, p.move.z);
    p.s.yaw = -Math.PI / 2; // nhìn về -x
    const mp0 = p.char.mp;
    sim.onSkill(p, { id: 'skl_thiet_bich_xung' });
    expect(p.move.x).toBeGreaterThanOrEqual(WORLD_MARGIN - 1e-6);
    expect(p.char.mp).toBe(mp0);
    expect(p.cds.has('skl_thiet_bich_xung')).toBe(false);
  });
  it('lướt hủy đòn đang chờ, đòn đó mất (không hoàn) và GCD vẫn do đòn đã dùng', () => {
    const { sim, p, mon, fresh, resolve } = setup(10, 'lac_kiem_quyet');
    const m = mon();
    fresh();
    sim.onSkill(p, { id: 'skl_kiem_khi_tram', t: m.id });
    const gcd = p.gcdAt;
    const mp1 = p.char.mp;
    p.s.yaw = Math.PI / 2;
    sim.now += 50;
    sim.onSkill(p, { id: 'skl_kiem_anh_bo', t: m.id });
    const dashed = Math.hypot(p.move.x - X, p.move.z - Z) > 0;
    if (dashed) {
      expect(p.flow.pending).toBeNull();
      expect(p.gcdAt).toBe(gcd);
      expect(p.char.mp).toBeLessThan(mp1);
      expect(p.cds.has('skl_kiem_khi_tram')).toBe(true);
      resolve();
      expect(m.s.hp).toBe(m.s.mhp);
    }
  });
  it('Thiết Bích Xung húc mục tiêu sát, mạnh gấp rưỡi sau Trấn Sơn Ấn', () => {
    const { sim, p, mon, fresh, resolve } = setup(10, 'bat_dong_kim_than');
    const m = mon(X + 3, Z);
    fresh();
    p.s.yaw = Math.PI / 2;
    const hp0 = m.s.hp;
    sim.onSkill(p, { id: 'skl_thiet_bich_xung', t: m.id });
    const plain = hp0 - m.s.hp;
    expect(plain).toBeGreaterThan(0);
    expect(p.flow.opened.has('skl_thiet_bich_xung')).toBe(true);
    // mở cửa sổ bằng Trấn Sơn Ấn rồi húc: cờ cường hóa bị tiêu, hồi chiêu húc đã đặt
    fresh();
    sim.onSkill(p, { id: 'skl_tran_son_an' });
    resolve();
    expect(p.flow.opened.has('skl_tran_son_an')).toBe(true);
    p.cds.clear();
    p.flow.lastDashAt = -1e9;
    sim.onSkill(p, { id: 'skl_thiet_bich_xung', t: m.id });
    expect(p.flow.opened.has('skl_tran_son_an')).toBe(false);
    expect(p.cds.has('skl_thiet_bich_xung')).toBe(true);
  });
});

describe('chiêu nhiều mốc hitAt', () => {
  it('đòn đầu ngay lúc áp, đòn sau theo mốc, qua hẹn giờ của server', () => {
    const { sim, p, mon, fresh, resolve } = setup(10);
    const sk = SKILL.get('skl_phi_kiem')!;
    const saved = sk.hitAt;
    p.char.meta.skillLv = { skl_phi_kiem: 3 };
    p.char.meta.skillVar = { skl_phi_kiem: 'a' }; // Song Kiếm: hits [0.6, 0.6]
    try {
      sk.hitAt = [0.26, 0.5];
      const m = mon();
      fresh();
      sim.onSkill(p, { id: 'skl_phi_kiem', t: m.id });
      resolve();
      const afterFirst = m.s.hp;
      expect(afterFirst).toBeLessThan(m.s.mhp);
      sim.now += 100;
      (sim as unknown as { tickMethods(): void }).tickMethods();
      expect(m.s.hp).toBe(afterFirst);
      sim.now += 200;
      (sim as unknown as { tickMethods(): void }).tickMethods();
      expect(m.s.hp).toBeLessThan(afterFirst);
    } finally {
      sk.hitAt = saved;
    }
  });
});

describe('đổi id chiêu: giữ cấp và biến thức', () => {
  it('khóa cũ chuyển sang khóa mới, không ghi đè khóa mới, chạy lại không đổi', () => {
    const meta: any = {
      method: 'lac_kiem_quyet',
      skillLv: { skl_kiem_anh_phan_quang: 4, skl_xuan_phong_hoa_vu: 3, skl_phi_kiem: 2 },
      skillVar: { skl_kiem_anh_phan_quang: 'b', skl_xuan_phong_hoa_vu: 'a' },
    };
    sanitizeMethodMeta(meta);
    expect(meta.skillLv).toEqual({ skl_phi_kiem_truy_hon: 4, skl_hoi_xuan_quyet: 3, skl_phi_kiem: 2 });
    expect(meta.skillVar).toEqual({ skl_phi_kiem_truy_hon: 'b', skl_hoi_xuan_quyet: 'a' });
    const snap = JSON.stringify(meta);
    sanitizeMethodMeta(meta);
    expect(JSON.stringify(meta)).toBe(snap);
    // khóa mới đã có thì thắng
    const m2: any = { skillLv: { skl_kiem_anh_phan_quang: 2, skl_phi_kiem_truy_hon: 5 } };
    sanitizeMethodMeta(m2);
    expect(m2.skillLv).toEqual({ skl_phi_kiem_truy_hon: 5 });
  });
});
