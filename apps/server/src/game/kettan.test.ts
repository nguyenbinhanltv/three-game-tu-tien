import { beforeAll, describe, expect, it } from 'vitest';
import { groundAt, S, tribDef, xpNeed, type FxMsg, type HazardMsg } from '@dtl/shared';

// Đan Hỏa Kiếp (E2-D): cơ chế Đan Trận (`dan_tran`), vật phẩm Kết Đan Dịch, thất bại khi ngưng đan không đầy.
process.env.DB_FILE = ':memory:';

type Ent = import('./sim').PlayerEnt;
let GameSim: typeof import('./sim').GameSim;
let WorldState: typeof import('../state').WorldState;
let Character: typeof import('./character').Character;
let stepDanTran: typeof import('./tribmech').stepDanTran;
let NPC: typeof import('@dtl/content').NPC;

beforeAll(async () => {
  ({ GameSim } = await import('./sim'));
  ({ WorldState } = await import('../state'));
  ({ Character } = await import('./character'));
  ({ stepDanTran } = await import('./tribmech'));
  ({ NPC } = await import('@dtl/content'));
});

const X = 2040;
const Z = 2040;
let acc = 9500;
const ITEM = 'itm_ket_dan_dich';

function setup(withItem = true) {
  const sent: { type: string; msg: unknown }[] = [];
  const host = { broadcast: (type: string, msg: unknown) => sent.push({ type, msg }) };
  const sim = new GameSim(new WorldState(), host as never, { levelId: 'van_lam', roomName: 'test', spawn: { x: X, z: Z }, respawn: { x: X, z: Z }, persistPosition: false });
  const char = Character.create(acc++, 'kd' + acc);
  char.level = 19;
  char.bk = 19;
  char.xp = xpNeed(19);
  char.recalc();
  char.hp = char.mhp;
  char.mp = char.mmp;
  if (withItem) char.tx('test', null, (d) => d.add(ITEM, 1));
  const p = sim.addPlayer({ sessionId: 'c' + acc, send: () => undefined } as never, char, true, 'c' + acc);
  p.move.x = X;
  p.move.z = Z;
  p.move.y = groundAt(X, Z);
  sim.now = 1_000_000;
  const priv = sim as unknown as { tickTribulation(p: Ent): void };
  const count = () => char.inv.reduce((s, it) => s + (it?.id === ITEM ? it.n : 0), 0);
  /** Chạy kiếp tới giây `to`, mỗi nhịp 50 ms; `each` gọi trước mỗi nhịp với giây đã trôi. */
  const run = (to: number, each?: (t: number) => void) => {
    const def = tribDef('ket_dan');
    const start = sim.now - (def.duration * 1000 - (p.trib!.endAt - sim.now));
    while (p.trib && (sim.now - start) / 1000 < to) {
      each?.((sim.now - start) / 1000);
      if (!p.trib) break;
      priv.tickTribulation(p);
      sim.now += 50;
    }
  };
  const fx = (t: string) => sent.filter((x) => x.type === S.FX && (x.msg as FxMsg).t === t).map((x) => x.msg as FxMsg);
  const hazards = () => sent.filter((x) => x.type === S.HAZARD).map((x) => x.msg as HazardMsg);
  return { sim, p, char, count, run, fx, hazards };
}

describe('Đan Hỏa Kiếp: luật thuần', () => {
  it('đứng yên trong vòng thì đầy sau 20 s, ra khỏi vòng tụt 3%/s, đi lại trong vòng giữ nguyên', () => {
    let pg = 0;
    for (let i = 0; i < 400; i++) pg = stepDanTran(pg, 0.05, true, true, 20, 3);
    expect(pg).toBeCloseTo(100, 5);
    expect(stepDanTran(50, 1, false, true, 20, 3)).toBeCloseTo(47);
    expect(stepDanTran(50, 1, true, false, 20, 3)).toBe(50);
    expect(stepDanTran(1, 5, false, true, 20, 3)).toBe(0);
  });
});

describe('Đan Hỏa Kiếp: vật phẩm và bắt đầu kiếp', () => {
  it('thiếu Kết Đan Dịch thì không độ kiếp được; có thì tiêu một viên khi bắt đầu', () => {
    const none = setup(false);
    none.sim.onBreakthrough(none.p);
    expect(none.p.trib).toBeNull();
    const t = setup();
    expect(t.count()).toBe(1);
    t.sim.onBreakthrough(t.p);
    expect(t.p.trib?.id).toBe('ket_dan');
    expect(t.count()).toBe(0);
  });

  it('bình cảnh Trúc Cơ 19 không còn bị chặn bởi peakGated (có thể độ kiếp khi đã vượt bình cảnh)', () => {
    const t = setup();
    t.char.bk = 0;
    t.sim.onBreakthrough(t.p);
    // Chưa vượt bình cảnh thì bị chặn vì bình cảnh, không phải vì "chưa mở".
    expect(t.p.trib).toBeNull();
  });
});

describe('Đan Hỏa Kiếp: Đan Trận', () => {
  it('đứng yên trong vòng suốt pha 2: thanh đầy, kiếp qua pha 3, không bị loại', () => {
    const t = setup();
    t.sim.onBreakthrough(t.p);
    t.run(41);
    expect(t.p.trib?.id).toBe('ket_dan');
    expect(t.fx('dantran').some((m) => m.r === 4 && m.x === X)).toBe(true);
    const last = t.fx('dantran').filter((m) => m.pg !== undefined && m.pg >= 0).pop();
    expect(last?.pg).toBe(100);
    expect(t.fx('dantran').some((m) => m.pg === -1)).toBe(true);
    // Có tia quét 18×3 m đi qua vòng.
    expect(t.hazards().some((h) => h.sh === 'rect' && h.r === 18 && h.w === 3)).toBe(true);
    // Pha 3 có tia khóa mệnh nhuốm lửa.
    t.run(44);
    expect(t.hazards().some((h) => h.big && h.hot)).toBe(true);
  });

  it('bỏ vòng chạy đi: ngưng đan không đầy, hết pha 2 kiếp thất bại, mất 15% tu vi, hoàn Kết Đan Dịch (trụ quá nửa)', () => {
    const t = setup();
    const xp0 = t.char.xp;
    t.sim.onBreakthrough(t.p);
    t.run(40.5, (s) => {
      t.p.move.x = s > 12.5 ? X + 30 : X;
    });
    expect(t.p.trib).toBeNull();
    expect(t.char.level).toBe(19);
    expect(t.char.xp).toBeLessThan(xp0);
    expect(t.count()).toBe(1);
  });

  it('thanh đầy rồi ra khỏi vòng thì tụt dưới 100 và hết pha vẫn thất bại', () => {
    const t = setup();
    t.sim.onBreakthrough(t.p);
    // Đứng yên 12–32 s (20 s) rồi bỏ đi 8 s: thanh tụt (−24%), hết pha < 100 → thất bại.
    t.run(40.5, (s) => {
      t.p.move.x = s > 32 ? X + 30 : X;
    });
    expect(t.p.trib).toBeNull();
  });

  it('thành công đưa lên Kết Đan sơ kỳ (cấp 20) và phát ascend', () => {
    const t = setup();
    t.sim.onBreakthrough(t.p);
    t.run(56);
    expect(t.p.trib).toBeNull();
    expect(t.char.level).toBe(20);
    expect(t.fx('ascend').length).toBe(1);
  });
});

describe('q2_ket_dan: không hoàn thành ngay lúc nhận', () => {
  it('nhận ở cấp 19 thì tiến độ 0; độ kiếp Kết Đan xong mới 1/1 (Trúc Cơ không tính)', () => {
    const t = setup();
    t.char.quests.done.push('q_truc_co');
    const npc = NPC.get('npc_chuong_mon')!;
    t.p.move.x = npc.x;
    t.p.move.z = npc.z;
    t.sim.onQuest(t.p, { a: 'accept', id: 'q2_ket_dan' });
    expect(t.char.quests.active.q2_ket_dan).toEqual([0]);
    expect(t.char.questComplete('q2_ket_dan')).toBe(false);
    // Kiếp Trúc Cơ (id khác) không tính cho nhiệm vụ này.
    t.char.questEvent('breakthrough', 'truc_co', 1);
    expect(t.char.quests.active.q2_ket_dan).toEqual([0]);
    t.p.move.x = X;
    t.p.move.z = Z;
    t.sim.onBreakthrough(t.p);
    t.run(56);
    expect(t.char.level).toBe(20);
    expect(t.char.quests.active.q2_ket_dan).toEqual([1]);
    expect(t.char.questComplete('q2_ket_dan')).toBe(true);
  });

  it('nhận khi đã Kết Đan rồi thì tính xong luôn (không kẹt); q_truc_co vẫn dùng mốc Trúc Cơ', () => {
    const t = setup(false);
    t.char.level = 20;
    t.char.recalc();
    t.char.quests.done.push('q_truc_co');
    const npc = NPC.get('npc_chuong_mon')!;
    t.p.move.x = npc.x;
    t.p.move.z = npc.z;
    t.sim.onQuest(t.p, { a: 'accept', id: 'q2_ket_dan' });
    expect(t.char.quests.active.q2_ket_dan).toEqual([1]);
    const u = setup(false);
    u.char.level = 16;
    u.char.recalc();
    u.char.quests.done.push('q_han_giao');
    u.p.move.x = npc.x;
    u.p.move.z = npc.z;
    u.sim.onQuest(u.p, { a: 'accept', id: 'q_truc_co' });
    expect(u.char.quests.active.q_truc_co).toEqual([1]);
  });
});
