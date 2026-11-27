import { describe, expect, it } from 'vitest';
import { LIMIT_KNEE, LIMIT_RANGE, limitCurve, limitTable } from './limiter';

describe('limitCurve (chặn đỉnh mềm ở đầu ra âm thanh)', () => {
  it('dưới điểm gãy thì giữ nguyên tín hiệu', () => {
    for (const x of [0, 0.01, -0.3, 0.5, -LIMIT_KNEE, LIMIT_KNEE]) expect(limitCurve(x)).toBe(x);
  });

  it('trên điểm gãy thì bo dần, không bao giờ vượt 1, tăng đơn điệu, đối xứng', () => {
    let prev = LIMIT_KNEE;
    for (let x = LIMIT_KNEE + 0.01; x <= 8; x += 0.01) {
      const y = limitCurve(x);
      expect(y).toBeGreaterThanOrEqual(prev);
      expect(y).toBeLessThanOrEqual(1);
      expect(limitCurve(-x)).toBeCloseTo(-y, 12);
      prev = y;
    }
    // Hai tiếng 0,6 chồng nhau (1,2, tức +1,6 dBFS, trước đây bị xén cứng ở 1) ra khoảng 0,98: đỉnh được bo tròn thay vì cắt phẳng.
    expect(limitCurve(1.2)).toBeGreaterThan(0.95);
    expect(limitCurve(1.2)).toBeLessThan(0.99);
  });

  it('độ dốc liên tục tại điểm gãy (không gãy khúc nghe thành méo)', () => {
    const e = 1e-4;
    const slope = (limitCurve(LIMIT_KNEE + e) - limitCurve(LIMIT_KNEE)) / e;
    expect(slope).toBeGreaterThan(0.99);
    expect(slope).toBeLessThanOrEqual(1);
  });

  it('bảng cho WaveShaper: số mẫu lẻ, 0 nằm đúng giữa, phần tuyến tính khớp từng mẫu', () => {
    const tb = limitTable(8193);
    expect(tb.length % 2).toBe(1);
    expect(tb[4096]).toBe(0);
    expect(tb[0]).toBeGreaterThanOrEqual(-1);
    expect(tb[8192]).toBeLessThanOrEqual(1);
    // Mẫu thứ i ứng với x = (i / 8192 × 2 − 1) × LIMIT_RANGE; trong vùng tuyến tính y phải bằng x (sai số số thực 32 bit).
    for (const i of [4096 + 100, 4096 - 512, 4096 + 700]) {
      const x = ((i / 8192) * 2 - 1) * LIMIT_RANGE;
      expect(Math.abs(x)).toBeLessThan(LIMIT_KNEE);
      expect(tb[i]).toBeCloseTo(x, 6);
    }
  });
});
