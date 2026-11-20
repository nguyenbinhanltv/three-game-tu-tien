import { describe, expect, it } from 'vitest';
import { LEVELS } from '@dtl/content';
import { terrainOf } from '@dtl/shared';
import { setActiveLevel } from '../../base/levelCtx';
import { cliffSpots } from './doanMachCliffs';

describe('doanMachCliffs: vách đá chỉ ở sườn dốc, tránh nơi đi lại', () => {
  it('không đặt cụm nào trong vùng cấm và tất định', () => {
    setActiveLevel('doan_mach');
    const T = terrainOf(LEVELS.doan_mach!);
    const ban = [{ x: 1024, z: 1036, r: 60 }];
    const free = (x: number, z: number) => !ban.some((b) => (x - b.x) ** 2 + (z - b.z) ** 2 < b.r * b.r);
    const a = cliffSpots(free);
    const b = cliffSpots(free);
    expect(a.length).toBeGreaterThan(20);
    expect(b).toEqual(a);
    for (const s of a) {
      expect(free(s.x, s.z)).toBe(true);
      // sườn dốc: pháp tuyến thật nghiêng nhiều
      expect(s.ny).toBeLessThan(0.65);
      expect(T.heightAt(s.x, s.z)).toBeGreaterThan(0);
    }
  });
});
