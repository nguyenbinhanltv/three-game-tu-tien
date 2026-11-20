import { describe, expect, it } from 'vitest';
import { t } from '@dtl/content';
import manifest from '../../base/calliManifest.json';
import { calliOf } from '../../base/calli';

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
