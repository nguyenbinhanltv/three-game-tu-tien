import { describe, expect, it } from 'vitest';
import { COLLIDERS, VALLEY } from './level';
import { PLAYER_RADIUS } from './movement';
import { FLY_MIN_CLEAR } from './movement';
import { BOLT_BODY_H, BOLT_MAX_LIFT, boltBlocked, boltBlockedAt, boltHits, boltLift, boltXZ, boltY, boltYaws, segDist2 } from './projectile';
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
    expect(boltHits(x, z - 1, x, z + 1, r, 0, x, py, z)).toBe(true);
    // Bước ngang vừa đủ: r + bán kính người + chút dư thì thoát.
    expect(boltHits(x, z - 1, x, z + 1, r, 0, x + r + PLAYER_RADIUS + 0.05, py, z)).toBe(false);
  });

  it('bay cao (ngự kiếm) hoặc thấp hơn đạn quá thân người thì không trúng', () => {
    const x = VALLEY.x;
    const z = VALLEY.z;
    const g = groundAt(x, z);
    expect(boltY(x, z)).toBeGreaterThan(g);
    expect(boltHits(x, z - 1, x, z + 1, 0.6, 0, x, g + 4, z)).toBe(false);
    expect(boltHits(x, z - 1, x, z + 1, 0.6, 0, x, g - BOLT_BODY_H - 2, z)).toBe(false);
  });

  it('đạn nâng theo độ cao mục tiêu lúc bắn: ngự kiếm sát đất không né được bằng cách lơ lửng', () => {
    const x = VALLEY.x;
    const z = VALLEY.z;
    const g = groundAt(x, z);
    const fly = g + FLY_MIN_CLEAR + 0.5;
    const lift = boltLift(fly, g);
    expect(lift).toBeCloseTo(FLY_MIN_CLEAR + 0.5);
    expect(boltHits(x, z - 1, x, z + 1, 0.45, 0, x, fly, z)).toBe(false); // đạn bám đất: bay qua dưới chân
    expect(boltHits(x, z - 1, x, z + 1, 0.45, lift, x, fly, z)).toBe(true);
    // Đổi độ cao sau khi đạn bắn thì né được.
    expect(boltHits(x, z - 1, x, z + 1, 0.45, lift, x, fly + 4, z)).toBe(false);
    expect(boltLift(g - 1, g)).toBe(0);
    expect(boltLift(g + 100, g)).toBe(BOLT_MAX_LIFT);
  });

  it('vỡ khi chạm vật cản tĩnh, xét cả đoạn quét (tick dài không xuyên tường)', () => {
    const c = COLLIDERS[0];
    expect(boltBlocked(c.x, c.z, 0.5)).toBe(true);
    expect(boltBlocked(c.x + c.r + 2, c.z, 0.5)).toBe(false);
    // Đoạn đi xuyên qua tâm vật cản từ ngoài này sang ngoài kia: chạm ở mép gần.
    const L = c.r + 10;
    const t = boltBlockedAt(c.x - L, c.z, c.x + L, c.z, 0.5);
    expect(t).toBeGreaterThan(0);
    expect(c.x - L + 2 * L * t).toBeCloseTo(c.x - c.r - 0.5);
    expect(boltBlockedAt(c.x - L, c.z + c.r + 3, c.x + L, c.z + c.r + 3, 0.5)).toBe(-1);
  });
});
