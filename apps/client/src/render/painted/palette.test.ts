import { describe, expect, it } from 'vitest';
import { CEL_EDGE, CEL_SOFT, PAINTED, celFactor, paintedColor, type PaintedKey } from './palette';

const keys = Object.keys(PAINTED) as PaintedKey[];

describe('bảng màu Họa Cảnh', () => {
  it('mỗi vật có hai màu hợp lệ, sáng khác tối', () => {
    for (const k of keys) {
      const [lit, shade] = PAINTED[k];
      expect(lit).toBeGreaterThanOrEqual(0);
      expect(lit).toBeLessThanOrEqual(0xffffff);
      expect(shade).toBeLessThanOrEqual(0xffffff);
      expect(lit).not.toBe(shade);
    }
  });

  it('màu tối tuyến tính không sáng hơn màu sáng, và lạnh hơn (xanh dương chiếm tỉ lệ cao hơn)', () => {
    for (const k of keys) {
      const l = paintedColor(k, 0);
      const s = paintedColor(k, 1);
      expect(s.r + s.g + s.b).toBeLessThan(l.r + l.g + l.b);
      expect(s.b / (s.r + s.g + s.b)).toBeGreaterThan(l.b / (l.r + l.g + l.b));
    }
  });
});

describe('bước tô celFactor', () => {
  it('0 dưới ngưỡng, 1 trên ngưỡng, 0,5 đúng ở ngưỡng, đơn điệu', () => {
    expect(celFactor(0)).toBe(0);
    expect(celFactor(1)).toBe(1);
    expect(celFactor(CEL_EDGE)).toBeCloseTo(0.5, 6);
    let prev = -1;
    for (let t = 0; t <= 1; t += 0.01) {
      const f = celFactor(t);
      expect(f).toBeGreaterThanOrEqual(prev);
      prev = f;
    }
  });

  it('bước ngắn: chuyển hết trong 2×soft quanh ngưỡng; soft=0 là bậc thang', () => {
    expect(celFactor(CEL_EDGE - CEL_SOFT)).toBe(0);
    expect(celFactor(CEL_EDGE + CEL_SOFT)).toBe(1);
    expect(celFactor(0.49, 0.5, 0)).toBe(0);
    expect(celFactor(0.5, 0.5, 0)).toBe(1);
  });
});
