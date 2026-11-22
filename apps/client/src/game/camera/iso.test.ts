import { describe, expect, it } from 'vitest';
import {
  clampLeadSafe,
  ISO_SAFE_DOWN,
  ISO_SAFE_UP,
  ISO_SAFE_X,
  ISO_DIST,
  isoCameraPos,
  isoLead,
  ISO_LEAD_MAX,
  nearestTo,
  rayGround,
  worldToIntent,
} from './iso';

describe('clampLeadSafe', () => {
  it('kẹp độ lệch ngang và độ tụt xuống để người ở vùng an toàn', () => {
    for (const yaw of [0, 0.785, 2.2]) {
      const s = Math.sin(yaw);
      const c = Math.cos(yaw);
      for (const [lx, lz] of [
        [30, 0],
        [0, 30],
        [-30, 0],
        [0, -30],
        [20, -25],
      ] as const) {
        const r = clampLeadSafe(lx, lz, yaw);
        const sx = r.x * c - r.z * s;
        const sy = r.x * s + r.z * c;
        expect(Math.abs(sx)).toBeLessThanOrEqual(ISO_SAFE_X + 1e-6);
        expect(sy).toBeGreaterThanOrEqual(-ISO_SAFE_DOWN - 1e-6);
        expect(sy).toBeLessThanOrEqual(ISO_SAFE_UP + 1e-6);
      }
    }
    expect(clampLeadSafe(0.5, 0.2, 0.7)).toEqual(expect.objectContaining({ x: expect.closeTo(0.5, 5), z: expect.closeTo(0.2, 5) }));
  });
});

describe('iso camera', () => {
  it('camera cách điểm nhìn đúng khoảng cố định', () => {
    const p = isoCameraPos(10, 2, -5, ISO_DIST, 0.8);
    expect(Math.hypot(p.x - 10, p.y - 2, p.z + 5)).toBeCloseTo(ISO_DIST, 5);
  });
  it('dẫn trước bị chặn', () => {
    const l = isoLead(100, 0);
    expect(Math.hypot(l.x, l.z)).toBeCloseTo(ISO_LEAD_MAX);
    expect(isoLead(0, 0)).toEqual({ x: 0, z: 0 });
  });
  it('raycast xuống đất phẳng và đồi', () => {
    const hit = rayGround({ x: 0, y: 10, z: 0 }, { x: 0, y: -1, z: 0 }, () => 2);
    expect(hit!.y).toBe(2);
    expect(hit!.x).toBeCloseTo(0);
    const d = Math.SQRT1_2;
    const h2 = rayGround({ x: 0, y: 10, z: 0 }, { x: d, y: -d, z: 0 }, (x) => 0.1 * x);
    expect(h2!.y).toBeCloseTo(0.1 * h2!.x, 2);
    expect(rayGround({ x: 0, y: 10, z: 0 }, { x: 1, y: 0.2, z: 0 }, () => 0)).toBeNull();
  });
  it('ý định đi ngược lại đúng stepMove', () => {
    for (const yaw of [0, 0.785, 2.4, -1.3]) {
      for (const [dx, dz] of [
        [1, 0],
        [0, 1],
        [-0.6, 0.8],
      ] as const) {
        const { mx, mz } = worldToIntent(dx, dz, yaw);
        const sin = Math.sin(yaw);
        const cos = Math.cos(yaw);
        const len = Math.hypot(dx, dz);
        expect(-sin * mz + cos * mx).toBeCloseTo(dx / len, 5);
        expect(-cos * mz - sin * mx).toBeCloseTo(dz / len, 5);
      }
    }
  });
  it('chọn quái gần con trỏ nhất trong bán kính', () => {
    const m = [
      { id: 'a', x: 3, z: 0 },
      { id: 'b', x: 1, z: 1 },
      { id: 'c', x: 20, z: 0 },
    ];
    expect(nearestTo(0, 0, m)).toBe('b');
    expect(nearestTo(50, 50, m)).toBe('');
  });
});
