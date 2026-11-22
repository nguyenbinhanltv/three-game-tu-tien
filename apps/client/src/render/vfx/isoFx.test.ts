import { describe, expect, it } from 'vitest';
import { ISO_UPRIGHT_MAX, ISO_UPRIGHT_SOFT, isoFxHeight } from './isoFx';

describe('isoFxHeight', () => {
  it('hình thấp và hình nằm đất giữ nguyên', () => {
    expect(isoFxHeight('spike', 1.2)).toBe(1.2);
    expect(isoFxHeight('ripple', 9)).toBe(9);
    expect(isoFxHeight('statue', 12)).toBe(12);
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
