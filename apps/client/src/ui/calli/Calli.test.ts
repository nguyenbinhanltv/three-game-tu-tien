import { describe, expect, it } from 'vitest';
import { t } from '@dtl/content';
import manifest from './manifest.json';
import { METHOD_SKILLS } from '@dtl/content';
import { calliFilesOf, calliOf } from './Calli';

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

describe('calliFilesOf (nạp trước thẻ chiêu tối thượng)', () => {
  it('mọi chiêu tối thượng có đúng ảnh trong manifest', () => {
    const keys = METHOD_SKILLS.filter((s) => s.ult).map((s) => `skill.${s.id}.name`);
    expect(keys.length).toBeGreaterThan(0);
    const files = calliFilesOf(keys);
    expect(files).toHaveLength(keys.length);
    const known = new Set(Object.values(manifest as Record<string, { file: string }>).map((e) => e.file));
    for (const f of files) expect(known.has(f), f).toBe(true);
  });
  it('bỏ key chưa có ảnh', () => {
    expect(calliFilesOf(['khong.ton.tai', 'ui.bag'])).toEqual([]);
  });
});
