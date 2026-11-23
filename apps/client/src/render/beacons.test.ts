import { describe, expect, it } from 'vitest';
import { ISO_BEACON_FADE_FROM, ISO_BEACON_HEIGHT_MUL, beaconHeight } from './beacons';

describe('cột linh quang ở camera iso', () => {
  it('hạ thấp ở iso, giữ nguyên ở camera cũ', () => {
    expect(beaconHeight(30, false)).toBe(30);
    expect(beaconHeight(30, true)).toBeCloseTo(30 * ISO_BEACON_HEIGHT_MUL, 6);
    expect(beaconHeight(30, true)).toBeLessThan(15);
  });
  it('phần trên tắt sớm hơn bản thường (0,55)', () => {
    expect(ISO_BEACON_FADE_FROM).toBeLessThan(0.55);
    expect(ISO_BEACON_FADE_FROM).toBeGreaterThan(0);
  });
});
