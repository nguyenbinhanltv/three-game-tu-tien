import { describe, expect, it } from 'vitest';
import { KIEM_TRUNG } from '@dtl/shared';
import { ktGroundColor, planGiants, planSmallSwords, swordKeepOut } from './kiemTrungArt';

describe('Kiếm Trủng (DUN-1)', () => {
  it('rải kiếm tất định và đủ số lượng', () => {
    const a = planSmallSwords(100, 80);
    const b = planSmallSwords(100, 80);
    expect(a).toEqual(b);
    expect(a.length).toBe(180);
    expect(a.filter((s) => s.kind === 'whole').length).toBe(100);
  });

  it('chừa khu giữa đài chiến và lối vào phía nam', () => {
    for (const s of planSmallSwords(300, 200)) {
      expect(Math.hypot(s.x - KIEM_TRUNG.x, s.z - KIEM_TRUNG.z)).toBeGreaterThanOrEqual(26);
      expect(Math.abs(s.x - KIEM_TRUNG.x) < 9 && s.z > KIEM_TRUNG.z).toBe(false);
    }
    expect(swordKeepOut(KIEM_TRUNG.x, KIEM_TRUNG.z + 40, 26)).toBe(true);
  });

  it('cự kiếm nằm trong vòm hang (r 170, h 110) và cách xa lối vào', () => {
    const g = planGiants();
    expect(g.length).toBeGreaterThanOrEqual(6);
    for (const k of g) {
      const r = Math.hypot(k.x - KIEM_TRUNG.x, k.z - KIEM_TRUNG.z);
      expect(r).toBeLessThan(150);
      // chiều cao vòm tại bán kính r: h * sqrt(1 - (r/R)^2)
      expect(k.h).toBeLessThan(110 * Math.sqrt(1 - (r / 170) ** 2));
    }
  });

  it('màu đất hợp lệ 0..1', () => {
    const out: [number, number, number] = [0, 0, 0];
    for (const [x, z, ny] of [
      [1520, 1300, 1],
      [1560, 1330, 0.9],
      [1700, 1100, 0.3],
    ] as const) {
      ktGroundColor(x, z, ny, out);
      for (const c of out) {
        expect(c).toBeGreaterThanOrEqual(0);
        expect(c).toBeLessThanOrEqual(1);
      }
    }
  });
});
