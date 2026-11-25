import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pull } from '../pull.js';
import { DEFAULT_STORE, hasInStore, placeFromStore, putInStore, storeDir, storeFile, verifyInStore } from './store.js';
import { sha256File } from './lock.js';
import { changedKeys, compareListing, rotatingSample } from './verify.js';
import type { Lock } from './lock.js';

const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
let tmp: string;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dtl-store-'));
});
afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('kho asset chung theo hash', () => {
  it('put rồi place: có trong kho, dest cùng nội dung, hardlink khi cùng ổ; ghi lại dest không hỏng kho', () => {
    const data = Buffer.from('noi dung asset');
    const h = sha(data);
    const store = path.join(tmp, 'store');
    expect(hasInStore(store, h, data.length)).toBe(false);
    putInStore(store, h, data);
    expect(hasInStore(store, h, data.length)).toBe(true);
    const dest = path.join(tmp, 'wt', 'a.glb');
    const how = placeFromStore(store, h, dest);
    expect(fs.readFileSync(dest)).toEqual(data);
    if (how === 'link') expect(fs.statSync(dest).ino).toBe(fs.statSync(storeFile(store, h)).ino);
    // đặt lại lần nữa (dest cũ chỉ đọc/hardlink) không lỗi
    expect(() => placeFromStore(store, h, dest)).not.toThrow();
    expect(fs.readFileSync(storeFile(store, h))).toEqual(data);
  });

  it('pull: lần 1 tải qua CDN (fetch) và lưu kho; lần 2 ở nơi khác lấy từ kho, KHÔNG gọi fetch', async () => {
    const data = Buffer.from('atlas-bytes');
    const key = 'x/a.0123456789.glb';
    const lockFile: Lock = { version: 1, files: { [key]: { sha256: sha(data), bytes: data.length } } };
    const store = path.join(tmp, 'store');
    const urls: string[] = [];
    const fetchFn = (async (u: string) => {
      urls.push(String(u));
      return new Response(new Uint8Array(data), { status: 200 });
    }) as unknown as typeof fetch;
    const run = (dir: string) =>
      pull({
        base: 'https://cdn.example',
        store,
        fetchFn,
        lock: lockFile,
        publicDir: path.join(tmp, dir, 'public'),
        cacheDir: path.join(tmp, dir, 'cache'),
      });
    const r1 = await run('w1');
    expect(r1.downloaded).toBe(1);
    expect(urls).toEqual([`https://cdn.example/${key}`]);
    const r2 = await run('w2');
    expect(r2.fromStore).toBe(1);
    expect(r2.downloaded).toBe(0);
    expect(urls).toHaveLength(1);
    expect(fs.readFileSync(path.join(tmp, 'w2', 'public', key))).toEqual(data);
  });
});

describe('validate giảm yêu cầu tới R2', () => {
  const L: Lock = {
    version: 1,
    files: { 'a.glb': { sha256: 'x', bytes: 1 }, 'b.glb': { sha256: 'y', bytes: 2 }, 'c.glb': { sha256: 'z', bytes: 3 } },
  };
  it('compareListing: thiếu hoặc lệch kích thước', () => {
    const errs = compareListing(
      L,
      new Map([
        ['a.glb', { size: 1 }],
        ['b.glb', { size: 9 }],
      ]),
    );
    expect(errs).toHaveLength(2);
    expect(errs.join('|')).toMatch(/b.glb: kích thước R2 9/);
    expect(errs.join('|')).toMatch(/c.glb: chưa có trên R2/);
  });
  it('rotatingSample: các lát theo ngày phủ hết khóa, không trùng', () => {
    const big: Lock = {
      version: 1,
      files: Object.fromEntries(Array.from({ length: 200 }, (_, i) => [`k${i}`, { sha256: 'x', bytes: 1 }])),
    };
    const all = Array.from({ length: 14 }, (_, d) => rotatingSample(big, d)).flat();
    expect(new Set(all).size).toBe(200);
    expect(all).toHaveLength(200);
  });
  it('changedKeys: chỉ khóa mới/đổi so với sổ gốc', () => {
    const base: Lock = { version: 1, files: { 'a.glb': { sha256: 'x', bytes: 1 }, 'b.glb': { sha256: 'OLD', bytes: 2 } } };
    expect(changedKeys(L, base)).toEqual(['b.glb', 'c.glb']);
  });
});

describe('mặc định kho', () => {
  afterEach(() => vi.unstubAllEnvs());
  it('không CI, chưa đặt env → bật ở ~/.dtl-asset-store; CI → tắt; off → tắt; đặt tường minh → dùng', () => {
    vi.stubEnv('DTL_ASSET_STORE', '');
    vi.stubEnv('CI', '');
    expect(storeDir()).toBe(DEFAULT_STORE);
    expect(DEFAULT_STORE.split(path.sep).pop()).toBe('.dtl-asset-store');
    vi.stubEnv('CI', 'true');
    expect(storeDir()).toBeNull();
    vi.stubEnv('DTL_ASSET_STORE', path.join(tmp, 'x'));
    expect(storeDir()).toBe(path.join(tmp, 'x'));
    vi.stubEnv('DTL_ASSET_STORE', 'off');
    expect(storeDir()).toBeNull();
  });
});

describe('an toàn hardlink', () => {
  it('verifyInStore xóa file kho bị hỏng; pull băm lại file hardlink bị ghi đè tại chỗ và đặt lại bản đúng', async () => {
    const data = Buffer.from('noi-dung-dung');
    const key = 'x/b.0123456789.glb';
    const lock: Lock = { version: 1, files: { [key]: { sha256: sha(data), bytes: data.length } } };
    const store = path.join(tmp, 'store');
    const fetchFn = (async () => new Response(new Uint8Array(data), { status: 200 })) as unknown as typeof fetch;
    const opts = { base: 'https://cdn.example', store, fetchFn, lock, publicDir: path.join(tmp, 'p'), cacheDir: path.join(tmp, 'c') };
    await pull(opts);
    const dest = path.join(tmp, 'p', key);
    const sf = storeFile(store, sha(data));
    // ghi đè tại chỗ cùng kích thước (nếu là hardlink thì hỏng cả bản trong kho)
    fs.chmodSync(dest, 0o666);
    fs.writeFileSync(dest, Buffer.from('XXXXXXXXXXXXX'));
    const corruptedStore = fs.statSync(dest).nlink > 1;
    if (corruptedStore) expect(await sha256File(sf)).not.toBe(sha(data));
    const r = await pull(opts);
    expect(fs.readFileSync(dest)).toEqual(data);
    // kho hỏng → tải lại từ CDN; kho không hỏng (bản chép) → đặt lại từ kho
    expect(corruptedStore ? r.downloaded : r.fromStore).toBe(1);
    expect(await verifyInStore(store, sha(data), data.length)).toBe(true);
  });
});

describe('chống path traversal', () => {
  it('storeFile từ chối sha256 không phải 64 hex', () => {
    expect(() => storeFile(tmp, '../../etc/passwd')).toThrow();
    expect(() => storeFile(tmp, 'ab')).toThrow();
    expect(() => storeFile(tmp, 'A'.repeat(64))).toThrow();
    expect(storeFile(tmp, 'a'.repeat(64)).startsWith(path.resolve(tmp))).toBe(true);
  });
});
