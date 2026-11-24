import { describe, expect, it } from 'vitest';
import { boxesOverlap, fitFactor, screenWidthPx } from './screenFit';

describe('screenFit', () => {
  it('camera sát thì nhãn bị kẹp lại, xa thì được nở ra, vừa thì giữ nguyên', () => {
    const near = fitFactor(3.6, 2, 55, 1000, 120, 240);
    expect(near).toBeLessThan(1);
    expect(screenWidthPx(3.6, 2, 55, 1000) * near).toBeCloseTo(240, 3);
    const far = fitFactor(3.6, 80, 55, 1000, 120, 240);
    expect(far).toBeGreaterThan(1);
    expect(screenWidthPx(3.6, 80, 55, 1000) * far).toBeCloseTo(120, 3);
    expect(fitFactor(3.6, 20, 55, 1000, 50, 400)).toBe(1);
  });
  it('hộp chồng nhau', () => {
    expect(boxesOverlap({ x: 0, y: 0, hw: 50, hh: 10 }, { x: 60, y: 5, hw: 50, hh: 10 })).toBe(true);
    expect(boxesOverlap({ x: 0, y: 0, hw: 50, hh: 10 }, { x: 0, y: 40, hw: 50, hh: 10 })).toBe(false);
  });
});
