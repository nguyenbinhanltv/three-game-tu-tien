import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { MS_DEAD, PF_DEAD, S, kieuMinClearSec } from '@dtl/shared';

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

async function mkRoom(levelId: string) {
  const { Aoi } = await import('../aoi');
  const cls = rooms.defineDungeon(levelId);
  const room = Object.create(cls.prototype) as Record<string, unknown> & { sim: InstanceType<typeof GameSim> };
  const spawn = content.LEVELS[levelId]!.dungeon!.spawn;
  room.broadcast = (type: string, msg: unknown) => sent.push({ type, msg, to: '*' });
  room.sim = new GameSim(new WorldState(), room as never, { levelId, roomName: levelId, spawn, respawn: spawn, persistPosition: false });
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
