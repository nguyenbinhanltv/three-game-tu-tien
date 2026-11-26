import { describe, expect, it } from 'vitest';
import { inArc } from './path';

describe('inArc (cung chém trước mặt)', () => {
  // Người ở gốc, nhìn theo +z.
  const hit = (ox: number, oz: number, r = 5, deg = 110, pad = 0) => inArc(0, 0, 0, 1, ox, oz, r, deg, pad);

  it('trúng trong tầm và trong góc mở; ngoài tầm hoặc lệch góc thì không', () => {
    expect(hit(0, 3)).toBe(true);
    expect(hit(2, 3)).toBe(true);
    expect(hit(0, 5.5)).toBe(false);
    expect(hit(4, 1)).toBe(false);
    expect(hit(0, -3)).toBe(false);
  });

  it('mép góc: 110° mở 55° mỗi bên', () => {
    const at = (a: number) => hit(Math.sin((a * Math.PI) / 180) * 3, Math.cos((a * Math.PI) / 180) * 3);
    expect(at(54)).toBe(true);
    expect(at(56)).toBe(false);
    expect(at(-54)).toBe(true);
  });

  it('thân quái (pad) nới tầm; quái sát người luôn trúng dù lệch góc', () => {
    expect(hit(0, 6, 5, 110, 1.2)).toBe(true);
    expect(hit(0, -0.8, 5, 110, 1)).toBe(true);
    expect(hit(0, -2.5, 5, 110, 1)).toBe(false);
  });

  it('hướng không xác định thì chỉ xét khoảng cách; góc ngoài 0–360 bị kẹp', () => {
    expect(inArc(0, 0, 0, 0, 0, -3, 5, 110)).toBe(true);
    expect(hit(0, -3, 5, 999)).toBe(true);
    expect(hit(1, 3, 5, -10)).toBe(false);
  });
});
