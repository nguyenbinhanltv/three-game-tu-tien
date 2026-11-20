import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { t } from '@dtl/content';
import manifest from './manifest.json';
import { calliOf } from './Calli';

describe('calliOf', () => {
  it('có ảnh cho cảnh giới và địa danh đã vẽ', () => {
    for (const k of ['realm.16', 'realm.32', 'ui.chapter.sect.title', 'ui.chapter.ch5.title', 'ui.chapter.trib.title']) {
      expect(calliOf(k)?.file, k).toMatch(/\.png$/);
    }
  });
  it('không có ảnh cho chuỗi chưa vẽ hoặc key không tồn tại', () => {
    expect(calliOf('ui.bag')).toBeUndefined();
    expect(calliOf('khong.ton.tai')).toBeUndefined();
  });
  it('chữ trong manifest khớp i18n hiện tại (ảnh không cũ)', () => {
    for (const e of Object.values(manifest as Record<string, { key: string; text: string }>)) expect(e.text).toBe(t(e.key));
  });
});

describe('tên bộ trang phục', () => {
  it('mọi key set.*.name trong i18n đều có ảnh thư pháp (bộ mới thêm sau không bị sót)', () => {
    const dir = new URL('../../../../../packages/content/data/i18n/', import.meta.url);
    const keys = new Set<string>();
    for (const f of fs.readdirSync(dir)) {
      if (f.endsWith('.json'))
        for (const k of Object.keys(JSON.parse(fs.readFileSync(new URL(f, dir), 'utf8')))) if (/^set\.[a-z_]+\.name$/.test(k)) keys.add(k);
    }
    expect(keys.size).toBeGreaterThanOrEqual(16);
    for (const k of keys) expect(calliOf(k), k).toBeDefined();
  });
});
