import { describe, expect, it } from 'vitest';
import { COTHAN_METHOD, LOI_METHOD } from '@dtl/shared';
import { cothanAura } from './realmAuraRules';

describe('hào quang cảnh giới của Cổ Thần (TN-5)', () => {
  it('người tu Cổ Thần chỉ giữ một lớp nhẹ (tối đa min); mode tắt thì vẫn tắt', () => {
    for (const m of ['min', 'std', 'full'] as const) expect(cothanAura(COTHAN_METHOD, 0, m)).toEqual({ mode: 'min', hidden: false });
    expect(cothanAura(COTHAN_METHOD, 0, 'off').mode).toBe('off');
  });
  it('đang hóa hình thì ẩn hẳn hào quang (không tím phủ thân), hết hóa hình thì hiện lại', () => {
    expect(cothanAura(COTHAN_METHOD, 0.5, 'std').hidden).toBe(true);
    expect(cothanAura(COTHAN_METHOD, 1, 'full').hidden).toBe(true);
    expect(cothanAura(COTHAN_METHOD, 0.01, 'std').hidden).toBe(false);
    expect(cothanAura(COTHAN_METHOD, undefined, 'std').hidden).toBe(false);
  });
  it('công pháp khác không đổi gì', () => {
    for (const mt of ['bat_dong_kim_than', 'lac_kiem_quyet', undefined]) {
      expect(cothanAura(mt, 1, 'full')).toEqual({ mode: 'full', hidden: false });
      expect(cothanAura(mt, 0, 'std')).toEqual({ mode: 'std', hidden: false });
    }
  });
  it('Lôi tu chỉ giữ một lớp nhẹ và không bao giờ bị ẩn (không có thân to)', () => {
    for (const m of ['min', 'std', 'full'] as const) expect(cothanAura(LOI_METHOD, 1, m)).toEqual({ mode: 'min', hidden: false });
    expect(cothanAura(LOI_METHOD, 0, 'off')).toEqual({ mode: 'off', hidden: false });
  });
});
