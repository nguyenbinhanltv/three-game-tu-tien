import { describe, expect, it } from 'vitest';
import { ISO_UPRIGHT_MAX, ISO_UPRIGHT_SOFT, isoFxHeight, isoFxScaleY } from './isoFx';

describe('isoFxHeight', () => {
  it('hình thấp, hình nằm đất, pháp tướng và gai giữ nguyên', () => {
    expect(isoFxHeight('diamond_cage', 1.2)).toBe(1.2);
    expect(isoFxHeight('ripple', 9)).toBe(9);
    expect(isoFxHeight('statue', 12)).toBe(12);
    expect(isoFxHeight('spike', 6)).toBe(6);
  });
  it('hình đứng cao bị nén, đơn điệu và có trần', () => {
    const a = isoFxHeight('rock_spire', 4);
    const b = isoFxHeight('rock_spire', 8);
    expect(a).toBeGreaterThan(ISO_UPRIGHT_SOFT);
    expect(a).toBeLessThan(4);
    expect(b).toBeGreaterThanOrEqual(a);
    expect(isoFxHeight('rock_spire', 100)).toBe(ISO_UPRIGHT_MAX);
  });
});

describe('isoFxScaleY', () => {
  it('đổi theo chiều cao gốc của lưới: lồng cao 2,2 ở scale 2 (4,4 m) bị nén theo mét', () => {
    const sy = isoFxScaleY('diamond_cage', 2, 2.2);
    expect(sy * 2.2).toBeCloseTo(isoFxHeight('diamond_cage', 4.4), 6);
    expect(sy).toBeLessThan(2);
  });
  it('lưới cao 1 thì như isoFxHeight; hình ngoài nhóm hoặc baseH hỏng giữ nguyên', () => {
    expect(isoFxScaleY('rock_spire', 4, 1)).toBeCloseTo(isoFxHeight('rock_spire', 4), 6);
    expect(isoFxScaleY('spike', 5, 3)).toBe(5);
    expect(isoFxScaleY('rock_spire', 5, 0)).toBe(5);
  });
});
