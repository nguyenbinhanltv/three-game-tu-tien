import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { BLINK_CD, BLINK_DIST, groundAt, IN_FLY, PF_DEAD, PF_SOUL, S, SOUL_COMBAT_BLOCK_MS, SOUL_DEATH_CD_MS, SOUL_DEATH_HP, SOUL_DEATH_MS, SOUL_RANGE, SOUL_SCOUT_CD_MS, SOUL_SCOUT_MS, WORLD_MARGIN, type FxMsg, type SoulStateMsg } from '@dtl/shared';

// E3-K: nguyên anh xuất khiếu (thám thính + cứu mạng khi chết), ngự không, thuấn di. Server quyết định hết.
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

afterEach(() => vi.useRealTimers());

const X = 2040;
const Z = 2040;
let acc = 7000;

interface Sent {
  type: string;
  msg: unknown;
}

function setup(level = 24, method = 'lac_kiem_quyet') {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(2_000_000);
  const sent: Sent[] = [];
  const host = { broadcast: (type: string, msg: unknown) => sent.push({ type, msg }) };
  const sim: Sim = new GameSim(new WorldState(), host as never, { levelId: 'van_lam', roomName: 'test', spawn: { x: X, z: Z }, respawn: { x: X + 300, z: Z }, persistPosition: false });
  const char = Character.create(acc++, 'sl' + acc);
  char.level = level;
  char.meta.method = method;
  char.recalc();
  char.hp = char.mhp;
  char.mp = char.mmp;
  const client = { sessionId: 'c' + acc, send: (type: string, msg: unknown) => sent.push({ type: 'to:' + type, msg }) };
  const p: Ent = sim.addPlayer(client as never, char, true, 's' + acc);
  p.move.x = X;
  p.move.z = Z;
  p.move.y = groundAt(X, Z);
  sim.monsters.splice(0);
  const advance = (ms: number) => {
    for (let t = 0; t < ms; t += 50) {
      vi.setSystemTime(Date.now() + 50);
      sim.tick(50);
    }
  };
  advance(100);
  const mon = (x: number, z: number) => sim.spawnMonster(MONSTER.get('mon_soi_xam')!, 10, x, z, null);
  const states = () => sent.filter((s) => s.type === 'to:' + S.SOUL_STATE).map((s) => s.msg as SoulStateMsg);
  const fxs = () => sent.filter((s) => s.type === S.FX).map((s) => s.msg as FxMsg);
  const kill = () => sim.damagePlayer(p, p.char.mhp * 10, '');
  return { sim, p, sent, advance, mon, states, fxs, kill };
}

describe('xuất khiếu thám thính (X)', () => {
  it('chưa Nguyên Anh thì không xuất khiếu được', () => {
    const { sim, p } = setup(23);
    sim.soul.command(p, {});
    expect(p.s.fl & PF_SOUL).toBe(0);
  });

  it('xuất khiếu: bay được, thân xác ghi lại, không rời tầm, nhập lại về đúng chỗ thân xác', () => {
    const { sim, p, advance, states } = setup();
    sim.soul.command(p, {});
    expect(p.s.fl & PF_SOUL).toBe(PF_SOUL);
    expect(p.move.flying).toBe(true);
    expect(states().at(-1)).toMatchObject({ k: 1, bx: X, bz: Z });
    // Bay thẳng ra xa (client chỉ gửi input; server ép tầm).
    for (let i = 0; i < 280; i++) {
      p.inputs.push({ s: i + 1, mx: 0, mz: 1, yaw: -Math.PI / 2, f: 0 });
      advance(50);
    }
    const d = Math.hypot(p.move.x - X, p.move.z - Z);
    expect(d).toBeLessThanOrEqual(SOUL_RANGE + 0.5);
    expect(d).toBeGreaterThan(SOUL_RANGE - 5);
    advance(1000);
    sim.soul.command(p, { on: false });
    expect(p.s.fl & PF_SOUL).toBe(0);
    expect(p.move.x).toBeCloseTo(X);
    expect(p.move.z).toBeCloseTo(Z);
    expect(p.move.flying).toBe(false);
    expect(p.move.y).toBeCloseTo(groundAt(X, Z));
  });

  it('hết giờ tự nhập lại; sau đó vào hồi chiêu', () => {
    const { sim, p, advance, states } = setup();
    sim.soul.command(p, {});
    advance(SOUL_SCOUT_MS + 300);
    expect(p.s.fl & PF_SOUL).toBe(0);
    expect(states().at(-1)).toMatchObject({ k: 0 });
    expect(states().at(-1)!.cd).toBeGreaterThan(SOUL_SCOUT_CD_MS - 1500);
    sim.soul.command(p, {});
    expect(p.s.fl & PF_SOUL).toBe(0);
    advance(SOUL_SCOUT_CD_MS);
    sim.soul.command(p, {});
    expect(p.s.fl & PF_SOUL).toBe(PF_SOUL);
  });

  it('vừa giao chiến thì không xuất khiếu', () => {
    const { sim, p } = setup();
    p.lastCombatAt = sim.now - SOUL_COMBAT_BLOCK_MS + 1000;
    sim.soul.command(p, {});
    expect(p.s.fl & PF_SOUL).toBe(0);
  });

  it('dạng nguyên anh: không nhận sát thương, quái không đuổi, không ra chiêu', () => {
    const { sim, p, advance, mon } = setup();
    const m = mon(X + 6, Z);
    sim.soul.command(p, {});
    const hp = p.char.hp;
    sim.damagePlayer(p, 500, m.id);
    expect(p.char.hp).toBe(hp);
    advance(2000);
    expect(m.target).toBe('');
    sim.onSkill(p, { id: 'skl_phi_kiem', t: m.id });
    expect(m.s.hp).toBe(m.s.mhp);
    expect(p.flow.pending).toBeNull();
  });

  it('rời room (drop) trả thân xác về chỗ cũ trước khi lưu', () => {
    const { sim, p, advance } = setup();
    sim.soul.command(p, {});
    for (let i = 0; i < 30; i++) {
      p.inputs.push({ s: i + 1, mx: 0, mz: 1, yaw: 0, f: 0 });
      advance(50);
    }
    expect(Math.hypot(p.move.x - X, p.move.z - Z)).toBeGreaterThan(5);
    sim.soul.drop(p);
    expect(p.move.x).toBeCloseTo(X);
    expect(p.move.z).toBeCloseTo(Z);
    expect(p.s.fl & PF_SOUL).toBe(0);
  });
});

describe('lưu nhân vật lúc xuất khiếu', () => {
  it('savePlayer lưu chỗ thân xác, không phải chỗ nguyên anh', () => {
    const t = setup();
    (t.sim as unknown as { opts: { persistPosition: boolean } }).opts.persistPosition = true;
    t.sim.soul.command(t.p, {});
    for (let i = 0; i < 30; i++) {
      t.p.inputs.push({ s: i + 1, mx: 0, mz: 1, yaw: -Math.PI / 2, f: 0 });
      t.advance(50);
    }
    expect(Math.hypot(t.p.move.x - X, t.p.move.z - Z)).toBeGreaterThan(10);
    t.sim.savePlayer(t.p);
    expect(t.p.char.x).toBeCloseTo(X);
    expect(t.p.char.z).toBeCloseTo(Z);
    expect(t.p.char.y).toBeCloseTo(groundAt(X, Z));
  });
});

describe('xuất khiếu cứu mạng khi chết', () => {
  it('chết ở Nguyên Anh: nguyên anh thoát ra, không mất tu vi, hết 10 giây hồi sinh 30% khí huyết ở nơi an toàn', () => {
    const { p, advance, kill, fxs } = setup();
    p.char.xp = 5000;
    kill();
    expect(p.s.fl & PF_DEAD).toBe(PF_DEAD);
    expect(p.s.fl & PF_SOUL).toBe(PF_SOUL);
    expect(p.char.xp).toBe(5000);
    expect(fxs().some((f) => f.t === 'soul_flee')).toBe(true);
    advance(SOUL_DEATH_MS - 500);
    expect(p.s.fl & PF_DEAD).toBe(PF_DEAD);
    advance(800);
    expect(p.s.fl).toBe(0);
    expect(p.char.hp).toBeGreaterThanOrEqual(Math.round(p.char.mhp * SOUL_DEATH_HP));
    expect(p.char.hp).toBeLessThan(p.char.mhp * 0.4);
    expect(p.move.x).toBeCloseTo(X + 300);
    expect(p.char.xp).toBe(5000);
  });

  it('bấm hồi sinh sớm cũng được 30% và không mất tu vi', () => {
    const { sim, p, kill } = setup();
    p.char.xp = 5000;
    kill();
    sim.onRespawn(p);
    expect(p.s.fl).toBe(0);
    expect(p.char.hp).toBe(Math.round(p.char.mhp * SOUL_DEATH_HP));
    expect(p.char.xp).toBe(5000);
  });

  it('mỗi 10 phút một lần: lần chết kế tiếp mất tu vi như thường, hết hồi chiêu thì cứu lại', () => {
    const { sim, p, advance, kill } = setup();
    p.char.xp = 50_000;
    kill();
    advance(SOUL_DEATH_MS + 200);
    expect(p.s.fl).toBe(0);
    p.char.hp = p.char.mhp;
    kill();
    expect(p.s.fl).toBe(PF_DEAD);
    expect(p.char.xp).toBeLessThan(50_000);
    sim.onRespawn(p);
    expect(p.char.hp).toBe(Math.round(p.char.mhp * 0.5));
    advance(SOUL_DEATH_CD_MS);
    p.char.hp = p.char.mhp;
    kill();
    expect(p.s.fl & PF_SOUL).toBe(PF_SOUL);
  });

  it('chưa Nguyên Anh thì chết thường, mất tu vi', () => {
    const { p, kill } = setup(23);
    p.char.xp = 50_000;
    kill();
    expect(p.s.fl).toBe(PF_DEAD);
    expect(p.char.xp).toBeLessThan(50_000);
  });
});

describe('thuấn di (thay Lướt cơ bản từ Nguyên Anh)', () => {
  const blink = (t: ReturnType<typeof setup>, tx = X + 40) => {
    const m = t.mon(tx, Z);
    t.p.s.yaw = Math.PI / 2;
    t.p.gcdAt = 0;
    t.p.flow.lastDashAt = -1e9;
    t.sim.onSkill(t.p, { id: 'skl_kiem_anh_bo', t: m.id });
    return m;
  };

  it('dịch 12 m, hồi 14 giây, tới đúng mặt đất, báo FX blink có điểm xuất phát', () => {
    const t = setup();
    blink(t);
    const d = Math.hypot(t.p.move.x - X, t.p.move.z - Z);
    expect(d).toBeGreaterThan(BLINK_DIST - 0.5);
    expect(d).toBeLessThanOrEqual(BLINK_DIST + 0.01);
    expect(t.p.move.y).toBeCloseTo(groundAt(t.p.move.x, t.p.move.z));
    const cd = t.p.cds.get('skl_kiem_anh_bo')!;
    expect(cd - t.sim.now).toBeGreaterThan(BLINK_CD * 1000 - 100);
    const fx = t.fxs().find((f) => f.t === 'blink');
    expect(fx).toMatchObject({ ox: X, oz: Z });
  });

  it('dưới Nguyên Anh vẫn Lướt 8 m', () => {
    const t = setup(20);
    blink(t);
    const d = Math.hypot(t.p.move.x - X, t.p.move.z - Z);
    expect(d).toBeLessThanOrEqual(8.01);
    expect(t.fxs().some((f) => f.t === 'blink')).toBe(false);
  });

  it('đang hồi chiêu thì không thuấn di lần hai', () => {
    const t = setup();
    blink(t);
    const x1 = t.p.move.x;
    t.p.flow.lastDashAt = -1e9;
    t.sim.onSkill(t.p, { id: 'skl_kiem_anh_bo' });
    expect(t.p.move.x).toBe(x1);
  });

  it('sát ranh bản đồ: không xuyên ra ngoài, không trừ linh lực, không đặt hồi chiêu', () => {
    const t = setup();
    t.p.move.x = WORLD_MARGIN;
    t.p.move.z = Z;
    t.p.move.y = groundAt(t.p.move.x, Z);
    t.p.s.yaw = -Math.PI / 2;
    t.p.flow.lastDashAt = -1e9;
    const mp = t.p.char.mp;
    t.sim.onSkill(t.p, { id: 'skl_kiem_anh_bo' });
    expect(t.p.move.x).toBeGreaterThanOrEqual(WORLD_MARGIN - 1e-6);
    expect(t.p.char.mp).toBe(mp);
    expect(t.p.cds.has('skl_kiem_anh_bo')).toBe(false);
  });

  it('đang ngự không/ngự kiếm hoặc đã chết thì không thuấn di', () => {
    const t = setup();
    t.p.move.flying = true;
    t.p.move.grounded = false;
    t.p.move.y += 3;
    blink(t);
    expect(t.p.move.x).toBe(X);
    t.p.move.flying = false;
    t.p.s.fl = PF_DEAD;
    t.p.flow.lastDashAt = -1e9;
    t.sim.onSkill(t.p, { id: 'skl_kiem_anh_bo' });
    expect(t.p.move.x).toBe(X);
  });

  it('dạng nguyên anh thì không thuấn di', () => {
    const t = setup();
    t.sim.soul.command(t.p, {});
    blink(t);
    expect(t.p.cds.has('skl_kiem_anh_bo')).toBe(false);
  });
});

describe('ngự không (server)', () => {
  it('Nguyên Anh bay dưới 30 m không tốn linh lực; Trúc Cơ bay 25 m thì tốn', () => {
    for (const [lv, drains] of [[24, false], [18, true]] as const) {
      const t = setup(lv);
      t.p.move.y = groundAt(X, Z) + 25;
      t.p.move.flying = true;
      t.p.move.grounded = false;
      t.p.char.mp = 100;
      for (let i = 0; i < 20; i++) t.p.inputs.push({ s: i + 1, mx: 0, mz: 0, yaw: 0, f: IN_FLY });
      t.advance(1000);
      if (drains) expect(t.p.char.mp).toBeLessThan(100);
      else expect(t.p.char.mp).toBeGreaterThanOrEqual(100);
    }
  });
});
