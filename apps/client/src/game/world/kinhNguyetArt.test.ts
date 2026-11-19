import { describe, expect, it } from 'vitest';
import { LEVELS } from '@dtl/content';
import { KN_DOME, KN_OCULI, knKeepOut } from './kinhNguyetArt';

describe('Kính Nguyệt Cung (DUN-1 PR3)', () => {
  const dg = LEVELS.kinh_nguyet!.dungeon!;

  it('chừa khu giữa đài chiến và lối vào phía nam', () => {
    expect(knKeepOut(dg.center.x, dg.center.z, 30)).toBe(true);
    expect(knKeepOut(dg.center.x + 3, dg.center.z + 70, 30)).toBe(true);
    expect(knKeepOut(dg.center.x + 70, dg.center.z, 30)).toBe(false);
  });

  it('vòm trùm kín vùng đi lại (bound) và khe hở trần nằm trong vòm', () => {
    expect(KN_DOME.r).toBeGreaterThan(dg.bound! + 20);
    for (const o of KN_OCULI) expect(Math.hypot(o.x - dg.center.x, o.z - dg.center.z)).toBeLessThan(KN_DOME.r);
  });
});
