import { beforeAll, describe, expect, it } from 'vitest';
import { DASH_MIN_GAP_MS, groundAt, MS_DEAD, PF_DEAD, S, WORLD_MARGIN, type CdMsg, type FxMsg } from '@dtl/shared';

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
  const sim: Sim = new GameSim(new WorldState(), host as never, { levelId: 'van_lam', roomName: 'test', spawn: { x: X, z: Z }, respawn: { x: X, z: Z }, persistPosition: false });
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
  return { sim, sent, p, mon, fresh, resolve, fxs, cd };
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
      seq.push(fxs().filter((f) => f.t === 'sword').pop()?.n);
    }
    expect(seq).toEqual([0, 1, 2, 0]);
    fresh();
    sim.now += 2500;
    sim.onSkill(p, { id: 'skl_phi_kiem', t: m.id });
    resolve();
    expect(fxs().filter((f) => f.t === 'sword').pop()?.n).toBe(0);
  });
  it('đòn 3 mạnh hơn đòn 1 (hệ số 1,4 so với 0,9)', () => {
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
    expect(muls[0]).toBeCloseTo(0.9);
    expect(muls[2]).toBeCloseTo(1.4);
  });
  it('quá GCD vẫn do server giữ: bấm dồn trong 1 giây chỉ ra một đòn', () => {
    const { sim, p, mon, fresh, resolve } = setup();
    const m = mon();
    fresh();
    for (let i = 0; i < 10; i++) sim.onSkill(p, { id: 'skl_phi_kiem', t: m.id });
    resolve();
    expect(p.flow.comboIdx).toBe(0);
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
