import { describe, expect, it } from 'vitest';
import { COLLIDERS, VALLEY } from './level';
import { PLAYER_RADIUS } from './movement';
import { BOLT_BODY_H, boltBlocked, boltHits, boltXZ, boltY, boltYaws, segDist2 } from './projectile';
import { groundAt } from './terrain';

describe('đạn đánh xa (D1)', () => {
  it('bay thẳng theo yaw = atan2(dx, dz)', () => {
    const p = boltXZ(10, 20, Math.PI / 2, 8, 0.5, { x: 0, z: 0 });
    expect(p.x).toBeCloseTo(14);
    expect(p.z).toBeCloseTo(20);
    const q = boltXZ(10, 20, 0, 8, 1, { x: 0, z: 0 });
    expect(q.x).toBeCloseTo(10);
    expect(q.z).toBeCloseTo(28);
  });

  it('loạt n viên tỏa đều, 1 viên giữ nguyên hướng', () => {
    expect(boltYaws(1, 1, 0.5)).toEqual([1]);
    const y = boltYaws(0, 3, 0.6);
    expect(y[0]).toBeCloseTo(-0.3);
    expect(y[1]).toBeCloseTo(0);
    expect(y[2]).toBeCloseTo(0.3);
  });

  it('khoảng cách điểm–đoạn kẹp ở hai đầu', () => {
    expect(segDist2(0, 0, 10, 0, 5, 2)).toBeCloseTo(4);
    expect(segDist2(0, 0, 10, 0, -3, 0)).toBeCloseTo(9);
    expect(segDist2(0, 0, 10, 0, 13, 4)).toBeCloseTo(25);
  });

  it('quét theo đoạn: trúng người đứng giữa hai tick, né khi bước ngang đủ xa', () => {
    const x = VALLEY.x;
    const z = VALLEY.z;
    const py = groundAt(x, z);
    const r = 0.6;
    // Đạn đi từ z-1 tới z+1 qua người đứng ở (x, z).
    expect(boltHits(x, z - 1, x, z + 1, r, x, py, z)).toBe(true);
    // Bước ngang vừa đủ: r + bán kính người + chút dư thì thoát.
    expect(boltHits(x, z - 1, x, z + 1, r, x + r + PLAYER_RADIUS + 0.05, py, z)).toBe(false);
  });

  it('bay cao (ngự kiếm) hoặc thấp hơn đạn quá thân người thì không trúng', () => {
    const x = VALLEY.x;
    const z = VALLEY.z;
    const g = groundAt(x, z);
    expect(boltY(x, z)).toBeGreaterThan(g);
    expect(boltHits(x, z - 1, x, z + 1, 0.6, x, g + 4, z)).toBe(false);
    expect(boltHits(x, z - 1, x, z + 1, 0.6, x, g - BOLT_BODY_H - 2, z)).toBe(false);
  });

  it('vỡ khi chạm vật cản tĩnh', () => {
    const c = COLLIDERS[0];
    expect(boltBlocked(c.x, c.z, 0.5)).toBe(true);
    expect(boltBlocked(c.x + c.r + 2, c.z, 0.5)).toBe(false);
  });
});
