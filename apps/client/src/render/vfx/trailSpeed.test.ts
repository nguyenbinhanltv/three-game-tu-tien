import { describe, expect, it } from 'vitest';
import { TRAIL_OTHERS, trailRate, trailWidth } from './trail';

// V-P10 đợt 3c: vệt phi kiếm dài/rộng theo tốc độ bay; vệt người khác mờ một nửa.
describe('vệt bay theo tốc độ', () => {
  it('bay nhanh thì lấy mẫu chậm hơn (dải dài hơn về thời gian) và dày hơn', () => {
    expect(trailRate(1)).toBeLessThan(trailRate(0.5));
    expect(trailRate(0.5)).toBeLessThan(trailRate(0));
    expect(trailWidth(1)).toBeGreaterThan(trailWidth(0));
  });
  it('kẹp ngoài [0,1]', () => {
    expect(trailRate(5)).toBe(trailRate(1));
    expect(trailRate(-3)).toBe(trailRate(0));
    expect(trailWidth(9)).toBe(trailWidth(1));
  });
  it('dải nhanh nhất dài hơn dải chậm nhất khoảng 1,67 lần (1,25 / 0,75)', () => {
    expect(trailRate(0) / trailRate(1)).toBeGreaterThan(1.5);
  });
  it('người khác mờ còn ≤ một nửa', () => {
    expect(TRAIL_OTHERS).toBeLessThanOrEqual(0.5);
  });
});
