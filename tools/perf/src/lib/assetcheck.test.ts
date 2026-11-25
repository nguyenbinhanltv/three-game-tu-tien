import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkAssets } from './assetcheck';

describe('checkAssets', () => {
  const lock = { 'assets/a.glb': {}, 'assets/b.ktx2': {}, 'terrain/m.png': {}, 'audio/x.webm': {}, 'ui/y.png': {} };
  const has = (set: string[]) => (f: string) => set.some((s) => path.normalize(f).endsWith(path.normalize(s)));

  it('đủ tệp cảnh thì không thiếu (bỏ qua âm thanh/UI)', () => {
    const r = checkAssets(lock, '/pub', has(['assets/a.glb', 'assets/b.ktx2', 'terrain/m.png']));
    expect(r.total).toBe(3);
    expect(r.missing).toEqual([]);
  });

  it('liệt kê tệp cảnh còn thiếu', () => {
    const r = checkAssets(lock, '/pub', has(['assets/a.glb']));
    expect(r.missing.sort()).toEqual(['assets/b.ktx2', 'terrain/m.png']);
  });
});
