import { describe, expect, it } from 'vitest';
import { boxesOverlap, fitFactor, screenWidthPx } from './screenFit';
import { easeZoneCam, zoneCamera, BASE_FOV } from '../camera/camZones';
import { KIEM_TRUNG, SECT } from '@dtl/shared';

describe('screenFit', () => {
  it('camera sát thì nhãn bị kẹp lại, xa thì được nở ra, vừa thì giữ nguyên', () => {
    const near = fitFactor(3.6, 2, 55, 1000, 120, 240);
    expect(near).toBeLessThan(1);
    expect(screenWidthPx(3.6, 2, 55, 1000) * near).toBeCloseTo(240, 3);
    const far = fitFactor(3.6, 80, 55, 1000, 120, 240);
    expect(far).toBeGreaterThan(1);
    expect(screenWidthPx(3.6, 80, 55, 1000) * far).toBeCloseTo(120, 3);
    expect(fitFactor(3.6, 20, 55, 1000, 50, 400)).toBe(1);
  });
  it('hộp chồng nhau', () => {
    expect(boxesOverlap({ x: 0, y: 0, hw: 50, hh: 10 }, { x: 60, y: 5, hw: 50, hh: 10 })).toBe(true);
    expect(boxesOverlap({ x: 0, y: 0, hw: 50, hh: 10 }, { x: 0, y: 40, hw: 50, hh: 10 })).toBe(false);
  });
});

describe('camZones', () => {
  it('ngoài mọi vùng là camera mặc định', () => {
    const z = zoneCamera(100, 100);
    expect(z.distMul).toBe(1);
    expect(z.fov).toBe(BASE_FOV);
  });
  it('sân xa hơn, Kiếm Trủng gần hơn', () => {
    expect(zoneCamera(SECT.x, SECT.z).distMul).toBeGreaterThan(1.15);
    expect(zoneCamera(KIEM_TRUNG.x, KIEM_TRUNG.z).distMul).toBeLessThan(0.85);
  });
  it('liên tục qua ranh: bước 1 m không nhảy quá 2%', () => {
    let prev = zoneCamera(SECT.x + 80, SECT.z).distMul;
    for (let d = 81; d < 260; d++) {
      const cur = zoneCamera(SECT.x + d, SECT.z).distMul;
      expect(Math.abs(cur - prev)).toBeLessThan(0.02);
      prev = cur;
    }
  });
  it('làm mượt tiến dần tới đích', () => {
    const cur = { distMul: 1, pitchAdd: 0, fov: 55 };
    easeZoneCam(cur, { distMul: 2, pitchAdd: 0, fov: 60 }, 0.1);
    expect(cur.distMul).toBeGreaterThan(1);
    expect(cur.distMul).toBeLessThan(2);
  });
});
