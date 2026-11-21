import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  groundAt,
  HOME_LEVEL,
  PEAK_LEVELS,
  PF_DEAD,
  PF_TRIBULATION,
  ROOM_TRIBULATION,
  S,
  TRIB_DEFS,
  TRIB_IDS,
  TRIB_LEVEL,
  TRIB_PHASE_END,
  TRIBULATION_DURATION,
  tribDef,
  tribForLevel,
  tribGapAt,
  tribPhaseIndex,
  xpNeed,
  type FxMsg,
  type HazardMsg,
  type TransferMsg,
} from '@dtl/shared';

// E1-F: độ kiếp theo dữ liệu. Khung cho ba kiếp mới (pha chung lôi/hỏa/tâm ma, hộ pháp chắn, hook cơ chế), room độ kiếp riêng
// (vé có khóa, tổ đội cùng vào, về nơi cũ khi xong) và độ kiếp Trúc Cơ không đổi (bản chuẩn băm ở trib.golden.test.ts).
process.env.DB_FILE = ':memory:';
process.env.AUTH_DEV_BYPASS = '1';

type Ent = import('./sim').PlayerEnt;
type Rooms = typeof import('../rooms');
let GameSim: typeof import('./sim').GameSim;
let WorldState: typeof import('../state').WorldState;
let Character: typeof import('./character').Character;
let parties: typeof import('./party').parties;
let rooms: Rooms;
let transfer: typeof import('../transfer');
let content: typeof import('@dtl/content');
let mech: typeof import('./tribmech');

beforeAll(async () => {
  ({ GameSim } = await import('./sim'));
  ({ WorldState } = await import('../state'));
  ({ Character } = await import('./character'));
  ({ parties } = await import('./party'));
  rooms = await import('../rooms');
  transfer = await import('../transfer');
  content = await import('@dtl/content');
  mech = await import('./tribmech');
});

afterEach(() => {
  vi.restoreAllMocks();
  parties.reset();
  transfer.tickets.clear();
  transfer.tickets.now = Date.now;
  sent.length = 0;
});

interface Sent {
  type: string;
  msg: unknown;
  to: string;
}
const sent: Sent[] = [];
let acc = 41000;
const X = 2040;
const Z = 2040;

function mkChar(name: string, level: number, bk = level) {
  const char = Character.create(acc++, name + acc);
  char.level = level;
  char.bk = bk;
  char.xp = xpNeed(level);
  char.recalc();
  char.hp = char.mhp;
  char.mp = char.mmp;
  return char;
}

/** Sim độc lập (không Colyseus). `host` bổ sung hook độ kiếp. */
function mkSim(levelId = HOME_LEVEL, host: Record<string, unknown> = {}) {
  const lv = content.LEVELS[levelId];
  const spawn = lv.dungeon?.spawn ?? lv.spawn ?? { x: X, z: Z };
  const h = { broadcast: (type: string, msg: unknown) => sent.push({ type, msg, to: '*' }), ...host };
  const sim = new GameSim(new WorldState(), h as never, {
    levelId,
    roomName: levelId,
    spawn,
    respawn: spawn,
    persistPosition: !lv.dungeon,
  });
  const join = (name: string, level: number, bk = level): Ent => {
    const char = mkChar(name, level, bk);
    const p = sim.addPlayer(
      { sessionId: 'c' + acc++, send: (type: string, msg: unknown) => sent.push({ type, msg, to: char.name }) } as never,
      char,
      true,
      's' + acc,
    );
    p.move.x = X;
    p.move.z = Z;
    p.move.y = groundAt(X, Z);
    return p;
  };
  const priv = sim as unknown as { tickTribulation(p: Ent): void; tickHazards(): void };
  /** Chạy kiếp `secs` giây (bước 50 ms), hồi đầy máu nếu `heal`. */
  const run = (p: Ent, secs: number, heal = true) => {
    for (let i = 0; i < secs * 20 && p.trib; i++) {
      if (heal) {
        p.char.hp = p.char.mhp;
        p.s.hp = p.s.mhp;
      }
      priv.tickTribulation(p);
      priv.tickHazards();
      sim.now += 50;
    }
  };
  return { sim, join, run };
}

const hazards = () => sent.filter((x) => x.type === S.HAZARD).map((x) => x.msg as HazardMsg);
const fxs = () => sent.filter((x) => x.type === S.FX).map((x) => x.msg as FxMsg);
const keys = (p: Ent) => sent.filter((s) => s.type === S.SYS && s.to === p.char.name).map((s) => (s.msg as { k: string }).k);
const xfers = (p: Ent) => sent.filter((s) => s.type === S.TRANSFER && s.to === p.char.name).map((s) => s.msg as TransferMsg);

describe('dữ liệu tribulations.json', () => {
  it('tám kiếp mở ra từ tám đại viên mãn, pha liền mạch tới hết thời lượng', () => {
    // Kiếp chuỗi (Thiên Nhân Ngũ Suy TN-4, Huyền Kiếp TN-6) chưa gắn vào thang cấp: kiểm riêng ở tribsuy.test.ts / tribhuyen.test.ts.
    const ids = TRIB_IDS.filter((i) => !TRIB_DEFS[i].chain);
    expect(TRIB_IDS.filter((i) => TRIB_DEFS[i].chain)).toEqual(['ngu_suy', 'huyen_ngoai', 'huyen_noi', 'huyen_hon']);
    expect(ids.sort()).toEqual(['am_hu', 'anh_bien', 'duong_thuc', 'hoa_than', 'ket_dan', 'nguyen_anh', 'truc_co', 'van_dinh']);
    for (const level of PEAK_LEVELS) expect(tribForLevel(level)?.from).toBe(level);
    expect(tribForLevel(16)).toBeNull();
    for (const id of TRIB_IDS) {
      const d = TRIB_DEFS[id];
      if (!d.chain) expect(d.to).toBe(d.from + 1);
      expect(d.phases.at(-1)!.end).toBe(d.duration);
      for (let i = 1; i < d.phases.length; i++) expect(d.phases[i].end).toBeGreaterThan(d.phases[i - 1].end);
    }
    expect(ids.map((i) => TRIB_DEFS[i].duration).sort((a, b) => a - b)).toEqual([40, 55, 65, 80, 90, 100, 110, 120]);
    expect(TRIB_DEFS.nguyen_anh.room).toBe('tribulation');
    expect(TRIB_DEFS.hoa_than.room).toBe('tribulation');
    expect(TRIB_DEFS.ket_dan.room).toBe('world');
  });

  it('hằng số Trúc Cơ cũ là bí danh của dữ liệu; phase/gap tính theo dữ liệu', () => {
    const tc = tribDef('truc_co');
    expect(TRIBULATION_DURATION).toBe(tc.duration);
    expect([...TRIB_PHASE_END]).toEqual(tc.phases.map((p) => p.end));
    expect(tribPhaseIndex(tc, 0)).toBe(0);
    expect(tribPhaseIndex(tc, TRIB_PHASE_END[0])).toBe(1);
    expect(tribPhaseIndex(tc, 999)).toBe(2);
    // Nguyên Anh: nhịp lôi dày dần từ 2,2 xuống 1,2 giây qua pha 1
    const na = tribDef('nguyen_anh');
    expect(tribGapAt(na, 0, 0)).toBeCloseTo(2.2);
    expect(tribGapAt(na, 0, 9)).toBeCloseTo(1.7);
    expect(tribGapAt(na, 0, 18)).toBeCloseTo(1.2);
    expect(tribDef(undefined).id).toBe('truc_co');
  });
});

describe('độ kiếp Trúc Cơ qua onBreakthrough (không đổi)', () => {
  it('thiếu Trúc Cơ Đan thì không bắt đầu; đủ thì tiêu đan và bắt đầu ngay ở room thế giới', () => {
    const { sim, join } = mkSim();
    const p = join('tc', 15);
    sim.onBreakthrough(p);
    expect(p.trib).toBeNull();
    expect(keys(p)).toContain('sys.trib_need_pill');
    expect(p.char.tx('t', null, (d) => d.add('itm_truc_co_dan', 1))).toBe(true);
    sim.onBreakthrough(p);
    expect(p.trib?.id).toBe('truc_co');
    expect(p.char.inv.some((it) => it?.id === 'itm_truc_co_dan')).toBe(false);
    expect((p.s.fl & PF_TRIBULATION) !== 0).toBe(true);
    const start = fxs().find((f) => f.t === 'tribstart')!;
    expect(start.d).toBe(40);
    expect(start.tb).toBe('truc_co');
  });

  it('chạy hết 40 s thì lên Trúc Cơ sơ kỳ, thông báo mang tên đại cảnh giới đích', () => {
    const { sim, join, run } = mkSim();
    const p = join('tc2', 15);
    p.char.tx('t', null, (d) => d.add('itm_truc_co_dan', 1));
    sim.onBreakthrough(p);
    run(p, 41);
    expect(p.trib).toBeNull();
    expect(p.char.level).toBe(16);
    const ok = sent.find((s) => s.type === S.SYS && (s.msg as { k: string }).k === 'sys.trib_ok')!;
    expect((ok.msg as { p: { realm: string } }).p.realm).toBe('Trúc Cơ');
  });
});

describe('kiếp mới: cờ enabled, GM và pha chung', () => {
  it('Kết Đan mở cho người chơi nhưng cần Kết Đan Dịch (thiếu vật phẩm thì không độ); GM force bỏ qua', () => {
    const { sim, join } = mkSim();
    const p = join('kd', 19);
    sim.onBreakthrough(p);
    expect(p.trib).toBeNull();
    expect(keys(p)).toContain('sys.trib_need_pill');
    sim.onBreakthrough(p, true);
    expect(p.trib?.id).toBe('ket_dan');
  });

  it('bình cảnh cửa Kết Đan chưa vượt thì không độ kiếp (kể cả force)', () => {
    const { sim, join } = mkSim();
    const p = join('kdbk', 19, 17);
    sim.onBreakthrough(p, true);
    expect(p.trib).toBeNull();
    expect(keys(p)).toContain('sys.bk_blocked');
  });

  it('Kết Đan: 55 s, tia sét theo pha, bóng tâm ma tràn vào pha Ngưng đan (không quá maxAlive), tia cuối có hộ pháp', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const { sim, join, run } = mkSim();
    const p = join('kdrun', 19);
    sim.onBreakthrough(p, true);
    expect(fxs().find((f) => f.t === 'tribstart')?.d).toBe(55);
    run(p, 11);
    expect(sim.monsters.filter((m) => m.owner === p.sid).length).toBe(0);
    run(p, 6); // vào pha 2 (12–40 s), đợt đầu 3 bóng
    const alive = () => sim.monsters.filter((m) => m.owner === p.sid && m.state !== 4).length;
    expect(alive()).toBe(3);
    run(p, 8); // tới ~25 s: thêm đợt thứ hai (mỗi 7 s) nhưng tối đa 6
    expect(alive()).toBeLessThanOrEqual(6);
    expect(alive()).toBeGreaterThan(3);
    // pha 3: tia khóa mệnh r 9 m, báo 3 s
    const before = hazards().length;
    run(p, 31);
    const big = hazards()
      .slice(before)
      .filter((h) => h.big);
    expect(big.length).toBe(1);
    expect(big[0].r).toBe(9);
    expect(big[0].delay).toBe(3);
    expect(p.trib).toBeNull();
    expect(p.char.level).toBe(20);
  });

  it('hook cơ chế riêng: enter/tick/exit gọi đúng pha, đổi pha thì exit rồi enter', () => {
    const log: string[] = [];
    const real = new Map<string, boolean>();
    for (const id of ['dan_tran', 'tia_xich']) real.set(id, true);
    mech.registerMechanic('dan_tran', {
      enter: (c) => log.push('enter:' + c.phase.id),
      tick: (c) => {
        if (log.at(-1) !== 'tick') log.push('tick');
        expect(c.def.id).toBe('ket_dan');
      },
      exit: (c) => log.push('exit:' + c.phase.id),
    });
    const { sim, join, run } = mkSim();
    const p = join('hook', 19);
    sim.onBreakthrough(p, true);
    run(p, 45);
    expect(log).toEqual(['enter:ngung_dan', 'tick', 'exit:ngung_dan']);
  });

  it('Nguyên Anh pha Hỏa: ô lửa hình chữ nhật, ô người độ kiếp đứng luôn bị chọn, báo trước 1,5 s', () => {
    const { sim, join, run } = mkSim();
    const p = join('na', 23);
    sim.onBreakthrough(p, true); // room thế giới không có hook room riêng → bị từ chối
    expect(p.trib).toBeNull();
    // bắt đầu thẳng trong room này như ở sân độ kiếp
    expect(sim.beginTribulation(p, tribDef('nguyen_anh'), false)).toBe(true);
    run(p, 19);
    const before = hazards().length;
    run(p, 5);
    const fire = hazards()
      .slice(before)
      .filter((h) => h.kind === 'fire');
    expect(fire.length).toBeGreaterThanOrEqual(2);
    for (const h of fire) {
      expect(h.sh).toBe('rect');
      expect(h.r).toBe(7);
      expect(h.w).toBe(7);
    }
    expect(fire.some((h) => Math.abs(h.x - X) <= 3.5 && p.move.z >= h.z && p.move.z <= h.z + 7)).toBe(true);
    expect(fire.find((h) => h.delay === 1.5)).toBeDefined();
  });

  it('Nguyên Anh pha Tâm ma: đúng một Tâm Ma Ảnh (levelDelta +2), không thả lại', () => {
    const { sim, join, run } = mkSim();
    const p = join('na2', 23);
    sim.beginTribulation(p, tribDef('nguyen_anh'), false);
    run(p, 44);
    const shadows = sim.monsters.filter((m) => m.owner === p.sid);
    expect(shadows.length).toBe(1);
    expect(shadows[0].s.lv).toBe(25);
  });

  it('tia cuối Hóa Thần: hộ pháp trong 12 m chắn thay 25% (chia đều, tối đa 2), chủ kiếp chịu phần còn lại', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const { sim, join, run } = mkSim();
    const owner = join('ht', 27);
    const g1 = join('hp1', 27);
    const g2 = join('hp2', 27);
    const far = join('xa', 27);
    g1.move.x += 4;
    g2.move.z += 6;
    far.move.x += 40;
    const party = { members: [owner, g1, g2, far].map((m) => m.char.id), leader: owner.char.id };
    for (const m of [owner, g1, g2, far]) (parties as unknown as { byChar: Map<number, unknown> }).byChar.set(m.char.id, party);
    sim.beginTribulation(owner, tribDef('hoa_than'), false);
    for (const m of [owner, g1, g2, far]) {
      m.char.hp = m.char.mhp = 1_000_000;
      m.s.hp = m.s.mhp = 1_000_000;
    }
    // nhảy thẳng tới pha 3 (55 s)
    owner.trib!.endAt = sim.now + 25_000;
    owner.trib!.nextAt = sim.now + 60_000;
    run(owner, 0.1, false);
    const guards = [g1, g2, far];
    const hp0 = guards.map((g) => g.char.hp);
    const o0 = owner.char.hp;
    const lock = hazards().find((h) => h.big)!;
    expect(lock.r).toBe(11);
    expect(lock.delay).toBe(4);
    run(owner, 4.3, false);
    const lost = (g: Ent, i: number) => hp0[i] - g.char.hp;
    expect(lost(g1, 0)).toBeGreaterThan(0);
    expect(lost(g2, 1)).toBeGreaterThan(0);
    expect(lost(far, 2)).toBe(0);
    expect(lost(g1, 0)).toBeCloseTo(lost(g2, 1), 3);
    // tổng sát thương tia = 75% hp tối đa ± giảm; phần hộ pháp chắn = 25% của tổng
    const ownerLoss = o0 - owner.char.hp;
    const guardLoss = lost(g1, 0) + lost(g2, 1);
    expect(guardLoss / (guardLoss + ownerLoss)).toBeCloseTo(0.25, 1);
  });
});

describe('hộ pháp chỉ nhận đồng đội', () => {
  it('người lạ đứng trong tầm hộ pháp (12 m) nhưng ngoài vòng tia (11 m) không bị kéo vào; đồng đội thì chắn', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const { sim, join, run } = mkSim();
    const owner = join('ht2', 27);
    const mate = join('dd', 27);
    const stranger = join('la', 27);
    mate.move.x += 4;
    stranger.move.x += 11.6; // trong g.r = 12, ngoài r tia = 11
    const party = { members: [owner.char.id, mate.char.id], leader: owner.char.id };
    for (const m of [owner, mate]) (parties as unknown as { byChar: Map<number, unknown> }).byChar.set(m.char.id, party);
    sim.beginTribulation(owner, tribDef('hoa_than'), false);
    for (const m of [owner, mate, stranger]) {
      m.char.hp = m.char.mhp = 1_000_000;
      m.s.hp = m.s.mhp = 1_000_000;
    }
    owner.trib!.endAt = sim.now + 25_000;
    owner.trib!.nextAt = sim.now + 60_000;
    run(owner, 0.1, false);
    const hpM = mate.char.hp;
    const hpS = stranger.char.hp;
    run(owner, 4.3, false);
    expect(hpM - mate.char.hp).toBeGreaterThan(0);
    expect(hpS - stranger.char.hp).toBe(0);
  });

  it('người lạ đứng sát chủ kiếp (trong vòng tia) trúng đòn nhưng không chết: dừng ở 1 khí huyết (#107)', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const { sim, join, run } = mkSim();
    const owner = join('ht3', 27);
    const stranger = join('la2', 27);
    stranger.move.x += 3;
    sim.beginTribulation(owner, tribDef('hoa_than'), false);
    owner.char.hp = owner.char.mhp = 1_000_000;
    owner.s.hp = owner.s.mhp = 1_000_000;
    stranger.char.hp = stranger.s.hp = 200;
    owner.trib!.endAt = sim.now + 25_000;
    owner.trib!.nextAt = sim.now + 60_000;
    run(owner, 0.1, false);
    run(owner, 4.3, false);
    expect(stranger.char.hp).toBeGreaterThanOrEqual(1);
    expect(stranger.s.fl & PF_DEAD).toBe(0);
  });
});

describe('hằng số theo kiếp đọc từ dữ liệu', () => {
  it('giảm sát thương tia khóa mệnh (cut) lấy từ final của kiếp, không phải hằng Trúc Cơ', () => {
    const fin = TRIB_DEFS.hoa_than.phases[2].final!;
    const old = { ...fin };
    fin.defMul = 7;
    fin.defMaxCut = 0.33;
    try {
      const { sim, join, run } = mkSim();
      const p = join('cut', 27);
      sim.beginTribulation(p, tribDef('hoa_than'), false);
      p.trib!.endAt = sim.now + 25_000;
      p.trib!.nextAt = sim.now + 60_000;
      run(p, 0.1);
      const lock = (sim as unknown as { hazards: { lock?: boolean; cut?: { mul: number; max: number } }[] }).hazards.find((h) => h.lock)!;
      expect(lock.cut).toEqual({ mul: 7, max: 0.33 });
    } finally {
      Object.assign(fin, old);
    }
  });
});

describe('room độ kiếp riêng', () => {
  const Aoi = () => import('../aoi').then((m) => m.Aoi);

  /** Dựng room (không qua Colyseus) đủ để `onJoin`, `afterJoin`, `director`. */
  async function mkRoom(levelId: string, cls: { prototype: object }) {
    const room = Object.create(cls.prototype) as Record<string, unknown> & { sim: InstanceType<typeof GameSim> };
    const lv = content.LEVELS[levelId];
    const spawn = lv.dungeon?.spawn ?? lv.spawn ?? { x: X, z: Z };
    room.broadcast = (type: string, msg: unknown) => sent.push({ type, msg, to: '*' });
    room.sim = new GameSim(new WorldState(), room as never, {
      levelId,
      roomName: levelId,
      spawn,
      respawn: spawn,
      persistPosition: !lv.dungeon,
    });
    room.aoi = new (await Aoi())(room.sim);
    room.clients = { getById: () => undefined };
    room.markers = { drop() {}, sync() {} };
    const timers: (() => void)[] = [];
    room.clock = { setTimeout: (fn: () => void) => timers.push(fn), setInterval: () => undefined };
    Object.defineProperty(room, 'roomName', { value: levelId });
    Object.assign(room, { startedAny: false, startPending: 0, idleSince: 0, createdAt: Date.now(), sentBack: new Map() });
    const client = (name: string) => ({
      sessionId: 'sid' + acc++,
      send: (type: string, msg: unknown) => sent.push({ type, msg, to: name }),
    });
    const join = (char: InstanceType<typeof Character>, auth: Record<string, unknown> = {}): Ent => {
      const c = client(char.name);
      (room as unknown as { onJoin(c: unknown, o: unknown, a: unknown): void }).onJoin(
        c,
        {},
        { accountId: 1, dev: true, charId: char.id, session: 's', ticket: true, ...auth },
      );
      return [...room.sim.players.values()].find((p) => p.char.id === char.id)!;
    };
    const runTimers = () => timers.splice(0).forEach((f) => f());
    return {
      room: room as unknown as InstanceType<Rooms['GameRoom']> & { sim: InstanceType<typeof GameSim>; director(): void },
      sim: room.sim,
      join,
      runTimers,
    };
  }

  /** onJoin nạp lại nhân vật từ DB: đặt cấp/tu vi sau khi vào. */
  const prime = (p: Ent, level: number): Ent => {
    p.char.level = level;
    p.char.bk = level;
    p.char.xp = xpNeed(level);
    p.char.recalc();
    p.char.hp = p.char.mhp;
    return p;
  };

  const TribAuth = () =>
    rooms.TribulationRoom as unknown as {
      onAuth(t: string, o: unknown): Promise<{ charId: number; trib?: { key: string; id?: string }; spawn: unknown }>;
    };
  const Home = () => rooms.WorldRoom as unknown as { onAuth(t: string, o: unknown): Promise<{ charId: number }> };

  it('tên room và level: tribulation / do_kiep, không phải bí cảnh có đợt quái', () => {
    expect(rooms.roomNameOf(TRIB_LEVEL)).toBe(ROOM_TRIBULATION);
    expect(content.LEVELS[TRIB_LEVEL].tribulation).toBe(true);
    expect(content.LEVELS[TRIB_LEVEL].dungeon!.waves).toEqual([]);
  });

  it('onAuth: cần vé có khóa room; khóa sai hoặc không vé bị từ chối; vé dùng một lần', async () => {
    const a = await Home().onAuth('', { dev: 'tribauth' });
    await expect(TribAuth().onAuth('', { dev: 'tribauth', tribRoom: 'k1' })).rejects.toThrow(/no_ticket/);
    transfer.tickets.issue(a.charId, TRIB_LEVEL, null, { key: 'k1', id: 'nguyen_anh' });
    await expect(TribAuth().onAuth('', { dev: 'tribauth', tribRoom: 'k2' })).rejects.toThrow(/no_ticket/);
    transfer.tickets.issue(a.charId, TRIB_LEVEL, null, { key: 'k1', id: 'nguyen_anh' });
    await expect(TribAuth().onAuth('', { dev: 'tribauth' })).rejects.toThrow(/no_ticket/);
    transfer.tickets.issue(a.charId, TRIB_LEVEL, null, { key: 'k1', id: 'nguyen_anh' });
    const ok = await TribAuth().onAuth('', { dev: 'tribauth', tribRoom: 'k1' });
    expect(ok.trib).toEqual({ key: 'k1', id: 'nguyen_anh' });
    await expect(TribAuth().onAuth('', { dev: 'tribauth', tribRoom: 'k1' })).rejects.toThrow(/no_ticket/);
  });

  it('vé không khóa/không phải kiếp (vé level khác) không mở được sân độ kiếp', async () => {
    const a = await Home().onAuth('', { dev: 'tribauth2' });
    transfer.tickets.issue(a.charId, TRIB_LEVEL);
    await expect(TribAuth().onAuth('', { dev: 'tribauth2', tribRoom: 'k' })).rejects.toThrow(/no_ticket/);
  });

  it('từ room thế giới: cấp vé cho người độ kiếp (kèm id kiếp) và đồng đội trong tầm (không kèm); xa hoặc đang bận thì không', async () => {
    const w = await mkRoom(HOME_LEVEL, rooms.WorldRoom);
    const lead = prime(w.join(mkChar('nadan', 23), { ticket: false }), 23);
    const near = prime(w.join(mkChar('nagan', 20), { ticket: false }), 20);
    const far = prime(w.join(mkChar('naxa', 20), { ticket: false }), 20);
    const busy = prime(w.join(mkChar('naban', 20), { ticket: false }), 20);
    for (const m of [lead, near, far, busy]) {
      m.move.x = X;
      m.move.z = Z;
      m.move.y = groundAt(X, Z);
    }
    far.move.x += 100;
    busy.s.fl |= PF_DEAD;
    const party = { members: [lead, near, far, busy].map((m) => m.char.id), leader: lead.char.id };
    for (const m of [lead, near, far, busy]) (parties as unknown as { byChar: Map<number, unknown> }).byChar.set(m.char.id, party);
    w.sim.onBreakthrough(lead, true);
    // room thật dùng GameRoom.enterTribulationRoom
    expect(transfer.tickets.has(lead.char.id, TRIB_LEVEL)).toBe(true);
    expect(transfer.tickets.has(near.char.id, TRIB_LEVEL)).toBe(true);
    expect(transfer.tickets.has(far.char.id, TRIB_LEVEL)).toBe(false);
    expect(transfer.tickets.has(busy.char.id, TRIB_LEVEL)).toBe(false);
    const m = xfers(lead).at(-1)!;
    expect(m.room).toBe(ROOM_TRIBULATION);
    expect(m.level).toBe(TRIB_LEVEL);
    expect(typeof m.options.tribRoom).toBe('string');
    expect(xfers(near).at(-1)!.options.tribRoom).toBe(m.options.tribRoom);
    const lt = transfer.tickets.take(lead.char.id, TRIB_LEVEL)!;
    const nt = transfer.tickets.take(near.char.id, TRIB_LEVEL)!;
    expect(lt.trib).toEqual({ key: m.options.tribRoom, id: 'nguyen_anh' });
    expect(nt.trib).toEqual({ key: m.options.tribRoom });
    // người độ kiếp chưa bắt đầu kiếp ở room cũ (kiếp bắt đầu khi tới sân)
    expect(lead.trib).toBeNull();
  });

  it('một mình vẫn vào được; bị chặn khi đang niệm/chết (kể cả không force)', async () => {
    const w = await mkRoom(HOME_LEVEL, rooms.WorldRoom);
    const p = prime(w.join(mkChar('solo', 27), { ticket: false }), 27);
    w.sim.onBreakthrough(p, true);
    expect(transfer.tickets.has(p.char.id, TRIB_LEVEL)).toBe(true);
    transfer.tickets.clear();
    p.s.fl |= PF_DEAD;
    (w.room as unknown as { enterTribulationRoom(p: Ent, d: unknown, f: boolean): boolean }).enterTribulationRoom(
      p,
      tribDef('hoa_than'),
      false,
    );
    expect(transfer.tickets.has(p.char.id, TRIB_LEVEL)).toBe(false);
  });

  it('tới sân: người độ kiếp bắt đầu kiếp sau độ trễ, hộ pháp nhận lời nhắc; giữa chừng không chuyển được', async () => {
    const arena = await mkRoom(TRIB_LEVEL, rooms.TribulationRoom);
    const owner = arena.join(mkChar('chu', 23), { trib: { key: 'a', id: 'nguyen_anh' } });
    owner.char.tx('t', null, (d) => d.add('itm_nguyen_anh_dan', 1));
    const guard = arena.join(mkChar('hophap', 20), { trib: { key: 'a' } });
    expect(owner.trib).toBeNull();
    expect(keys(guard)).toContain('sys.trib_guard');
    arena.runTimers();
    expect(owner.trib?.id).toBe('nguyen_anh');
    expect(guard.trib).toBeNull();
    // sân độ kiếp đặt người ở điểm vào của `do_kiep`
    const d = content.LEVELS[TRIB_LEVEL].dungeon!;
    expect(Math.hypot(owner.move.x - d.spawn.x, owner.move.z - d.spawn.z)).toBeLessThan(1);
    // đang độ kiếp: không rời được bằng đường thường
    expect(arena.sim.leaveBlocker(owner)).toBe('sys.tele_busy');
  });

  it('kết thúc: sau thời gian nán lại, mọi người (cả hộ pháp, cả người chết) được cấp vé về Vân Lam kèm returnSpawn', async () => {
    const arena = await mkRoom(TRIB_LEVEL, rooms.TribulationRoom);
    const owner = arena.join(mkChar('chu2', 23), { trib: { key: 'b', id: 'nguyen_anh' } });
    owner.char.tx('t', null, (d) => d.add('itm_nguyen_anh_dan', 1));
    const guard = arena.join(mkChar('hophap2', 20), { trib: { key: 'b' } });
    arena.runTimers();
    expect(owner.trib).not.toBeNull();
    // người độ kiếp thất bại (chết): kiếp kết thúc, chủ và hộ pháp đều phải về
    owner.char.hp = 0;
    arena.sim.now += 1000;
    (arena.sim as unknown as { endTribulation(p: Ent, ok: boolean, silent: boolean): void }).endTribulation(owner, false, false);
    owner.s.fl |= PF_DEAD;
    const t = vi.spyOn(Date, 'now');
    let now = Date.now();
    t.mockImplementation(() => now);
    arena.room.director();
    expect(transfer.tickets.has(owner.char.id, HOME_LEVEL)).toBe(false);
    now += rooms.TribulationRoom.LINGER_MS + 100;
    arena.room.director();
    const d = content.LEVELS[TRIB_LEVEL].dungeon!;
    for (const p of [owner, guard]) {
      const back = transfer.tickets.take(p.char.id, d.returnLevel)!;
      expect(back.spawn).toEqual(d.returnSpawn);
      expect(xfers(p).at(-1)!.level).toBe(d.returnLevel);
      expect(xfers(p).at(-1)!.room).toBe('world');
    }
    expect((owner.s.fl & PF_DEAD) === 0).toBe(true);
  });

  it('chưa ai bắt đầu kiếp sau WAIT_MS (vé/vật phẩm hỏng): đưa mọi người về', async () => {
    const arena = await mkRoom(TRIB_LEVEL, rooms.TribulationRoom);
    const g = arena.join(mkChar('lac', 20), { trib: { key: 'c' } });
    const t = vi.spyOn(Date, 'now');
    let now = Date.now();
    t.mockImplementation(() => now);
    arena.room.director();
    expect(transfer.tickets.has(g.char.id, HOME_LEVEL)).toBe(false);
    now += rooms.TribulationRoom.WAIT_MS + 1;
    arena.room.director();
    expect(transfer.tickets.has(g.char.id, HOME_LEVEL)).toBe(true);
  });

  it('hộ pháp tới trước, người độ kiếp tới muộn sát WAIT_MS: không bị gửi về, kiếp vẫn bắt đầu; nếu đã bị gửi về thì hẹn giờ không tiêu vật phẩm', async () => {
    const orig = TRIB_DEFS.nguyen_anh.item;
    (TRIB_DEFS.nguyen_anh as { item: string | null }).item = 'itm_truc_co_dan';
    try {
      const arena = await mkRoom(TRIB_LEVEL, rooms.TribulationRoom);
      const t = vi.spyOn(Date, 'now');
      let now = Date.now();
      t.mockImplementation(() => now);
      Object.assign(arena.room, { createdAt: now });
      const g = arena.join(mkChar('somg', 20), { trib: { key: 'h' } });
      now += rooms.TribulationRoom.WAIT_MS - 1000;
      const owner = arena.join(mkChar('muon', 23), { trib: { key: 'h', id: 'nguyen_anh' } });
      owner.char.tx('t', null, (d) => d.add('itm_truc_co_dan', 1));
      // quá WAIT_MS trong lúc hẹn giờ bắt đầu còn chờ: không đóng phòng
      now += 2000;
      arena.room.director();
      expect(transfer.tickets.has(owner.char.id, HOME_LEVEL)).toBe(false);
      expect(transfer.tickets.has(g.char.id, HOME_LEVEL)).toBe(false);
      arena.runTimers();
      expect(owner.trib).not.toBeNull();
      // trường hợp đã bị gửi về trước khi hẹn giờ chạy: bỏ qua, giữ nguyên vật phẩm
      const arena2 = await mkRoom(TRIB_LEVEL, rooms.TribulationRoom);
      const o2 = arena2.join(mkChar('muon2', 23), { trib: { key: 'i', id: 'nguyen_anh' } });
      o2.char.tx('t', null, (d) => d.add('itm_truc_co_dan', 1));
      (arena2.room as unknown as { sentBack: Map<string, number> }).sentBack.set(o2.sid, now);
      arena2.runTimers();
      expect(o2.trib).toBeNull();
      expect(o2.char.inv.some((it) => it?.id === 'itm_truc_co_dan')).toBe(true);
    } finally {
      (TRIB_DEFS.nguyen_anh as { item: string | null }).item = orig;
    }
  });

  it('ngắt kết nối giữa kiếp: mất 15% tu vi (không hoàn), người khác vẫn về đúng lúc; vé còn hạn cho lần vào lại', async () => {
    const arena = await mkRoom(TRIB_LEVEL, rooms.TribulationRoom);
    const owner = arena.join(mkChar('mat', 23), { trib: { key: 'd', id: 'nguyen_anh' } });
    owner.char.tx('t', null, (d) => d.add('itm_nguyen_anh_dan', 1));
    const guard = arena.join(mkChar('o', 20), { trib: { key: 'd' } });
    arena.runTimers();
    expect(owner.trib).not.toBeNull();
    const xp0 = owner.char.xp;
    arena.sim.removePlayer(owner.sid);
    expect(owner.trib).toBeNull();
    expect(owner.char.xp).toBe(xp0 - Math.floor(xp0 * 0.15));
    const t = vi.spyOn(Date, 'now');
    let now = Date.now();
    t.mockImplementation(() => now);
    arena.room.director();
    now += rooms.TribulationRoom.LINGER_MS + 100;
    arena.room.director();
    expect(transfer.tickets.has(guard.char.id, HOME_LEVEL)).toBe(true);
    // người đã mất kết nối đăng nhập lại: bí cảnh/sân không giữ người, về returnLevel
    const reload = Character.load(owner.char.id);
    expect(arena.room.resumeTarget(reload)).toBeNull(); // chính sân không dẫn ai đi
    const home = await mkRoom(HOME_LEVEL, rooms.WorldRoom);
    expect(home.room.resumeTarget(reload)).toEqual({ level: HOME_LEVEL, spawn: content.LEVELS[TRIB_LEVEL].dungeon!.returnSpawn });
  });

  it('vật phẩm đột phá bị tiêu khi tới sân, không phải lúc rời; thiếu vật phẩm thì mọi người bị đưa về', async () => {
    const orig = TRIB_DEFS.nguyen_anh.item;
    (TRIB_DEFS.nguyen_anh as { item: string | null }).item = 'itm_truc_co_dan';
    try {
      const arena = await mkRoom(TRIB_LEVEL, rooms.TribulationRoom);
      const a = arena.join(mkChar('daydu', 23), { trib: { key: 'e', id: 'nguyen_anh' } });
      a.char.tx('t', null, (d) => d.add('itm_nguyen_anh_dan', 1));
      a.char.tx('t', null, (d) => d.add('itm_truc_co_dan', 1));
      arena.runTimers();
      expect(a.trib).not.toBeNull();
      expect(a.char.inv.some((it) => it?.id === 'itm_truc_co_dan')).toBe(false);
      const arena2 = await mkRoom(TRIB_LEVEL, rooms.TribulationRoom);
      const b = arena2.join(mkChar('thieu', 23), { trib: { key: 'f', id: 'nguyen_anh' } });
      arena2.runTimers();
      expect(b.trib).toBeNull();
      expect(keys(b)).toContain('sys.trib_need_pill');
      expect(transfer.tickets.has(b.char.id, HOME_LEVEL)).toBe(true);
    } finally {
      (TRIB_DEFS.nguyen_anh as { item: string | null }).item = orig;
    }
  });

  it('thành công trong sân: lên Nguyên Anh sơ kỳ (24)', async () => {
    const arena = await mkRoom(TRIB_LEVEL, rooms.TribulationRoom);
    const owner = arena.join(mkChar('thanh', 23), { trib: { key: 'g', id: 'nguyen_anh' } });
    owner.char.tx('t', null, (d) => d.add('itm_nguyen_anh_dan', 1));
    arena.runTimers();
    const sim = arena.sim as unknown as { tickTribulation(p: Ent): void; tickHazards(): void; now: number };
    for (let i = 0; i < 65 * 20 + 5 && owner.trib; i++) {
      owner.char.hp = owner.char.mhp;
      owner.s.hp = owner.s.mhp;
      sim.tickTribulation(owner);
      sim.tickHazards();
      sim.now += 50;
    }
    expect(owner.trib).toBeNull();
    expect(owner.char.level).toBe(24);
    expect(fxs().some((f) => f.t === 'ascend')).toBe(true);
  });
  it('Nhật Thực Kiếp: đồng đội cấp < 28 trong tầm hộ pháp không nhận vé (không bị đưa tới Bắc Hoang quá cấp), cấp >= 28 thì có', async () => {
    const level = 'do_kiep_bac_hoang';
    const w = await mkRoom('bac_hoang', rooms.WorldRoom);
    const lead = prime(w.join(mkChar('abchu', 31), { ticket: false }), 31);
    const high = prime(w.join(mkChar('abcao', 29), { ticket: false }), 29);
    const low = prime(w.join(mkChar('abthap', 27), { ticket: false }), 27);
    for (const m of [lead, high, low]) {
      m.move.x = X;
      m.move.z = Z;
      m.move.y = groundAt(X, Z);
    }
    const party = { members: [lead, high, low].map((m) => m.char.id), leader: lead.char.id };
    for (const m of [lead, high, low]) (parties as unknown as { byChar: Map<number, unknown> }).byChar.set(m.char.id, party);
    (w.room as unknown as { enterTribulationRoom(p: Ent, d: unknown, f: boolean): boolean }).enterTribulationRoom(
      lead,
      tribDef('anh_bien'),
      true,
    );
    expect(transfer.tickets.has(lead.char.id, level)).toBe(true);
    expect(transfer.tickets.has(high.char.id, level)).toBe(true);
    expect(transfer.tickets.has(low.char.id, level)).toBe(false);
    expect(xfers(low)).toHaveLength(0);
    expect(xfers(high).at(-1)!.room).toBe('tribulation-do_kiep_bac_hoang');
  });
});
