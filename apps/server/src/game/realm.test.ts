import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { beforeAll, describe, expect, it } from 'vitest';
import { isRootId, PF_DEAD, rootChangeCost, xpNeed } from '@dtl/shared';

process.env.DB_FILE = ':memory:';

let openDb: typeof import('../db').openDb;
let rootForName: typeof import('../db').rootForName;
let sqlite: typeof import('../db').sqlite;
let Character: typeof import('./character').Character;

beforeAll(async () => {
  ({ openDb, rootForName, sqlite } = await import('../db'));
  ({ Character } = await import('./character'));
});

let n = 0;
const fresh = (root?: 'hoa') => Character.create(900_000 + ++n, 'Tu' + n + Date.now(), null, root ?? null);

describe('migration linh căn + bình cảnh (DB v2)', () => {
  it('gán linh căn theo tên và bình cảnh đã vượt theo cấp; chạy lại không đổi', () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'dtl-realm-')), 'old.db');
    const raw = new Database(file);
    // Schema v1 (đã có inst, chưa có root/bk).
    raw.exec(`
CREATE TABLE accounts (id INTEGER PRIMARY KEY AUTOINCREMENT, sub TEXT NOT NULL UNIQUE, email TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL);
CREATE TABLE invites (email TEXT PRIMARY KEY);
CREATE TABLE characters (id INTEGER PRIMARY KEY AUTOINCREMENT, account_id INTEGER NOT NULL UNIQUE, name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  level INTEGER NOT NULL DEFAULT 1, xp INTEGER NOT NULL DEFAULT 0, gold INTEGER NOT NULL DEFAULT 0, hp INTEGER NOT NULL DEFAULT 1, mp INTEGER NOT NULL DEFAULT 0,
  x REAL NOT NULL DEFAULT 0, y REAL NOT NULL DEFAULT 0, z REAL NOT NULL DEFAULT 0, room TEXT NOT NULL DEFAULT '', equip TEXT NOT NULL DEFAULT '{}',
  quests TEXT NOT NULL DEFAULT '{"active":{},"done":[]}', meta TEXT NOT NULL DEFAULT '{}', appearance TEXT NOT NULL DEFAULT '', updated_at INTEGER NOT NULL DEFAULT 0);
CREATE TABLE items (char_id INTEGER NOT NULL, slot INTEGER NOT NULL, item_id TEXT NOT NULL, qty INTEGER NOT NULL, plus INTEGER NOT NULL DEFAULT 0, inst TEXT, PRIMARY KEY (char_id, slot));
CREATE TABLE ledger (id INTEGER PRIMARY KEY AUTOINCREMENT, char_id INTEGER NOT NULL, kind TEXT NOT NULL, ref TEXT NOT NULL DEFAULT '', delta INTEGER NOT NULL, reason TEXT NOT NULL, idem TEXT UNIQUE, ts INTEGER NOT NULL);
PRAGMA user_version = 1;`);
    const ins = raw.prepare('INSERT INTO characters (account_id, name, level) VALUES (?, ?, ?)');
    [3, 5, 7, 10, 15, 17].forEach((lv, i) => ins.run(i + 1, 'N' + lv, lv));
    raw.close();

    const first = openDb(file);
    const rows = () =>
      first.sqlite.prepare('SELECT name, level, root, bk FROM characters ORDER BY id').all() as {
        name: string;
        level: number;
        root: string;
        bk: number;
      }[];
    const got = rows();
    expect(got.map((r) => r.bk)).toEqual([0, 0, 5, 5, 10, 15]);
    for (const r of got) {
      expect(isRootId(r.root)).toBe(true);
      expect(r.root).toBe(rootForName(r.name));
    }
    const snap = JSON.stringify(got);
    first.sqlite.close();
    const second = openDb(file);
    expect(JSON.stringify(second.sqlite.prepare('SELECT name, level, root, bk FROM characters ORDER BY id').all())).toBe(snap);
    second.sqlite.close();
  }, 30_000);
});

describe('Character: linh căn', () => {
  it('chọn thì theo, không chọn thì server gán ngẫu nhiên hợp lệ', () => {
    expect(fresh('hoa').root).toBe('hoa');
    for (let i = 0; i < 5; i++) expect(isRootId(fresh().root)).toBe(true);
  });
  it('ảnh hưởng chỉ số: Hỏa +5% công kích, +8% sát thương hệ Hỏa', () => {
    const a = fresh('hoa');
    expect(a.stats.elemDmg.hoa).toBeCloseTo(0.08);
    sqlite.prepare('UPDATE characters SET root = ? WHERE id = ?').run('tho', a.id);
    const b = Character.load(a.id);
    expect(b.stats.elemDmg.tho).toBeCloseTo(0.08);
    expect(b.stats.elemDmg.hoa).toBeUndefined();
    expect(a.stats.atk).toBeGreaterThan(b.stats.atk);
  });
  it('đổi linh căn: trừ linh thạch + đổi root trong một transaction, ghi ledger, khóa trùng bị chặn', () => {
    const c = fresh('hoa');
    const cost = rootChangeCost(c.level);
    c.tx('gm', null, (d) => (d.addGold(cost + 10), true));
    const ok = c.tx('root:hoa>kim', 'k:dup-1', (d) => d.spendGold(cost) && ((d.root = 'kim'), true));
    expect(ok).toBe(true);
    expect(c.root).toBe('kim');
    expect(c.gold).toBe(10);
    expect(c.stats.critRate).toBeCloseTo(0.15);
    expect(Character.load(c.id).root).toBe('kim');
    const rows = sqlite.prepare("SELECT kind, delta, reason, idem FROM ledger WHERE char_id = ? AND reason LIKE 'root:%'").all(c.id);
    expect(rows).toEqual([{ kind: 'gold', delta: -cost, reason: 'root:hoa>kim', idem: 'k:dup-1' }]);
    c.gold += cost; // giả như đủ tiền lại: khóa trùng vẫn bị từ chối, root không đổi
    expect(c.tx('root:kim>moc', 'k:dup-1', (d) => d.spendGold(cost) && ((d.root = 'moc'), true))).toBe(false);
    expect(c.txFail).toBe('dup');
    expect(c.root).toBe('kim');
  });
  it('không đủ linh thạch thì không đổi, không ghi ledger', () => {
    const c = fresh('hoa');
    expect(c.tx('root:hoa>kim', 'k:poor-1', (d) => d.spendGold(1) && ((d.root = 'kim'), true))).toBe(false);
    expect(c.root).toBe('hoa');
  });
});

describe('Character: bình cảnh', () => {
  const at = (level: number, bk: number) => {
    const c = fresh();
    c.level = level;
    c.bk = bk;
    c.xp = 0;
    c.recalc();
    return c;
  };
  it('tầng 5 đầy tu vi thì kẹt, tu vi không tràn', () => {
    const c = at(5, 0);
    expect(c.gainXp(xpNeed(5) * 3)).toBe(0);
    expect(c.level).toBe(5);
    expect(c.xp).toBe(xpNeed(5));
  });
  it('các tầng thường lên bình thường, kẹt ở tầng 10', () => {
    const c = at(9, 5);
    expect(c.gainXp(xpNeed(9) + 10)).toBe(1);
    expect(c.level).toBe(10);
    c.gainXp(xpNeed(10) * 5);
    expect(c.level).toBe(10);
    expect(c.xp).toBe(xpNeed(10));
  });
  it('vượt bình cảnh tầng 5: lên tầng 6, tu vi về 0, hồi đầy, rồi lên tiếp được', () => {
    const c = at(5, 0);
    c.gainXp(xpNeed(5));
    c.hp = 1;
    expect(c.passBottleneck()).toBe(6);
    expect(c.bk).toBe(5);
    expect(c.xp).toBe(0);
    expect(c.hp).toBe(c.mhp);
    expect(c.gainXp(xpNeed(6))).toBe(1);
    expect(c.level).toBe(7);
  });
  it('tầng 15: vượt chỉ mở độ kiếp, không đổi tầng, giữ tu vi đầy', () => {
    const c = at(15, 10);
    c.gainXp(xpNeed(15));
    expect(c.passBottleneck()).toBe(15);
    expect(c.bk).toBe(15);
    expect(c.xp).toBe(xpNeed(15));
  });
  it('view báo linh căn, bình cảnh, đếm giờ thử thách/chờ', () => {
    const c = at(5, 0);
    c.trialEndsAt = Date.now() + 90_000;
    c.retryAt = Date.now() + 30_000;
    const v = c.view();
    expect(v.bk).toBe(0);
    expect(isRootId(v.root)).toBe(true);
    expect(v.trial).toBeGreaterThan(85);
    expect(v.retry).toBeGreaterThan(25);
  });
});

describe('thiên kiếp và người ngoài cuộc', () => {
  it('người đứng trong vòng sét của người khác vẫn mất máu nhưng không chết; chủ kiếp thì chết được', async () => {
    const { GameSim } = await import('./sim');
    const { WorldState } = await import('../state');
    const sim = new GameSim(new WorldState(), { broadcast: () => {} } as never, {
      levelId: 'van_lam',
      roomName: 'test',
      spawn: { x: 2048, z: 2088 },
      respawn: { x: 2048, z: 2088 },
      persistPosition: false,
    });
    const join = (sid: string) => sim.addPlayer({ sessionId: sid, send: () => {} } as never, fresh(), false, 'sess', false);
    const owner = join('own');
    const by = join('by');
    for (const p of [owner, by]) p.move = { ...p.move, x: 2048, z: 2088 };
    const lv0 = by.char.level;
    const xp0 = by.char.xp;
    // 8 tia 24% khí huyết tối đa đánh thẳng vào chỗ cả hai đang đứng.
    for (let i = 0; i < 8; i++) {
      sim.addHazard({ x: 2048, z: 2088, r: 4.2 }, 0, 0.24, true, 'lightning', owner.sid);
      sim.now += 10;
      (sim as unknown as { tickHazards(): void }).tickHazards();
    }
    expect(by.char.hp).toBe(1);
    expect(by.s.fl & PF_DEAD).toBe(0);
    expect([by.char.level, by.char.xp]).toEqual([lv0, xp0]);
    expect(owner.s.fl & PF_DEAD).toBe(PF_DEAD);
  });
});
