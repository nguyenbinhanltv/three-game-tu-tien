import { describe, expect, it } from 'vitest';
import { allyBearing } from './partyView';

describe('hướng đồng đội trên màn hình', () => {
  it('yaw 0: camera ở +z nhìn về −z; phía bắc (−z) = lên, +x = sang phải', () => {
    expect(allyBearing(0, -10, 0)).toEqual({ deg: 0, dist: 10 });
    expect(allyBearing(10, 0, 0).deg).toBe(90);
    expect(allyBearing(0, 10, 0).deg).toBe(180);
    expect(allyBearing(-10, 0, 0).deg).toBe(270);
  });
  it('yaw 90°: camera ở +x nhìn về −x; −x = lên', () => {
    const y = Math.PI / 2;
    expect(allyBearing(-10, 0, y).deg).toBe(0);
    expect(allyBearing(0, -10, y).deg).toBe(90);
  });
});
