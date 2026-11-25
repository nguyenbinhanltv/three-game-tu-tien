// Sổ khóa asset: mọi file dưới apps/client/public (trừ fonts/ và *.txt) với sha256 + kích thước.
// Git giữ sổ này (mỗi file một dòng, sắp theo đường dẫn nên merge/diff gọn); nhị phân nằm trên R2.
// Khóa trên R2 = đường dẫn tương đối so với public (ví dụ `assets/arch_sect.4d15d27b64.glb`).

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../config.js';
import { at } from '@dtl/shared';

export const PUBLIC_DIR = path.join(ROOT, 'apps/client/public');
export const CACHE_DIR = path.join(ROOT, '.asset-cache');
export const LOCK_FILE = path.join(ROOT, 'assets/asset-lock.json');
/** Nhị phân CŨ có tên cố định (không hash) được miễn quy tắc tên-theo-hash. Chỉ thu hẹp, không thêm file mới vào đây. */
export const GRACE_FILE = path.join(ROOT, 'assets/asset-fixed-names.json');

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

/** Nhị phân (phải có hash nội dung trong tên); manifest/json/văn bản được miễn. */
export const BINARY_EXT = /\.(glb|ktx2|webp|png|jpe?g|gif|webm|mp4|m4a|ogg|mp3|wav|bin)$/i;

/** Tên có đoạn hash nội dung hex 8–64 ký tự (`<id>.<hash>.<ext>`; bản mới dùng 10 ký tự đầu của sha256). */
export function hasContentHash(rel: string): boolean {
  return /\.[0-9a-f]{8,64}\.[a-z0-9]+$/.test(rel);
}

export function readGrace(file = GRACE_FILE): Set<string> {
  if (!fs.existsSync(file)) return new Set();
  return new Set((JSON.parse(fs.readFileSync(file, 'utf8')) as { files: string[] }).files);
}

/**
 * Nhị phân trong sổ khóa mà tên KHÔNG chứa hash nội dung và không nằm trong danh sách ân hạn. R2 là bất biến: một khóa đã có không bao giờ được ghi lại
 * nội dung khác (main và các nhánh khác đang tải khóa đó), nên nhị phân mới phải có tên `<tên>.<hash10>.<đuôi>` (hash10 = 10 ký tự đầu của sha256 nội dung).
 */
export function unhashedBinaries(lock: Lock, grace: Set<string> = readGrace()): string[] {
  return Object.keys(lock.files)
    .filter((k) => BINARY_EXT.test(k) && !hasContentHash(k) && !grace.has(k))
    .sort();
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
      while (i < items.length) await fn(at(items, i++, 'items'));
    }),
  );
}

/**
 * Nhị phân trong `dir` (mặc định public/) mà sổ khóa KHÔNG có: do cache CI khôi phục từ nhánh khác (`restore-keys`) hoặc file mồ côi. Chỉ xét NHỊ PHÂN
 * (manifest json không đụng) và KHÔNG bao giờ file git đang theo dõi (`tracked`). Chỉ xóa file cục bộ khi `apply`; KHÔNG bao giờ chạm R2.
 */
export function pruneStale(lock: Lock, apply: boolean, dir: string = PUBLIC_DIR, tracked: Set<string> = trackedIn(dir)): string[] {
  const stale = walk(dir)
    .filter((r) => isLocked(r) && BINARY_EXT.test(r) && !lock.files[r] && !tracked.has(r))
    .sort();
  if (apply) for (const r of stale) fs.rmSync(path.join(dir, r), { force: true });
  return stale;
}

/** File git đang theo dõi dưới `dir` (đường dẫn tương đối `dir`, dấu `/`): favicon, file tĩnh commit trong public/ — không bao giờ bị prune. Lỗi git → ném (an toàn: không xóa gì). */
export function trackedIn(dir: string): Set<string> {
  const out = execFileSync('git', ['ls-files', '-z', '--', '.'], { cwd: dir, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return new Set(out.split('\u0000').filter(Boolean));
}

/**
 * Quét đĩa dựng sổ khóa. Hash lấy lại từ sổ cũ khi kích thước không đổi và tên đã chứa hash,
 * còn lại tính sha256 thật. File chỉ có trong .asset-cache (sau R2-3) cũng được tính.
 */
/** `hashLinked`: băm lại cả file hardlink (nlink>1, chung inode với kho) dù tên có hash và kích thước khớp — bắt trường hợp ghi đè tại chỗ làm hỏng kho. */
export async function scanLock(prev: Lock = readLock(), opts: { hashLinked?: boolean } = {}): Promise<Lock> {
  const rels = new Set<string>();
  for (const dir of [PUBLIC_DIR, CACHE_DIR]) for (const r of walk(dir)) if (isLocked(r)) rels.add(r);
  const files: Record<string, LockEntry> = {};
  await pool([...rels], 8, async (rel) => {
    const f = localPath(rel)!;
    const bytes = fs.statSync(f).size;
    const old = prev.files[rel];
    const linked = opts.hashLinked === true && fs.statSync(f).nlink > 1;
    if (old && old.bytes === bytes && isHashedName(rel) && !linked) files[rel] = old;
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
