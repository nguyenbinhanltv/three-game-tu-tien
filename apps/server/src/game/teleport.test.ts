import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  groundAt,
  MARK_GAP_MS,
  MARK_TTL_MS,
  PF_DEAD,
  S,
  TELE_CAST_MS,
  TELE_CD_MS,
  TELE_FREE,
  TELE_PAD,
  TELE_PADS,
  type MarkMsg,
  type TeleMsg,
} from '@dtl/shared';

// Truyền Tống Trận và điểm đánh dấu (M-4): server quyết định mở khóa, niệm, chặn khi bận, hồi chiêu, chia sẻ điểm trong tổ đội.
process.env.DB_FILE = ':memory:';

type Ent = import('./sim').PlayerEnt;
let GameSim: typeof import('./sim').GameSim;
let WorldState: typeof import('../state').WorldState;
let Character: typeof import('./character').Character;
let parties: typeof import('./party').parties;
let MarkerSystem: typeof import('./marker').MarkerSystem;
let TeleportSystem: typeof import('./teleport').TeleportSystem;
let parseTele: typeof import('./character').parseTele;
let db: typeof import('../db');

beforeAll(async () => {
  ({ GameSim } = await import('./sim'));
  ({ WorldState } = await import('../state'));
  ({ Character, parseTele } = await import('./character'));
  ({ parties } = await import('./party'));
  ({ MarkerSystem } = await import('./marker'));
  ({ TeleportSystem } = await import('./teleport'));
  db = await import('../db');
});

afterEach(() => {
  parties.reset();
  TeleportSystem.resetCooldowns();
});

let nextAcc = 9000;
interface Sent {
  type: string;
  msg: unknown;
  to: string;
}

function setup(roomName = 'world', levelId = 'van_lam') {
  const sent: Sent[] = [];
  const host = { broadcast: () => {}, roomName };
  const sim = new GameSim(new WorldState(), host as never, {
    levelId,
    roomName,
    spawn: { x: 2048, z: 2088 },
    respawn: { x: 2048, z: 2088 },
    persistPosition: false,
  });
  const join = (name: string): Ent => {
    const char = Character.create(nextAcc++, name + nextAcc);
    char.level = 8;
    char.recalc();
    char.hp = char.mhp;
    const client = { sessionId: 'sid' + name + nextAcc, send: (type: string, msg: unknown) => sent.push({ type, msg, to: char.name }) };
    const p = sim.addPlayer(client as never, char, true, 's' + nextAcc);
    p.move.x = 2048;
    p.move.z = 2088;
    p.move.y = groundAt(2048, 2088);
    parties.attach(p, host);
    return p;
  };
  const sys = (p: Ent) => sent.filter((s) => s.type === S.SYS && s.to === p.char.name).map((s) => (s.msg as { k: string }).k);
  const lastTele = (p: Ent) => [...sent].reverse().find((s) => s.type === S.TELE && s.to === p.char.name)?.msg as TeleMsg | undefined;
  const lastMark = (p: Ent) => [...sent].reverse().find((s) => s.type === S.MARK && s.to === p.char.name)?.msg as MarkMsg | undefined;
  /** Đẩy đồng hồ sim và chạy tick. */
  const advance = (ms: number) => {
    sim.now += ms;
    (sim.tele as unknown as { stepAt: number }).stepAt = 0;
    sim.tele.tick();
  };
  const stand = (p: Ent, x: number, z: number) => {
    p.move.x = x;
    p.move.z = z;
  };
  return { sim, sent, host, join, sys, lastTele, lastMark, advance, stand };
}

const PAD = TELE_PAD.get('tp_rung')!;
const SEC = 'tp_tong_mon';
const nearPad = (s: ReturnType<typeof setup>, p: Ent) => s.stand(p, PAD.x + 1, PAD.z);
const farFromPad = (p: Ent) => Math.hypot(p.move.x - PAD.x, p.move.z - PAD.z) > 100;

describe('mở khóa', () => {
  it('trận tông môn mở sẵn, trận khác phải chạm; chạm lần đầu lưu DB', () => {
    const s = setup();
    const p = s.join('a');
    expect(p.char.teleOpen()).toEqual([...TELE_FREE]);
    nearPad(s, p);
    s.advance(300);
    expect(p.char.teleOpen()).toContain('tp_rung');
    expect(s.sys(p)).toContain('sys.tele_unlock');
    expect(s.lastTele(p)!.open).toContain('tp_rung');
    const row = db.sqlite.prepare('SELECT tele FROM characters WHERE id = ?').get(p.char.id) as { tele: string };
    expect(JSON.parse(row.tele)).toContain('tp_rung');
    // đứng xa thì không mở
    const q = s.join('b');
    s.stand(q, PAD.x + 30, PAD.z);
    s.advance(300);
    expect(q.char.teleOpen()).toEqual([...TELE_FREE]);
  });

  it('parseTele bỏ id lạ và dữ liệu hỏng', () => {
    expect(parseTele('')).toEqual([]);
    expect(parseTele('not json')).toEqual([]);
    expect(parseTele('["tp_rung","hack","tp_rung",5]')).toEqual(['tp_rung']);
  });
});

describe('dịch chuyển', () => {
  it('chưa mở khóa hoặc id lạ thì từ chối', () => {
    const s = setup();
    const p = s.join('a');
    s.sim.tele.command(p, { id: 'tp_rung' });
    s.advance(500);
    s.sim.tele.command(p, { id: '../etc' });
    s.advance(500);
    s.sim.tele.command(p, { id: 5 });
    expect(s.sys(p)).toContain('sys.tele_locked');
    expect(s.lastTele(p)).toBeUndefined();
  });

  it('niệm đủ thời gian thì tới nơi, rồi hồi chiêu', () => {
    const s = setup();
    const p = s.join('a');
    p.char.unlockTele('tp_rung');
    s.sim.tele.command(p, { id: 'tp_rung' });
    expect(s.lastTele(p)!.cast!.id).toBe('tp_rung');
    s.advance(TELE_CAST_MS - 400);
    expect(farFromPad(p)).toBe(true);
    s.advance(600);
    expect(Math.hypot(p.move.x - PAD.x, p.move.z - PAD.z)).toBeLessThan(5);
    expect(s.sys(p)).toContain('sys.tele_done');
    expect(s.lastTele(p)!.cd).toBeGreaterThan(TELE_CD_MS - 1000);
    s.advance(500);
    s.sim.tele.command(p, { id: SEC });
    expect(s.sys(p)).toContain('sys.tele_cd');
  });

  it('di chuyển khi niệm thì hủy', () => {
    const s = setup();
    const p = s.join('a');
    p.char.unlockTele('tp_rung');
    s.sim.tele.command(p, { id: 'tp_rung' });
    p.move.x += 6;
    s.advance(300);
    expect(s.sys(p)).toContain('sys.tele_moved');
    expect(s.lastTele(p)!.cast).toBeNull();
    s.advance(TELE_CAST_MS);
    expect(farFromPad(p)).toBe(true);
  });

  it('đang giao chiến thì không bắt đầu niệm; bị đánh giữa chừng thì hủy', () => {
    const s = setup();
    const p = s.join('a');
    p.char.unlockTele('tp_rung');
    p.lastCombatAt = s.sim.now;
    s.sim.tele.command(p, { id: 'tp_rung' });
    expect(s.sys(p)).toContain('sys.tele_combat');
    p.lastCombatAt = 0;
    s.advance(500);
    s.sim.tele.command(p, { id: 'tp_rung' });
    expect(s.lastTele(p)!.cast).not.toBeNull();
    p.lastCombatAt = s.sim.now;
    s.advance(300);
    expect(s.sys(p)).toContain('sys.tele_broken');
    s.advance(TELE_CAST_MS);
    expect(farFromPad(p)).toBe(true);
  });

  it('độ kiếp, tâm ma, chết thì không niệm', () => {
    const s = setup();
    const p = s.join('a');
    p.char.unlockTele('tp_rung');
    p.trib = { endAt: s.sim.now + 9999, nextAt: 0, n: 0, fin: true, pills: 0 };
    s.sim.tele.command(p, { id: 'tp_rung' });
    p.trib = null;
    p.trial = { endAt: s.sim.now + 9999, monId: 'x', x: 0, z: 0 };
    s.advance(2500);
    s.sim.tele.command(p, { id: 'tp_rung' });
    p.trial = null;
    p.s.fl |= PF_DEAD;
    s.advance(2500);
    s.sim.tele.command(p, { id: 'tp_rung' });
    const k = s.sys(p);
    expect(k.filter((x) => x === 'sys.tele_busy').length).toBe(2);
    expect(k).toContain('sys.tele_dead');
    expect(s.lastTele(p)).toBeUndefined();
  });

  it('vào độ kiếp giữa lúc niệm thì hủy, không dịch chuyển', () => {
    const s = setup();
    const p = s.join('a');
    p.char.unlockTele('tp_rung');
    s.sim.tele.command(p, { id: 'tp_rung' });
    p.trib = { endAt: s.sim.now + 99999, nextAt: 0, n: 0, fin: true, pills: 0 };
    s.advance(TELE_CAST_MS + 100);
    expect(farFromPad(p)).toBe(true);
  });

  it('spam lệnh bị giãn; hủy bằng lệnh rỗng', () => {
    const s = setup();
    const p = s.join('a');
    p.char.unlockTele('tp_rung');
    for (let i = 0; i < 50; i++) s.sim.tele.command(p, { id: 'tp_rung' });
    expect(s.sent.filter((x) => x.type === S.TELE && x.to === p.char.name).length).toBe(1);
    s.advance(500);
    s.sim.tele.command(p, {});
    expect(s.lastTele(p)!.cast).toBeNull();
  });

  it('bí cảnh không có truyền tống', () => {
    const s = setup('dungeon', 'kiem_trung');
    const p = s.join('a');
    p.char.unlockTele('tp_rung');
    s.sim.tele.command(p, { id: 'tp_rung' });
    expect(s.sys(p)).toContain('sys.tele_here');
  });

  it('mọi trận có id duy nhất và đứng được', () => {
    expect(new Set(TELE_PADS.map((x) => x.id)).size).toBe(TELE_PADS.length);
    for (const x of TELE_PADS) expect(Number.isFinite(groundAt(x.x, x.z))).toBe(true);
  });
});

describe('điểm đánh dấu', () => {
  it('đồng đội cùng tổ đội thấy điểm của nhau, người ngoài thì không', () => {
    const s = setup();
    const room = s.host;
    const a = s.join('a');
    const b = s.join('b');
    const c = s.join('c');
    const m = new MarkerSystem(
      room,
      () => s.sim.players.values(),
      () => s.sim.now,
    );
    parties.now = () => Date.now() + 10_000;
    parties.command(a, { a: 'inv', n: b.char.name });
    parties.command(b, { a: 'acc', id: a.char.id });
    parties.now = () => Date.now();
    m.command(a, { x: 2100, z: 2100 });
    expect(s.lastMark(a)!.marks).toEqual([expect.objectContaining({ x: 2100, z: 2100, own: true })]);
    expect(s.lastMark(b)!.marks).toEqual([expect.objectContaining({ id: a.char.id, own: false })]);
    expect(s.lastMark(c)).toBeUndefined();
    m.drop(a);
    expect(s.lastMark(b)!.marks).toEqual([]);
  });

  it('chặn toạ độ sai, ngoài vùng chơi và spam', () => {
    const s = setup();
    const a = s.join('a');
    const m = new MarkerSystem(
      {},
      () => s.sim.players.values(),
      () => s.sim.now,
    );
    for (const bad of [{ x: NaN, z: 1 }, { x: 'a', z: 1 }, { x: 1e9, z: 0 }, { x: 0, z: 0 }, {}, null, 5]) {
      s.sim.now += MARK_GAP_MS + 1;
      m.command(a, bad);
    }
    expect(s.lastMark(a)).toBeUndefined();
    s.sim.now += MARK_GAP_MS + 1;
    m.command(a, { x: 2100, z: 2100 });
    const n = s.sent.filter((x) => x.type === S.MARK).length;
    for (let i = 0; i < 30; i++) m.command(a, { x: 2100 + i, z: 2100 });
    expect(s.sent.filter((x) => x.type === S.MARK).length).toBe(n);
  });

  it('điểm tự hết hạn', () => {
    const s = setup();
    const a = s.join('a');
    const m = new MarkerSystem(
      {},
      () => s.sim.players.values(),
      () => s.sim.now,
    );
    s.sim.now += MARK_GAP_MS + 1;
    m.command(a, { x: 2100, z: 2100 });
    s.sim.now += MARK_TTL_MS + 1;
    m.sync();
    expect(s.lastMark(a)!.marks).toEqual([]);
  });
});

describe('migration', () => {
  it('nhân vật cũ: mở trận vùng đã vượt cấp; DB mới có cột tele', () => {
    const { sqlite, DATA_VERSION } = db;
    expect(DATA_VERSION).toBeGreaterThanOrEqual(3);
    const cols = sqlite.prepare('PRAGMA table_info(characters)').all() as { name: string }[];
    expect(cols.some((c) => c.name === 'tele')).toBe(true);
    sqlite.prepare("INSERT INTO accounts (sub, email, created_at) VALUES ('t:mig1','',0)").run();
    const acc = (sqlite.prepare("SELECT id FROM accounts WHERE sub='t:mig1'").get() as { id: number }).id;
    sqlite.prepare("INSERT INTO characters (account_id, name, level, tele) VALUES (?, 'migcu', 12, '')").run(acc);
    db.migrateTele(sqlite);
    const row = sqlite.prepare("SELECT tele FROM characters WHERE name='migcu'").get() as { tele: string };
    const open = JSON.parse(row.tele) as string[];
    expect(open).toContain('tp_thung_lung');
    expect(open).toContain('tp_cong');
    expect(open).not.toContain('tp_ho');
    expect(open).not.toContain('tp_tong_mon');
    db.migrateTele(sqlite);
    expect((sqlite.prepare("SELECT tele FROM characters WHERE name='migcu'").get() as { tele: string }).tele).toBe(row.tele);
  });
});
