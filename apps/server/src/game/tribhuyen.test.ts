import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  HK_MECHANICS,
  HOME_LEVEL,
  HUYEN_CHAINS,
  S,
  TRIB_DEFS,
  TRIB_LEVEL,
  chainCleared,
  chainDone,
  groundAt,
  huyenKiepCleared,
  huyenOriginTier,
  setChainCleared,
  tribForLevel,
  type FxMsg,
  type HazardMsg,
  type TribDef,
} from '@dtl/shared';
import { suyState } from './tribsuy.testutil';
import { runHk } from './tribhuyen.testutil';

// TN-6: Huyền Kiếp. Ba chuỗi × ba kiếp nhỏ `hk_*`; server quyết định, thưởng qua transaction + sổ cái có khóa chống trùng.
process.env.DB_FILE = ':memory:';
process.env.AUTH_DEV_BYPASS = '1';

/* eslint-disable @typescript-eslint/no-explicit-any */
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

const sent: { type: string; msg: unknown; to: string }[] = [];
let acc = 88000;
afterEach(() => {
  vi.restoreAllMocks();
  sent.length = 0;
});

const CHAINS: TribDef[] = HUYEN_CHAINS.map((id) => TRIB_DEFS[id]);
const ALL = CHAINS.flatMap((d) => d.phases.map((ph, k) => ({ d, k, ph })));

function mk(def: TribDef, cleared = 0, levelId: string = TRIB_LEVEL) {
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
  sim.now = 7_000_000;
  const char = Character.create(acc++, 'hk' + acc);
  char.level = def.from;
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
  if (cleared) setChainCleared(char.meta, def, cleared);
  return { sim, p, ended };
}

const seeded = (seed: number) => {
  let a = seed * 7919;
  vi.spyOn(Math, 'random').mockImplementation(() => {
    a = (a * 1664525 + 1013904223) >>> 0;
    return a / 4294967296;
  });
};
const marks = (s?: string) =>
  sent
    .filter((x) => x.type === S.FX)
    .map((x) => x.msg as FxMsg)
    .filter((m) => m.t === 'hkmark' && (!s || m.s === s));
const keys = (p: Ent) => sent.filter((s) => s.type === S.SYS && s.to === p.char.name).map((s) => (s.msg as { k: string }).k);
const ledger = (p: Ent) =>
  sqlite.prepare("SELECT kind, delta, idem FROM ledger WHERE char_id = ? AND reason = 'suy:stage' ORDER BY id").all(p.char.id) as {
    kind: string;
    delta: number;
    idem: string | null;
  }[];

describe('dữ liệu Huyền Kiếp', () => {
  it('ba chuỗi × ba kiếp, chín cơ chế riêng, chưa bật, không nằm trên đường đột phá theo cấp, nối Ngoại → Nội → Hồn', () => {
    expect(ALL.map((x) => x.ph.mechanic)).toEqual([...HK_MECHANICS]);
    for (const d of CHAINS) {
      expect(d.chain && !d.enabled && d.to === d.from).toBe(true);
      expect(d.stageGold).toHaveLength(3);
      expect(tribForLevel(d.from)).toBeNull();
    }
    expect(CHAINS.map((d) => d.after)).toEqual([undefined, 'huyen_ngoai', 'huyen_noi']);
  });

  it('tiến độ từng chuỗi tách riêng; bậc Bản Nguyên (móc cho TN-1) = số chuỗi đã qua đủ', () => {
    const meta: { suy?: number; chain?: Record<string, number> } = {};
    expect(huyenOriginTier(meta)).toBe(0);
    setChainCleared(meta, CHAINS[0]!, 3);
    setChainCleared(meta, CHAINS[1]!, 2);
    setChainCleared(meta, CHAINS[2]!, 99);
    expect(meta.suy).toBeUndefined();
    expect(CHAINS.map((d) => chainCleared(meta, d))).toEqual([3, 2, 3]);
    expect(huyenKiepCleared(meta)).toBe(8);
    expect(huyenOriginTier(meta)).toBe(2);
    expect(chainDone(meta, TRIB_DEFS.ngu_suy)).toBe(false);
  });
});

describe('vào kiếp', () => {
  it('chưa bật thì người chơi thường không vào được', () => {
    const a = mk(CHAINS[0]!, 0, HOME_LEVEL);
    a.sim.onBreakthrough(a.p, false, 'huyen_ngoai');
    expect(a.p.trib).toBeNull();
    expect(keys(a.p)).toContain('sys.trib_locked');
  });

  it('giả sử đã bật: chưa qua chuỗi trước thì bị chặn; GM (force) bỏ qua được điều kiện này', () => {
    const noi = CHAINS[1]!;
    const was = noi.enabled;
    (noi as { enabled: boolean }).enabled = true;
    try {
      const b = mk(noi, 0, HOME_LEVEL);
      b.sim.onBreakthrough(b.p, false, 'huyen_noi');
      expect(keys(b.p)).toContain('sys.hk_need_prev');
      expect(b.p.trib).toBeNull();
    } finally {
      (noi as { enabled: boolean }).enabled = was;
    }
  });

  it('đã qua đủ chuỗi thì không vào lại', () => {
    const { sim, p } = mk(CHAINS[2]!, 3, HOME_LEVEL);
    sim.onBreakthrough(p, true, 'huyen_hon');
    expect(p.trib).toBeNull();
    expect(keys(p)).toContain('sys.hk_done');
  });
});

describe('đứng yên không thao tác: kiếp nào cũng thất bại, không phạt, không thưởng', () => {
  for (const { d, k, ph } of ALL) {
    it(`${d.id} / ${ph.id}`, () => {
      seeded(3);
      const { sim, p, ended } = mk(d, k);
      p.char.xp = 777;
      sim.beginTribulation(p, d, false);
      runHk(sim, p, 34.5, false);
      expect(p.trib).toBeNull();
      expect(ended).toEqual([false]);
      expect(chainCleared(p.char.meta, d)).toBe(k);
      expect(keys(p)).toContain('sys.hk_fail');
      expect(p.char.xp).toBe(777);
      expect(ledger(p)).toHaveLength(0);
    });
  }
});

describe('thao tác đúng (đi bộ 6 m/s): kiếp nào cũng qua với dư địa', () => {
  for (const { d, k, ph } of ALL) {
    it(`${d.id} / ${ph.id}: sáu hạt giống, thanh cao nhất dưới 80`, () => {
      for (const seed of [1, 2, 3, 4, 5, 6]) {
        seeded(seed);
        const { sim, p } = mk(d, k);
        sim.beginTribulation(p, d, false);
        let max = 0;
        for (let i = 0; i < 36 * 20 && p.trib && (p.trib.pi ?? k) <= k; i++) {
          runHk(sim, p, 0.05, true);
          const st = suyState(p);
          if (st && (p.trib?.pi ?? -1) === k) max = Math.max(max, st.pg);
        }
        expect(chainCleared(p.char.meta, d), `hạt giống ${seed}`).toBeGreaterThan(k);
        expect(max, `hạt giống ${seed}`).toBeLessThan(80);
        vi.restoreAllMocks();
      }
    });
  }
});

describe('qua đủ một chuỗi', () => {
  it('lưu từng kiếp, thưởng một lần mỗi kiếp qua sổ cái, không đổi cấp; đặt lại tiến độ rồi qua lại không nhận lần hai', () => {
    seeded(5);
    const d = CHAINS[0]!;
    const { sim, p, ended } = mk(d);
    const gold0 = p.char.gold;
    const mhp0 = p.char.mhp;
    sim.beginTribulation(p, d, false);
    runHk(sim, p, d.duration + 5, true);
    expect(ended).toEqual([true]);
    expect(chainDone(p.char.meta, d)).toBe(true);
    expect(p.char.level).toBe(d.from);
    expect(p.char.mhp).toBe(mhp0);
    expect(p.char.gold).toBe(gold0 + d.stageGold!.reduce((a, b) => a + b, 0));
    expect(ledger(p).map((r) => [r.kind, r.delta, r.idem])).toEqual(
      d.stageGold!.map((g, i) => ['gold', g, `suy:${d.id}:${p.char.id}:${i + 1}`]),
    );
    expect(keys(p)).not.toContain('sys.suy_law');
    expect(huyenOriginTier(p.char.meta)).toBe(1);
    const gold = p.char.gold;
    setChainCleared(p.char.meta, d, 0);
    sim.beginTribulation(p, d, false);
    runHk(sim, p, d.duration + 5, true);
    expect(chainDone(p.char.meta, d)).toBe(true);
    expect(p.char.gold).toBe(gold);
    expect(ledger(p)).toHaveLength(3);
  });
});

describe('từng cơ chế', () => {
  const start = (id: string) => {
    seeded(2);
    const { d, k, ph } = ALL.find((x) => x.ph.mechanic === id)!;
    const h = mk(d, k);
    h.sim.beginTribulation(h.p, d, false);
    runHk(h.sim, h.p, ph.suy!.rest + 0.2, false);
    return { ...h, ph, hk: ph.hk!, st: () => suyState(h.p) as unknown as Record<string, any> };
  };

  it('Tuyết Kiếp: chạy thì thanh giảm, đứng lại thì tăng nhanh hơn mức tự tăng', () => {
    const { sim, p, st, ph, hk } = start('hk_tuyet');
    const a = st().pg;
    runHk(sim, p, 3, true);
    expect(st().pg).toBeLessThan(a);
    const b = st().pg;
    runHk(sim, p, 3, false);
    expect(st().pg).toBeGreaterThan(b + (ph.suy!.rise + hk.cold!) * 3 - 2);
  });

  it('Phong Kiếp: hướng gió được báo trước; đứng trước trụ thì trúng, nấp sau trụ theo chiều gió thì thanh giảm', () => {
    const { sim, p, st, hk } = start('hk_phong');
    const g = st().pend;
    expect(marks('phong').some((m) => m.pg === 2 && m.ox === g.dx && m.d === hk.warn)).toBe(true);
    const before = st().pg;
    p.move.x = st().x - g.dx * 2;
    p.move.z = st().z + hk.ring! - g.dz * 2;
    runHk(sim, p, hk.warn!, false);
    expect(st().pg).toBeGreaterThan(before + hk.hurt! - 1);
    expect(marks('phong').some((m) => m.pg === 4)).toBe(true);
    const high = st().pg;
    runHk(sim, p, hk.every!, true);
    expect(marks('phong').some((m) => m.pg === 3)).toBe(true);
    expect(st().pg).toBeLessThan(high);
  });

  it('Lôi Kiếp: chạm trụ nguội thì xả; trụ nóng không xả lại được và nổ có báo trước', () => {
    const { sim, p, st, hk } = start('hk_loi');
    p.move.x = st().x;
    p.move.z = st().z + hk.ring!;
    const before = st().pg;
    runHk(sim, p, 0.1, false);
    expect(st().pg).toBeLessThan(Math.max(3, before - hk.cure! + 2));
    const pg = st().pg;
    runHk(sim, p, 0.5, false);
    expect(st().pg).toBeGreaterThan(pg);
    runHk(sim, p, hk.boomWarn!, false);
    expect(marks('loi').some((m) => m.pg === 4 && m.n === 0)).toBe(true);
    expect(sent.some((x) => x.type === S.HAZARD && (x.msg as HazardMsg).kind === 'lightning' && (x.msg as HazardMsg).r === hk.boomR)).toBe(
      true,
    );
  });

  it('Trảm Ly Kiếp: ra khỏi vòng ấn thì thanh tăng nhanh; vạch chém có báo trước', () => {
    const { sim, p, st, hk } = start('hk_tram_ly');
    p.move.x = st().x + hk.r! + 4;
    const before = st().pg;
    runHk(sim, p, 2, false);
    expect(st().pg).toBeGreaterThan(before + hk.out! * 2 - 1);
    expect(sent.some((x) => x.type === S.HAZARD && (x.msg as HazardMsg).sh === 'rect' && (x.msg as HazardMsg).delay === hk.warn)).toBe(
      true,
    );
  });

  it('Huyết Ảnh Kiếp: hạ Huyết Ảnh thì thanh giảm và con kế tiếp hiện; hết kiếp dọn sạch', () => {
    const { sim, p, st, hk } = start('hk_huyet_anh');
    const sh = sim.monsters.find((m) => m.owner === p.sid && m.s.hp > 0)!;
    expect(sh.s.mhp).toBe(Math.round(p.char.mhp * hk.hpFrac!));
    const before = st().pg;
    (sim as unknown as { damageMonster(m: unknown, n: number, p: Ent): void }).damageMonster(sh, sh.s.hp, p);
    runHk(sim, p, 0.1, false);
    expect(st().pg).toBeLessThan(Math.max(3, before - hk.kill! + 2));
    runHk(sim, p, hk.respawn! + 0.2, false);
    expect(sim.monsters.some((m) => m.owner === p.sid && m.s.hp > 0)).toBe(true);
    runHk(sim, p, 40, false);
    expect(p.trib).toBeNull();
    expect(sim.monsters.filter((m) => m.owner === p.sid && m.s.hp > 0)).toHaveLength(0);
  });

  it('Vấn Tâm Kiếp: ấn thật sáng rồi đổi chỗ; đứng ở ấn cũ là sai', () => {
    const { sim, p, st, hk } = start('hk_van_tam');
    const r = st().pend;
    const shown = marks('van').find((m) => m.pg === 2)!;
    expect(shown.n).toBe(r.idx);
    p.move.x = shown.x!;
    p.move.z = shown.z!;
    const before = st().pg;
    runHk(sim, p, hk.show! + hk.think! + 0.1, false);
    expect(marks('van').some((m) => m.pg === 3 && m.n === r.shift)).toBe(true);
    expect(marks('van').some((m) => m.pg === 5)).toBe(true);
    expect(st().pg).toBeGreaterThan(before + hk.hurt! - 1);
  });

  it('Thập Tức Khô Thần: điều tức đúng nhịp thì giảm (một lần mỗi nhịp), bấm lệch nhịp thì tăng, bỏ nhịp thì tăng', () => {
    const { sim, p, st, hk } = start('hk_kho_than');
    const pg0 = st().pg;
    sim.onTribSoul(p);
    expect(st().pg).toBeCloseTo(pg0 + hk.hurt!, 1);
    sim.now = st().beatAt;
    const pg1 = st().pg;
    sim.onTribSoul(p);
    expect(st().pg).toBeCloseTo(pg1 - hk.cure!, 1);
    sim.onTribSoul(p);
    expect(st().pg).toBeCloseTo(pg1 - hk.cure! + hk.hurt!, 1);
    const beat = st().beat;
    runHk(sim, p, hk.every! * 2 + hk.win! + 0.2, false);
    expect(st().beat).toBeGreaterThan(beat + 1);
    expect(marks('tuc').some((m) => m.pg === 4)).toBe(true);
  });

  it('Hồn Thọ Kiếp: châu để lâu thì tan; chạm Hồn Châu thì thanh giảm', () => {
    const { sim, p, st, hk } = start('hk_hon_tho');
    const orb = st().orbs[0];
    expect(orb).toBeTruthy();
    runHk(sim, p, hk.life! + 0.2, false);
    expect(marks('chau').some((m) => m.pg === 0 && m.n === orb.n)).toBe(true);
    const o2 = st().orbs[0];
    const before = st().pg;
    p.move.x = o2.x;
    p.move.z = o2.z;
    runHk(sim, p, 0.1, false);
    expect(st().pg).toBeLessThan(before - hk.cure! + 2);
    expect(marks('chau').some((m) => m.pg === 2 && m.n === o2.n)).toBe(true);
  });

  it('Luân Hồi Kiếp: lần nghiền có báo trước; ngoài cung sinh thì trúng, sau mỗi lần nghiền đổi chiều xoay', () => {
    const { sim, p, st, hk } = start('hk_luan_hoi');
    const w0 = st().omega;
    runHk(sim, p, (st().grindAt - sim.now) / 1000 - 0.1, false);
    const a = st();
    const th = a.theta0 + a.omega * ((a.grindAt - a.t0) / 1000) + Math.PI;
    p.move.x = a.x + Math.sin(th) * 6;
    p.move.z = a.z + Math.cos(th) * 6;
    const before = a.pg;
    runHk(sim, p, 0.2, false);
    expect(marks('luan').some((m) => m.pg === 2 && m.d === hk.warn)).toBe(true);
    expect(marks('luan').some((m) => m.pg === 4)).toBe(true);
    expect(st().pg).toBeGreaterThan(before + hk.hurt! - 2);
    expect(st().omega).toBe(-w0);
  });
});
