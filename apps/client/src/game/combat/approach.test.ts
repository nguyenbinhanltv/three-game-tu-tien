import { describe, expect, it } from 'vitest';
import { APPROACH_MARGIN, approachPoint } from './approach';

describe('approachPoint (tự áp sát của đòn cận chiến)', () => {
  it('đã trong tầm thì không cần đi', () => {
    expect(approachPoint(0, 0, 3, 0, 5)).toBeNull();
    expect(approachPoint(0, 0, 4, 0, 5)).toBeNull();
  });

  it('ngoài tầm: điểm đến nằm trên đường thẳng tới mục tiêu, cách mục tiêu (tầm − lề)', () => {
    const p = approachPoint(0, 0, 20, 0, 5)!;
    expect(p.z).toBeCloseTo(0, 6);
    expect(20 - p.x).toBeCloseTo(5 - APPROACH_MARGIN, 6);
    const q = approachPoint(10, 10, 0, 0, 6)!;
    expect(Math.hypot(q.x, q.z)).toBeCloseTo(6 - APPROACH_MARGIN, 6);
    expect(q.x).toBeCloseTo(q.z, 6);
  });

  it('điểm đến luôn gần mục tiêu hơn chỗ đang đứng (không bao giờ đi lùi ra xa)', () => {
    for (const d of [4.5, 6, 12, 40]) {
      const p = approachPoint(d, 0, 0, 0, 5)!;
      expect(Math.hypot(p.x, p.z)).toBeLessThan(d);
    }
  });

  it('tầm rất nhỏ vẫn giữ khoảng đứng tối thiểu, không dẫm lên mục tiêu', () => {
    const p = approachPoint(10, 0, 0, 0, 0.5)!;
    expect(Math.hypot(p.x, p.z)).toBeCloseTo(0.5, 6);
  });
});
