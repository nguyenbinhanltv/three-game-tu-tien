import { describe, expect, it } from 'vitest';
import { itemQuality } from './chatItem';

describe('itemQuality', () => {
  it('phẩm roll dùng thẳng, không lệch bậc', () => {
    expect(itemQuality(2, 0)).toBe(2); // Huyền phẩm vẫn là Huyền
    expect(itemQuality(0, 3)).toBe(0);
    expect(itemQuality(5, 0)).toBe(5);
  });
  it('không có phẩm thì chuẩn hóa rarity (kẹp 0..5)', () => {
    expect(itemQuality(undefined, 3)).toBe(3);
    expect(itemQuality(undefined, 9)).toBe(5);
    expect(itemQuality(undefined, -1)).toBe(0);
  });
});
