import { describe, expect, it } from 'vitest';
import { SCABBARD_DEFAULT, SWORD_FINAL, SWORD_GLOW_TINT, SWORD_MODELS, scabbardOf } from '@dtl/content';

// Kiếm Tinh Khuyết (bậc 4): dạng cuối +10, vỏ riêng, hào quang tím sao. Phần dữ liệu thuần, không nạp asset.
describe('kiếm Tinh Khuyết', () => {
  it('dạng cuối thay dạng gốc ở +10 và có trong danh sách model hợp lệ', () => {
    expect(SWORD_FINAL.prop_kiem_tinh_khuyet).toBe('prop_kiem_tinh_khuyet_cuoi');
    expect(SWORD_MODELS).toContain('prop_kiem_tinh_khuyet_cuoi');
  });

  it('vỏ riêng dùng chung cho cả hai dạng; kiếm khác dùng vỏ mặc định', () => {
    expect(scabbardOf('prop_kiem_tinh_khuyet')).toBe('prop_vo_kiem_tinh_khuyet');
    expect(scabbardOf('prop_kiem_tinh_khuyet_cuoi')).toBe('prop_vo_kiem_tinh_khuyet');
    expect(scabbardOf('prop_kiem_liet_mach')).toBe(SCABBARD_DEFAULT);
    expect(scabbardOf(undefined)).toBe(SCABBARD_DEFAULT);
  });

  it('hào quang là màu tím (lam và đỏ cao hơn lục), không phải xanh ngọc', () => {
    for (const id of ['prop_kiem_tinh_khuyet', 'prop_kiem_tinh_khuyet_cuoi']) {
      const hex = SWORD_GLOW_TINT[id]!;
      expect(hex).toMatch(/^#[0-9a-f]{6}$/i);
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
      expect(b!).toBeGreaterThan(g!);
      expect(r!).toBeGreaterThan(g!);
    }
  });
});

// Kiếm Kính Quang (bậc 3): dạng cuối +10, vỏ riêng, hào quang lam băng.
describe('kiếm Kính Quang', () => {
  it('dạng cuối +10, vỏ riêng dùng chung hai dạng, hào quang lam (lam cao hơn đỏ)', () => {
    expect(SWORD_FINAL.prop_kiem_kinh_quang).toBe('prop_kiem_kinh_quang_cuoi');
    expect(SWORD_MODELS).toContain('prop_kiem_kinh_quang_cuoi');
    expect(scabbardOf('prop_kiem_kinh_quang')).toBe('prop_vo_kiem_kinh_quang');
    expect(scabbardOf('prop_kiem_kinh_quang_cuoi')).toBe('prop_vo_kiem_kinh_quang');
    const [r, , b] = [1, 3, 5].map((i) => parseInt(SWORD_GLOW_TINT.prop_kiem_kinh_quang!.slice(i, i + 2), 16));
    expect(b!).toBeGreaterThan(r!);
  });
});
