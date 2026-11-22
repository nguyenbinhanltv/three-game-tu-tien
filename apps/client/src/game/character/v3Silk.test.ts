import { describe, expect, it } from 'vitest';
import { silkTier, V3_SILK, v3SilkOf } from '@dtl/shared';
import { KEEP_ORIGINAL_ASSETS } from './mannequin';

describe('độ bóng lụa voan Đan sư (V3_SILK)', () => {
  it('chỉ khai cho model giữ gốc (nơi có mặt nạ voan COLOR_0), đủ nam + nữ', () => {
    for (const id of Object.keys(V3_SILK)) expect(KEEP_ORIGINAL_ASSETS.has(id), id).toBe(true);
    for (const id of Object.keys(V3_SILK)) {
      const twin = id.endsWith('_nam') ? id.replace(/_nam$/, '_nu') : id.replace(/_nu$/, '_nam');
      expect(V3_SILK[twin], twin).toBeDefined();
    }
  });

  it('tham số trong khoảng hợp lý (không thành nhựa bóng/cháy sáng)', () => {
    for (const s of Object.values(V3_SILK)) {
      expect(s.sheen).toBeGreaterThan(0);
      expect(s.sheen).toBeLessThanOrEqual(1);
      expect(s.aniso).toBeLessThanOrEqual(1);
      expect(s.back).toBeLessThanOrEqual(1);
      expect(s.tint).toBeGreaterThanOrEqual(0);
      expect(s.tint).toBeLessThanOrEqual(1);
      expect(s.clear).toBeLessThan(0.4);
      expect(s.roughness).toBeGreaterThanOrEqual(0.3); // dưới mức này voan bóng như nhựa
      expect(s.sheenColor).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it('bộ ngoài danh sách không có lụa; preset Thấp tắt, Vừa chỉ ánh viền', () => {
    expect(v3SilkOf('chr_v3_tinh_khuyet_nu')).toBeUndefined();
    expect(silkTier('low')).toBe(0);
    expect(silkTier('medium')).toBe(1);
    expect(silkTier('high')).toBe(2);
    expect(silkTier('ultra')).toBe(2);
  });
});
