import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  groundAt,
  HOME_LEVEL,
  PF_DEAD,
  S,
  TELE_CAST_LEVEL_MS,
  TELE_CAST_MS,
  TELE_FREE,
  TELE_PAD,
  TELE_PADS,
  registerTerrain,
  type TelePad,
  type TerrainDef,
  type TransferMsg,
} from '@dtl/shared';

import { at } from '@dtl/shared';
// E1-B: room theo level, vé chuyển bản đồ một lần (hết hạn 15 s), chặn khi bận/giao chiến, Truyền Tống liên level hai chiều.
// Dùng một level thử nhỏ (`test_isle`) đăng ký ngay trong test: chưa có bản đồ thật (E2-A).
process.env.DB_FILE = ':memory:';
process.env.AUTH_DEV_BYPASS = '1';

type Ent = import('./sim').PlayerEnt;
type Rooms = typeof import('../rooms');
let GameSim: typeof import('./sim').GameSim;
let WorldState: typeof import('../state').WorldState;
let Character: typeof import('./character').Character;
let parties: typeof import('./party').parties;
let TeleportSystem: typeof import('./teleport').TeleportSystem;
let rooms: Rooms;
let transfer: typeof import('../transfer');
let LEVELS: typeof import('@dtl/content').LEVELS;
let db: typeof import('../db');

const ISLE_ID = 'test_isle';
const ISLE: TerrainDef = {
  id: ISLE_ID,
  seed: 777,
  size: 1024,
  margin: 8,
  natural: { freq: 0.002, baseOct: 3, ridgeOct: 2, level: 0, baseAmp: 0, ridgeAmp: 0, maskFreq: 0.001, maskOct: 1, maskLo: 0, maskHi: 1 },
  islands: [{ x: 300, z: 300, r: 120, edge: 20, y: 400 }],
  voidFloor: -200,
  features: [{ id: 'altar', x: 300, z: 300, y: 405, flatR: 40, outerR: 80, round: true }],
  play: { cx: 512, cz: 512, half: 400, wallH: 100 },
  biomes: [{ feature: 'altar', biome: 'sect', min: 0.5 }],
  colliders: [],
};
const ISLE_PAD: TelePad = { id: 'zt_hub', level: ISLE_ID, zone: '', x: 310, z: 310, face: { x: 300, z: 300 } };

beforeAll(async () => {
  ({ GameSim } = await import('./sim'));
  ({ WorldState } = await import('../state'));
  ({ Character } = await import('./character'));
  ({ parties } = await import('./party'));
  ({ TeleportSystem } = await import('./teleport'));
  rooms = await import('../rooms');
  transfer = await import('../transfer');
  ({ LEVELS } = await import('@dtl/content'));
  db = await import('../db');
  void db;
  registerTerrain(ISLE);
  LEVELS[ISLE_ID] = { id: ISLE_ID, spawns: [], nodes: [], spawn: { x: 300, z: 300 } };
  (TELE_PADS as TelePad[]).push(ISLE_PAD);
  TELE_PAD.set(ISLE_PAD.id, ISLE_PAD);
});

afterEach(() => {
  parties.reset();
  TeleportSystem.resetCooldowns();
  transfer.tickets.clear();
  transfer.tickets.now = Date.now;
});

interface Sent {
  type: string;
  msg: unknown;
  to: string;
}

let nextAcc = 20000;
const sent: Sent[] = [];

/** Một "room" dựng không qua Colyseus: đủ để gọi `requestLevel`, `prepareChar`, `onPortal` như thật. */
function mkRoom(levelId: string, cls: { prototype: object }) {
  const room = Object.create(cls.prototype) as InstanceType<Rooms['GameRoom']> & { sim: InstanceType<typeof GameSim> };
  const lv = at(LEVELS, levelId);
  const spawn = lv.dungeon?.spawn ?? lv.spawn ?? { x: 2048, z: 2088 };
  room.sim = new GameSim(new WorldState(), room as never, {
    levelId,
    roomName: levelId,
    spawn,
    respawn: spawn,
    persistPosition: !lv.dungeon,
  });
  const join = (name: string, level = 8, spawnAt: { x: number; z: number } | null = null): Ent => {
    const char = Character.create(nextAcc++, name + nextAcc);
    char.level = level;
    char.recalc();
    char.hp = char.mhp;
    return enter(char, spawnAt);
  };
  const enter = (char: InstanceType<typeof Character>, spawnAt: { x: number; z: number } | null = null): Ent => {
    room.prepareChar(char, spawnAt);
    const client = { sessionId: 'sid' + nextAcc++, send: (type: string, msg: unknown) => sent.push({ type, msg, to: char.name }) };
    const p = room.sim.addPlayer(client as never, char, true, 's' + nextAcc);
    parties.attach(p, room);
    return p;
  };
  const advance = (ms: number) => {
    room.sim.now += ms;
    (room.sim.tele as unknown as { stepAt: number }).stepAt = 0;
    room.sim.tele.tick();
  };
  return { room, sim: room.sim, join, enter, advance };
}

const xfers = (p: Ent) => sent.filter((s) => s.type === S.TRANSFER && s.to === p.char.name).map((s) => s.msg as TransferMsg);
const keys = (p: Ent) => sent.filter((s) => s.type === S.SYS && s.to === p.char.name).map((s) => (s.msg as { k: string }).k);
const has = (p: Ent, to: string) => transfer.tickets.has(p.char.id, to);

describe('TicketBook', () => {
  it('vé dùng một lần: lấy xong là hết', () => {
    const b = new transfer.TicketBook(() => 1000);
    b.issue(1, 'x', { x: 5, z: 6 });
    expect(b.take(1, 'x')).toMatchObject({ to: 'x', spawn: { x: 5, z: 6 } });
    expect(b.take(1, 'x')).toBeNull();
  });
  it('hết hạn sau 15 s', () => {
    let now = 0;
    const b = new transfer.TicketBook(() => now);
    b.issue(1, 'x');
    now = transfer.TICKET_TTL_MS;
    expect(b.has(1, 'x')).toBe(true);
    now = transfer.TICKET_TTL_MS + 1;
    expect(b.take(1, 'x')).toBeNull();
    expect(transfer.TICKET_TTL_MS).toBe(15_000);
  });
  it('vé tới nơi khác không bị đốt; cấp vé mới thay vé cũ; mỗi người một vé', () => {
    const b = new transfer.TicketBook(() => 0);
    b.issue(1, 'a');
    expect(b.take(1, 'b')).toBeNull();
    expect(b.take(1, 'a')).not.toBeNull();
    b.issue(1, 'a');
    b.issue(1, 'b');
    expect(b.take(1, 'a')).toBeNull();
    expect(b.take(2, 'b')).toBeNull();
  });
});

describe('onAuth theo level', () => {
  const Isle = () =>
    rooms.defineWorld(ISLE_ID) as unknown as {
      onAuth(t: string, o: unknown): Promise<{ charId: number; spawn: { x: number; z: number } | null }>;
    };
  const Home = () => rooms.WorldRoom as unknown as { onAuth(t: string, o: unknown): Promise<{ charId: number; spawn: unknown }> };
  const Dun = () => rooms.DungeonRoom as unknown as { onAuth(t: string, o: unknown): Promise<unknown> };
  const acct = (n: string) => ({ dev: n });

  it('Vân Lam nhận đăng nhập thường; level khác và bí cảnh từ chối khi không có vé', async () => {
    const a = await Home().onAuth('', acct('authhome'));
    expect(a.spawn).toBeNull();
    await expect(Isle().onAuth('', acct('authhome'))).rejects.toThrow(/no_ticket/);
    await expect(Dun().onAuth('', acct('authhome'))).rejects.toThrow(/no_ticket/);
  });

  it('vé hợp lệ vào được một lần, mang theo điểm xuất hiện; dùng lại bị từ chối', async () => {
    const a = await Home().onAuth('', acct('authone'));
    transfer.tickets.issue(a.charId, ISLE_ID, { x: 301, z: 302 });
    const ok = await Isle().onAuth('', acct('authone'));
    expect(ok.spawn).toEqual({ x: 301, z: 302 });
    await expect(Isle().onAuth('', acct('authone'))).rejects.toThrow(/no_ticket/);
  });

  it('vé tới level khác không mở được level này (và không bị đốt)', async () => {
    const a = await Home().onAuth('', acct('authwrong'));
    transfer.tickets.issue(a.charId, 'kiem_trung');
    await expect(Isle().onAuth('', acct('authwrong'))).rejects.toThrow(/no_ticket/);
    expect(has({ char: { id: a.charId } } as Ent, 'kiem_trung')).toBe(true);
  });

  it('vé hết hạn sau 15 s thì bị từ chối', async () => {
    const a = await Home().onAuth('', acct('authexp'));
    let now = 1_000_000;
    transfer.tickets.now = () => now;
    transfer.tickets.issue(a.charId, ISLE_ID);
    now += 16_000;
    await expect(Isle().onAuth('', acct('authexp'))).rejects.toThrow(/no_ticket/);
  });
});

describe('requestLevel (kiểm ở room đi)', () => {
  it('đứng yên thì được: cấp vé tới level đích, lưu vị trí, báo client đổi room', () => {
    const w = mkRoom(HOME_LEVEL, rooms.WorldRoom);
    const p = w.join('free');
    expect(w.room.requestLevel(p, ISLE_ID, { x: 300, z: 300 })).toBe(true);
    expect(has(p, ISLE_ID)).toBe(true);
    expect(xfers(p)).toEqual([{ room: 'world-test_isle', level: ISLE_ID, options: {} }]);
  });

  it.each([
    ['chết', (p: Ent) => void (p.s.fl |= PF_DEAD), 'sys.tele_dead'],
    ['độ kiếp', (p: Ent) => void (p.trib = {} as never), 'sys.tele_busy'],
    ['tâm ma', (p: Ent) => void (p.trial = {} as never), 'sys.tele_busy'],
    ['niệm dở', (p: Ent) => void (p.casting = { endAt: 1 } as never), 'sys.tele_busy'],
  ])('đang %s thì bị chặn, không có vé', (_n, mod, key) => {
    const w = mkRoom(HOME_LEVEL, rooms.WorldRoom);
    const p = w.join('busy');
    mod(p);
    expect(w.room.requestLevel(p, ISLE_ID, { x: 300, z: 300 })).toBe(false);
    expect(has(p, ISLE_ID)).toBe(false);
    expect(xfers(p)).toEqual([]);
    expect(keys(p)).toContain(key);
  });

  it('đang giao chiến: bị chặn khi hỏi combat (Truyền Tống), qua được khi không', () => {
    const w = mkRoom(HOME_LEVEL, rooms.WorldRoom);
    const p = w.join('fight');
    p.lastCombatAt = w.sim.now;
    expect(w.room.requestLevel(p, ISLE_ID, { x: 300, z: 300 }, { combat: true })).toBe(false);
    expect(keys(p)).toContain('sys.tele_combat');
    expect(has(p, ISLE_ID)).toBe(false);
    expect(w.room.requestLevel(p, ISLE_ID, { x: 300, z: 300 })).toBe(true);
  });

  it('từ chối level lạ, bí cảnh, chính level này, điểm ngoài vùng chơi', () => {
    const w = mkRoom(HOME_LEVEL, rooms.WorldRoom);
    const p = w.join('bad');
    expect(w.room.requestLevel(p, 'khong_co', null)).toBe(false);
    expect(w.room.requestLevel(p, 'kiem_trung', null)).toBe(false);
    expect(w.room.requestLevel(p, HOME_LEVEL, null)).toBe(false);
    expect(w.room.requestLevel(p, ISLE_ID, { x: 99999, z: 5 })).toBe(false);
    expect(w.room.requestLevel(p, ISLE_ID, { x: NaN, z: 5 })).toBe(false);
    expect(xfers(p)).toEqual([]);
  });
});

describe('chuyển bản đồ hai chiều', () => {
  it('Vân Lam → đảo thử → Vân Lam bằng Truyền Tống, rồi đăng nhập lại ở đảo thì được dẫn về đúng chỗ', async () => {
    const home = mkRoom(HOME_LEVEL, rooms.WorldRoom);
    const isle = mkRoom(ISLE_ID, rooms.defineWorld(ISLE_ID));
    const p = home.join('hai');
    p.char.unlockTele(ISLE_PAD.id);

    // đi: niệm 5 s (liên level), chưa đủ thì chưa chuyển
    home.sim.tele.command(p, { id: ISLE_PAD.id });
    home.advance(TELE_CAST_MS + 200);
    expect(xfers(p)).toEqual([]);
    home.advance(TELE_CAST_LEVEL_MS - TELE_CAST_MS);
    expect(xfers(p)).toEqual([{ room: 'world-test_isle', level: ISLE_ID, options: {} }]);
    const t = transfer.tickets.take(p.char.id, ISLE_ID)!;
    expect(t).not.toBeNull();
    expect(transfer.tickets.take(p.char.id, ISLE_ID)).toBeNull(); // dùng một lần
    expect(Math.hypot(t.spawn!.x - 300, t.spawn!.z - 300)).toBeLessThan(15);

    // đến: room đảo đặt nhân vật ở điểm của vé (onAuth đã được kiểm ở nhóm trên)
    const char = Character.load(p.char.id);
    const q = isle.enter(char, t.spawn);
    expect(q.char.room).toBe(ISLE_ID);
    expect(Math.hypot(q.move.x - t.spawn!.x, q.move.z - t.spawn!.z)).toBeLessThan(0.5);
    expect(q.move.y).toBeGreaterThan(300); // địa hình riêng của đảo, không phải Vân Lam
    isle.sim.savePlayer(q);
    expect(Character.load(p.char.id).room).toBe(ISLE_ID);

    // về: trận tông môn (mở sẵn, thuộc Vân Lam) từ đảo
    TeleportSystem.resetCooldowns();
    expect(TELE_FREE).toContain('tp_tong_mon');
    isle.sim.tele.command(q, { id: 'tp_tong_mon' });
    isle.advance(TELE_CAST_LEVEL_MS + 100);
    expect(xfers(q).at(-1)).toEqual({ room: 'world', level: HOME_LEVEL, options: {} });
    const back = transfer.tickets.take(q.char.id, HOME_LEVEL)!;
    expect(back.spawn).not.toBeNull();
    const r = home.enter(Character.load(p.char.id), back.spawn);
    expect(r.char.room).toBe(HOME_LEVEL);
    expect(Math.hypot(r.move.x - back.spawn!.x, r.move.z - back.spawn!.z)).toBeLessThan(0.5);
  });

  it('Truyền Tống liên level bị chặn khi giao chiến, không niệm được và không có vé', () => {
    const home = mkRoom(HOME_LEVEL, rooms.WorldRoom);
    const p = home.join('chien');
    p.char.unlockTele(ISLE_PAD.id);
    p.lastCombatAt = home.sim.now;
    home.sim.tele.command(p, { id: ISLE_PAD.id });
    expect(keys(p)).toContain('sys.tele_combat');
    home.advance(TELE_CAST_LEVEL_MS + 500);
    expect(xfers(p)).toEqual([]);
    expect(has(p, ISLE_ID)).toBe(false);
  });

  it('bị đánh giữa lúc niệm: hủy, không chuyển', () => {
    const home = mkRoom(HOME_LEVEL, rooms.WorldRoom);
    const p = home.join('danh');
    p.char.unlockTele(ISLE_PAD.id);
    home.sim.tele.command(p, { id: ISLE_PAD.id });
    home.advance(2000);
    p.lastCombatAt = home.sim.now;
    home.advance(TELE_CAST_LEVEL_MS);
    expect(xfers(p)).toEqual([]);
    expect(keys(p)).toContain('sys.tele_broken');
  });

  it('trận chưa mở khóa của level khác thì từ chối', () => {
    const home = mkRoom(HOME_LEVEL, rooms.WorldRoom);
    const p = home.join('khoa');
    home.sim.tele.command(p, { id: ISLE_PAD.id });
    expect(keys(p)).toContain('sys.tele_locked');
    home.advance(TELE_CAST_LEVEL_MS + 500);
    expect(xfers(p)).toEqual([]);
  });

  it('trận ở level khác không mở khóa được khi đứng ở tọa độ trùng', () => {
    const home = mkRoom(HOME_LEVEL, rooms.WorldRoom);
    const p = home.join('trung');
    p.move.x = ISLE_PAD.x;
    p.move.z = ISLE_PAD.z;
    home.advance(300);
    expect(p.char.teleOpen()).not.toContain(ISLE_PAD.id);
  });

  it('tổ đội: người dẫn kéo theo đồng đội ở gần, bỏ đồng đội ở xa hoặc đang bận', () => {
    const home = mkRoom(HOME_LEVEL, rooms.WorldRoom);
    const lead = home.join('dan');
    const near = home.join('gan');
    const far = home.join('xa');
    const busy = home.join('ban');
    for (const m of [lead, near, far, busy]) {
      m.move.x = 2048;
      m.move.z = 2088;
      m.move.y = groundAt(2048, 2088);
    }
    far.move.x += 200;
    busy.s.fl |= PF_DEAD;
    const party = { members: [lead, near, far, busy].map((m) => m.char.id), leader: lead.char.id };
    (parties as unknown as { byChar: Map<number, unknown> }).byChar.set(lead.char.id, party);
    for (const m of [near, far, busy]) (parties as unknown as { byChar: Map<number, unknown> }).byChar.set(m.char.id, party);
    expect(home.room.requestLevel(lead, ISLE_ID, { x: 300, z: 300 }, { combat: true, party: true })).toBe(true);
    expect(has(lead, ISLE_ID)).toBe(true);
    expect(has(near, ISLE_ID)).toBe(true);
    expect(has(far, ISLE_ID)).toBe(false);
    expect(has(busy, ISLE_ID)).toBe(false);
    // đồng đội không phải người dẫn thì không kéo ai
    expect(home.room.requestLevel(near, 'khong_co', null, { party: true })).toBe(false);
  });
});

describe('đến nơi qua onJoin thật', () => {
  const Aoi = () => import('../aoi').then((m) => m.Aoi);

  /** Dựng room đủ để chạy `GameRoom.onJoin` (không qua Colyseus). */
  async function joinable(levelId: string, cls: { prototype: object }) {
    const r = mkRoom(levelId, cls);
    const room = r.room as unknown as Record<string, unknown>;
    room.aoi = new (await Aoi())(r.sim);
    room.clients = { getById: () => undefined };
    room.markers = { drop() {}, sync() {} };
    room.clock = { setTimeout: () => undefined };
    Object.defineProperty(room, 'roomName', { value: levelId });
    return r;
  }
  const client = (name: string) => ({
    sessionId: 'sid' + nextAcc++,
    send: (type: string, msg: unknown) => sent.push({ type, msg, to: name }),
  });

  it('world → world: lưu ở level nguồn rồi vào bằng vé thì đặt ở điểm của vé, không bị dẫn ngược', async () => {
    const home = mkRoom(HOME_LEVEL, rooms.WorldRoom);
    const isle = await joinable(ISLE_ID, rooms.defineWorld(ISLE_ID));
    const p = home.join('qua');
    // đường đi thật: requestLevel → savePlayer ghi char.room = level nguồn
    expect(home.room.requestLevel(p, ISLE_ID, { x: 300, z: 300 })).toBe(true);
    expect(Character.load(p.char.id).room).toBe(HOME_LEVEL);
    const ticket = transfer.tickets.take(p.char.id, ISLE_ID)!;
    expect(ticket).not.toBeNull();

    const c = client(p.char.name);
    const before = sent.length;
    const auth = { accountId: 1, dev: true, charId: p.char.id, session: 's', spawn: ticket.spawn, ticket: true };
    (isle.room as unknown as { onJoin(c: unknown, o: unknown, a: unknown): void }).onJoin(c, {}, auth);
    const msgs = sent.slice(before).filter((m) => m.to === p.char.name);
    expect(msgs.filter((m) => m.type === S.TRANSFER)).toEqual([]);
    const q = [...isle.sim.players.values()].find((x) => x.char.id === p.char.id)!;
    expect(q).toBeDefined();
    expect(q.char.room).toBe(ISLE_ID);
    expect(Math.hypot(q.move.x - 300, q.move.z - 300)).toBeLessThan(0.5);
    expect(transfer.tickets.has(p.char.id, HOME_LEVEL)).toBe(false);
  });

  it('đăng nhập thường vào room không phải level đang lưu (không vé): vẫn được dẫn đúng chỗ', async () => {
    const home = await joinable(HOME_LEVEL, rooms.WorldRoom);
    const char = Character.create(nextAcc++, 'dn' + nextAcc);
    char.room = ISLE_ID;
    char.save();
    const c = client(char.name);
    const before = sent.length;
    (home.room as unknown as { onJoin(c: unknown, o: unknown, a: unknown): void }).onJoin(
      c,
      {},
      { accountId: 1, dev: true, charId: char.id, session: 's', spawn: null },
    );
    const x = sent
      .slice(before)
      .filter((m) => m.to === char.name && m.type === S.TRANSFER)
      .map((m) => m.msg);
    expect(x).toEqual([{ room: 'world-test_isle', level: ISLE_ID, options: {} }]);
    expect(transfer.tickets.has(char.id, ISLE_ID)).toBe(true);
    expect(home.sim.players.size).toBe(0);
  });
});

describe('bí cảnh theo dữ liệu', () => {
  it('cổng Vân Lam cấp vé bí cảnh khi đủ cấp và đứng gần cổng; xa hoặc thấp cấp thì không', () => {
    const w = mkRoom(HOME_LEVEL, rooms.WorldRoom);
    const portal = at(at(LEVELS, HOME_LEVEL).portals!, 0);
    const p = w.join('cong', 8);
    p.move.x = portal.x + 100;
    w.room.onPortal(p);
    expect(has(p, 'kiem_trung')).toBe(false);
    expect(keys(p)).toContain('sys.too_far');
    p.move.x = portal.x;
    p.move.z = portal.z;
    const low = w.join('thap', 3);
    low.move.x = portal.x;
    low.move.z = portal.z;
    w.room.onPortal(low);
    expect(has(low, 'kiem_trung')).toBe(false);
    w.room.onPortal(p);
    expect(has(p, 'kiem_trung')).toBe(true);
    expect(xfers(p).at(-1)).toEqual({ room: 'dungeon', level: 'kiem_trung', options: {} });
  });

  it('cổng ra bí cảnh cấp vé về returnLevel kèm returnSpawn; đăng nhập lại giữa bí cảnh thì về đó', () => {
    const d = mkRoom('kiem_trung', rooms.DungeonRoom);
    const def = at(LEVELS, 'kiem_trung').dungeon!;
    const p = d.join('ra');
    p.move.x = def.exit.x;
    p.move.z = def.exit.z;
    d.room.onPortal(p);
    expect(xfers(p).at(-1)).toEqual({ room: 'world', level: HOME_LEVEL, options: {} });
    const t = transfer.tickets.take(p.char.id, HOME_LEVEL)!;
    expect(t.spawn).toEqual(def.returnSpawn);

    // đăng nhập lại khi bản ghi còn ở bí cảnh: room Vân Lam đặt về returnSpawn
    d.sim.savePlayer(p);
    const w = mkRoom(HOME_LEVEL, rooms.WorldRoom);
    const char = Character.load(p.char.id);
    char.room = 'kiem_trung';
    expect(w.room.resumeTarget(char)).toEqual({ level: HOME_LEVEL, spawn: def.returnSpawn });
    const q = w.enter(char);
    expect(q.char.room).toBe(HOME_LEVEL);
    expect(Math.hypot(q.move.x - def.returnSpawn.x, q.move.z - def.returnSpawn.z)).toBeLessThan(0.5);
  });

  it('nhân vật lưu ở level khác (không phải bí cảnh): room Vân Lam bảo sang room đó, không dựng người', () => {
    const w = mkRoom(HOME_LEVEL, rooms.WorldRoom);
    const char = Character.create(nextAcc++, 'luu' + nextAcc);
    char.room = ISLE_ID;
    expect(w.room.resumeTarget(char)).toEqual({ level: ISLE_ID, spawn: null });
    const isle = mkRoom(ISLE_ID, rooms.defineWorld(ISLE_ID));
    expect(isle.room.resumeTarget(char)).toBeNull();
  });

  it('vào bí cảnh bằng vé khi bản ghi đang lưu ở Vân Lam: không bị dẫn ngược về thế giới', () => {
    const d = mkRoom('kiem_trung', rooms.DungeonRoom);
    const char = Character.create(nextAcc++, 'vao' + nextAcc);
    char.room = HOME_LEVEL;
    expect(d.room.resumeTarget(char)).toBeNull();
    const p = d.enter(char);
    expect(p.char.room).toBe('kiem_trung');
    const sp = at(LEVELS, 'kiem_trung').dungeon!.spawn;
    expect(Math.hypot(p.move.x - sp.x, p.move.z - sp.z)).toBeLessThan(0.5);
  });

  it('tên room: Vân Lam `world`, Kiếm Trủng `dungeon`, level khác có hậu tố', () => {
    expect(rooms.roomNameOf(HOME_LEVEL)).toBe('world');
    expect(rooms.roomNameOf('kiem_trung')).toBe('dungeon');
    expect(rooms.roomNameOf(ISLE_ID)).toBe('world-test_isle');
    // Colyseus chỉ giữ phần khớp [A-Za-z0-9_-]+ đầu tiên của tên room: dấu chấm làm room khác bị nhận nhầm là 'world'
    for (const id of [HOME_LEVEL, 'kiem_trung', ISLE_ID]) expect(rooms.roomNameOf(id)).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(() => rooms.defineWorld('kiem_trung')).toThrow();
    expect(() => rooms.defineDungeon(HOME_LEVEL)).toThrow();
  });
});
