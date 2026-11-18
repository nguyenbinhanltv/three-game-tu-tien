import { describe, expect, it } from 'vitest';
import { breathOf, flinchOf, leanOf, locoMix, lookAngles, swingRate, turnLagOf, xfade } from './mannequinAnim';

describe('mannequinAnim', () => {
  it('locoMix: tổng trọng số 1, đi → chạy → chạy nhanh', () => {
    for (const s of [0.5, 1.5, 2.5, 4, 5.4, 6.5, 7.2, 9]) {
      const m = locoMix(s);
      expect(m.walk + m.jog + m.sprint).toBeCloseTo(1, 6);
    }
    expect(locoMix(0.8).walk).toBe(1);
    expect(locoMix(5.36).jog).toBeCloseTo(1, 3);
    expect(locoMix(7.2).sprint).toBeGreaterThan(0.5);
    expect(locoMix(9).sprint).toBe(1);
  });
  it('locoMix: chu kỳ/giây tăng theo tốc độ và bám tốc độ gốc của clip', () => {
    expect(locoMix(5.36).cycles).toBeCloseTo(5.36 / 5.0, 2);
    expect(locoMix(8.25).cycles).toBeCloseTo(8.25 / 5.5, 2);
    expect(locoMix(7.2).cycles).toBeGreaterThan(locoMix(5.4).cycles);
  });
  it('xfade: chết nhanh, ngồi chậm, dừng chậm hơn xuất phát', () => {
    expect(xfade('Jog_Fwd_Loop', 'Death01')).toBeLessThan(0.1);
    expect(xfade('Idle_Loop', 'Sitting_Idle_Loop')).toBeGreaterThan(0.3);
    expect(xfade('Jog_Fwd_Loop', 'Idle_Loop')).toBeGreaterThan(xfade('Idle_Loop', 'Jog_Fwd_Loop'));
  });
  it('leanOf/turnLagOf kẹp biên độ, đứng yên không nghiêng', () => {
    expect(leanOf(5, 0.2)).toBe(0);
    expect(leanOf(8, 8)).toBeCloseTo(0.13);
    expect(leanOf(-8, 8)).toBeCloseTo(-0.13);
    expect(Math.abs(turnLagOf(100))).toBeCloseTo(0.6);
  });
  it('lookAngles giới hạn góc, không nhìn ra sau lưng', () => {
    expect(lookAngles(10, 0, 0, 0).yaw).toBeCloseTo(1.0);
    expect(lookAngles(0, 0, 10, 0).yaw).toBeCloseTo(0);
    expect(lookAngles(0, 0, -10, 0)).toEqual({ yaw: 0, pitch: 0 });
    expect(lookAngles(0, 20, 1, 0).pitch).toBeCloseTo(-0.4);
    expect(lookAngles(0.1, 3, 0.1, 0)).toEqual({ yaw: 0, pitch: 0 });
  });
  it('swingRate: chậm rồi nhanh; flinch tắt dần; thở nhỏ', () => {
    expect(swingRate(0.1, 1.6)).toBeLessThan(1.6);
    expect(swingRate(0.3, 1.6)).toBeGreaterThan(1.6);
    expect(flinchOf(0.2, 0.01)).toBeLessThan(flinchOf(0.2, 0.05));
    expect(flinchOf(0.2, 0.5)).toBeLessThan(0.01);
    expect(Math.abs(breathOf(0.9, true))).toBeLessThanOrEqual(0.012);
  });
});
