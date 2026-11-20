import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { integer, primaryKey, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import {
  DISPLAY_SLOTS,
  DUNGEON_MIN_LEVEL,
  initialBottleneck,
  INV_SIZE,
  isDisplaySlot,
  isEquipSlot,
  isRootId,
  isWearSlot,
  ROOT_IDS,
  TELE_FREE,
  TELE_PADS,
  TRUC_CO_LEVEL,
  HOA_THAN_LEVEL,
  xpNeed,
  at,
} from '@dtl/shared';
import { ITEM, LEVELS } from '@dtl/content';
import { config } from './config';
import { log } from './log';

export const accounts = sqliteTable('accounts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  /** 'g:<google sub>' hoặc 'dev:<tên>'. */
  sub: text('sub').notNull().unique(),
  email: text('email').notNull().default(''),
  createdAt: integer('created_at').notNull(),
});

export const invites = sqliteTable('invites', {
  email: text('email').primaryKey(),
});

export const characters = sqliteTable('characters', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  accountId: integer('account_id').notNull().unique(),
  name: text('name').notNull().unique(),
  level: integer('level').notNull().default(1),
  xp: integer('xp').notNull().default(0),
  gold: integer('gold').notNull().default(0),
  hp: integer('hp').notNull().default(1),
  mp: integer('mp').notNull().default(0),
  x: real('x').notNull().default(0),
  y: real('y').notNull().default(0),
  z: real('z').notNull().default(0),
  room: text('room').notNull().default(''),
  equip: text('equip').notNull().default('{}'),
  quests: text('quests').notNull().default('{"active":{},"done":[]}'),
  meta: text('meta').notNull().default('{}'),
  /** Ngoại hình JSON `{"g":"m","dye":"attire_sect"}` (quyết định 6.4b); '' = nhân vật cũ, màu theo tên. */
  appearance: text('appearance').notNull().default(''),
  /** Tủ ngoại trang (P4): JSON `OutfitLook` (ghi đè hiển thị theo ô + nhuộm 3 kênh); rỗng = không dùng. */
  look: text('look').notNull().default(''),
  /** Linh căn ngũ hành (`RootId`); '' chỉ tồn tại tới lần migration/nạp đầu, sau đó luôn có. */
  root: text('root').notNull().default(''),
  /** Bình cảnh đã vượt cao nhất: 0, 5, 10 hoặc 15 (Phase 3-7). */
  bk: integer('bk').notNull().default(0),
  /** Truyền Tống Trận đã mở khóa (M-4): mảng JSON id (`TELE_PADS`), không gồm trận mở sẵn; '' = chưa qua migration. */
  tele: text('tele').notNull().default(''),
  updatedAt: integer('updated_at').notNull().default(0),
});

export const items = sqliteTable(
  'items',
  {
    charId: integer('char_id').notNull(),
    slot: integer('slot').notNull(),
    itemId: text('item_id').notNull(),
    qty: integer('qty').notNull(),
    plus: integer('plus').notNull().default(0),
    /** Phần đã roll của trang bị (JSON `ItemInst`: phẩm, ilvl, dòng chính/phụ, ngọc, ràng buộc); NULL = đồ cũ/vật phẩm thường. */
    inst: text('inst'),
    /** Ô khóa (TD-A): 1 = không bán/phân giải/làm nguyên liệu/gộp khi sắp xếp. */
    locked: integer('locked').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.charId, t.slot] })],
);

/** Tủ ngoại trang (P4): món đã mở khóa theo nhân vật, vĩnh viễn (bán/phân giải món vẫn còn). Chỉ ghi trong `Character.tx`. */
export const wardrobe = sqliteTable(
  'wardrobe',
  {
    charId: integer('char_id').notNull(),
    itemId: text('item_id').notNull(),
    at: integer('at').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.charId, t.itemId] })],
);

export const ledger = sqliteTable('ledger', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  charId: integer('char_id').notNull(),
  /** 'gold' | 'item' | 'noop'. */
  kind: text('kind').notNull(),
  ref: text('ref').notNull().default(''),
  delta: integer('delta').notNull(),
  reason: text('reason').notNull(),
  /** Khóa chống xử lý trùng; duy nhất nếu có. */
  idem: text('idem').unique(),
  ts: integer('ts').notNull(),
});

const DDL = `
CREATE TABLE IF NOT EXISTS accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sub TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS invites (email TEXT PRIMARY KEY);
CREATE TABLE IF NOT EXISTS characters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL UNIQUE,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  level INTEGER NOT NULL DEFAULT 1,
  xp INTEGER NOT NULL DEFAULT 0,
  gold INTEGER NOT NULL DEFAULT 0,
  hp INTEGER NOT NULL DEFAULT 1,
  mp INTEGER NOT NULL DEFAULT 0,
  x REAL NOT NULL DEFAULT 0,
  y REAL NOT NULL DEFAULT 0,
  z REAL NOT NULL DEFAULT 0,
  room TEXT NOT NULL DEFAULT '',
  equip TEXT NOT NULL DEFAULT '{}',
  quests TEXT NOT NULL DEFAULT '{"active":{},"done":[]}',
  meta TEXT NOT NULL DEFAULT '{}',
  appearance TEXT NOT NULL DEFAULT '',
  look TEXT NOT NULL DEFAULT '',
  root TEXT NOT NULL DEFAULT '',
  bk INTEGER NOT NULL DEFAULT 0,
  tele TEXT NOT NULL DEFAULT '',
  updated_at INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS items (
  char_id INTEGER NOT NULL,
  slot INTEGER NOT NULL,
  item_id TEXT NOT NULL,
  qty INTEGER NOT NULL,
  plus INTEGER NOT NULL DEFAULT 0,
  inst TEXT,
  locked INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (char_id, slot)
);
CREATE TABLE IF NOT EXISTS wardrobe (
  char_id INTEGER NOT NULL,
  item_id TEXT NOT NULL,
  at INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (char_id, item_id)
);
CREATE TABLE IF NOT EXISTS ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  char_id INTEGER NOT NULL,
  kind TEXT NOT NULL,
  ref TEXT NOT NULL DEFAULT '',
  delta INTEGER NOT NULL,
  reason TEXT NOT NULL,
  idem TEXT UNIQUE,
  ts INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ledger_char ON ledger (char_id);
`;

/**
 * Cột thêm sau khi bảng đã có dữ liệu: `CREATE TABLE IF NOT EXISTS` không thêm cột vào bảng cũ nên phải ALTER.
 * Mỗi cột mới trong DDL ở trên (sau bản đầu) phải có một dòng ở đây.
 */
const ADDED_COLUMNS: [table: string, column: string, ddl: string][] = [
  ['characters', 'appearance', "TEXT NOT NULL DEFAULT ''"],
  ['items', 'inst', 'TEXT'],
  ['items', 'locked', 'INTEGER NOT NULL DEFAULT 0'],
  ['characters', 'root', "TEXT NOT NULL DEFAULT ''"],
  ['characters', 'bk', 'INTEGER NOT NULL DEFAULT 0'],
  ['characters', 'tele', "TEXT NOT NULL DEFAULT ''"],
  ['characters', 'look', "TEXT NOT NULL DEFAULT ''"],
];

/** Phiên bản dữ liệu (PRAGMA user_version). 1 = trang bị 8 ô (Phase 3-1); 2 = linh căn + bình cảnh (Phase 3-7); 3 = Truyền Tống Trận (M-4); 4 = thang 28 cấp (E1-C: tu vi Trúc Cơ, bình cảnh); 6 = trần cấp 32 (DV-3K: tu vi cấp 28 từng là trần `99.999.999` nên bị kẹp về `xpNeed(28)`); 7 = tủ ngoại trang P4 (điền `wardrobe` từ túi + trang bị hiện có); 5 = túi 120 ô + cột `items.locked` (TD-A; không cần đổi dữ liệu: túi chỉ là các hàng theo ô, đồ cũ ở ô 0–29 giữ nguyên). */
export const DATA_VERSION = 7;

/**
 * Chuyển trang bị từ 3 ô (weapon/robe/accessory) sang 8 ô: `accessory` đi vào ô đúng loại của mẫu
 * (ngọc bội → jade, giới chỉ → ring). Chỉ đổi chỗ, không tạo hay mất vật phẩm nên không ghi ledger.
 * Khóa lạ khác được đưa về túi. Chạy một lần (user_version), idempotent.
 */
function migrateEquipSlots(sqlite: Database.Database): void {
  const rows = sqlite.prepare('SELECT id, equip FROM characters').all() as { id: number; equip: string }[];
  const upd = sqlite.prepare('UPDATE characters SET equip = ? WHERE id = ?');
  const usedSlots = sqlite.prepare('SELECT slot FROM items WHERE char_id = ?');
  const putItem = sqlite.prepare('INSERT INTO items (char_id, slot, item_id, qty, plus, inst) VALUES (?, ?, ?, 1, ?, ?)');
  for (const r of rows) {
    let eq: Record<string, { id: string; n: number; plus?: number; inst?: unknown }>;
    try {
      eq = JSON.parse(r.equip) as typeof eq;
    } catch {
      continue;
    }
    if (!eq || typeof eq !== 'object') continue;
    const out: typeof eq = {};
    const stray: { id: string; n: number; plus?: number; inst?: unknown }[] = [];
    let changed = false;
    for (const [k, it] of Object.entries(eq)) {
      if (!it || typeof it.id !== 'string') {
        changed = true;
        continue;
      }
      if (isWearSlot(k)) {
        out[k] = it;
        continue;
      }
      changed = true;
      const kind = ITEM.get(it.id)?.kind;
      if (isEquipSlot(kind) && !out[kind] && !eq[kind]) out[kind] = it;
      else stray.push(it);
    }
    if (!changed) continue;
    if (stray.length) {
      const used = new Set((usedSlots.all(r.id) as { slot: number }[]).map((x) => x.slot));
      for (const it of stray) {
        let i = 0;
        while (i < INV_SIZE && used.has(i)) i++;
        if (i >= INV_SIZE) {
          // Không xảy ra với dữ liệu 3 ô cũ (accessory luôn có ô); chỉ là lưới an toàn cho khóa lạ.
          log.warn('[migrate] túi đầy, bỏ vật phẩm không có ô:', r.id, it.id);
          continue;
        }
        used.add(i);
        putItem.run(r.id, i, it.id, it.plus ?? 0, it.inst ? JSON.stringify(it.inst) : null);
      }
    }
    upd.run(JSON.stringify(out), r.id);
  }
}

/** Linh căn xác định theo tên cho nhân vật cũ (cùng tên luôn ra cùng linh căn, không cần ngẫu nhiên). */
export function rootForName(name: string): (typeof ROOT_IDS)[number] {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.codePointAt(0)!) >>> 0;
  return at(ROOT_IDS, h % ROOT_IDS.length, 'ROOT_IDS');
}

/**
 * Phase 3-7: gán linh căn cho nhân vật chưa có và đặt bình cảnh đã vượt theo cấp hiện tại
 * (người đã qua tầng 5/10 không bị chặn lại). Không đụng vật phẩm/tiền nên không ghi ledger. Idempotent.
 */
function migrateRealm(sqlite: Database.Database): void {
  const rows = sqlite.prepare('SELECT id, name, level, root FROM characters').all() as {
    id: number;
    name: string;
    level: number;
    root: string;
  }[];
  const upd = sqlite.prepare('UPDATE characters SET root = ?, bk = ? WHERE id = ?');
  for (const r of rows) upd.run(isRootId(r.root) ? r.root : rootForName(r.name), initialBottleneck(r.level), r.id);
}

/**
 * M-4: nhân vật cũ chưa có cột `tele`. Mở sẵn trận của vùng mà họ đã vượt cấp (cấp cao hơn khoảng hợp của vùng nên chắc đã
 * đi qua) và trận cổng nếu đủ cấp vào Kiếm Trủng; còn lại phải chạm trận như người mới. Không đụng vật phẩm/tiền, idempotent.
 */
export function migrateTele(sqlite: Database.Database): void {
  const zones = at(LEVELS, 'van_lam').zones ?? [];
  const rows = sqlite.prepare("SELECT id, level FROM characters WHERE tele = ''").all() as { id: number; level: number }[];
  const upd = sqlite.prepare('UPDATE characters SET tele = ? WHERE id = ?');
  for (const r of rows) {
    const open = TELE_PADS.filter(
      (p) =>
        p.level === 'van_lam' &&
        (p.zone ? levelPast(zones, p.zone, r.level) : p.id === 'tp_cong' && r.level >= DUNGEON_MIN_LEVEL) &&
        !TELE_FREE.includes(p.id),
    ).map((p) => p.id);
    upd.run(JSON.stringify(open), r.id);
  }
}

/** `xpNeed` cũ của cấp Trúc Cơ 16–18 trước E1-C (30k/50k/70k); cấp 18 từng là trần nên tu vi ở đó không bị chặn ở mức này. */
const legacyTrucCoNeed = (level: number) => 30_000 + (level - TRUC_CO_LEVEL) * 20_000;

/**
 * E1-C: thang 28 cấp đổi `xpNeed` cấp 16–18 (30k/50k/70k → 56k/59k/62k) và thêm bình cảnh ở Trúc Cơ 17/19.
 * Nhân vật đang ở cấp 16–18 giữ **tỉ lệ** tiến độ trong cấp (tu vi nhân `xpNeed` mới / cũ, tối đa bằng đầy), nên không mất
 * tiến độ tương đối; người ở cấp 18 từng không bị chặn (cấp tối đa cũ) nên tu vi thừa bị chặn ở mức đầy và vẫn lên được cấp 19.
 * `bk` nâng lên bình cảnh đã vượt theo cấp (người ở 18 đã qua nút 17). Không đụng vật phẩm/tiền nên không ghi ledger.
 * Chỉ chạy một lần nhờ `user_version` (gọi lại sẽ nhân tỉ lệ lần nữa), xem `migrate`.
 */
/** DV-3K: cấp 28 hết là trần (`xpNeed` 99.999.999 → 234.000): tu vi tích thừa bị kẹp về mức đầy để không lên thẳng cấp 29 khi nâng trần. Chạy một lần (user_version). */
export function migrateHoaThanXp(sqlite: Database.Database): void {
  sqlite.prepare('UPDATE characters SET xp = MIN(xp, ?) WHERE level = ?').run(xpNeed(HOA_THAN_LEVEL), HOA_THAN_LEVEL);
}

function migrateTrucCoXp(sqlite: Database.Database): void {
  const rows = sqlite.prepare('SELECT id, level, xp, bk FROM characters WHERE level >= ? AND level <= 18').all(TRUC_CO_LEVEL) as {
    id: number;
    level: number;
    xp: number;
    bk: number;
  }[];
  const upd = sqlite.prepare('UPDATE characters SET xp = ?, bk = ? WHERE id = ?');
  for (const r of rows) {
    const oldNeed = legacyTrucCoNeed(r.level);
    const newNeed = xpNeed(r.level);
    const xp = Math.min(newNeed, Math.round((Math.max(0, r.xp) * newNeed) / oldNeed));
    upd.run(xp, Math.max(r.bk, initialBottleneck(r.level)), r.id);
  }
}

/**
 * Tủ ngoại trang (P4): điền `wardrobe` từ mọi món có hình trên người đang nằm ở túi hoặc trang bị của từng nhân vật.
 * Không tạo/mất vật phẩm hay tiền nên không ghi ledger. Idempotent (INSERT OR IGNORE).
 */
export function migrateWardrobe(sqlite: Database.Database): void {
  const ins = sqlite.prepare('INSERT OR IGNORE INTO wardrobe (char_id, item_id, at) VALUES (?, ?, ?)');
  const now = Date.now();
  const show = (id: unknown): id is string => typeof id === 'string' && isDisplaySlot(ITEM.get(id)?.kind);
  for (const r of sqlite.prepare('SELECT char_id, item_id FROM items').all() as { char_id: number; item_id: string }[]) {
    if (show(r.item_id)) ins.run(r.char_id, r.item_id, now);
  }
  for (const r of sqlite.prepare('SELECT id, equip FROM characters').all() as { id: number; equip: string }[]) {
    let eq: Record<string, { id?: unknown } | null> = {};
    try {
      eq = JSON.parse(r.equip) as typeof eq;
    } catch {
      continue;
    }
    if (!eq || typeof eq !== 'object') continue;
    for (const slot of DISPLAY_SLOTS) {
      const id = eq[slot]?.id;
      if (show(id)) ins.run(r.id, id, now);
    }
  }
}

function levelPast(zones: readonly { id: string; lvMax: number }[], zone: string, level: number): boolean {
  const z = zones.find((x) => x.id === zone);
  return !!z && level > z.lvMax;
}

function migrate(sqlite: Database.Database): void {
  // Một transaction: lỗi giữa chừng thì không để DB nửa vời (SQLite cho ALTER trong transaction).
  sqlite.transaction(() => {
    for (const [table, column, ddl] of ADDED_COLUMNS) {
      const cols = sqlite.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
      if (!cols.some((c) => c.name === column)) sqlite.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
    }
    const v = sqlite.pragma('user_version', { simple: true }) as number;
    if (v < 1) migrateEquipSlots(sqlite);
    if (v < 2) migrateRealm(sqlite);
    if (v < 3) migrateTele(sqlite);
    if (v < 4) migrateTrucCoXp(sqlite);
    if (v < 6) migrateHoaThanXp(sqlite);
    if (v < 7) migrateWardrobe(sqlite);
    if (v < DATA_VERSION) sqlite.pragma(`user_version = ${DATA_VERSION}`);
  })();
}

export function openDb(file: string = config.dbFile) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const sqlite = new Database(file);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('synchronous = NORMAL');
  sqlite.exec(DDL);
  migrate(sqlite);
  return { sqlite, db: drizzle(sqlite) };
}

const opened = openDb();
export const sqlite = opened.sqlite;
export const db = opened.db;
