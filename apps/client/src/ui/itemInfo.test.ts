import { describe, expect, it } from 'vitest';
import { ITEMS } from '@dtl/content';
import { bagLow, BAG_WARN_AT, itemSources, itemUses, isUpgrade } from './itemInfo';

describe('gợi ý vật phẩm suy từ dữ liệu', () => {
  it('nguồn rơi lấy từ quái, không có tỉ lệ', () => {
    const lines = itemSources('itm_nanh_soi');
    expect(lines.length).toBeGreaterThan(0);
    expect(lines[0].text).toMatch(/^Nguồn: rơi từ /);
    expect(lines[0].text).not.toMatch(/%|\d/);
  });

  it('nguyên liệu có dòng "Dùng để" chế món', () => {
    const uses = itemUses('itm_linh_thao');
    expect(uses.some((u) => u.text.startsWith('Dùng để: chế'))).toBe(true);
  });

  it('quặng cường hóa dùng để cường hóa', () => {
    expect(itemUses('itm_thiet_tinh').some((u) => u.text.includes('cường hóa'))).toBe(true);
  });

  it('mọi vật phẩm đều có chuỗi nguồn/dùng-để hợp lệ (không ném lỗi)', () => {
    for (const it of ITEMS) {
      for (const l of [...itemSources(it.id), ...itemUses(it.id)]) expect(l.text).not.toMatch(/\{\w+\}/);
    }
  });

  it('cảnh báo túi khi còn ≤ ngưỡng', () => {
    const inv = Array.from({ length: 30 }, () => ({ id: 'itm_linh_thao', n: 1 }));
    expect(bagLow(inv)).toBe(0);
    expect(bagLow([...inv.slice(0, 30 - BAG_WARN_AT), ...Array(BAG_WARN_AT).fill(null)])).toBe(BAG_WARN_AT);
    expect(bagLow([...inv.slice(0, 30 - BAG_WARN_AT - 1), ...Array(BAG_WARN_AT + 1).fill(null)])).toBeNull();
  });

  it('không phải trang bị thì không phải "tốt hơn"', () => {
    expect(isUpgrade(10, {}, { id: 'itm_linh_thao', n: 1 }, '')).toBe(false);
    expect(isUpgrade(10, {}, null, '')).toBe(false);
  });
});
