import { describe, expect, it } from 'vitest';
import { reflectionThrottle } from './reflectThrottle';

describe('reflectionThrottle', () => {
  it('every = 1 (hoặc nhỏ hơn): vẽ mọi khung', () => {
    const t = reflectionThrottle(1);
    expect(Array.from({ length: 5 }, t)).toEqual([true, true, true, true, true]);
    const z = reflectionThrottle(0);
    expect(Array.from({ length: 3 }, z)).toEqual([true, true, true]);
  });
  it('every = 2: khung đầu vẽ, rồi cách một khung', () => {
    const t = reflectionThrottle(2);
    expect(Array.from({ length: 6 }, t)).toEqual([true, false, true, false, true, false]);
  });
  it('every = 3 và số lẻ được làm tròn xuống', () => {
    const t = reflectionThrottle(3.9);
    expect(Array.from({ length: 7 }, t)).toEqual([true, false, false, true, false, false, true]);
  });
});
