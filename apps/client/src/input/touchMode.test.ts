import { describe, expect, it } from 'vitest';
import { isTap, joystick, JOY_DEAD, JOY_RADIUS, pinchDist, resolveTouch } from './touchMode';

describe('joystick', () => {
  it('vùng chết không di chuyển', () => {
    const j = joystick(JOY_RADIUS * JOY_DEAD * 0.9, 0);
    expect(j.mx).toBe(0);
    expect(j.mz).toBe(0);
    expect(j.mag).toBe(0);
  });
  it('vuốt lên = tiến (mz +1), phải = mx +1', () => {
    const up = joystick(0, -JOY_RADIUS);
    expect(up.mz).toBeCloseTo(1);
    expect(up.mx).toBeCloseTo(0);
    expect(up.mag).toBe(1);
    const right = joystick(JOY_RADIUS, 0);
    expect(right.mx).toBeCloseTo(1);
    expect(right.mz).toBeCloseTo(0);
  });
  it('vector chuẩn hóa, đầu cần kẹp trong bán kính', () => {
    const j = joystick(300, -300);
    expect(Math.hypot(j.mx, j.mz)).toBeCloseTo(1);
    expect(Math.hypot(j.kx, j.ky)).toBeCloseTo(JOY_RADIUS);
  });
  it('độ lệch tăng dần theo mag', () => {
    expect(joystick(0, -JOY_RADIUS * 0.5).mag).toBeGreaterThan(0);
    expect(joystick(0, -JOY_RADIUS * 0.5).mag).toBeLessThan(1);
  });
});

describe('pinch, tap, resolve', () => {
  it('tách hai ngón = lại gần, kẹp giới hạn', () => {
    expect(pinchDist(20, 2)).toBe(10);
    expect(pinchDist(20, 100)).toBe(3);
    expect(pinchDist(20, 0.001)).toBe(70);
    expect(pinchDist(20, 0)).toBe(20);
  });
  it('chạm = nhỏ + ngắn', () => {
    expect(isTap(4, 120)).toBe(true);
    expect(isTap(30, 120)).toBe(false);
    expect(isTap(4, 900)).toBe(false);
  });
  it('ưu tiên URL > Cài đặt > thiết bị', () => {
    expect(resolveTouch({ pref: 'auto', detected: true }, null)).toBe(true);
    expect(resolveTouch({ pref: 'auto', detected: false }, null)).toBe(false);
    expect(resolveTouch({ pref: 'on', detected: false }, null)).toBe(true);
    expect(resolveTouch({ pref: 'off', detected: true }, null)).toBe(false);
    expect(resolveTouch({ pref: 'off', detected: true }, true)).toBe(true);
  });
});
