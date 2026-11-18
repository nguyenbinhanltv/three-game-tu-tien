import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { beforeAll, describe, expect, it } from 'vitest';
import { INV_SIZE } from '@dtl/shared';

// DB trong bộ nhớ cho các module kéo theo db.ts.
process.env.DB_FILE = ':memory:';

let openDb: typeof import('../db').openDb;
let DATA_VERSION: number;
let Character: typeof import('./character').Character;
let sqlite: typeof import('../db').sqlite;

beforeAll(async () => {
  ({ openDb, DATA_VERSION, sqlite } = await import('../db'));
  ({ Character } = await import('./character'));
});

// Schema cũ (3 ô, chưa có cột items.inst, chưa user_version).
const OLD_DDL = `
CREATE TABLE accounts (id INTEGER PRIMARY KEY AUTOINCREMENT, sub TEXT NOT NULL UNIQUE, email TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL);
CREATE TABLE invites (email TEXT PRIMARY KEY);
CREATE TABLE characters (
  id INTEGER PRIMARY KEY AUTOINCREMENT, account_id INTEGER NOT NULL UNIQUE, name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  level INTEGER NOT NULL DEFAULT 1, xp INTEGER NOT NULL DEFAULT 0, gold INTEGER NOT NULL DEFAULT 0,
  hp INTEGER NOT NULL DEFAULT 1, mp INTEGER NOT NULL DEFAULT 0, x REAL NOT NULL DEFAULT 0, y REAL NOT NULL DEFAULT 0, z REAL NOT NULL DEFAULT 0,
  room TEXT NOT NULL DEFAULT '', equip TEXT NOT NULL DEFAULT '{}', quests TEXT NOT NULL DEFAULT '{"active":{},"done":[]}',
  meta TEXT NOT NULL DEFAULT '{}', updated_at INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE items (char_id INTEGER NOT NULL, slot INTEGER NOT NULL, item_id TEXT NOT NULL, qty INTEGER NOT NULL, plus INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (char_id, slot));
CREATE TABLE ledger (id INTEGER PRIMARY KEY AUTOINCREMENT, char_id INTEGER NOT NULL, kind TEXT NOT NULL, ref TEXT NOT NULL DEFAULT '', delta INTEGER NOT NULL, reason TEXT NOT NULL, idem TEXT UNIQUE, ts INTEGER NOT NULL);
`;

function oldDb(): { file: string; raw: Database.Database } {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'dtl-mig-')), 'old.db');
  const raw = new Database(file);
  raw.exec(OLD_DDL);
  return { file, raw };
}

describe('migration 3 ô → 8 ô', () => {
  it('đưa accessory vào ô đúng loại, giữ cường hóa và đồ trong túi, không mất gì', () => {
    const { file, raw } = oldDb();
    const eqOf = (items: Record<string, unknown>) => JSON.stringify(items);
    const ins = raw.prepare('INSERT INTO characters (account_id, name, equip) VALUES (?, ?, ?)');
    ins.run(
      1,
      'A',
      eqOf({
        weapon: { id: 'itm_moc_kiem', n: 1, plus: 3 },
        robe: { id: 'itm_bo_y', n: 1 },
        accessory: { id: 'itm_ngoc_boi', n: 1, plus: 2 },
      }),
    );
    ins.run(2, 'B', eqOf({ accessory: { id: 'itm_huyen_thiet_gioi', n: 1 } }));
    ins.run(3, 'C', eqOf({ weapon: { id: 'itm_moc_kiem', n: 1 } }));
    raw.prepare('INSERT INTO items VALUES (1, 0, ?, 1, 4)').run('itm_thiet_kiem');
    raw.close();

    const { sqlite: s } = openDb(file);
    const eq = (name: string) =>
      JSON.parse((s.prepare('SELECT equip FROM characters WHERE name = ?').get(name) as { equip: string }).equip);
    expect(eq('A')).toEqual({
      weapon: { id: 'itm_moc_kiem', n: 1, plus: 3 },
      robe: { id: 'itm_bo_y', n: 1 },
      jade: { id: 'itm_ngoc_boi', n: 1, plus: 2 },
    });
    expect(eq('B')).toEqual({ ring: { id: 'itm_huyen_thiet_gioi', n: 1 } });
    expect(eq('C')).toEqual({ weapon: { id: 'itm_moc_kiem', n: 1 } });
    expect(s.prepare('SELECT item_id, plus, inst FROM items WHERE char_id = 1').all()).toEqual([
      { item_id: 'itm_thiet_kiem', plus: 4, inst: null },
    ]);
    expect(s.pragma('user_version', { simple: true })).toBe(DATA_VERSION);
    s.close();
  }, 30_000);

  it('chạy lại không đổi gì (idempotent) và không ghi ledger', () => {
    const { file, raw } = oldDb();
    raw
      .prepare('INSERT INTO characters (account_id, name, equip) VALUES (1, ?, ?)')
      .run('A', JSON.stringify({ accessory: { id: 'itm_ngoc_boi', n: 1 } }));
    raw.close();
    const first = openDb(file);
    const snap = JSON.stringify(first.sqlite.prepare('SELECT * FROM characters').all());
    first.sqlite.close();
    const second = openDb(file);
    expect(JSON.stringify(second.sqlite.prepare('SELECT * FROM characters').all())).toBe(snap);
    expect(second.sqlite.prepare('SELECT COUNT(*) AS n FROM ledger').get()).toEqual({ n: 0 });
    second.sqlite.close();
  });

  it('nhân vật cũ nạp được: chỉ số đúng như trước migration', async () => {
    // Weapon +3 (atk 4) và ngọc bội +2 (mp 40, hp 20) nạp qua Character.load.
    const acc = Date.now() % 1_000_000;
    const c = Character.create(acc, 'Cu' + acc, null, 'kim' as never); // Kim không cộng hp/mp/công/thủ
    sqlite
      .prepare('UPDATE characters SET equip = ? WHERE id = ?')
      .run(JSON.stringify({ weapon: { id: 'itm_moc_kiem', n: 1, plus: 3 }, jade: { id: 'itm_ngoc_boi', n: 1, plus: 2 } }), c.id);
    const l = Character.load(c.id);
    const base = Character.load(Character.create(acc + 1, 'Cu' + (acc + 1), null, 'kim' as never).id);
    expect(l.atk).toBe(base.atk + Math.round(4 * 1.24));
    expect(l.mmp).toBe(base.mmp + Math.round(40 * 1.16));
  });
});

describe('trang bị đã roll: lưu, ledger, idempotency', () => {
  // Linh căn cố định (Kim không cộng hp/mp/công/thủ): bỏ trống thì `Character.create` roll ngẫu nhiên, hai nhân vật đem so chỉ số
  // có thể lệch nhau 1 điểm công và test đỏ theo lượt (từng gặp trên CI: `expected 68 to be greater than 68`).
  const mk = (n: string) =>
    Character.create(900_000 + Math.floor(Math.random() * 90_000), n + Math.floor(Math.random() * 1e6), null, 'kim' as never);

  it('roll ghi inst vào DB, ledger có seed, nạp lại giống hệt, chỉ số tính từ inst', () => {
    const c = mk('R');
    expect(c.tx('test:roll', 'k1', (d) => d.addRolled('itm_thanh_phong_kiem', 12, 4))).toBe(true);
    const slot = c.inv.findIndex((s) => s?.id === 'itm_thanh_phong_kiem');
    const inst = c.inv[slot]!.inst!;
    expect(inst.q).toBe(4);
    expect(inst.affixes).toHaveLength(4);
    const row = sqlite.prepare('SELECT inst FROM items WHERE char_id = ? AND slot = ?').get(c.id, slot) as { inst: string };
    expect(JSON.parse(row.inst)).toEqual(inst);
    const led = sqlite.prepare("SELECT reason, delta FROM ledger WHERE char_id = ? AND kind = 'item'").all(c.id) as {
      reason: string;
      delta: number;
    }[];
    expect(led).toHaveLength(1);
    expect(led[0].delta).toBe(1);
    expect(led[0].reason).toMatch(/^test:roll roll=\d+:q4:il12$/);
    expect(Character.load(c.id).inv[slot]).toEqual(c.inv[slot]);

    // Mặc vào ô: chỉ số lấy từ dòng chính × dòng phụ.
    c.equip.weapon = c.inv[slot]!;
    c.recalc();
    const bare = Character.load(mk('S').id);
    expect(c.atk).toBeGreaterThan(bare.atk + inst.main.atk! - 1);
  });

  it('Thần phẩm (q5): lưu DB không cần migration, 5 dòng phụ, ledger ghi q5, nạp lại giống hệt; q6 bị từ chối', () => {
    const c = mk('T');
    expect(c.tx('test:roll', 'than-1', (d) => d.addRolled('itm_thanh_phong_kiem', 12, 5))).toBe(true);
    const slot = c.inv.findIndex((s) => s?.id === 'itm_thanh_phong_kiem');
    const inst = c.inv[slot]!.inst!;
    expect(inst.q).toBe(5);
    expect(inst.affixes).toHaveLength(5);
    expect(inst.gems).toHaveLength(3);
    const led = sqlite.prepare("SELECT reason FROM ledger WHERE char_id = ? AND kind = 'item'").all(c.id) as { reason: string }[];
    expect(led).toHaveLength(1);
    expect(led[0].reason).toMatch(/^test:roll roll=\d+:q5:il12$/);
    expect(Character.load(c.id).inv[slot]).toEqual(c.inv[slot]);
    expect(c.tx('test:roll', 'than-2', (d) => d.addRolled('itm_thanh_phong_kiem', 12, 6 as 0))).toBe(false);
  });

  it('cùng khóa idempotency lần hai bị từ chối, không sinh thêm đồ', () => {
    const c = mk('I');
    expect(c.tx('test:roll', 'dup-1', (d) => d.addRolled('itm_dao_bao', 5, 2))).toBe(true);
    expect(c.tx('test:roll', 'dup-1', (d) => d.addRolled('itm_dao_bao', 5, 2))).toBe(false);
    expect(c.txFail).toBe('dup');
    expect(c.inv.filter((s) => s?.id === 'itm_dao_bao')).toHaveLength(1);
  });

  it('chỉ roll được từ mẫu trang bị, phẩm hợp lệ, túi đầy thì hủy cả giao dịch', () => {
    const c = mk('F');
    expect(c.tx('t', null, (d) => d.addRolled('itm_linh_thao', 5, 1))).toBe(false);
    expect(c.tx('t', null, (d) => d.addRolled('itm_moc_kiem', 5, 7 as 0))).toBe(false);
    expect(c.tx('t', null, (d) => d.addRolled('itm_khong_co', 5, 1))).toBe(false);
    for (let i = 0; i < INV_SIZE; i++) expect(c.tx('fill', null, (d) => d.addRolled('itm_moc_kiem', 3, 0))).toBe(true);
    expect(c.tx('t', null, (d) => d.addRolled('itm_moc_kiem', 3, 0))).toBe(false);
    expect(c.inv.filter(Boolean)).toHaveLength(INV_SIZE);
  });

  it('dòng chính vô lý trong DB bị bỏ riêng, món vẫn giữ phẩm/ilvl', () => {
    const c = mk('H');
    expect(c.tx('t', null, (d) => d.addRolled('itm_moc_kiem', 5, 1))).toBe(true);
    const slot = c.inv.findIndex(Boolean);
    sqlite
      .prepare('UPDATE items SET inst = ? WHERE char_id = ? AND slot = ?')
      .run(JSON.stringify({ q: 4, ilvl: 5, main: { atk: 99999 }, affixes: [], gems: [], bound: false }), c.id, slot);
    expect(Character.load(c.id).inv[slot]!.inst).toMatchObject({ q: 4, ilvl: 5, main: {} });
  });

  it('nạp trang bị: bỏ khóa ô cũ, không xóa thầm đồ lệch ô', () => {
    const c = mk('E');
    sqlite.prepare('UPDATE characters SET equip = ? WHERE id = ?').run(
      JSON.stringify({
        weapon: { id: 'itm_moc_kiem', n: 1 },
        robe: { id: 'itm_moc_kiem', n: 1 },
        accessory: { id: 'itm_ngoc_boi', n: 1 },
      }),
      c.id,
    );
    const l = Character.load(c.id);
    // khóa accessory (cũ) bị bỏ; đồ lệch ô được giữ nguyên, không xóa thầm
    expect(Object.keys(l.equip).sort()).toEqual(['robe', 'weapon']);
  });
});
