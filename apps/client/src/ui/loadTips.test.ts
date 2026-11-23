import { describe, expect, it } from 'vitest';
import { hasString } from '@dtl/content';
import { firstTipIndex, placeKey, tipKey, TIP_COUNT } from './loadTips';

describe('mẹo màn tải', () => {
  it('mọi mẹo đều có chuỗi i18n', () => {
    for (let i = 0; i < TIP_COUNT; i++) expect(hasString(tipKey(i)), tipKey(i)).toBe(true);
  });
  it('xoay vòng, kể cả số âm', () => {
    expect(tipKey(0)).toBe('ui.tip.1');
    expect(tipKey(TIP_COUNT)).toBe('ui.tip.1');
    expect(tipKey(-1)).toBe(`ui.tip.${TIP_COUNT}`);
  });
  it('chỉ số đầu nằm trong dải', () => {
    for (const s of [0, 1, 12345, -7, 1e9]) {
      const i = firstTipIndex(s);
      expect(i).toBeGreaterThanOrEqual(0);
      expect(i).toBeLessThan(TIP_COUNT);
    }
  });
});

describe('tên nơi đến ở màn tải', () => {
  it('mọi id tranh có chuỗi tên', () => {
    for (const art of [
      'load_song',
      'doan_mach',
      'van_hai_phu_dao',
      'thien_khuyet_co_thanh',
      'bac_hoang',
      'van_dinh',
      'phuc_mach_quat',
      'kiem_trung',
      'thung_lung',
      'suoi_thanh_khe',
      'rung_linh_thao',
      'vach_da_ngoc',
      'ho_suong_mu',
    ])
      expect(hasString(placeKey(art)), art).toBe(true);
  });
});
