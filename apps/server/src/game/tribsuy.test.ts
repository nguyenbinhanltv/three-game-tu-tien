import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  groundAt,
  HOME_LEVEL,
  MAX_LEVEL,
  PF_TRIBULATION,
  S,
  SUY_MECHANICS,
  TRIB_DEFS,
  TRIB_LEVEL,
  lawPassive,
  suyRemaining,
  suyRingPos,
  tribForLevel,
  type FxMsg,
  type HazardMsg,
} from '@dtl/shared';
import { runSuy, suyState, type SuyPriv } from './tribsuy.testutil';

// TN-4: Thiên Nhân Ngũ Suy. Năm ải là năm cơ chế `suy_*`; server quyết định mọi thứ, thưởng qua transaction + sổ cái có khóa chống trùng.
process.env.DB_FILE = ':memory:';
process.env.AUTH_DEV_BYPASS = '1';

type Ent = import('./sim').PlayerEnt;
let GameSim: typeof import('./sim').GameSim;
let WorldState: typeof import('../state').WorldState;
let Character: typeof import('./character').Character;
let sqlite: typeof import('../db').sqlite;
let content: typeof import('@dtl/content');

beforeAll(async () => {
  ({ GameSim } = await import('./sim'));
  ({ WorldState } = await import('../state'));
  ({ Character } = await import('./character'));
  ({ sqlite } = await import('../db'));
  content = await import('@dtl/content');
});

interface Sent {
  type: string;
  msg: unknown;
  to: string;
}
const sent: Sent[] = [];
let acc = 77000;
const DEF = TRIB_DEFS.ngu_suy;
const N = DEF.phases.length;

afterEach(() => {
  vi.restoreAllMocks();
  sent.length = 0;
});

function mk(cleared = 0, levelId: string = TRIB_LEVEL) {
  const lv = content.LEVELS[levelId]!;
  const spawn = lv.dungeon?.spawn ?? lv.spawn ?? { x: 2040, z: 2040 };
  const ended: boolean[] = [];
  const host = {
    broadcast: (type: string, msg: unknown) => sent.push({ type, msg, to: '*' }),
    onTribulationEnd: (_p: unknown, _d: unknown, ok: boolean) => ended.push(ok),
  };
  const sim = new GameSim(new WorldState(), host as never, {
    levelId,
    roomName: levelId === TRIB_LEVEL ? 'tribulation' : levelId,
    spawn,
    respawn: spawn,
    persistPosition: false,
  });
  sim.now = 5_000_000;
  const join = (name: string): Ent => {
    const char = Character.create(acc++, name + acc);
    char.level = DEF.from;
    char.recalc();
    char.hp = char.mhp;
    char.mp = char.mmp;
    const p = sim.addPlayer(
      { sessionId: 'c' + acc++, send: (type: string, msg: unknown) => sent.push({ type, msg, to: char.name }) } as never,
      char,
      true,
      's' + acc,
    );
    p.move.x = spawn.x;
    p.move.z = spawn.z;
    p.move.y = groundAt(spawn.x, spawn.z);
    return p;
  };
  const p = join('suy');
  if (cleared) p.char.meta.suy = cleared;
  return { sim, p, join, ended, priv: sim as unknown as SuyPriv };
}

const fxs = (t?: string) =>
  sent
    .filter((x) => x.type === S.FX)
    .map((x) => x.msg as FxMsg)
    .filter((m) => !t || m.t === t);
const keys = (p: Ent) => sent.filter((s) => s.type === S.SYS && s.to === p.char.name).map((s) => (s.msg as { k: string }).k);
const ledger = (p: Ent) =>
  sqlite.prepare("SELECT kind, delta, reason, idem FROM ledger WHERE char_id = ? AND reason = 'suy:stage' ORDER BY id").all(p.char.id) as {
    kind: string;
    delta: number;
    reason: string;
    idem: string | null;
  }[];

describe('dữ liệu Ngũ Suy', () => {
  it('kiếp chuỗi năm ải, mỗi ải một cơ chế riêng, chưa bật và không nằm trên đường đột phá theo cấp', () => {
    expect(DEF.chain).toBe(true);
    expect(DEF.enabled).toBe(false);
    expect(DEF.phases.map((p) => p.mechanic)).toEqual([...SUY_MECHANICS]);
    expect(DEF.stageGold).toHaveLength(N);
    expect(DEF.from).toBe(MAX_LEVEL);
    expect(tribForLevel(DEF.from)).toBeNull();
    expect(lawPassive(N - 1)).toBeNull();
    expect(lawPassive(N)).toEqual(DEF.law);
  });
});

describe('vào kiếp', () => {
  it('người chơi thường không mở được (chưa bật); tin đột phá không mang id nên không chọn được kiếp chuỗi', () => {
    const { sim, p } = mk(0, HOME_LEVEL);
    sim.onBreakthrough(p);
    expect(p.trib).toBeNull();
    expect(keys(p)).toContain('sys.max_level');
    // Có id (đường GM) mà không `force`: kiếp chưa bật thì vẫn bị chặn.
    const b = mk(0, HOME_LEVEL);
    b.sim.onBreakthrough(b.p, false, 'ngu_suy');
    expect(b.p.trib).toBeNull();
    expect(keys(b.p)).toContain('sys.trib_locked');
  });

  it('vào tiếp từ ải chưa qua: đồng hồ kiếp bắt đầu ở đầu ải đó', () => {
    const { sim, p } = mk(3);
    expect(sim.beginTribulation(p, DEF, false)).toBe(true);
    expect(p.s.fl & PF_TRIBULATION).not.toBe(0);
    const start = fxs('tribstart')[0]!;
    expect(start.tb).toBe('ngu_suy');
    expect(start.d).toBe(suyRemaining(DEF, 3));
    expect(start.d).toBe(DEF.duration - DEF.phases[2]!.end);
    runSuy(sim, p, 1, false);
    expect(suyState(p)?.id).toBe('suy_tho');
  });

  it('đã qua đủ chuỗi thì không vào lại', () => {
    const { sim, p } = mk(N, HOME_LEVEL);
    sim.onBreakthrough(p, true, 'ngu_suy');
    expect(p.trib).toBeNull();
    expect(keys(p)).toContain('sys.suy_done');
  });
});

describe('đứng yên không thao tác: ải nào cũng thất bại', () => {
  for (let k = 0; k < N; k++) {
    it(`ải ${k + 1} (${DEF.phases[k]!.id})`, () => {
      vi.spyOn(Math, 'random').mockImplementation(() => 0.37);
      const { sim, p, ended } = mk(k);
      const xp = (p.char.xp = 1234);
      sim.beginTribulation(p, DEF, false);
      const len = DEF.phases[k]!.end - (DEF.phases[k - 1]?.end ?? 0);
      runSuy(sim, p, len - 0.5, false);
      expect(p.trib).toBeNull();
      expect(ended).toEqual([false]);
      expect(p.char.meta.suy ?? 0).toBe(k);
      expect(keys(p)).toContain('sys.suy_fail');
      expect(keys(p)).toContain('sys.suy_keep');
      // Ngũ Suy không phạt tu vi, không thưởng gì khi thất bại.
      expect(p.char.xp).toBe(xp);
      expect(ledger(p)).toHaveLength(0);
    });
  }
});

describe('thao tác đúng: qua đủ năm ải', () => {
  it('lưu từng ải, thưởng linh thạch một lần mỗi ải qua sổ cái, mở pháp tắc, không đổi cấp', () => {
    vi.spyOn(Math, 'random').mockImplementation(() => 0.37);
    const { sim, p, ended } = mk();
    const gold0 = p.char.gold;
    const mhp0 = p.char.mhp;
    const atk0 = p.char.atk;
    sim.beginTribulation(p, DEF, false);
    runSuy(sim, p, DEF.duration + 5, true);
    expect(p.trib).toBeNull();
    expect(ended).toEqual([true]);
    expect(p.char.meta.suy).toBe(N);
    expect(p.char.level).toBe(DEF.from);
    const total = DEF.stageGold!.reduce((a, b) => a + b, 0);
    expect(p.char.gold).toBe(gold0 + total);
    const rows = ledger(p);
    expect(rows.map((r) => r.delta)).toEqual(DEF.stageGold);
    expect(rows.map((r) => r.idem)).toEqual(DEF.stageGold!.map((_, i) => `suy:ngu_suy:${p.char.id}:${i + 1}`));
    expect(rows.every((r) => r.kind === 'gold')).toBe(true);
    expect(fxs('suyok').map((m) => m.n)).toEqual([0, 1, 2, 3, 4]);
    expect(fxs('ascend')).toHaveLength(1);
    // Pháp tắc sơ ngộ: chỉ số gốc cộng thêm đúng theo dữ liệu.
    expect(p.char.mhp).toBe(Math.round(mhp0 * (1 + DEF.law!.hp)));
    expect(p.char.atk).toBe(Math.round(atk0 * (1 + DEF.law!.atk)));
    expect(keys(p)).toContain('sys.suy_law');
  });

  it('đặt lại tiến độ rồi qua lại: không nhận thưởng lần hai (khóa chống trùng), tiến độ vẫn lên', () => {
    vi.spyOn(Math, 'random').mockImplementation(() => 0.61);
    const { sim, p } = mk();
    sim.beginTribulation(p, DEF, false);
    runSuy(sim, p, DEF.duration + 5, true);
    expect(p.char.meta.suy).toBe(N);
    const gold = p.char.gold;
    p.char.meta.suy = 0;
    sim.beginTribulation(p, DEF, false);
    runSuy(sim, p, DEF.duration + 5, true);
    expect(p.char.meta.suy).toBe(N);
    expect(p.char.gold).toBe(gold);
    expect(ledger(p)).toHaveLength(N);
  });

  it('không nhảy cóc, không lùi, không tính cho người không độ kiếp chuỗi', () => {
    const { sim, p, priv } = mk();
    priv.tribHub.suyCleared(p, 0);
    expect(p.char.meta.suy ?? 0).toBe(0);
    sim.beginTribulation(p, DEF, false);
    priv.tribHub.suyCleared(p, 3);
    priv.tribHub.suyCleared(p, N);
    priv.tribHub.suyCleared(p, -1);
    expect(p.char.meta.suy ?? 0).toBe(0);
    priv.tribHub.suyCleared(p, 0);
    priv.tribHub.suyCleared(p, 0);
    expect(p.char.meta.suy).toBe(1);
    expect(ledger(p)).toHaveLength(1);
  });
});

describe('Linh Lực Suy', () => {
  it('linh lực bị rút theo thanh; đứng trong Linh Nhãn thì thanh giảm', () => {
    vi.spyOn(Math, 'random').mockImplementation(() => 0.2);
    const { sim, p } = mk(0);
    sim.beginTribulation(p, DEF, false);
    runSuy(sim, p, DEF.phases[0]!.suy!.rest + 4, false);
    const st = suyState(p)!;
    expect(st.pg).toBeGreaterThan(DEF.phases[0]!.suy!.start);
    expect(p.char.mp).toBeLessThan(p.char.mmp);
    const high = st.pg;
    runSuy(sim, p, 3, true);
    expect(suyState(p)!.pg).toBeLessThan(high);
    expect(fxs('suymark').some((m) => m.s === 'nhan' && m.pg === 1)).toBe(true);
  });
});

describe('Nhục Thân Suy', () => {
  it('đón Tôi Thể Lôi: thanh giảm một mảng, đổi bằng khí huyết nhưng không chết', () => {
    vi.spyOn(Math, 'random').mockImplementation(() => 0.2);
    const { sim, p, priv } = mk(1);
    const cfg = DEF.phases[1]!.suy!;
    sim.beginTribulation(p, DEF, false);
    runSuy(sim, p, cfg.rest + 0.3, false);
    const st = suyState(p)!;
    expect(st.pend).toBeTruthy();
    const before = st.pg;
    p.move.x = st.pend!.x!;
    p.move.z = st.pend!.z!;
    let hpBefore = 0;
    for (let i = 0; i < cfg.the!.warn * 20 + 2; i++) {
      hpBefore = p.char.hp = p.char.mhp;
      priv.tickTribulation(p);
      sim.now += 50;
      if (fxs('suymark').some((m) => m.s === 'toi' && m.pg === 2)) break;
    }
    expect(suyState(p)!.pg).toBeLessThan(before);
    // Đổi bằng khí huyết: mất đúng phần `cost` (cộng tối đa một nhịp rỉ máu), không phải đòn chí mạng.
    const lost = hpBefore - p.char.hp;
    expect(lost).toBeGreaterThanOrEqual(Math.floor(p.char.mhp * cfg.the!.cost));
    expect(lost).toBeLessThanOrEqual(Math.ceil(p.char.mhp * (cfg.the!.cost + cfg.the!.bleed)));
    expect(p.trib).not.toBeNull();
    expect(fxs('suymark').some((m) => m.s === 'toi' && m.pg === 2)).toBe(true);
  });
});

describe('Thần Thức Suy', () => {
  const start = () => {
    vi.spyOn(Math, 'random').mockImplementation(() => 0.2);
    const h = mk(2);
    h.sim.beginTribulation(h.p, DEF, false);
    return h;
  };
  const cones = () =>
    sent
      .filter((x) => x.type === S.HAZARD)
      .map((x) => x.msg as HazardMsg)
      .filter((m) => m.sh === 'cone');

  it('lôi ẩn không được báo trước; ngưng thần mới gửi vạch các cung sắp nổ', () => {
    const { sim, p } = start();
    const t = DEF.phases[2]!.suy!.thuc!;
    runSuy(sim, p, DEF.phases[2]!.suy!.rest + 0.5, false);
    expect(suyState(p)!.pend).toBeTruthy();
    expect(cones()).toHaveLength(0);
    // Tin "đang tụ" không lộ cung nào nổ.
    const brew = fxs('suymark').filter((m) => m.s === 'thuc' && m.pg === 3);
    expect(brew).toHaveLength(1);
    expect(brew[0]!.n).toBeUndefined();
    sim.onTribSoul(p);
    expect(cones()).toHaveLength(t.sectors - t.safe);
    expect(fxs('suyreveal')).toHaveLength(1);
  });

  it('ngưng thần có hồi chiêu, dài dần theo thanh; người ngoài không ngưng thần hộ được', () => {
    const { sim, p, join } = start();
    const other = join('khach');
    const cfg = DEF.phases[2]!.suy!;
    runSuy(sim, p, cfg.rest + 0.5, false);
    sim.onTribSoul(other);
    expect(fxs('suyreveal')).toHaveLength(0);
    sim.onTribSoul(p);
    sim.onTribSoul(p);
    sim.onTribSoul(p);
    expect(fxs('suyreveal')).toHaveLength(1);
    const cd = fxs('suyreveal')[0]!.d!;
    expect(cd).toBeGreaterThan(cfg.thuc!.cd);
    expect(cd).toBeLessThan(cfg.thuc!.cdEnd);
  });

  it('trúng đợt lôi ẩn thì thanh tăng, đứng cung yên thì giảm', () => {
    const { sim, p } = start();
    const cfg = DEF.phases[2]!.suy!;
    runSuy(sim, p, cfg.rest + 0.5, false);
    const st = suyState(p)!;
    // Ra khỏi sân: luôn tính là trúng.
    p.move.x = st.x + cfg.thuc!.r + 5;
    const before = st.pg;
    runSuy(sim, p, cfg.thuc!.warn, false);
    expect(suyState(p)!.pg).toBeGreaterThan(before + cfg.thuc!.hurt - 1);
    const high = suyState(p)!.pg;
    runSuy(sim, p, cfg.thuc!.every, true);
    expect(suyState(p)!.pg).toBeLessThan(high);
  });
});

describe('Thọ Nguyên Suy', () => {
  it('suy phong thổi tắt đèn có báo trước; đứng cạnh đủ lâu mới thắp lại, rời ra là mất công', () => {
    vi.spyOn(Math, 'random').mockImplementation(() => 0.2);
    const { sim, p } = mk(3);
    const cfg = DEF.phases[3]!.suy!;
    const t = cfg.tho!;
    sim.beginTribulation(p, DEF, false);
    runSuy(sim, p, cfg.rest + t.warn + 0.3, false);
    const st = suyState(p)!;
    const off = st.lit!.findIndex((v) => !v);
    expect(off).toBeGreaterThanOrEqual(0);
    expect(fxs('suymark').some((m) => m.s === 'den' && m.n === off && m.pg === 2)).toBe(true);
    // Đi tới ngọn đã tắt, đứng chưa đủ `light` giây rồi rời đi: đèn vẫn tắt.
    const lamp = suyRingPos(st, t.ring, off, t.lamps);
    const dist = () => Math.hypot(p.move.x - lamp.x, p.move.z - lamp.z);
    for (let i = 0; i < 100 && dist() > t.r; i++) runSuy(sim, p, 0.05, true);
    expect(dist()).toBeLessThanOrEqual(t.r);
    runSuy(sim, p, t.light - 0.4, true);
    expect(suyState(p)!.lit![off]).toBe(false);
    expect(fxs('suymark').some((m) => m.s === 'den' && m.n === off && m.pg === 3)).toBe(true);
    p.move.x = st.x;
    p.move.z = st.z;
    runSuy(sim, p, 0.2, false);
    expect(suyState(p)!.lit![off]).toBe(false);
    // Quay lại đứng đủ lâu thì thắp được.
    p.move.x = lamp.x;
    p.move.z = lamp.z;
    runSuy(sim, p, t.light + 0.2, false);
    expect(suyState(p)!.lit![off]).toBe(true);
  });
});

describe('Đạo Tâm Suy', () => {
  it('lúc tĩnh ra tay thì thanh tăng, đúng nhịp phá vọng thì giảm (một lần mỗi nhịp); sát thương rỉ không tính', () => {
    vi.spyOn(Math, 'random').mockImplementation(() => 0.2);
    const { sim, p, priv } = mk(4);
    const cfg = DEF.phases[4]!.suy!;
    const t = cfg.tam!;
    sim.beginTribulation(p, DEF, false);
    runSuy(sim, p, cfg.rest + 1, false);
    const st = suyState(p)!;
    expect(st.mode).toBe(0);
    expect(sim.monsters.some((m) => m.owner === p.sid)).toBe(true);
    let pg = st.pg;
    priv.tribSys.noteHit(p, 'hit', true);
    expect(st.pg).toBe(pg);
    priv.tribSys.noteHit(p, 'hit');
    expect(st.pg).toBeCloseTo(pg + t.hitBad, 5);
    runSuy(sim, p, t.calm, false);
    expect(suyState(p)!.mode).toBe(1);
    pg = st.pg;
    priv.tribSys.noteHit(p, 'hit');
    expect(st.pg).toBeCloseTo(pg - t.hitGood, 5);
    priv.tribSys.noteHit(p, 'hit');
    expect(st.pg).toBeCloseTo(pg - t.hitGood, 5);
    priv.tribSys.noteHit(p, 'hurt');
    expect(st.pg).toBeCloseTo(pg - t.hitGood + t.hurt, 5);
  });

  it('phản đòn thụ động khi bị Tâm Ma Ảnh đánh không tính là ra tay lúc tĩnh', () => {
    vi.spyOn(Math, 'random').mockImplementation(() => 0.2);
    const { sim, p } = mk(4);
    const cfg = DEF.phases[4]!.suy!;
    sim.beginTribulation(p, DEF, false);
    runSuy(sim, p, cfg.rest + 1, false);
    const st = suyState(p)!;
    const sh = sim.monsters.find((m) => m.owner === p.sid)!;
    p.mth.reflectUntil = sim.now + 10_000;
    p.mth.reflectMul = 0.5;
    const pg = st.pg;
    const hp = sh.s.hp;
    sim.damagePlayer(p, 100, sh.id);
    expect(sh.s.hp).toBeLessThan(hp);
    expect(st.pg).toBeCloseTo(pg + cfg.tam!.hurt, 5);
  });

  it('hết kiếp hay thất bại đều dọn Tâm Ma Ảnh', () => {
    vi.spyOn(Math, 'random').mockImplementation(() => 0.2);
    const { sim, p } = mk(4);
    sim.beginTribulation(p, DEF, false);
    runSuy(sim, p, 40, false);
    expect(p.trib).toBeNull();
    expect(sim.monsters.filter((m) => m.owner === p.sid && m.s.hp > 0)).toHaveLength(0);
  });
});

describe('dư địa qua ải', () => {
  // Người chơi mẫu ĐI BỘ thật (6 m/s, chậm hơn chạy 7 m/s), không dịch chuyển tức thời: ải nào cũng phải qua được với thanh còn cách 100 một quãng,
  // để người thật (phản ứng chậm hơn, có lúc lỡ nhịp) vẫn có chỗ sai. Đổi số trong tribulations.json mà làm ải quá sát thì test này báo.
  for (let k = 0; k < N; k++) {
    it(`ải ${k + 1} (${DEF.phases[k]!.id}): sáu hạt giống, thanh cao nhất dưới 70`, () => {
      for (const seed of [1, 2, 3, 4, 5, 6]) {
        let a = seed * 7919;
        vi.spyOn(Math, 'random').mockImplementation(() => {
          a = (a * 1664525 + 1013904223) >>> 0;
          return a / 4294967296;
        });
        const { sim, p } = mk(k);
        sim.beginTribulation(p, DEF, false);
        let max = 0;
        for (let i = 0; i < 41 * 20 && p.trib && (p.trib.pi ?? k) <= k; i++) {
          runSuy(sim, p, 0.05, true);
          const st = suyState(p);
          if (st && (p.trib?.pi ?? -1) === k) max = Math.max(max, st.pg);
        }
        expect(p.char.meta.suy, `hạt giống ${seed}`).toBeGreaterThan(k);
        expect(max, `hạt giống ${seed}`).toBeLessThan(70);
        vi.restoreAllMocks();
      }
    });
  }
});
