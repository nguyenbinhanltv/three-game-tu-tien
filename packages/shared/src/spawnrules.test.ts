import { describe, expect, it } from 'vitest';
import {
  AOI_BOSS_IN,
  AOI_BOSS_OUT,
  AOI_IN,
  AOI_OUT,
  aoiVisible,
  CAMP_RESPAWN_MAX,
  CAMP_RESPAWN_MIN,
  campMeleeCount,
  campRespawnSec,
  formationSlots,
} from './index';

describe('hồi sinh cụm theo số người', () => {
  it('luôn trong 12–25 giây, một người thì chậm nhất, càng đông càng nhanh', () => {
    for (const base of [25, 28, 30, 35, 10]) {
      let prev = Infinity;
      for (let n = 0; n <= 60; n++) {
        const t = campRespawnSec(base, n);
        expect(t).toBeGreaterThanOrEqual(CAMP_RESPAWN_MIN);
        expect(t).toBeLessThanOrEqual(CAMP_RESPAWN_MAX);
        expect(t).toBeLessThanOrEqual(prev + 1e-9);
        prev = t;
      }
    }
    expect(campRespawnSec(35, 1)).toBe(25);
    expect(campRespawnSec(25, 0)).toBe(25);
    expect(campRespawnSec(30, 50)).toBe(12);
  });
  it('số con: một người ra số gốc, đủ đông ra 1,5 lần (làm tròn xuống), không vượt', () => {
    expect(campMeleeCount(3, 1)).toBe(3);
    expect(campMeleeCount(4, 1)).toBe(4);
    expect(campMeleeCount(3, 10)).toBe(4);
    expect(campMeleeCount(4, 10)).toBe(6);
    for (const c of [3, 4]) {
      let prev = 0;
      for (let n = 0; n <= 100; n++) {
        const k = campMeleeCount(c, n);
        expect(k).toBeGreaterThanOrEqual(c);
        expect(k).toBeLessThanOrEqual(Math.floor(c * 1.5));
        expect(k).toBeGreaterThanOrEqual(prev);
        prev = k;
      }
    }
  });
});

describe('đội hình cụm', () => {
  it('con thường đứng đều trên vòng quanh tâm, không chồng nhau, nằm trong bán kính bãi', () => {
    for (const [r, n] of [[18, 3], [25, 4], [30, 6], [18, 4]] as const) {
      const { melee } = formationSlots(100, 200, r, n, 0.7, false);
      expect(melee).toHaveLength(n);
      for (const s of melee) expect(Math.hypot(s.x - 100, s.z - 200)).toBeLessThanOrEqual(r);
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) expect(Math.hypot(melee[i].x - melee[j].x, melee[i].z - melee[j].z)).toBeGreaterThan(3);
    }
  });
  it('quái đánh xa đứng phía sau, gần tâm hơn vòng; cùng phase thì cùng đội hình', () => {
    const a = formationSlots(0, 0, 25, 3, 1.1, true);
    const b = formationSlots(0, 0, 25, 3, 1.1, true);
    expect(a).toEqual(b);
    const ring = Math.hypot(a.melee[0].x, a.melee[0].z);
    expect(Math.hypot(a.ranged!.x, a.ranged!.z)).toBeLessThan(ring);
  });
});

describe('AOI', () => {
  it('vào ở AOI_IN, ra ở AOI_OUT (độ trễ), boss rộng hơn', () => {
    const d = (r: number) => r * r;
    expect(aoiVisible(d(AOI_IN - 1), false, false)).toBe(true);
    expect(aoiVisible(d(AOI_IN + 1), false, false)).toBe(false);
    expect(aoiVisible(d(AOI_IN + 1), true, false)).toBe(true);
    expect(aoiVisible(d(AOI_OUT + 1), true, false)).toBe(false);
    expect(aoiVisible(d(AOI_BOSS_IN - 1), false, true)).toBe(true);
    expect(aoiVisible(d(AOI_BOSS_OUT + 1), true, true)).toBe(false);
    expect(AOI_OUT).toBeGreaterThan(AOI_IN);
    // client chỉ vẽ quái thường tới 125 m, boss tới 280 m
    expect(AOI_IN).toBeGreaterThan(125);
    expect(AOI_BOSS_IN).toBeGreaterThan(280);
  });
});
