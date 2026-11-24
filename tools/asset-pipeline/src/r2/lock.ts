// Sổ khóa asset: mọi file dưới apps/client/public (trừ fonts/ và *.txt) với sha256 + kích thước.
// Git giữ sổ này (mỗi file một dòng, sắp theo đường dẫn nên merge/diff gọn); nhị phân nằm trên R2.
// Khóa trên R2 = đường dẫn tương đối so với public (ví dụ `assets/arch_sect.4d15d27b64.glb`).

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../config.js';

export const PUBLIC_DIR = path.join(ROOT, 'apps/client/public');
export const CACHE_DIR = path.join(ROOT, '.asset-cache');
export const LOCK_FILE = path.join(ROOT, 'assets/asset-lock.json');

export interface LockEntry {
  sha256: string;
  bytes: number;
}
export interface Lock {
  version: 1;
  files: Record<string, LockEntry>;
}

/** Không đưa lên R2: font (nhỏ, preload cùng origin) và văn bản giấy phép. */
export function isLocked(rel: string): boolean {
  if (rel.startsWith('fonts/')) return false;
  if (rel.endsWith('.txt') || rel.split('/').some((p) => p.startsWith('.'))) return false;
  return true;
}

/** Tên có đoạn hash nội dung 10 hex (`<id>.<hash10>.<ext>`): bất biến, cache immutable. */
export function isHashedName(rel: string): boolean {
  return /\.[0-9a-f]{10}\.[a-z0-9]+$/.test(rel);
}

export function walk(dir: string, base = dir): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(full, base));
    else if (e.isFile()) out.push(path.relative(base, full).split(path.sep).join('/'));
  }
  return out;
}

export function sha256File(file: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const h = createHash('sha256');
    fs.createReadStream(file)
      .on('data', (d) => h.update(d))
      .on('error', reject)
      .on('end', () => resolve(h.digest('hex')));
  });
}

/** Đường dẫn thật của một khóa: public/ trước, rồi .asset-cache/. */
export function localPath(rel: string): string | null {
  for (const dir of [PUBLIC_DIR, CACHE_DIR]) {
    const f = path.join(dir, rel);
    if (fs.existsSync(f)) return f;
  }
  return null;
}

export function readLock(file = LOCK_FILE): Lock {
  if (!fs.existsSync(file)) return { version: 1, files: {} };
  return JSON.parse(fs.readFileSync(file, 'utf8')) as Lock;
}

export function formatLock(lock: Lock): string {
  const keys = Object.keys(lock.files).sort();
  const lines = keys.map((k) => `    ${JSON.stringify(k)}: ${JSON.stringify(lock.files[k])}`);
  return `{\n  "version": 1,\n  "files": {\n${lines.join(',\n')}\n  }\n}\n`;
}

/** Chạy `fn` trên từng phần tử với tối đa `n` việc song song. */
export async function pool<T>(items: T[], n: number, fn: (x: T) => Promise<void>): Promise<void> {
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length) await fn(items[i++]);
    }),
  );
}

/**
 * Quét đĩa dựng sổ khóa. Hash lấy lại từ sổ cũ khi kích thước không đổi và tên đã chứa hash,
 * còn lại tính sha256 thật. File chỉ có trong .asset-cache (sau R2-3) cũng được tính.
 */
export async function scanLock(prev: Lock = readLock()): Promise<Lock> {
  const rels = new Set<string>();
  for (const dir of [PUBLIC_DIR, CACHE_DIR]) for (const r of walk(dir)) if (isLocked(r)) rels.add(r);
  const files: Record<string, LockEntry> = {};
  await pool([...rels], 8, async (rel) => {
    const f = localPath(rel)!;
    const bytes = fs.statSync(f).size;
    const old = prev.files[rel];
    if (old && old.bytes === bytes && isHashedName(rel)) files[rel] = old;
    else files[rel] = { sha256: await sha256File(f), bytes };
  });
  return { version: 1, files };
}

export function writeLock(lock: Lock, file = LOCK_FILE): boolean {
  const text = formatLock(lock);
  if (fs.existsSync(file) && fs.readFileSync(file, 'utf8') === text) return false;
  fs.writeFileSync(file, text);
  return true;
}
