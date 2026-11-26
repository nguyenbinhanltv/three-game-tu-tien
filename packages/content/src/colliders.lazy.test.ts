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
  it('import lỗi: thử lại có giới hạn, lần sau thành công thì collidersReady = true và đăng ký đúng một lần', async () => {
    const level = 'level_thu_loi_1';
    let calls = 0;
    const box: Shape = { k: 'cyl', x: 1, z: 2, r: 1, y0: 0, y1: 2, tag: 't' };
    await ensureColliders(level, {
      delayMs: 0,
      load: async () => {
        if (++calls < 3) throw new Error('Failed to fetch dynamically imported module');
        return [box];
      },
    });
    expect(calls).toBe(3);
    expect(collidersReady(level)).toBe(true);
    expect(collisionOf(level).shapes.length).toBe(1);
  });
  it('hết lần thử thì từ chối, không nhớ lỗi: gọi lại sau đó thành công (người chơi không kẹt)', async () => {
    const level = 'level_thu_loi_2';
    let calls = 0;
    const ok = async (): Promise<Shape[]> => [];
    await expect(
      ensureColliders(level, {
        tries: 2,
        delayMs: 0,
        load: async () => {
          calls++;
          throw new Error('404');
        },
      }),
    ).rejects.toThrow('404');
    expect(calls).toBe(2);
    expect(collidersReady(level)).toBe(false);
    await ensureColliders(level, { delayMs: 0, load: ok });
    expect(collidersReady(level)).toBe(true);
  });
});
