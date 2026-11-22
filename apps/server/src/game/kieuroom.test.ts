import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { KIEU_BOSS_ID, MS_DEAD, PF_DEAD, S, TRIB_DEFS, groundAt, kieuMinClearSec, tribDef, type TransferMsg } from '@dtl/shared';

// TN-7: phòng cầu Cửu Kiều (cầu 1 Thạch, cầu 2 Kiếm Ảnh). Vé kiểm lại ở onAuth, đóng góp do server đếm, cầu chỉ ghi khi server thấy điều kiện qua.
process.env.DB_FILE = ':memory:';
process.env.AUTH_DEV_BYPASS = '1';

type Ent = import('./sim').PlayerEnt;
type Rooms = typeof import('../rooms');
let GameSim: typeof import('./sim').GameSim;
let WorldState: typeof import('../state').WorldState;
let Character: typeof import('./character').Character;
let rooms: Rooms;
let transfer: typeof import('../transfer');
let content: typeof import('@dtl/content');

beforeAll(async () => {
  ({ GameSim } = await import('./sim'));
  ({ WorldState } = await import('../state'));
  ({ Character } = await import('./character'));
  rooms = await import('../rooms');
  transfer = await import('../transfer');
  content = await import('@dtl/content');
});

afterEach(() => {
  vi.restoreAllMocks();
  transfer.tickets.clear();
  sent.length = 0;
});

interface Sent {
  type: string;
  msg: unknown;
  to: string;
}
const sent: Sent[] = [];
let acc = 58000;
const keys = (p: Ent) => sent.filter((s) => s.type === S.SYS && s.to === p.char.name).map((s) => (s.msg as { k: string }).k);

function mkChar(name: string, level: number, kieu = 0) {
  const char = Character.create(acc++, name + acc);
  char.level = level;
  char.bk = level;
  char.meta.kieu = kieu;
  char.xp = 0;
  char.recalc();
  char.hp = char.mhp;
  char.mp = char.mmp;
  char.save();
  return char;
}

type TestRoom = InstanceType<Rooms['GameRoom']> & {
  director(): void;
  wave: number;
  nextWaveAt: number;
  clearedAt: number;
  onPlayerHitMonster(p: Ent, m: import('./sim').MonEnt): void;
  bridge: { begin(): void; contributed: Set<number>; finish(): number; startedAt: number; tick(): void };
};

async function mkRoom(levelId: string, cls: { prototype: object } = rooms.defineDungeon(levelId)) {
  const { Aoi } = await import('../aoi');
  const room = Object.create(cls.prototype) as Record<string, unknown> & { sim: InstanceType<typeof GameSim> };
  const lv = content.LEVELS[levelId]!;
  const spawn = lv.dungeon?.spawn ?? lv.spawn!;
  room.broadcast = (type: string, msg: unknown) => sent.push({ type, msg, to: '*' });
  room.sim = new GameSim(new WorldState(), room as never, {
    levelId,
    roomName: levelId,
    spawn,
    respawn: spawn,
    persistPosition: !lv.dungeon,
  });
  room.aoi = new Aoi(room.sim);
  room.clients = { getById: () => undefined };
  room.markers = { drop() {}, sync() {} };
  room.clock = { setTimeout: () => undefined, setInterval: () => undefined };
  Object.defineProperty(room, 'roomName', { value: levelId });
  room.lock = () => undefined;
  Object.assign(room, { wave: 0, nextWaveAt: 0, clearedAt: 0, revives: new Map() });
  const join = (char: InstanceType<typeof Character>): Ent => {
    const c = { sessionId: 'sid' + acc++, send: (type: string, msg: unknown) => sent.push({ type, msg, to: char.name }) };
    (room as unknown as { onJoin(c: unknown, o: unknown, a: unknown): void }).onJoin(
      c,
      {},
      { accountId: 1, dev: true, charId: char.id, session: 's', ticket: true },
    );
    const p = [...room.sim.players.values()].find((q) => q.char.id === char.id)!;
    // onJoin nạp lại nhân vật từ DB: đặt lại cấp và tiến độ như lúc tạo.
    p.char.level = char.level;
    p.char.bk = char.bk;
    p.char.meta.kieu = char.meta.kieu;
    p.char.recalc();
    p.char.hp = p.char.mhp;
    return p;
  };
  return { room: room as unknown as TestRoom, sim: room.sim, join };
}

describe('dữ liệu phòng cầu', () => {
  it('cầu 1 có 3 đợt (đợt cuối Kiều Thủ), cầu 2 một đợt Kiếm Ảnh; vào bằng vé, không có cổng thế giới', () => {
    const k1 = content.LEVELS.kieu_1!.dungeon!;
    expect(k1.waves).toHaveLength(3);
    expect(k1.waves[2]!.mons[0]!.id).toBe('boss_kieu_thu');
    expect(k1.private).toBe(true);
    expect(k1.returnLevel).toBe('cuu_kieu');
    const k2 = content.LEVELS.kieu_2!.dungeon!;
    expect(k2.waves).toHaveLength(1);
    expect(k2.waves[0]!.shadow?.hpMul).toBe(2.5);
    expect(content.LEVELS.cuu_kieu!.portals ?? []).toHaveLength(0);
    expect(rooms.roomNameOf('kieu_2')).toBe('dungeon-kieu_2');
  });
});

describe('onAuth phòng cầu: kiểm lại điều kiện vào', () => {
  const Dg = (n: number) => rooms.defineDungeon(`kieu_${n}`) as unknown as { onAuth(t: string, o: unknown): Promise<{ charId: number }> };
  const Home = () => rooms.WorldRoom as unknown as { onAuth(t: string, o: unknown): Promise<{ charId: number }> };

  async function prep(dev: string, level: number, kieu: number) {
    const a = await Home().onAuth('', { dev });
    const c = Character.load(a.charId);
    c.level = level;
    c.meta.kieu = kieu;
    c.recalc();
    c.save();
    return a.charId;
  }

  it('đủ cấp và đúng cầu kế tiếp thì vào; vé một lần', async () => {
    const id = await prep('kauth1', 44, 0);
    transfer.tickets.issue(id, 'kieu_1', null, undefined, 'k');
    await expect(Dg(1).onAuth('', { dev: 'kauth1', dgKey: 'k' })).resolves.toMatchObject({ charId: id });
    await expect(Dg(1).onAuth('', { dev: 'kauth1', dgKey: 'k' })).rejects.toThrow(/no_ticket/);
  });

  it('vé có sẵn nhưng nhảy cầu hoặc thiếu cấp thì bị từ chối ở onAuth (vé không bị đốt)', async () => {
    const skip = await prep('kauth2', 46, 0); // chưa qua cầu 1 mà cầm vé cầu 2
    transfer.tickets.issue(skip, 'kieu_2', null, undefined, 'k');
    await expect(Dg(2).onAuth('', { dev: 'kauth2', dgKey: 'k' })).rejects.toThrow(/no_ticket/);
    expect(transfer.tickets.has(skip, 'kieu_2')).toBe(true);
    const low = await prep('kauth3', 43, 0);
    transfer.tickets.issue(low, 'kieu_1', null, undefined, 'k');
    await expect(Dg(1).onAuth('', { dev: 'kauth3', dgKey: 'k' })).rejects.toThrow(/no_ticket/);
  });

  it('luyện lại cầu đã qua vẫn vào được', async () => {
    const id = await prep('kauth4', 45, 3);
    transfer.tickets.issue(id, 'kieu_2', null, undefined, 'k');
    await expect(Dg(2).onAuth('', { dev: 'kauth4', dgKey: 'k' })).resolves.toMatchObject({ charId: id });
  });
});

describe('qua cầu 1: server thấy hạ hết quái', () => {
  /** Chạy director tới hết đợt (giả lập thời gian); quái chết ngay sau khi sinh, `hitters` đã ra đòn lên chúng. */
  function runClear(hitters: Ent[], waitMs: number, r: Awaited<ReturnType<typeof mkRoom>>) {
    let now = 30_000_000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    r.room.bridge.startedAt = 0; // đồng hồ giả bắt đầu từ đây (lúc vào room dùng đồng hồ thật)
    const d = content.LEVELS.kieu_1!.dungeon!;
    r.room.nextWaveAt = now + 1;
    for (let i = 0; i < d.waves.length; i++) {
      now += 8100;
      r.room.director(); // sinh đợt i
      for (const m of r.sim.monsters) {
        for (const h of hitters) r.room.onPlayerHitMonster(h, m);
        m.state = MS_DEAD;
      }
      now += waitMs;
      r.room.director(); // hẹn đợt sau
    }
    now += 8100;
    r.room.director(); // hết đợt: ghi cầu
  }

  it('người đã đánh quái thì cầu được ghi; người đứng nhìn (không đóng góp) không được ghi', async () => {
    const r = await mkRoom('kieu_1');
    const a = r.join(mkChar('kra', 44));
    const b = r.join(mkChar('krb', 44));
    runClear([a], 20_000, r);
    expect(r.room.clearedAt).toBeGreaterThan(0);
    expect(a.char.meta.kieu).toBe(1);
    expect(keys(a)).toContain('sys.kieu_clear');
    expect(b.char.meta.kieu).toBe(0); // treo máy mang theo: không ghi
    expect(keys(b)).not.toContain('sys.kieu_clear');
  });

  it('qua nhanh hơn thời gian tối thiểu: không ghi', async () => {
    const r = await mkRoom('kieu_1');
    const p = r.join(mkChar('krd', 44));
    r.room.bridge.contributed.add(p.char.id);
    r.room.bridge.begin();
    r.room.bridge.startedAt -= (kieuMinClearSec(1) - 5) * 1000;
    r.room.bridge.finish();
    expect(p.char.meta.kieu).toBe(0);
  });

  it('luyện lại (đã qua cầu 1): không thưởng, không rơi đồ, tiến độ giữ nguyên', async () => {
    const r = await mkRoom('kieu_1');
    const p = r.join(mkChar('kre', 45, 2));
    expect(p.noLoot).toBe(true);
    const gold = p.char.gold;
    runClear([p], 20_000, r);
    expect(p.char.meta.kieu).toBe(2);
    expect(p.char.gold).toBe(gold);
  });
});

describe('cầu 2: Kiếm Ảnh', () => {
  it('chủ bóng rời room giữa đợt: bóng mồ côi bị gỡ, người còn lại hạ bóng của mình thì phòng ghi cầu', async () => {
    const r = await mkRoom('kieu_2');
    const a = r.join(mkChar('kla', 44, 1));
    const b = r.join(mkChar('klb', 44, 1));
    let now = 50_000_000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    r.room.bridge.startedAt = 0;
    r.room.nextWaveAt = now + 1;
    now += 10_000;
    r.room.director();
    const shadows = r.sim.monsters.filter((m) => m.state !== MS_DEAD);
    expect(shadows).toHaveLength(2);
    r.sim.removePlayer(a.sid); // A rớt mạng
    now += 1000;
    r.room.bridge.tick();
    const left = r.sim.monsters.filter((m) => m.state !== MS_DEAD);
    expect(left).toHaveLength(1);
    expect(left[0]!.owner).toBe(b.sid);
    now += 25_000;
    r.room.onPlayerHitMonster(b, left[0]!);
    left[0]!.state = MS_DEAD;
    r.room.director(); // hẹn
    now += 10_000;
    r.room.director(); // hết đợt
    expect(r.room.clearedAt).toBeGreaterThan(0);
    expect(b.char.meta.kieu).toBe(2);
  });

  it('mỗi người sống có một bóng riêng, bóng giáng vùng nổ xuống chỗ chủ; đợt chỉ xong khi hạ bóng', async () => {
    const r = await mkRoom('kieu_2');
    const a = r.join(mkChar('ksa', 44, 1));
    const b = r.join(mkChar('ksb', 44, 1));
    b.s.fl |= PF_DEAD; // người đang chết không có bóng
    let now = 40_000_000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    r.room.bridge.startedAt = 0;
    r.room.nextWaveAt = now + 1;
    now += 10_000;
    r.room.director();
    const shadows = r.sim.monsters.filter((m) => m.state !== MS_DEAD);
    expect(shadows).toHaveLength(1);
    expect(shadows[0]!.owner).toBe(a.sid);
    expect(shadows[0]!.s.mhp).toBe(Math.round(a.char.mhp * 2.5));
    expect(keys(a)).toContain('sys.kieu_shadow');
    // chưa hạ bóng thì chưa xong, dù qua bao lâu
    now += 100_000;
    r.room.director();
    expect(r.room.clearedAt).toBe(0);
    // bóng giáng vùng nổ xuống chỗ chủ
    const spy = vi.spyOn(r.sim, 'addHazard');
    now += 7000;
    r.room.bridge.tick();
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0]![0]).toMatchObject({ x: a.move.x, z: a.move.z });
    // hạ bóng: người đánh được ghi cầu 2
    r.room.onPlayerHitMonster(a, shadows[0]!);
    shadows[0]!.state = MS_DEAD;
    now += 10_000;
    r.room.director(); // hẹn
    now += 10_000;
    r.room.director(); // hết đợt
    expect(r.room.clearedAt).toBeGreaterThan(0);
    expect(a.char.meta.kieu).toBe(2);
    expect(b.char.meta.kieu).toBe(1);
  });
});

describe('cầu 3–6: dữ liệu', () => {
  it('cầu 3 là sân kiếp của Ngũ Suy; cầu 4 đố ba cột rồi ba Vệ Kiều; cầu 5 giáp phá có giờ; cầu 6 kháng nguồn ba hình thái', () => {
    expect(content.LEVELS.kieu_3!.tribulation).toBe(true);
    expect(TRIB_DEFS.ngu_suy.level).toBe('kieu_3');
    expect(rooms.roomNameOf('kieu_3')).toBe('tribulation-kieu_3');
    const k4 = content.LEVELS.kieu_4!.dungeon!;
    expect(k4.waves[0]!.puzzle!.points).toHaveLength(3);
    expect(k4.waves[1]!.mons).toEqual([{ id: 'boss_ve_kieu', level: 46, n: 3 }]);
    expect(content.MONSTER.get('boss_ve_kieu')!.ai!.faces).toBeTruthy();
    const k5 = content.LEVELS.kieu_5!.dungeon!;
    expect(k5.timeLimit).toBe(240);
    expect(content.MONSTER.get(k5.waves[0]!.mons[0]!.id)!.ai!.armor).toMatchObject({ cycle: 30, window: 8 });
    const dl = content.MONSTER.get('boss_dao_linh')!;
    expect(dl.ai!.resist!.forms).toHaveLength(dl.phases!.length + 1);
    expect(rooms.roomNameOf('kieu_6')).toBe('dungeon-kieu_6');
  });
});

describe('cầu 5: giới hạn thời gian', () => {
  it('hết 240 s mà chưa xong thì mọi người bị đưa về Kiều Đầu, không ghi cầu', async () => {
    const r = await mkRoom('kieu_5');
    const p = r.join(mkChar('k5a', 45, 4));
    const room = r.room as unknown as { checkTimeLimit(): void; clearedAt: number };
    room.checkTimeLimit();
    expect(room.clearedAt).toBe(0); // vừa vào
    r.room.bridge.startedAt = Date.now() - 239_000;
    room.checkTimeLimit();
    expect(room.clearedAt).toBe(0);
    r.room.bridge.startedAt = Date.now() - 241_000;
    room.checkTimeLimit();
    expect(room.clearedAt).toBeGreaterThan(0);
    expect(sent.some((m) => m.type === S.SYS && (m.msg as { k: string }).k === 'sys.kieu_timeout')).toBe(true);
    const x = sent.filter((m) => m.type === S.TRANSFER && m.to === p.char.name).map((m) => m.msg as TransferMsg);
    expect(x.at(-1)!.level).toBe('cuu_kieu');
    expect(p.char.meta.kieu).toBe(4);
  });
});

describe('cầu 3: Ngũ Suy trong sân kiếp', () => {
  const Tr = () => rooms.defineTribulation('kieu_3') as unknown as { onAuth(t: string, o: unknown): Promise<{ charId: number }> };
  const Home = () => rooms.WorldRoom as unknown as { onAuth(t: string, o: unknown): Promise<{ charId: number }> };

  async function prep(dev: string, level: number, kieu: number) {
    const a = await Home().onAuth('', { dev });
    const c = Character.load(a.charId);
    c.level = level;
    c.meta.kieu = kieu;
    c.recalc();
    c.save();
    return a.charId;
  }

  it('onAuth kiểm lại: đủ điều kiện mới vào; nhảy cầu hoặc thiếu cấp bị từ chối, vé không bị đốt', async () => {
    const ok = await prep('k3ok', 44, 2);
    transfer.tickets.issue(ok, 'kieu_3', null, { key: 'k', id: 'ngu_suy' });
    await expect(Tr().onAuth('', { dev: 'k3ok', tribRoom: 'k' })).resolves.toMatchObject({ charId: ok });
    const skip = await prep('k3skip', 46, 0);
    transfer.tickets.issue(skip, 'kieu_3', null, { key: 'k', id: 'ngu_suy' });
    await expect(Tr().onAuth('', { dev: 'k3skip', tribRoom: 'k' })).rejects.toThrow(/no_ticket/);
    expect(transfer.tickets.has(skip, 'kieu_3')).toBe(true);
    const low = await prep('k3low', 43, 2);
    transfer.tickets.issue(low, 'kieu_3', null, { key: 'k', id: 'ngu_suy' });
    await expect(Tr().onAuth('', { dev: 'k3low', tribRoom: 'k' })).rejects.toThrow(/no_ticket/);
  });

  /** Room kiếp dựng tay (không qua Colyseus) cho `kieu_3`; giờ vào và số ải đã qua đặt qua `kieuStart`. */
  async function trib(level: number, kieu: number, name: string) {
    const r = await mkRoom('kieu_3', rooms.defineTribulation('kieu_3'));
    const p = r.join(mkChar(name, level, kieu));
    const room = r.room as unknown as {
      kieuStart: Map<number, { stage: number; at: number }>;
      onTribulationEnd(p: Ent, def: ReturnType<typeof tribDef>, ok: boolean): void;
    };
    room.kieuStart ??= new Map();
    return { p, room };
  }

  it('chuỗi kiếp qua trọn vẹn thì ghi cầu 3, kiếp thất bại hoặc không phải chuỗi thì không', async () => {
    const def = tribDef('ngu_suy');
    const a = await trib(44, 2, 'k3a');
    a.room.kieuStart.set(a.p.char.id, { stage: 0, at: Date.now() - 200_000 });
    a.room.onTribulationEnd(a.p, def, false);
    expect(a.p.char.meta.kieu).toBe(2);
    a.room.kieuStart.set(a.p.char.id, { stage: 0, at: Date.now() - 200_000 });
    a.room.onTribulationEnd(a.p, tribDef('nguyen_anh'), true);
    expect(a.p.char.meta.kieu).toBe(2);
    a.room.kieuStart.set(a.p.char.id, { stage: 0, at: Date.now() - 200_000 });
    a.room.onTribulationEnd(a.p, def, true);
    expect(a.p.char.meta.kieu).toBe(3);
    expect(keys(a.p)).toContain('sys.kieu_clear');
  });

  it('qua thần tốc từ đầu (dưới giờ tối thiểu) không ghi; tiếp tục ải dở dang (đã qua vài ải) ghi dù ngắn', async () => {
    const def = tribDef('ngu_suy');
    const fast = await trib(44, 2, 'k3f');
    fast.room.kieuStart.set(fast.p.char.id, { stage: 0, at: Date.now() - 20_000 });
    fast.room.onTribulationEnd(fast.p, def, true);
    expect(fast.p.char.meta.kieu).toBe(2);
    const resume = await trib(44, 2, 'k3r');
    resume.room.kieuStart.set(resume.p.char.id, { stage: 3, at: Date.now() - 20_000 });
    resume.room.onTribulationEnd(resume.p, def, true);
    expect(resume.p.char.meta.kieu).toBe(3);
  });
});

describe('xin vé cầu kiếp chuỗi ở Dẫn Kiều Nhân', () => {
  it('cầu 3 cấp vé KIẾP có khóa phòng, chuyển sang room tribulation-kieu_3', async () => {
    const w = await mkRoom('cuu_kieu', rooms.defineWorld('cuu_kieu'));
    const npc = content.NPCS.find((n) => n.id === 'npc_dan_kieu_nhan')!;
    const p = w.join(mkChar('k3tick', 44, 2));
    p.move.x = npc.x;
    p.move.z = npc.z + 2;
    p.move.y = groundAt(p.move.x, p.move.z);
    (w.room as unknown as { onKieu(p: Ent, m: unknown): void }).onKieu(p, { n: 3 });
    const t = transfer.tickets.peek(p.char.id, 'kieu_3');
    expect(t?.trib?.id).toBe('ngu_suy');
    const x = sent.filter((m) => m.type === S.TRANSFER && m.to === p.char.name).map((m) => m.msg as TransferMsg);
    expect(x.at(-1)).toMatchObject({ room: 'tribulation-kieu_3', level: 'kieu_3' });
    expect(x.at(-1)!.options.tribRoom).toBe(t!.trib!.key);
  });
});

describe('cầu 4: ba cột công tắc rồi ba Vệ Kiều', () => {
  it('chạm đúng thứ tự thì boss yếu đi 10% và đợt sau sinh ba Vệ Kiều; hạ hết thì ghi cầu 4', async () => {
    const r = await mkRoom('kieu_4');
    const p = r.join(mkChar('k4a', 45, 3));
    const room = r.room as unknown as { puzzle: { active: boolean; order: number[]; tick(): void } | null };
    let now = 60_000_000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    r.room.bridge.startedAt = 0;
    r.room.nextWaveAt = now + 1;
    now += 10_000;
    r.room.director();
    const pz = room.puzzle!;
    expect(pz.active).toBe(true);
    const pts = content.LEVELS.kieu_4!.dungeon!.waves[0]!.puzzle!.points;
    for (const i of pz.order) {
      p.move.x = pts[i]!.x;
      p.move.z = pts[i]!.z;
      p.move.y = groundAt(p.move.x, p.move.z);
      now += 500;
      pz.tick();
    }
    expect(pz.active).toBe(false);
    expect(r.sim.bossDmgMul).toBeCloseTo(0.9);
    now += 10_000;
    r.room.director(); // hẹn đợt 2
    now += 10_000;
    r.room.director();
    const guards = r.sim.monsters.filter((m) => m.state !== MS_DEAD);
    expect(guards.map((m) => m.def.id)).toEqual(['boss_ve_kieu', 'boss_ve_kieu', 'boss_ve_kieu']);
    for (const g of guards) {
      r.room.onPlayerHitMonster(p, g);
      g.state = MS_DEAD;
    }
    now += 60_000;
    r.room.director();
    now += 10_000;
    r.room.director();
    expect(r.room.clearedAt).toBeGreaterThan(0);
    expect(p.char.meta.kieu).toBe(4);
  });
});

describe('cầu 7–9: Huyền Kiếp trong sân kiếp', () => {
  const CASES = [
    { n: 7, id: 'huyen_ngoai', level: 46, kieu: 6 },
    { n: 8, id: 'huyen_noi', level: 46, kieu: 7 },
    { n: 9, id: 'huyen_hon', level: 47, kieu: 8 },
  ] as const;

  it('mỗi chuỗi Huyền Kiếp gắn đúng level cầu; cầu là sân kiếp có room tribulation-kieu_n', () => {
    for (const c of CASES) {
      expect(tribDef(c.id).level).toBe(`kieu_${c.n}`);
      expect(content.LEVELS[`kieu_${c.n}`]!.tribulation).toBe(true);
      expect(rooms.roomNameOf(`kieu_${c.n}`)).toBe(`tribulation-kieu_${c.n}`);
    }
  });

  for (const c of CASES.filter((x) => x.n !== 9)) {
    it(`cầu ${c.n}: chuỗi ${c.id} qua trọn vẹn thì ghi cầu ${c.n}; kiếp thất bại thì không`, async () => {
      const r = await mkRoom(`kieu_${c.n}`, rooms.defineTribulation(`kieu_${c.n}`));
      const p = r.join(mkChar(`k${c.n}h`, c.level, c.kieu));
      const room = r.room as unknown as {
        kieuStart: Map<number, { stage: number; at: number }>;
        onTribulationEnd(p: Ent, def: ReturnType<typeof tribDef>, ok: boolean): void;
      };
      room.kieuStart ??= new Map();
      room.kieuStart.set(p.char.id, { stage: 0, at: Date.now() - 150_000 });
      room.onTribulationEnd(p, tribDef(c.id), false);
      expect(p.char.meta.kieu).toBe(c.kieu);
      room.kieuStart.set(p.char.id, { stage: 0, at: Date.now() - 150_000 });
      room.onTribulationEnd(p, tribDef(c.id), true);
      expect(p.char.meta.kieu).toBe(c.n);
    });
  }

  it('cầu 9: pha boss Lộ Linh (chỗ cắm) tiếp quản thì Hồn kiếp xong chưa ghi cầu', async () => {
    const r = await mkRoom('kieu_9', rooms.defineTribulation('kieu_9'));
    const p = r.join(mkChar('k9boss', 47, 8));
    const room = r.room as unknown as {
      kieuStart: Map<number, { stage: number; at: number }>;
      kieuBossPhase: (p: Ent, elapsedSec: number) => boolean;
      onTribulationEnd(p: Ent, def: ReturnType<typeof tribDef>, ok: boolean): void;
    };
    room.kieuStart ??= new Map();
    room.kieuStart.set(p.char.id, { stage: 0, at: Date.now() - 150_000 });
    const seen: [number, string][] = [];
    room.kieuBossPhase = (_p: Ent, elapsed: number) => (seen.push([elapsed, KIEU_BOSS_ID]), true);
    room.onTribulationEnd(p, tribDef('huyen_hon'), true);
    expect(p.char.meta.kieu).toBe(8);
    expect(seen).toHaveLength(1);
    expect(seen[0]![1]).toBe('boss_lo_linh');
  });

  it('cầu 9 thật: Hồn kiếp xong thì hiện Lộ Linh, chỉ ghi cầu khi server thấy boss gục; người đánh chết thì bỏ pha', async () => {
    const run = async (name: string, kill: (p: Ent, mon: { state: number }) => void) => {
      const r = await mkRoom('kieu_9', rooms.defineTribulation('kieu_9'));
      const p = r.join(mkChar(name, 47, 8));
      const room = r.room as unknown as {
        kieuStart: Map<number, { stage: number; at: number }>;
        kieuBoss: { mon: { state: number } } | null;
        tickKieuBoss(): boolean;
        onTribulationEnd(p: Ent, def: ReturnType<typeof tribDef>, ok: boolean): void;
      };
      room.kieuStart ??= new Map();
      room.kieuStart.set(p.char.id, { stage: 0, at: Date.now() - 200_000 });
      room.onTribulationEnd(p, tribDef('huyen_hon'), true);
      const mon = room.kieuBoss!.mon;
      expect(mon).toBeTruthy();
      expect(p.char.meta.kieu).toBe(8); // Hồn kiếp xong chưa ghi cầu
      expect(room.tickKieuBoss()).toBe(true); // boss còn sống: giữ phòng
      kill(p, mon);
      return { p, room };
    };
    const win = await run('k9win', (_p, mon) => {
      mon.state = MS_DEAD;
    });
    expect(win.room.tickKieuBoss()).toBe(false);
    expect(win.p.char.meta.kieu).toBe(9);
    const lose = await run('k9lose', (p) => {
      p.s.fl |= PF_DEAD;
    });
    expect(lose.room.tickKieuBoss()).toBe(false);
    expect(lose.p.char.meta.kieu).toBe(8);
  });

  it('cầu 9: boss gục quá nhanh bất thường thì không ghi nhưng báo người chơi (không im lặng)', async () => {
    const r = await mkRoom('kieu_9', rooms.defineTribulation('kieu_9'));
    const p = r.join(mkChar('k9fast', 47, 8));
    const room = r.room as unknown as {
      kieuStart: Map<number, { stage: number; at: number }>;
      kieuBoss: { mon: { state: number } } | null;
      tickKieuBoss(): boolean;
      onTribulationEnd(p: Ent, def: ReturnType<typeof tribDef>, ok: boolean): void;
    };
    room.kieuStart ??= new Map();
    room.kieuStart.set(p.char.id, { stage: 0, at: Date.now() - 10_000 });
    room.onTribulationEnd(p, tribDef('huyen_hon'), true);
    room.kieuBoss!.mon.state = MS_DEAD;
    room.tickKieuBoss();
    expect(p.char.meta.kieu).toBe(8);
    expect(keys(p)).toContain('sys.kieu_clear_fail');
  });
});
