import { describe, expect, it } from 'vitest';
import { HpTrail, TRAIL_HOLD } from './hpTrail';

const step = (t: HpTrail, frac: number, secs: number, dt = 1 / 60) => {
  for (let s = 0; s < secs; s += dt) t.update(frac, dt);
  return t.value;
};

describe('HpTrail', () => {
  it('giữ nguyên trong thời gian giữ rồi rút về máu', () => {
    const t = new HpTrail(1);
    expect(step(t, 0.6, TRAIL_HOLD * 0.8)).toBe(1);
    step(t, 0.6, 2);
    expect(t.value).toBeCloseTo(0.6, 5);
  });

  it('máu tăng thì theo ngay', () => {
    const t = new HpTrail(0.4);
    t.update(0.9, 1 / 60);
    expect(t.value).toBe(0.9);
  });

  it('đòn đến liên tục không giữ mãi', () => {
    const t = new HpTrail(1);
    let hp = 1;
    // Mỗi 0,2 giây mất 2%: nhỏ hơn thời gian giữ, nếu đặt lại thời gian giữ thì đoạn trễ đứng yên mãi.
    for (let i = 0; i < 20; i++) {
      hp -= 0.02;
      step(t, hp, 0.2);
    }
    expect(t.value).toBeLessThan(0.9);
    expect(t.value).toBeGreaterThanOrEqual(hp);
  });

  it('không bao giờ thấp hơn máu, kẹp 0..1, chịu NaN', () => {
    const t = new HpTrail(1);
    for (let i = 0; i < 300; i++) expect(t.update(0.3, 1 / 30)).toBeGreaterThanOrEqual(0.3);
    t.reset(2);
    expect(t.value).toBe(1);
    t.update(Number.NaN, 0.1);
    expect(t.value).toBe(1);
    step(t, Number.NaN, 3);
    expect(t.value).toBe(0);
  });

  it('khoảng mất lớn rút nhanh hơn khoảng mất nhỏ', () => {
    const a = new HpTrail(1);
    const b = new HpTrail(1);
    step(a, 0.9, TRAIL_HOLD + 0.2);
    step(b, 0.2, TRAIL_HOLD + 0.2);
    expect(1 - b.value).toBeGreaterThan(1 - a.value);
  });
});
