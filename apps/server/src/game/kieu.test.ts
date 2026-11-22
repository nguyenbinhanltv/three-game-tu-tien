import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { KIEU_MIN_CLEAR_SEC, KIEU_RETICKET_SEC, kieuGold, kieuIdem, groundAt } from '@dtl/shared';

// TN-7: vé vào cầu Cửu Kiều và ghi tiến độ. Server quyết định hết; chống nhảy cầu, vé dùng lại, qua quá nhanh, ghi hai lần.
process.env.DB_FILE = ':memory:';

type Ent = import('./sim').PlayerEnt;
let GameSim: typeof import('./sim').GameSim;
let WorldState: typeof import('../state').WorldState;
let Character: typeof import('./character').Character;
let KieuSystem: typeof import('./kieu').KieuSystem;
let LEVELS: typeof import('@dtl/content').LEVELS;
let db: typeof import('../db').db;
let ledger: typeof import('../db').ledger;

beforeAll(async () => {
  ({ GameSim } = await import('./sim'));
  ({ WorldState } = await import('../state'));
  ({ Character } = await import('./character'));
  ({ KieuSystem } = await import('./kieu'));
  ({ LEVELS } = await import('@dtl/content'));
  ({ db, ledger } = await import('../db'));
});

const X = 2040;
const Z = 2040;
let acc = 52000;

function setup() {
  const sim = new GameSim(new WorldState(), { broadcast: () => undefined } as never, {
    levelId: 'van_lam',
    roomName: 'test',
    spawn: { x: X, z: Z },
    respawn: { x: X, z: Z },
    persistPosition: false,
  });
  const join = (level: number, kieu?: number): Ent => {
    const char = Character.create(acc++, 'kieu' + acc, null, 'moc');
    char.level = level;
    if (kieu !== undefined) char.meta.kieu = kieu;
    char.recalc();
    char.hp = char.mhp;
    const p = sim.addPlayer({ sessionId: 'k' + acc, send: () => undefined } as never, char, true, 's' + acc);
    p.move.x = X;
    p.move.z = Z;
    p.move.y = groundAt(X, Z);
    return p;
  };
  const warns: string[] = [];
  const syss: string[] = [];
  let near = true;
  const sys = new KieuSystem({
    get now() {
      return Date.now();
    },
    warn: (_p, k) => void warns.push(k),
    sys: (_p, k) => void syss.push(k),
    nearNpc: () => near,
    leaveBlocker: () => '',
    isDead: () => false,
    giveXp: (p, n) => void p.char.gainXp(n),
    savePlayer: () => undefined,
  });
  return { join, sys, warns, syss, setNear: (v: boolean) => (near = v) };
}

const OK = { present: true, contributed: true, elapsedSec: 999 };

afterEach(() => {
  vi.useRealTimers();
  for (const k of Object.keys(LEVELS)) if (k.startsWith('kieu_')) delete (LEVELS as Record<string, unknown>)[k];
});

function openBridges(...ns: number[]) {
  for (const n of ns) (LEVELS as Record<string, unknown>)[`kieu_${n}`] = { dungeon: { private: true } };
}

describe('xin vé vào cầu', () => {
  it('chỉ cấp vé cầu kế tiếp, không nhảy cóc, không khi xa NPC, không cầu chưa mở', () => {
    const { join, sys, warns, setNear } = setup();
    const p = join(44);
    expect(sys.plan(p, { n: 1 }, [])).toBeNull();
    expect(warns).toContain('sys.kieu_closed');
    openBridges(1, 2, 3);
    setNear(false);
    expect(sys.plan(p, { n: 1 }, [])).toBeNull();
    expect(warns).toContain('sys.kieu_far');
    setNear(true);
    expect(sys.plan(p, { n: 2 }, [])).toBeNull();
    expect(warns).toContain('sys.kieu_order');
    const plan = sys.plan(p, { n: 1 }, []);
    expect(plan?.level).toBe('kieu_1');
    expect(plan?.members).toEqual([p]);
  });

  it('dữ liệu lạ bị bỏ qua, không cấp vé', () => {
    const { join, sys } = setup();
    openBridges(1);
    const p = join(44);
    for (const bad of [null, undefined, {}, { n: 0 }, { n: 10 }, { n: '1' }, { n: 1.5 }, { n: NaN }, 'x'])
      expect(sys.plan(p, bad, [])).toBeNull();
  });

  it('thiếu cấp thì báo; cấp lại vé phải chờ ' + KIEU_RETICKET_SEC + ' giây', () => {
    vi.useFakeTimers();
    const { join, sys, warns } = setup();
    openBridges(4);
    const low = join(44, 3);
    expect(sys.plan(low, { n: 4 }, [])).toBeNull();
    expect(warns).toContain('sys.kieu_level');
    const p = join(45, 3);
    expect(sys.plan(p, { n: 4 }, [])).not.toBeNull();
    expect(sys.plan(p, { n: 4 }, [])).toBeNull();
    expect(warns).toContain('sys.kieu_wait');
    vi.advanceTimersByTime(KIEU_RETICKET_SEC * 1000 + 1);
    expect(sys.plan(p, { n: 4 }, [])).not.toBeNull();
  });

  it('đồng đội phải tự đủ điều kiện và cùng chế độ; tối đa 4 người', () => {
    const { join, sys, warns } = setup();
    openBridges(3);
    const lead = join(44, 2);
    const ok = join(44, 2);
    const skipped = join(44, 0); // chưa qua cầu 2: không được kéo vào cầu 3
    const practice = join(45, 3); // đã qua cầu 3: luyện lại, khác chế độ
    const more = [join(44, 2), join(44, 2), join(44, 2)];
    const plan = sys.plan(lead, { n: 3 }, [ok, skipped, practice, ...more]);
    expect(plan?.members).toHaveLength(4);
    expect(plan?.members).toContain(ok);
    expect(plan?.members).not.toContain(skipped);
    expect(plan?.members).not.toContain(practice);
    expect(warns.filter((w) => w === 'sys.kieu_mate_skip').length).toBeGreaterThanOrEqual(2);
  });
});

describe('ghi tiến độ cầu', () => {
  it('lần đầu: tăng meta.kieu, thưởng linh thạch một lần, ghi ledger', () => {
    const { join, sys } = setup();
    const p = join(44);
    const gold = p.char.gold;
    expect(sys.onClear(p, 1, OK)).toBe('ok');
    expect(p.char.meta.kieu).toBe(1);
    expect(p.char.gold).toBe(gold + kieuGold(1));
    const rows = db
      .select()
      .from(ledger)
      .all()
      .filter((r) => r.idem === kieuIdem(p.char.id, 1));
    expect(rows).toHaveLength(1);
  });

  it('gọi lại cùng cầu: luyện lại, không thưởng thêm, không nhân đôi ledger', () => {
    const { join, sys } = setup();
    const p = join(44);
    sys.onClear(p, 1, OK);
    const gold = p.char.gold;
    expect(sys.onClear(p, 1, OK)).toBe('practice');
    expect(p.char.gold).toBe(gold);
    expect(
      db
        .select()
        .from(ledger)
        .all()
        .filter((r) => r.idem === kieuIdem(p.char.id, 1)),
    ).toHaveLength(1);
  });

  it('không ghi cầu nhảy cóc, cầu ngoài 1..9, hay lượt bất thường', () => {
    const { join, sys } = setup();
    const p = join(44);
    expect(sys.onClear(p, 3, OK)).toBe('practice');
    expect(p.char.meta.kieu).toBeUndefined();
    for (const n of [0, 10, 1.5, NaN]) expect(sys.onClear(p, n, OK)).toBe('anomaly');
    expect(sys.onClear(p, 1, { ...OK, present: false })).toBe('anomaly');
    expect(sys.onClear(p, 1, { ...OK, contributed: false })).toBe('anomaly');
    expect(sys.onClear(p, 1, { ...OK, elapsedSec: (KIEU_MIN_CLEAR_SEC[0] ?? 30) - 1 })).toBe('anomaly');
    expect(p.char.meta.kieu).toBeUndefined();
  });

  it('đặt lại tiến độ rồi qua lại: khóa chống trùng chặn thưởng lần hai nhưng vẫn ghi tiến độ', () => {
    const { join, sys } = setup();
    const p = join(44);
    sys.onClear(p, 1, OK);
    const gold = p.char.gold;
    p.char.meta.kieu = 0; // GM đặt lại
    expect(sys.onClear(p, 1, OK)).toBe('dup');
    expect(p.char.meta.kieu).toBe(1);
    expect(p.char.gold).toBe(gold);
  });

  it('qua cầu 3 nâng trần cấp: tu vi đang đầy ở trần 45 lên 46 ngay', () => {
    const { join, sys } = setup();
    const p = join(45, 2);
    p.char.xp = 250_000 * 5;
    p.char.gainXp(0);
    expect(p.char.level).toBe(45); // kẹt ở trần
    expect(p.char.levelCap()).toBe(45);
    sys.onClear(p, 3, OK);
    expect(p.char.levelCap()).toBe(46);
    expect(p.char.level).toBe(46);
  });
  it('trần cấp chặn tu vi: cày thoải mái khi chưa qua cầu vẫn không vượt 45', () => {
    const { join } = setup();
    const p = join(44);
    p.char.gainXp(10_000_000);
    expect(p.char.level).toBe(45);
    p.char.meta.kieu = 9;
    p.char.gainXp(100_000_000);
    expect(p.char.level).toBe(47);
  });

  it('Kiều Lực: mỗi cầu cộng 1% khí huyết', () => {
    const { join } = setup();
    const p = join(44);
    const base = p.char.mhp;
    p.char.meta.kieu = 5;
    p.char.recalc();
    expect(p.char.mhp / base).toBeGreaterThan(1.04);
    expect(p.char.mhp / base).toBeLessThan(1.06);
  });
});

describe('kết game: chọn nguồn Cực nguyên (Đạp Thiên)', () => {
  it('phải đủ chín cầu, đứng cạnh NPC, chỉ chọn một lần, id lạ bị bỏ qua', () => {
    const { join, sys, warns, setNear } = setup();
    const p = join(47, 8);
    sys.onChoose(p, { id: 'sat_luc' });
    expect(p.char.meta.dap).toBeUndefined();
    expect(warns).toContain('sys.dap_locked');
    p.char.meta.kieu = 9;
    for (const bad of [null, undefined, {}, { id: 'kim' }, { id: 7 }, { id: '__proto__' }, 'sat_luc']) sys.onChoose(p, bad);
    expect(p.char.meta.dap).toBeUndefined();
    setNear(false);
    sys.onChoose(p, { id: 'sat_luc' });
    expect(p.char.meta.dap).toBeUndefined();
    setNear(true);
    const atk0 = p.char.atk;
    sys.onChoose(p, { id: 'sat_luc' });
    expect(p.char.meta.dap).toBe('sat_luc');
    expect(p.char.atk).toBeGreaterThan(atk0 * 1.05);
    sys.onChoose(p, { id: 'cam_che' });
    expect(p.char.meta.dap).toBe('sat_luc');
    expect(warns).toContain('sys.dap_have');
    expect(p.char.view().dap).toBe('sat_luc');
    expect(p.char.view().kieu).toBe(9);
  });

  it('meta.dap bị sửa bậy khi tải: chuỗi lạ coi như chưa chọn', () => {
    const { join } = setup();
    const p = join(47, 9);
    const before = p.char.mhp;
    (p.char.meta as { dap?: string }).dap = 'khong_co';
    p.char.recalc();
    expect(p.char.mhp).toBe(before);
    expect(p.char.view().dap).toBe('');
  });
});

describe('Bảng Thiên Lộ', () => {
  it('chỉ liệt kê người đã qua cầu 9, theo thời điểm ghi; giãn cách giữa hai lần xin', () => {
    vi.useFakeTimers();
    const { join, sys } = setup();
    const a = join(47, 8);
    const b = join(47, 8);
    const c = join(47, 3);
    expect(sys.onClear(a, 9, OK)).toBe('ok');
    vi.advanceTimersByTime(5000);
    expect(sys.onClear(b, 9, OK)).toBe('ok');
    const got: { type: string; msg: { rows: { name: string; ts: number }[]; total: number } }[] = [];
    (c as unknown as { client: { send: (t: string, m: unknown) => void } }).client = {
      send: (type: string, msg: unknown) => void got.push({ type, msg: msg as never }),
    };
    sys.onBoard(c);
    expect(got).toHaveLength(1);
    expect(got[0]!.type).toBe('kbd');
    const names = got[0]!.msg.rows.map((r) => r.name);
    expect(names.slice(-2)).toEqual([a.char.name, b.char.name]);
    expect(names).not.toContain(c.char.name);
    expect(got[0]!.msg.total).toBeGreaterThanOrEqual(2);
    const ts = got[0]!.msg.rows.map((r) => r.ts);
    expect([...ts].sort((x, y) => x - y)).toEqual(ts);
    sys.onBoard(c); // trong giãn cách: bỏ qua
    expect(got).toHaveLength(1);
    vi.advanceTimersByTime(2500);
    sys.onBoard(c);
    expect(got).toHaveLength(2);
  });
});
