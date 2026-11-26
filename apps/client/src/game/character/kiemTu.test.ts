import { describe, expect, it } from 'vitest';
import { PATHS } from '@dtl/content';
import { isKiemTu } from './kiemTu';

describe('isKiemTu', () => {
  it('đúng với mọi công pháp của hướng kiem_tu, sai với các hướng khác', () => {
    for (const p of PATHS) for (const m of p.methods) expect(isKiemTu(m)).toBe(p.id === 'kiem_tu');
    expect(PATHS.find((p) => p.id === 'kiem_tu')!.methods.length).toBeGreaterThan(0);
  });
  it('khóa trống hoặc lạ thì không', () => {
    expect(isKiemTu(undefined)).toBe(false);
    expect(isKiemTu('')).toBe(false);
    expect(isKiemTu('khong_co_cong_phap')).toBe(false);
  });
});
