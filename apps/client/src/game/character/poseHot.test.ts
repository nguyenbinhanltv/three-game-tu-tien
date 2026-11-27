import { describe, expect, it } from 'vitest';
import { POSE } from '@dtl/content';
import type { PoseDef } from '@dtl/shared';
import { buildMixamoFixture } from './mixamoFixture';
import { bakePoseLibrary, forgetPoseBake } from './poseLib';

describe('nạp lại pose tức thì (bản dev): quên clip đã nướng', () => {
  it('pose chiêu đổi dữ liệu tại chỗ → lần get kế nướng lại theo dữ liệu mới', () => {
    const src = POSE.get('kiem_khi_tram') as unknown as PoseDef;
    const def = JSON.parse(JSON.stringify(src)) as PoseDef;
    const lib = bakePoseLibrary(buildMixamoFixture(), [def])!;
    const a = lib.get(def.id)!;
    expect(a.full.duration).toBeCloseTo(def.duration, 3);
    // Chưa quên: vẫn là clip cũ dù dữ liệu đã đổi.
    def.duration = 1.4;
    def.keys[def.keys.length - 1]!.t = 1.4;
    expect(lib.get(def.id)).toBe(a);
    expect(forgetPoseBake(def)).toBeGreaterThanOrEqual(1);
    const b = lib.get(def.id)!;
    expect(b).not.toBe(a);
    expect(b.full.duration).toBeCloseTo(1.4, 3);
    expect(b.upper.duration).toBeCloseTo(1.4, 3);
    expect(lib.has(def.id)).toBe(true);
  });

  it('pose không có trong thư viện thì không đụng gì', () => {
    const def = JSON.parse(JSON.stringify(POSE.get('kiem_khi_tram'))) as PoseDef;
    const lib = bakePoseLibrary(buildMixamoFixture(), [def])!;
    const size = lib.size;
    forgetPoseBake({ ...def, id: 'khong_co' });
    expect(lib.size).toBe(size);
    expect(lib.has('khong_co')).toBe(false);
  });
});
