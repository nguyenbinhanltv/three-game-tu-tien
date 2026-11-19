import { describe, expect, it } from 'vitest';
import { columnGeometry, stairPoint, tkFbm, tkRng } from './thienKhuyetSky';

const SKY = {
  stair: { cx: 1044, cz: 374, r0: 170, r1: 120, turns: 1.35, y0: 80, y1: 296, a0: 1.57, width: 16 },
};

describe('Thiên Khuyết trên trời (MAP-4)', () => {
  it('bậc thang xoắn bắt đầu ở mặt quảng trường và kết thúc ở cao độ bệ cổng', () => {
    const a = stairPoint(SKY.stair, 0);
    const b = stairPoint(SKY.stair, 1);
    expect(a.y).toBe(80);
    expect(b.y).toBe(296);
    expect(Math.hypot(a.x - 1044, a.z - 374)).toBeCloseTo(170, 5);
    expect(Math.hypot(b.x - 1044, b.z - 374)).toBeCloseTo(120, 5);
  });

  it('nhiễu và rng tất định', () => {
    expect(tkFbm(1.3, 2.1, 3.7, 5)).toBe(tkFbm(1.3, 2.1, 3.7, 5));
    const r1 = tkRng(42);
    const r2 = tkRng(42);
    expect([r1(), r1(), r1()]).toEqual([r2(), r2(), r2()]);
  });

  it('cột gãy thấp hơn cột nguyên và không có đỉnh NaN', () => {
    const full = columnGeometry(30, 2, 1, 3);
    const broken = columnGeometry(30, 2, 0.5, 3);
    full.computeBoundingBox();
    broken.computeBoundingBox();
    expect(broken.boundingBox!.max.y).toBeLessThan(full.boundingBox!.max.y * 0.7);
    for (const v of broken.getAttribute('position').array) expect(Number.isFinite(v)).toBe(true);
  });
});
