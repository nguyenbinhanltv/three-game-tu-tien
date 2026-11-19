import { describe, expect, it } from 'vitest';
import { tkFbm, tkRng } from './thienKhuyetSky';

describe('Thiên Khuyết trên trời (MAP-4)', () => {
  it('nhiễu và rng tất định', () => {
    expect(tkFbm(1.3, 2.1, 3.7, 5)).toBe(tkFbm(1.3, 2.1, 3.7, 5));
    const r1 = tkRng(42);
    const r2 = tkRng(42);
    expect([r1(), r1(), r1()]).toEqual([r2(), r2(), r2()]);
  });
});
