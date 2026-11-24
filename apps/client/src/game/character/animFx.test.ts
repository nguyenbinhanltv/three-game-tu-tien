import { describe, expect, it } from 'vitest';
import { POSE } from '@dtl/content';
import { accelLean, bobOf, EXAG_GAIN, exagBlend, exagGain, glideDip, glideLean, IDLE_POSES, idleDue, idlePoseFor, leanBoost } from './animFx';
import { closeCam, keyMoments } from '../debug/animLab';

describe('Thân Pháp T1 (cường điệu)', () => {
  it('đứng yên giữ nguyên clip, chạy thì đủ hệ số', () => {
    expect(exagBlend(0)).toBe(0);
    expect(exagGain('upperarm_l', 0)).toBe(1);
    expect(exagBlend(3)).toBe(1);
    expect(exagGain('upperarm_l', 5.4)).toBeCloseTo(EXAG_GAIN.upperarm_l!, 6);
  });
  it('hệ số tay/vai/hông nằm trong 15–30%', () => {
    for (const g of Object.values(EXAG_GAIN)) {
      expect(g).toBeGreaterThanOrEqual(1.15);
      expect(g).toBeLessThanOrEqual(1.3);
    }
  });
  it('xương lạ không bị đụng', () => {
    expect(exagGain('head', 5)).toBe(1);
  });
  it('nảy bước: không nảy khi đứng, thấp nhất lúc chân chạm, hai lần mỗi chu kỳ', () => {
    expect(bobOf(0.3, 0)).toBe(0);
    expect(bobOf(0, 5.4)).toBeCloseTo(0, 9);
    expect(bobOf(0.25, 5.4)).toBeGreaterThan(0.03);
    expect(bobOf(0.5, 5.4)).toBeCloseTo(0, 9);
    expect(bobOf(0.25, 5.4)).toBeCloseTo(bobOf(0.75, 5.4), 9);
  });
  it('nghiêng khi rẽ mạnh hơn gốc nhưng có trần', () => {
    expect(leanBoost(0.1)).toBeCloseTo(0.15, 9);
    expect(leanBoost(5)).toBe(0.2);
    expect(leanBoost(-5)).toBe(-0.2);
  });
});

describe('animlab', () => {
  it('mốc tự chụp tăng dần, +30 ms ngay sau đỉnh đòn', () => {
    const m = keyMoments(0.28, 0.9);
    expect(m.map((x) => x.name)).toEqual(['dolu', 'dinh', 'p30', 'thu']);
    expect(m[1]!.at).toBe(0.28);
    expect(m[2]!.at).toBeCloseTo(0.31, 9);
    for (let i = 1; i < m.length; i++) expect(m[i]!.at).toBeGreaterThan(m[i - 1]!.at);
    expect(m[3]!.at).toBeLessThan(0.9);
  });
  it('camera cận nhìn vào người, cách đúng khoảng', () => {
    const c = closeCam(10, 2, 20, 1.7, Math.PI / 2, 3.6);
    expect(c.tx).toBe(10);
    expect(Math.hypot(c.x - 10, c.z - 20)).toBeCloseTo(3.6, 9);
    expect(c.y).toBeGreaterThan(2 + 1.2);
    expect(c.fov).toBe(28);
  });
});

describe('Thân Pháp T2/T3 (di chuyển, idle)', () => {
  it('tăng tốc chúi tới, phanh ngả sau, có trần', () => {
    expect(accelLean(8)).toBeGreaterThan(0);
    expect(accelLean(-8)).toBeLessThan(0);
    expect(accelLean(1000)).toBe(0.16);
    expect(accelLean(-1000)).toBe(-0.16);
  });
  it('lướt thấp chỉ khi chạy', () => {
    expect(glideLean(0)).toBe(0);
    expect(glideLean(1)).toBeLessThan(glideLean(5.4));
    expect(glideDip(5.4)).toBeCloseTo(0.04, 9);
    expect(glideDip(0)).toBe(0);
  });
  it('idle: chọn pose theo thế kiếm, tới lượt sau 7 s đứng yên', () => {
    expect(idlePoseFor(true)).toBe('kiem_idle_xoay');
    expect(idlePoseFor(false)).toBe('kiem_idle_chap_tay');
    expect(idleDue(6.9)).toBe(false);
    expect(idleDue(7)).toBe(true);
    expect(POSE.has(IDLE_POSES.drawn) && POSE.has(IDLE_POSES.free)).toBe(true);
  });
});
