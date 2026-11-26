import { describe, expect, it } from 'vitest';
import { TOON_EDGES, TOON_LEVELS, toonLevel } from './world';

describe('toonLevel (tô bóng chia bậc Dạ Cảnh)', () => {
  it('ba bậc phẳng: trong mỗi vùng giá trị không đổi theo tỉ lệ sáng', () => {
    expect(toonLevel(0.05)).toBeCloseTo(TOON_LEVELS[0]);
    expect(toonLevel(0.3)).toBeCloseTo(TOON_LEVELS[0]);
    expect(toonLevel(0.6)).toBeCloseTo(TOON_LEVELS[1]);
    expect(toonLevel(0.75)).toBeCloseTo(TOON_LEVELS[1]);
    expect(toonLevel(1)).toBeCloseTo(TOON_LEVELS[2]);
    expect(toonLevel(3)).toBeCloseTo(TOON_LEVELS[2]);
  });

  it('đơn điệu không giảm, mép chuyển bậc ngắn (không nhảy cứng gây răng cưa)', () => {
    let prev = -1;
    for (let r = 0; r <= 2; r += 0.005) {
      const v = toonLevel(r);
      expect(v).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = v;
    }
    const mid = toonLevel(TOON_EDGES[0]);
    expect(mid).toBeGreaterThan(TOON_LEVELS[0]);
    expect(mid).toBeLessThan(TOON_LEVELS[1]);
  });

  it('bậc bóng không đen đặc (nhân vật không mất khối trên nền đêm)', () => {
    expect(TOON_LEVELS[0]).toBeGreaterThanOrEqual(0.3);
  });
});
