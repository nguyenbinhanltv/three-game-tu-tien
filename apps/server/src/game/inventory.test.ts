// TD-A: túi 120 ô, sắp xếp, khóa ô, tách chồng, gửi delta, migration cột `locked` (DB v5).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { applyInvMsg, groundAt, INV_PAGE, INV_PAGES, INV_SIZE, S, type InvMsg, type InvSlot } from '@dtl/shared';

process.env.DB_FILE = ':memory:';

let GameSim: typeof import('./sim').GameSim;
let WorldState: typeof import('../state').WorldState;
let Character: typeof import('./character').Character;
let openDb: typeof import('../db').openDb;
let DATA_VERSION: number;
let sqlite: typeof import('../db').sqlite;
let ITEM: typeof import('@dtl/content').ITEM;

beforeAll(async () => {
  ({ GameSim } = await import('./sim'));
  ({ WorldState } = await import('../state'));
  ({ Character } = await import('./character'));
  ({ openDb, DATA_VERSION, sqlite } = await import('../db'));
  ({ ITEM } = await import('@dtl/content'));
});

let acc = 40_000;
const PILL = 'itm_hoi_khi_dan';
const ORE = 'itm_thiet_tinh';

function setup() {
  const sent: { type: string; msg: unknown }[] = [];
  const sim = new GameSim(new WorldState(), { broadcast: () => undefined } as never, { levelId: 'van_lam', roomName: 'test', spawn: { x: 2040, z: 2040 }, respawn: { x: 2040, z: 2040 }, persistPosition: false });
  const char = Character.create(acc++, 'tui' + acc);
  const p = sim.addPlayer({ sessionId: 'c' + acc, send: (type: string, msg: unknown) => sent.push({ type, msg }) } as never, char, true, 'c' + acc);
  p.move.x = 2040;
  p.move.z = 2040;
  p.move.y = groundAt(2040, 2040);
  sim.now = 1_000_000;
  let n = 0;
  const step = () => {
    sim.now += 1500;
  };
  const sort = (r = 'sort-' + ++n) => (step(), sim.inventory.onSort(p, { r }));
  const lock = (slot: number, on: boolean) => (step(), sim.inventory.onLock(p, { slot, on }));
  const split = (slot: number, k: number, extra: Record<string, unknown> = {}, r = 'split-' + ++n) => (step(), sim.inventory.onSplit(p, { slot, n: k, r, ...extra }));
  const give = (fn: (d: import('./character').InvDraft) => void) => expect(char.tx('test', null, (d) => (fn(d), true))).toBe(true);
  const total = (id: string) => char.inv.reduce((s, x) => s + (x?.id === id ? x.n : 0), 0);
  const invMsgs = () => sent.filter((x) => x.type === S.INV).map((x) => x.msg as InvMsg);
  return { sim, p, char, sort, lock, split, give, total, sent, invMsgs, step };
}

describe('túi 120 ô', () => {
  it('hằng số và nhân vật mới có 120 ô; ô 100 ghi và nạp lại được', () => {
    expect(INV_SIZE).toBe(INV_PAGE * INV_PAGES);
    expect(INV_SIZE).toBe(120);
    const t = setup();
    expect(t.char.inv.length).toBe(120);
    t.char.tx('t', null, (d) => ((d.inv[100] = { id: PILL, n: 3 }), true));
    expect(Character.load(t.char.id).inv[100]).toEqual({ id: PILL, n: 3 });
  });

  it('túi đầy 120 ô: thêm vật phẩm mới bị từ chối, không đụng gì', () => {
    const t = setup();
    t.give((d) => {
      for (let i = 0; i < INV_SIZE; i++) d.inv[i] = { id: ORE, n: 1 };
    });
    expect(t.char.tx('add', null, (d) => d.add(PILL, 1))).toBe(false);
    expect(t.char.txFail).toBe('abort');
    expect(t.char.inv.filter(Boolean).length).toBe(120);
  });

  it('chuyển đồ sang ô ngoài phạm vi bị bỏ; ô 119 hợp lệ', () => {
    const t = setup();
    t.give((d) => (d.inv[0] = { id: PILL, n: 1 }));
    t.sim.onMoveItem(t.p, { a: 0, b: 120 });
    t.sim.onMoveItem(t.p, { a: 0, b: -1 });
    t.sim.onMoveItem(t.p, { a: 0, b: 1.5 });
    expect(t.char.inv[0]?.id).toBe(PILL);
    t.sim.onMoveItem(t.p, { a: 0, b: 119 });
    expect(t.char.inv[119]?.id).toBe(PILL);
  });
});

describe('sắp xếp', () => {
  it('gộp chồng, dồn về đầu, đan trước nguyên liệu; tổng giữ nguyên; ledger có một dòng noop', () => {
    const t = setup();
    const stack = ITEM.get(ORE)!.stack;
    t.give((d) => {
      d.inv[5] = { id: ORE, n: 10 };
      d.inv[50] = { id: ORE, n: 7 };
      d.inv[90] = { id: PILL, n: 2 };
      d.inv[119] = { id: ORE, n: stack };
    });
    const before = t.total(ORE);
    t.sort('sort-1');
    expect(t.total(ORE)).toBe(before);
    const used = t.char.inv.map((s, i) => (s ? i : -1)).filter((i) => i >= 0);
    expect(used).toEqual(used.map((_, i) => i));
    expect(t.char.inv[0]?.id).toBe(PILL);
    expect(t.char.inv.filter((s) => s?.id === ORE).length).toBe(2);
    expect(Character.load(t.char.id).inv.map((s) => s?.id ?? null)).toEqual(t.char.inv.map((s) => s?.id ?? null));
    const row = sqlite.prepare("SELECT kind, delta FROM ledger WHERE char_id = ? AND reason = 'inv:sort'").all(t.char.id);
    expect(row).toEqual([{ kind: 'noop', delta: 0 }]);
  });

  it('món khóa không bị gộp và không nhận phần gộp', () => {
    const t = setup();
    t.give((d) => {
      d.inv[0] = { id: ORE, n: 5, lk: true };
      d.inv[1] = { id: ORE, n: 5 };
      d.inv[2] = { id: ORE, n: 5 };
    });
    t.sort();
    const ores = t.char.inv.filter((s) => s?.id === ORE);
    expect(ores.map((s) => s!.n).sort()).toEqual([10, 5]);
    expect(ores.filter((s) => s!.lk).map((s) => s!.n)).toEqual([5]);
  });

  it('trùng khóa idempotency chỉ chạy một lần; thiếu khóa bị bỏ; spam trong 1 s bị bỏ', () => {
    const t = setup();
    t.give((d) => ((d.inv[7] = { id: PILL, n: 1 }), (d.inv[8] = { id: ORE, n: 1 })));
    t.sort('dup-key');
    expect(t.char.inv[0]?.id).toBe(PILL);
    t.give((d) => (d.inv[40] = { id: ORE, n: 1 }));
    const snap = JSON.stringify(t.char.inv);
    t.step();
    t.sim.inventory.onSort(t.p, { r: 'dup-key' });
    expect(JSON.stringify(t.char.inv)).toBe(snap);
    t.step();
    t.sim.inventory.onSort(t.p, {});
    expect(JSON.stringify(t.char.inv)).toBe(snap);
    t.step();
    t.sim.inventory.onSort(t.p, { r: 'spam-1' });
    t.give((d) => (d.inv[60] = { id: PILL, n: 1 }));
    t.sim.inventory.onSort(t.p, { r: 'spam-2' });
    expect(t.char.inv[60]?.id).toBe(PILL);
  });
});

describe('khóa ô', () => {
  it('khóa lưu DB và nạp lại; mở khóa xóa cờ; ô trống/ngoài phạm vi/sai kiểu bị bỏ', () => {
    const t = setup();
    t.give((d) => (d.inv[3] = { id: ORE, n: 4 }));
    t.lock(3, true);
    expect(t.char.inv[3]?.lk).toBe(true);
    expect(Character.load(t.char.id).inv[3]?.lk).toBe(true);
    t.lock(3, false);
    expect(t.char.inv[3]?.lk).toBeUndefined();
    expect(Character.load(t.char.id).inv[3]?.lk).toBeUndefined();
    t.lock(4, true);
    t.lock(120, true);
    t.lock(-1, true);
    t.step();
    t.sim.inventory.onLock(t.p, { slot: 3, on: 'yes' });
    t.sim.inventory.onLock(t.p, { slot: 3.5, on: true });
    expect(t.char.inv.filter((s) => s?.lk).length).toBe(0);
  });

  it('ô khóa: không làm nguyên liệu (remove/count), không nhận thêm khi nhặt, không gộp bằng đổi chỗ', () => {
    const t = setup();
    t.give((d) => ((d.inv[0] = { id: ORE, n: 5, lk: true }), (d.inv[1] = { id: ORE, n: 3 })));
    t.char.tx('t', null, (d) => {
      expect(d.count(ORE)).toBe(3);
      expect(d.remove(ORE, 4)).toBe(false);
      expect(d.remove(ORE, 3)).toBe(true);
      return true;
    });
    expect(t.char.inv[0]).toEqual({ id: ORE, n: 5, lk: true });
    t.char.tx('t', null, (d) => d.add(ORE, 2));
    expect(t.char.inv[0]!.n).toBe(5);
    expect(t.total(ORE)).toBe(7);
    t.give((d) => (d.inv[2] = { id: ORE, n: 1 }));
    t.sim.onMoveItem(t.p, { a: 2, b: 0 });
    expect(t.char.inv[0]).toEqual({ id: ORE, n: 1 });
    expect(t.char.inv[2]).toEqual({ id: ORE, n: 5, lk: true });
  });

  it('ô khóa không bán được (kiểm ở server); ô không khóa bán được', () => {
    const t = setup();
    t.p.move.x = 2004;
    t.p.move.z = 2064;
    t.give((d) => ((d.inv[0] = { id: ORE, n: 5, lk: true }), (d.inv[1] = { id: ORE, n: 5 })));
    const gold = t.char.gold;
    t.sim.onSell(t.p, { npc: 'npc_duoc_su', slot: 0, n: 5, r: 'sell-lock' });
    expect(t.char.gold).toBe(gold);
    expect(t.char.inv[0]?.n).toBe(5);
    t.sim.onSell(t.p, { npc: 'npc_duoc_su', slot: 1, n: 5, r: 'sell-free' });
    expect(t.char.gold).toBeGreaterThan(gold);
  });
});

describe('tách chồng', () => {
  it('tách n sang ô trống đầu tiên hoặc ô chỉ định; tổng giữ nguyên; kế thừa khóa', () => {
    const t = setup();
    t.give((d) => (d.inv[0] = { id: ORE, n: 10 }));
    t.split(0, 4);
    expect(t.char.inv[0]!.n).toBe(6);
    expect(t.char.inv[1]).toEqual({ id: ORE, n: 4 });
    t.split(0, 2, { to: 100 });
    expect(t.char.inv[100]).toEqual({ id: ORE, n: 2 });
    expect(t.total(ORE)).toBe(10);
    t.lock(0, true);
    t.split(0, 1);
    expect(t.char.inv.filter((s, i) => i > 1 && i < 100 && s?.lk).length).toBe(1);
    const loaded = Character.load(t.char.id);
    expect(loaded.inv.reduce((s, x) => s + (x?.id === ORE ? x.n : 0), 0)).toBe(10);
  });

  it('từ chối: n âm/0/không nguyên/≥ số lượng, đồ không chồng được, ô đích có đồ, ngoài phạm vi, trùng khóa', () => {
    const t = setup();
    t.give((d) => ((d.inv[0] = { id: ORE, n: 5 }), (d.inv[1] = { id: PILL, n: 1 }), (d.inv[9] = { id: ORE, n: 1 })));
    const snap = JSON.stringify(t.char.inv);
    for (const k of [-3, 0, 1.5, 5, 6]) t.split(0, k);
    t.split(0, 2, { to: 9 });
    t.split(0, 2, { to: 120 });
    t.split(0, 2, { to: 0 });
    t.split(120, 1);
    t.split(-1, 1);
    expect(JSON.stringify(t.char.inv)).toBe(snap);
    t.split(0, 2, {}, 'k-dup');
    expect(t.char.inv[0]!.n).toBe(3);
    t.split(0, 2, {}, 'k-dup');
    expect(t.char.inv[0]!.n).toBe(3);
    expect(t.total(ORE)).toBe(6);
  });

  it('túi đầy thì không tách được', () => {
    const t = setup();
    t.give((d) => {
      for (let i = 0; i < INV_SIZE; i++) d.inv[i] = { id: ORE, n: 2 };
    });
    const snap = JSON.stringify(t.char.inv);
    t.split(0, 1);
    expect(JSON.stringify(t.char.inv)).toBe(snap);
  });
});

describe('gửi túi theo delta', () => {
  it('tin đầu đầy đủ; đổi ít ô gửi delta; đổi nhiều ô gửi đầy đủ; áp lên client khớp server', () => {
    const t = setup();
    t.give((d) => (d.inv[9] = { id: PILL, n: 1 }));
    t.sim.tick(50);
    const m0 = t.invMsgs().at(-1)!;
    expect(m0.inv?.length).toBe(INV_SIZE); // tin S.INV đầu tiên của phiên luôn là ảnh đầy đủ
    let client: InvSlot[] = applyInvMsg([], m0);
    t.give((d) => (d.inv[10] = { id: ORE, n: 2 }));
    t.sim.tick(50);
    const m1 = t.invMsgs().at(-1)!;
    expect(m1.inv).toBeUndefined();
    expect(m1.d).toEqual([[10, { id: ORE, n: 2 }]]);
    client = applyInvMsg(client, m1);
    t.lock(10, true);
    t.sim.tick(50);
    const m2 = t.invMsgs().at(-1)!;
    expect(m2.d).toEqual([[10, { id: ORE, n: 2, lk: true }]]);
    client = applyInvMsg(client, m2);
    t.give((d) => {
      for (let i = 20; i < 60; i++) d.inv[i] = { id: PILL, n: 1 + (i % 3) };
    });
    t.sim.tick(50);
    const m3 = t.invMsgs().at(-1)!;
    expect(m3.inv?.length).toBe(INV_SIZE);
    client = applyInvMsg(client, m3);
    expect(JSON.parse(JSON.stringify(client))).toEqual(JSON.parse(JSON.stringify(t.char.inv)));
    expect(JSON.stringify(m1).length).toBeLessThan(JSON.stringify(m3).length / 4);
  });
});

describe('kết nối lại', () => {
  it('đổi túi lúc mất kết nối rồi nối lại: tin S.INV kế tiếp là ảnh đầy đủ khớp server', () => {
    const t = setup();
    t.give((d) => (d.inv[9] = { id: PILL, n: 1 }));
    t.sim.tick(50);
    t.give((d) => (d.inv[10] = { id: ORE, n: 2 }));
    t.sim.tick(50);
    expect(t.invMsgs().at(-1)!.d).toBeDefined();
    t.p.connected = false;
    t.give((d) => (d.inv[11] = { id: ORE, n: 5 }));
    const n = t.invMsgs().length;
    t.sim.tick(50);
    expect(t.invMsgs().length).toBe(n); // không gửi vào socket chết
    // giống GameRoom.onLeave sau allowReconnection
    t.p.connected = true;
    t.p.invSent = undefined;
    t.char.invDirty = true;
    t.sim.tick(50);
    const m = t.invMsgs().at(-1)!;
    expect(m.inv?.length).toBe(INV_SIZE);
    expect(JSON.parse(JSON.stringify(applyInvMsg([], m)))).toEqual(JSON.parse(JSON.stringify(t.char.inv)));
  });
});

describe('migration DB v4 → v5', () => {
  it('thêm cột locked, giữ đồ ở ô 0–29, ô khóa mặc định mở', () => {
    expect(DATA_VERSION).toBe(5);
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'dtl-tda-')), 'v4.db');
    const a = openDb(file);
    a.sqlite.exec('DROP TABLE items; CREATE TABLE items (char_id INTEGER NOT NULL, slot INTEGER NOT NULL, item_id TEXT NOT NULL, qty INTEGER NOT NULL, plus INTEGER NOT NULL DEFAULT 0, inst TEXT, PRIMARY KEY (char_id, slot));');
    a.sqlite.prepare('INSERT INTO characters (account_id, name, level) VALUES (1, ?, 5)').run('cu_nhan');
    const id = (a.sqlite.prepare('SELECT id FROM characters').get() as { id: number }).id;
    a.sqlite.prepare('INSERT INTO items (char_id, slot, item_id, qty) VALUES (?, 0, ?, 7), (?, 29, ?, 3)').run(id, ORE, id, PILL);
    a.sqlite.pragma('user_version = 4');
    a.sqlite.close();
    const b = openDb(file);
    expect(b.sqlite.pragma('user_version', { simple: true })).toBe(5);
    const cols = (b.sqlite.prepare('PRAGMA table_info(items)').all() as { name: string }[]).map((c) => c.name);
    expect(cols).toContain('locked');
    const rows = b.sqlite.prepare('SELECT slot, item_id, qty, locked FROM items ORDER BY slot').all();
    expect(rows).toEqual([
      { slot: 0, item_id: ORE, qty: 7, locked: 0 },
      { slot: 29, item_id: PILL, qty: 3, locked: 0 },
    ]);
    b.sqlite.close();
  });
});
