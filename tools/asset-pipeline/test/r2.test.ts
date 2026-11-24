import { describe, expect, it } from 'vitest';
import { cacheControl, contentType } from '../src/r2/client.js';
import { parseEnvFile } from '../src/r2/env.js';
import { formatLock, isHashedName, isLocked } from '../src/r2/lock.js';
import { urlOf } from '../src/pull.js';

describe('r2', () => {
  it('parseEnvFile đọc KEY=VALUE, bỏ chú thích và dấu nháy', () => {
    expect(parseEnvFile('# c\nA=1\nexport B="x y"\nC=\'z\'\n\nbad line')).toEqual({ A: '1', B: 'x y', C: 'z' });
  });
  it('nhận diện tên có hash và file thuộc sổ khóa', () => {
    expect(isHashedName('assets/arch_sect.4d15d27b64.glb')).toBe(true);
    expect(isHashedName('assets/vfx/ice_crack.ktx2')).toBe(false);
    expect(isLocked('fonts/dtl-title.woff2')).toBe(false);
    expect(isLocked('assets/LICENSE.txt')).toBe(false);
    expect(isLocked('assets/manifest.json')).toBe(true);
  });
  it('cache immutable chỉ cho tên có hash; content-type theo đuôi', () => {
    expect(cacheControl('a.4d15d27b64.glb')).toContain('immutable');
    expect(cacheControl('manifest.json')).not.toContain('immutable');
    expect(contentType('x.glb')).toBe('model/gltf-binary');
    expect(contentType('x.ktx2')).toBe('image/ktx2');
  });
  it('formatLock sắp theo khóa, mỗi file một dòng', () => {
    const t = formatLock({ version: 1, files: { b: { sha256: 'y', bytes: 2 }, a: { sha256: 'x', bytes: 1 } } });
    expect(t.indexOf('"a"')).toBeLessThan(t.indexOf('"b"'));
    expect(JSON.parse(t).files.a.bytes).toBe(1);
  });
  it('urlOf mã hóa từng đoạn đường dẫn', () => {
    expect(urlOf('https://cdn.test', 'assets/a b/c.glb')).toBe('https://cdn.test/assets/a%20b/c.glb');
  });
});

describe('gc', () => {
  it('từ chối --days không hợp lệ trước khi chạm R2', async () => {
    const { gc } = await import('../src/gc.js');
    for (const d of [Number.NaN, 0, -1, 3, 1.5]) await expect(gc({ days: d, apply: true })).rejects.toThrow(/--days/);
  });
});
