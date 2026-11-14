import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { integer, primaryKey, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { config } from './config';

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
  },
  (t) => [primaryKey({ columns: [t.charId, t.slot] })],
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
  updated_at INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS items (
  char_id INTEGER NOT NULL,
  slot INTEGER NOT NULL,
  item_id TEXT NOT NULL,
  qty INTEGER NOT NULL,
  plus INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (char_id, slot)
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

export function openDb(file: string = config.dbFile) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const sqlite = new Database(file);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('synchronous = NORMAL');
  sqlite.exec(DDL);
  return { sqlite, db: drizzle(sqlite) };
}

const opened = openDb();
export const sqlite = opened.sqlite;
export const db = opened.db;
export type Db = typeof db;
