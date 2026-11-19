import { describe, expect, it } from 'vitest';
import { LEVELS } from '@dtl/content';
import { pmGroundColor, pmKeepOut, PM_DOME } from './phucMachArt';

describe('Phục Mạch Quật (DUN-1 PR2)', () => {
  it('màu đất hợp lệ 0..1', () => {
    const out: [number, number, number] = [0, 0, 0];
    for (const [x, z, ny] of [
      [1520, 1300, 1],
      [1570, 1340, 0.9],
      [1650, 1200, 0.3],
    ] as const) {
      pmGroundColor(x, z, ny, out);
      for (const c of out) {
        expect(c).toBeGreaterThanOrEqual(0);
        expect(c).toBeLessThanOrEqual(1);
      }
    }
  });

  it('chừa khu giữa đài chiến và lối vào phía nam', () => {
    const c = LEVELS.phuc_mach!.dungeon!.center;
    expect(pmKeepOut(c.x, c.z, 30)).toBe(true);
    expect(pmKeepOut(c.x + 2, c.z + 60, 30)).toBe(true);
    expect(pmKeepOut(c.x + 60, c.z, 30)).toBe(false);
  });

  it('vòm hang trùm kín vùng đi lại của phó bản (bound 90)', () => {
    const bound = LEVELS.phuc_mach!.dungeon!.bound!;
    expect(PM_DOME.r).toBeGreaterThan(bound + 20);
  });
});
