import { describe, expect, it } from 'vitest';
import { footprintDist } from '@dtl/shared';
import { classify, groupOf, summarize } from './collscan.lib';

const mk = (o: Partial<{ path: string; x: number; z: number; y0: number; y1: number; w: number; d: number }>) => ({
  path: 'a',
  i: -1,
  x: 0,
  z: 0,
  y0: 0,
  y1: 3,
  w: 2,
  d: 2,
  tris: 10,
  ...o,
});
const g0 = () => 0;

describe('collscan: phân loại độ phủ', () => {
  it('vật thấp không cần va chạm; vật cao có vòng tròn phủ thì covered', () => {
    const rows = classify([mk({ y1: 0.2 }), mk({ x: 10 }), mk({ x: 50 })], [{ x: 10, z: 0, r: 2 }], [], footprintDist, g0);
    expect(rows.map((r) => [r.needs, r.covered])).toEqual([
      [false, false],
      [true, true],
      [true, false],
    ]);
  });
  it('hộp xoay phủ vật nằm trong', () => {
    const box = { k: 'box' as const, x: 0, z: 0, hx: 5, hz: 1, yaw: 0.5, y0: 0, y1: 4 };
    const rows = classify([mk({ x: 1, z: 0 }), mk({ x: 30, z: 0 })], [], [box], footprintDist, g0);
    expect(rows.map((r) => r.covered)).toEqual([true, false]);
  });
  it('gom nhóm bỏ chỉ số cuối và đếm thiếu', () => {
    expect(groupOf('sect>tree_12>mesh')).toBe('sect>tree>mesh');
    const rows = classify([mk({ path: 'cay_1', x: 0 }), mk({ path: 'cay_2', x: 30 })], [{ x: 0, z: 0, r: 2 }], [], footprintDist, g0);
    const rep = summarize('t', rows);
    expect(rep).toMatchObject({ needs: 2, covered: 1, missing: 1 });
    expect(rep.groups[0]).toMatchObject({ group: 'cay', n: 2, missing: 1 });
  });
});
