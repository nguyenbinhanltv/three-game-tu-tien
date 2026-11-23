import { describe, expect, it } from 'vitest';
import { ClothBudget } from './thienY';

describe('ClothBudget', () => {
  it('cho chạy tới khi hết ngân sách khung, khung mới thì đặt lại', () => {
    let t = 0;
    const b = new ClothBudget(0.5, 0.08, () => t);
    expect(b.allow(0)).toBe(true);
    b.charge(0.3);
    expect(b.allow(0)).toBe(true);
    b.charge(0.3);
    expect(b.allow(0.016)).toBe(false);
    t = 16.7;
    expect(b.allow(0.016)).toBe(true);
  });
  it('hoãn quá maxLag thì buộc chạy', () => {
    const b = new ClothBudget(0.5, 0.08, () => 0);
    b.allow(0);
    b.charge(1);
    expect(b.allow(0.05)).toBe(false);
    expect(b.allow(0.09)).toBe(true);
  });
});
