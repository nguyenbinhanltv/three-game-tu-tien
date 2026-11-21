import { describe, expect, it } from 'vitest';
import { GIANT_SCALE, giantScale, stepGiant } from './giant';

describe('hóa hình Cổ Thần (thân to)', () => {
  it('trôi dần tới đích, không vượt [0, 1], to ra nhanh hơn nhỏ lại', () => {
    let k = 0;
    let up = 0;
    while (k < 1 && up < 100) ((k = stepGiant(k, true, 1 / 60)), up++);
    expect(k).toBe(1);
    let down = 0;
    while (k > 0 && down < 200) ((k = stepGiant(k, false, 1 / 60)), down++);
    expect(k).toBe(0);
    expect(up).toBeLessThan(down);
  });
  it('khung dài (lag) vẫn bị kẹp, tỉ lệ khớp hai đầu và tăng đơn điệu', () => {
    expect(stepGiant(0, true, 10)).toBeLessThanOrEqual(1);
    expect(giantScale(0)).toBe(1);
    expect(giantScale(1)).toBeCloseTo(GIANT_SCALE, 6);
    let prev = 1;
    for (let i = 1; i <= 20; i++) {
      const s = giantScale(i / 20);
      expect(s).toBeGreaterThanOrEqual(prev);
      prev = s;
    }
    expect(giantScale(-5)).toBe(1);
    expect(giantScale(5)).toBeCloseTo(GIANT_SCALE, 6);
  });
});
