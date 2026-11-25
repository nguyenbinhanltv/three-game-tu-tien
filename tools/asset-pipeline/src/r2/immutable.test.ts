import { describe, expect, it } from 'vitest';
import { isMutableKey, planPush, PushConflictError } from '../push.js';
import { compareListing } from './verify.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { hasContentHash, type Lock, pruneStale, trackedIn, unhashedBinaries } from './lock.js';

const sha = (c: string) => c.repeat(64).slice(0, 64);
const lock = (files: Record<string, { sha256: string; bytes: number }>): Lock => ({ version: 1, files });

describe('R2 bất biến: push từ chối ghi đè', () => {
  const L = lock({
    'hoa-truc/vfx_sprites.webp': { sha256: sha('a'), bytes: 100 },
    'hoa-truc/vfx_sprites.0123456789.webp': { sha256: sha('b'), bytes: 200 },
    'assets/moi.abcdef0123.glb': { sha256: sha('c'), bytes: 300 },
  });
  const keys = Object.keys(L.files);

  it('khóa chưa có trên R2 → upload; khóa khớp → bỏ qua', async () => {
    const remote = new Map([['hoa-truc/vfx_sprites.webp', { size: 100 }]]);
    const p = await planPush({ keys, lock: L, remote, remoteSha: async () => sha('a') });
    expect(p.conflicts).toEqual([]);
    expect(p.present).toBe(1);
    expect(p.todo.sort()).toEqual(['assets/moi.abcdef0123.glb', 'hoa-truc/vfx_sprites.0123456789.webp']);
  });

  it('khóa đã có nhưng KÍCH THƯỚC khác sổ khóa → xung đột, không nằm trong todo (không ghi đè)', async () => {
    const remote = new Map([['hoa-truc/vfx_sprites.webp', { size: 999 }]]);
    const p = await planPush({ keys, lock: L, remote, remoteSha: async () => sha('a') });
    expect(p.conflicts.map((c) => c.key)).toEqual(['hoa-truc/vfx_sprites.webp']);
    expect(p.todo).not.toContain('hoa-truc/vfx_sprites.webp');
  });

  it('tên cố định cùng kích thước nhưng sha256 metadata khác → xung đột', async () => {
    const remote = new Map([['hoa-truc/vfx_sprites.webp', { size: 100 }]]);
    const p = await planPush({ keys, lock: L, remote, remoteSha: async () => sha('z') });
    expect(p.conflicts).toHaveLength(1);
    expect(p.conflicts[0]!.reason).toMatch(/sha256/);
  });

  it('đối tượng cũ không có metadata sha: cảnh báo, không coi là xung đột', async () => {
    const remote = new Map([['hoa-truc/vfx_sprites.webp', { size: 100 }]]);
    const p = await planPush({ keys, lock: L, remote, remoteSha: async () => undefined });
    expect(p.conflicts).toEqual([]);
    expect(p.unverified).toEqual(['hoa-truc/vfx_sprites.webp']);
  });

  it('khóa có hash trong tên đã tồn tại với kích thước khác → xung đột', async () => {
    const remote = new Map([['assets/moi.abcdef0123.glb', { size: 1 }]]);
    const p = await planPush({ keys, lock: L, remote, remoteSha: async () => undefined });
    expect(p.conflicts.map((c) => c.key)).toEqual(['assets/moi.abcdef0123.glb']);
  });

  it('PushConflictError nêu từng khóa và cách sửa (tên theo hash)', () => {
    const e = new PushConflictError([{ key: 'a/b.webp', reason: 'x' }]);
    expect(e.message).toContain('a/b.webp');
    expect(e.message).toMatch(/hash10/);
    expect(e.message).toMatch(/TỪ CHỐI/);
  });
});

describe('nhị phân mới phải có hash trong tên', () => {
  it('hasContentHash nhận hash 8–64 hex, không nhận tên thường', () => {
    expect(hasContentHash('assets/a.0123456789.glb')).toBe(true);
    expect(hasContentHash('assets/calli/x.bfc1f4e44599.png')).toBe(true);
    expect(hasContentHash('hoa-truc/vfx_sprites.webp')).toBe(false);
    expect(hasContentHash('assets/a.glb')).toBe(false);
  });

  it('báo nhị phân không hash chưa có trong danh sách ân hạn; manifest/json được miễn; file cũ trong ân hạn được miễn', () => {
    const L = lock({
      'assets/manifest.json': { sha256: sha('a'), bytes: 1 },
      'hoa-truc/manifest.json': { sha256: sha('a'), bytes: 1 },
      'map/cu.webp': { sha256: sha('b'), bytes: 1 },
      'map/moi.webp': { sha256: sha('c'), bytes: 1 },
      'assets/dung.0123456789.glb': { sha256: sha('d'), bytes: 1 },
      'audio/x.ogg': { sha256: sha('e'), bytes: 1 },
    });
    expect(unhashedBinaries(L, new Set(['map/cu.webp']))).toEqual(['audio/x.ogg', 'map/moi.webp']);
  });
});

describe('json/văn bản tên cố định (manifest): chỉ main được ghi đè', () => {
  const M = 'assets/manifest.json';
  const L = lock({ [M]: { sha256: sha('a'), bytes: 100 }, 'x/a.0123456789.glb': { sha256: sha('b'), bytes: 10 } });
  const keys = Object.keys(L.files);

  it('isMutableKey: json/txt có, nhị phân không', () => {
    expect(isMutableKey(M)).toBe(true);
    expect(isMutableKey('audio/manifest.json')).toBe(true);
    expect(isMutableKey('x/a.glb')).toBe(false);
    expect(isMutableKey('x/a.0123456789.webp')).toBe(false);
  });

  it('manifest lệch: nhánh (allowMutable=false) → HOÃN, không ghi, không xung đột; main (true) → ghi đè; nhị phân vẫn xung đột', async () => {
    const remote = new Map([
      [M, { size: 50 }],
      ['x/a.0123456789.glb', { size: 99 }],
    ]);
    const branch = await planPush({ keys, lock: L, remote, remoteSha: async () => sha('a') });
    expect(branch.todo).toEqual([]);
    expect(branch.deferred).toEqual([M]);
    expect(branch.overwrites).toEqual([]);
    expect(branch.conflicts.map((c) => c.key)).toEqual(['x/a.0123456789.glb']);
    const main = await planPush({ keys, lock: L, remote, remoteSha: async () => sha('a'), allowMutable: true });
    expect(main.todo).toEqual([M]);
    expect(main.overwrites).toEqual([M]);
    expect(main.deferred).toEqual([]);
  });

  it('manifest chưa có trên R2 → tạo mới được cả ở nhánh', async () => {
    const p = await planPush({ keys: [M], lock: L, remote: new Map(), remoteSha: async () => undefined });
    expect(p.todo).toEqual([M]);
  });

  it('manifest cùng kích thước nhưng sha khác → ghi đè (main); cùng sha → bỏ qua', async () => {
    const remote = new Map([[M, { size: 100 }]]);
    const diff = await planPush({ keys: [M], lock: L, remote, remoteSha: async () => sha('z'), allowMutable: true });
    expect(diff.overwrites).toEqual([M]);
    const same = await planPush({ keys: [M], lock: L, remote, remoteSha: async () => sha('a') });
    expect(same.todo).toEqual([]);
    expect(same.present).toBe(1);
  });
});

describe('validate không đỏ vì manifest lệch R2 ở nhánh', () => {
  it('compareListing: kích thước manifest lệch được miễn, nhị phân lệch vẫn lỗi, thiếu hẳn vẫn lỗi', () => {
    const L = lock({
      'assets/manifest.json': { sha256: sha('a'), bytes: 100 },
      'x/a.0123456789.glb': { sha256: sha('b'), bytes: 10 },
      'audio/manifest.json': { sha256: sha('c'), bytes: 5 },
    });
    const errs = compareListing(
      L,
      new Map([
        ['assets/manifest.json', { size: 7 }],
        ['x/a.0123456789.glb', { size: 11 }],
      ]),
    );
    expect(errs.join('|')).not.toMatch(/assets\/manifest\.json: kích thước/);
    expect(errs.join('|')).toMatch(/x\/a\.0123456789\.glb: kích thước/);
    expect(errs.join('|')).toMatch(/audio\/manifest\.json: chưa có trên R2/);
  });
});

describe('prune: dọn nhị phân cache ngoài sổ khóa (CI)', () => {
  const setup = () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'prune-'));
    const put = (rel: string) => {
      fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
      fs.writeFileSync(path.join(dir, rel), 'x');
    };
    put('hoa-truc/vfx_sprites.0fe2efa754.webp'); // cache nhánh khác, không có trong sổ
    put('hoa-truc/vfx_sprites.aaaaaaaaaa.webp'); // có trong sổ
    put('assets/manifest.json'); // json: không đụng dù không có trong sổ
    put('fonts/a.woff2'); // không thuộc sổ khóa
    return { dir, put };
  };
  const L = lock({ 'hoa-truc/vfx_sprites.aaaaaaaaaa.webp': { sha256: sha('a'), bytes: 1 } });

  it('chạy thử chỉ liệt kê, không xóa', () => {
    const { dir } = setup();
    expect(pruneStale(L, false, dir, new Set())).toEqual(['hoa-truc/vfx_sprites.0fe2efa754.webp']);
    expect(fs.existsSync(path.join(dir, 'hoa-truc/vfx_sprites.0fe2efa754.webp'))).toBe(true);
  });
  it('--apply xóa nhị phân ngoài sổ, giữ file trong sổ, json và font', () => {
    const { dir } = setup();
    pruneStale(L, true, dir, new Set());
    expect(fs.existsSync(path.join(dir, 'hoa-truc/vfx_sprites.0fe2efa754.webp'))).toBe(false);
    for (const keep of ['hoa-truc/vfx_sprites.aaaaaaaaaa.webp', 'assets/manifest.json', 'fonts/a.woff2'])
      expect(fs.existsSync(path.join(dir, keep)), keep).toBe(true);
    expect(pruneStale(L, true, dir, new Set())).toEqual([]);
  });
  it('KHÔNG xóa file git đang theo dõi dù không có trong sổ khóa (favicon, file tĩnh commit)', () => {
    const { dir, put } = setup();
    put('favicon.png');
    const tracked = new Set(['favicon.png']);
    expect(pruneStale(L, true, dir, tracked)).toEqual(['hoa-truc/vfx_sprites.0fe2efa754.webp']);
    expect(fs.existsSync(path.join(dir, 'favicon.png'))).toBe(true);
  });
  it('trackedIn đọc git ls-files thật: file đã commit trong public/ được nhận ra', () => {
    const t = trackedIn(path.resolve(__dirname, '../../../../apps/client/public'));
    expect(t.size).toBeGreaterThan(0);
  });
});
