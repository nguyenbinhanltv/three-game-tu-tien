import { collisionOf, type Shape } from '@dtl/shared';
import { describe, expect, it } from 'vitest';
import { ARCH_BY_LEVEL, INST_BY_LEVEL, propShapesOf } from './colliders';
import { archShapesFrom } from './colliders.core';
import { collidersReady, ensureColliders, loadLevelShapes } from './colliders.lazy';

const levels = [...new Set([...Object.keys(INST_BY_LEVEL), ...Object.keys(ARCH_BY_LEVEL)])];

describe('colliders.lazy (B7)', () => {
  it('nạp theo level cho đúng cùng hình với colliders.ts (prop + kiến trúc), mọi level', async () => {
    expect(levels.length).toBeGreaterThanOrEqual(15);
    for (const lv of levels) {
      const want: Shape[] = [...propShapesOf(lv), ...archShapesFrom(ARCH_BY_LEVEL[lv] ?? [])];
      const got = await loadLevelShapes(lv);
      expect(got.length, lv).toBe(want.length);
      expect(JSON.stringify(got), lv).toBe(JSON.stringify(want));
    }
  });
  it('level không có dữ liệu bake thì không lỗi', async () => {
    expect(await loadLevelShapes('khong_co_level_nay')).toEqual([]);
  });
  it('ensureColliders không đăng ký trùng khi đã có hình (môi trường nạp đủ) và báo sẵn sàng', async () => {
    const before = collisionOf('van_lam').shapes.length;
    expect(before).toBeGreaterThan(0);
    await ensureColliders('van_lam');
    await ensureColliders('van_lam');
    expect(collisionOf('van_lam').shapes.length).toBe(before);
    expect(collidersReady('van_lam')).toBe(true);
  });
});
