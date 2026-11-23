import { beforeAll, describe, expect, it } from 'vitest';
import {
  AIM_MAX_DIST,
  DODGE_MIN_GAP_MS,
  DODGE_RECHARGE_MS,
  DODGE_DIST,
  DODGE_IFRAME_MS,
  groundAt,
  S,
  sanitizeAim,
  type CdMsg,
  type FxMsg,
} from '@dtl/shared';

// Thiên Nhãn P1: điểm ngắm (kẹp, tự khóa phía server, đổi hướng chiêu) và né Space (hồi, quãng, khung bất tử do server giữ).
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
let acc = 9000;

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

describe('sanitizeAim', () => {
  it('từ chối thiếu/không hữu hạn, kẹp điểm quá xa', () => {
    expect(sanitizeAim(null, 0, 0)).toBeNull();
    expect(sanitizeAim({ ax: 'x', az: 1 }, 0, 0)).toBeNull();
    expect(sanitizeAim({ ax: NaN, az: 1 }, 0, 0)).toBeNull();
    expect(sanitizeAim({ ax: Infinity, az: 1 }, 0, 0)).toBeNull();
    expect(sanitizeAim({ ax: 0.1, az: 0.1 }, 0, 0)).toBeNull();
    const far = sanitizeAim({ ax: 1e9, az: 0 }, 0, 0)!;
    expect(Math.hypot(far.x, far.z)).toBeCloseTo(AIM_MAX_DIST);
  });
});

describe('điểm ngắm lên server', () => {
  it('chiêu đơn không nêu mục tiêu: server tự khóa quái gần điểm ngắm nhất', () => {
    const { sim, p, mon, fresh } = setup();
    const near = mon(X + 5, Z + 2);
    const other = mon(X + 5, Z - 7);
    fresh();
    sim.onSkill(p, { id: 'skl_kiem_khi_tram', ax: X + 5, az: Z + 3 });
    expect(p.flow.pending?.target).toBe(near.id);
    expect(p.flow.pending?.target).not.toBe(other.id);
  });
  it('điểm ngắm xa mọi quái hoặc quái ngoài tầm chiêu: không ra chiêu', () => {
    const { sim, p, mon, fresh } = setup();
    mon(X + 5, Z);
    fresh();
    sim.onSkill(p, { id: 'skl_kiem_khi_tram', ax: X - 30, az: Z - 30 });
    expect(p.flow.pending).toBeNull();
    const far = mon(X + 200, Z);
    sim.onSkill(p, { id: 'skl_kiem_khi_tram', ax: far.s.x, az: far.s.z });
    expect(p.flow.pending).toBeNull();
  });
  it('mục tiêu nêu rõ thắng điểm ngắm; điểm ngắm rác bị bỏ qua', () => {
    const { sim, p, mon, fresh } = setup();
    const a = mon(X + 4, Z);
    mon(X, Z + 4);
    fresh();
    sim.onSkill(p, { id: 'skl_kiem_khi_tram', t: a.id, ax: X, az: Z + 4 });
    expect(p.flow.pending?.target).toBe(a.id);
    fresh();
    (p.flow as { pending: unknown }).pending = null;
    sim.onSkill(p, { id: 'skl_kiem_khi_tram', t: a.id, ax: 'rác', az: {} });
    expect((p.flow.pending as { target: string } | null)?.target).toBe(a.id);
  });
});

describe('né (Space)', () => {
  it('lướt đúng hướng điểm ngắm, không quá DODGE_DIST, bật khung bất tử', () => {
    const { sim, p } = setup();
    sim.onDodge(p, { ax: X + 20, az: Z });
    expect(p.move.x - X).toBeGreaterThan(1);
    expect(p.move.x - X).toBeLessThanOrEqual(DODGE_DIST + 0.5);
    expect(Math.abs(p.move.z - Z)).toBeLessThan(1);
    expect(p.dodgeUntil - sim.now).toBe(DODGE_IFRAME_MS);
  });
  it('trong khung bất tử không mất máu; hết khung thì mất', () => {
    const { sim, p } = setup();
    sim.onDodge(p, {});
    const hp = p.char.hp;
    sim.damagePlayer(p, 50, '');
    expect(p.char.hp).toBe(hp);
    sim.now += DODGE_IFRAME_MS + 1;
    sim.damagePlayer(p, 50, '');
    expect(p.char.hp).toBeLessThan(hp);
  });
  it('hai lượt nạp (S5): né liền hai lần được, lần ba bị chặn; không gia hạn khung bất tử; spam không dò đường', () => {
    const { sim, p } = setup();
    sim.onDodge(p, { ax: X + 20, az: Z });
    const until1 = p.dodgeUntil;
    sim.now += DODGE_MIN_GAP_MS + 10;
    sim.onDodge(p, { ax: X + 20, az: Z });
    expect(p.dodgeUntil).toBeGreaterThan(until1);
    expect(p.dodge.charges).toBe(0);
    const until2 = p.dodgeUntil;
    const x = p.move.x;
    sim.now += DODGE_MIN_GAP_MS + 10;
    sim.onDodge(p, { ax: X + 20, az: Z });
    expect(p.dodgeUntil).toBe(until2);
    expect(p.move.x).toBe(x);
  });
  it('nạp tuần tự: sau DODGE_RECHARGE_MS có lại một lượt, sau hai lần có đủ hai', () => {
    const { sim, p } = setup();
    sim.onDodge(p, {});
    sim.now += DODGE_MIN_GAP_MS + 10;
    sim.onDodge(p, {});
    sim.now += DODGE_RECHARGE_MS;
    const until = p.dodgeUntil;
    sim.onDodge(p, {});
    expect(p.dodgeUntil).toBeGreaterThan(until);
    expect(p.dodge.charges).toBe(0);
  });
  it('người chết không né được', () => {
    const { sim, p } = setup();
    p.char.hp = 0;
    sim.damagePlayer(p, 1, '');
    sim.onDodge(p, {});
    expect(p.dodgeUntil).toBe(0);
  });
  it('né không đổi vật phẩm/tiền', () => {
    const { sim, p } = setup();
    const gold = p.char.gold;
    const inv = JSON.stringify(p.char.inv);
    sim.onDodge(p, { ax: X, az: Z + 9 });
    expect(p.char.gold).toBe(gold);
    expect(JSON.stringify(p.char.inv)).toBe(inv);
  });
});
