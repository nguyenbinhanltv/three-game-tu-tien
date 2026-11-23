import { describe, expect, it } from 'vitest';
import { hasString } from '@dtl/content';
import { firstTipIndex, tipKey, TIP_COUNT } from './loadTips';

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
