import { at } from './arr';
import { describe, expect, it } from 'vitest';
import { PROP_LIB, propColliders, propLibEntry, propLibForMap } from './propLib';

describe('propLib', () => {
  it('id duy nhất, prefix prop_, mỗi bản đồ 6 prop', () => {
    expect(new Set(PROP_LIB.map((p) => p.id)).size).toBe(PROP_LIB.length);
    for (const p of PROP_LIB) expect(p.id.startsWith('prop_')).toBe(true);
    expect(propLibForMap('doan_mach').length).toBe(6);
    expect(propLibForMap('van_hai').length).toBe(6);
    expect(propLibForMap('co_thanh').length).toBe(6);
  });
  it('va chạm xoay theo yaw và nhân tỉ lệ', () => {
    expect(propLibEntry('prop_cong_thanh_vo')?.colliders.length).toBe(2);
    const a = propColliders('prop_cong_thanh_vo', 100, 200, 0, 1);
    expect(a[1]).toEqual({ x: 108, z: 200, r: 4.5 });
    const b = propColliders('prop_cong_thanh_vo', 100, 200, Math.PI / 2, 2);
    const b1 = at(b, 1);
    expect(b1.x).toBeCloseTo(100, 6);
    expect(b1.z).toBeCloseTo(200 - 16, 6);
    expect(b1.r).toBe(9);
    expect(propColliders('khong_co', 0, 0)).toEqual([]);
  });
});
