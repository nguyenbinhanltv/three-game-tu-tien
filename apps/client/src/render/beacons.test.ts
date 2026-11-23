import { describe, expect, it } from 'vitest';
import {
  ISO_BEACON_FADE_FROM,
  ISO_BEACON_HEIGHT_MUL,
  ISO_BEACON_RADIUS_MUL,
  ISO_HALO_SCALE,
  beaconHeight,
  beaconRadiusMul,
  haloScale,
} from './beacons';

describe('cột linh quang ở camera iso', () => {
  it('hạ thấp ở iso, giữ nguyên ở camera cũ', () => {
    expect(beaconHeight(30, false)).toBe(30);
    expect(beaconHeight(30, true)).toBeCloseTo(30 * ISO_BEACON_HEIGHT_MUL, 6);
    expect(beaconHeight(30, true)).toBeLessThan(5);
  });
  it('iso: bán kính và quầng nhỏ hơn nhiều, camera cũ giữ nguyên', () => {
    expect(beaconRadiusMul(false)).toBe(1);
    expect(beaconRadiusMul(true)).toBe(ISO_BEACON_RADIUS_MUL);
    expect(haloScale(false)).toBe(3);
    expect(haloScale(true)).toBe(ISO_HALO_SCALE);
    // bán kính quầng ngoài cùng ở iso (chân cột 5,2 m): không quá 4 m
    expect(5.2 * ISO_BEACON_RADIUS_MUL * ISO_HALO_SCALE).toBeLessThan(4);
  });
  it('phần trên tắt sớm hơn bản thường (0,55)', () => {
    expect(ISO_BEACON_FADE_FROM).toBeLessThan(0.55);
    expect(ISO_BEACON_FADE_FROM).toBeGreaterThan(0);
  });
});
