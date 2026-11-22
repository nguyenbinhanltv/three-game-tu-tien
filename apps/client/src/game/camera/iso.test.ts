import { describe, expect, it } from 'vitest';
import {
  clampLeadFrame,
  clampLeadSafe,
  ISO_HEIGHT_TO_GROUND,
  ISO_HEAD_UP,
  ISO_TGT_UP,
  ISO_TGT_X,
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

describe('clampLeadFrame', () => {
  const project = (lx: number, lz: number, yaw: number, ox: number, oz: number) => {
    const s = Math.sin(yaw);
    const c = Math.cos(yaw);
    // vị trí (phải, xuống) của điểm cách người (ox, oz) so với tâm khung khi điểm nhìn lệch (lx, lz)
    return { r: (ox - lx) * c - (oz - lz) * s, d: (ox - lx) * s + (oz - lz) * c };
  };
  it('mục tiêu vừa tầm: cả người và mục tiêu trong vùng an toàn', () => {
    for (const yaw of [0, 0.785, 2.2]) {
      const t = { x: 9 * Math.cos(1), z: 9 * Math.sin(1) };
      const l = clampLeadFrame(t.x * 0.5, t.z * 0.5, yaw, t.x, t.z);
      const me = project(l.x, l.z, yaw, 0, 0);
      const tg = project(l.x, l.z, yaw, t.x, t.z);
      expect(Math.abs(me.r)).toBeLessThanOrEqual(ISO_SAFE_X + 1e-6);
      expect(me.d).toBeLessThanOrEqual(ISO_SAFE_DOWN + 1e-6);
      expect(Math.abs(tg.r)).toBeLessThanOrEqual(ISO_TGT_X + 1e-6);
      expect(tg.d).toBeGreaterThanOrEqual(-ISO_TGT_UP - 1e-6);
    }
  });
  it('mục tiêu quá xa: ưu tiên người chơi trong vùng an toàn', () => {
    const l = clampLeadFrame(20, -20, 0.785, 40, -40);
    const me = project(l.x, l.z, 0.785, 0, 0);
    expect(Math.abs(me.r)).toBeLessThanOrEqual(ISO_SAFE_X + 1e-6);
    expect(me.d).toBeLessThanOrEqual(ISO_SAFE_DOWN + 1e-6);
    expect(me.d).toBeGreaterThanOrEqual(-ISO_SAFE_UP - 1e-6);
  });
  it('boss cao: đỉnh đầu boss nằm trong khung (đẩy tâm khung lên phía boss)', () => {
    const t = { x: 0, z: -4 }; // boss ở phía xa camera (yaw 0: camera ở +z)
    const h = 5;
    const a = clampLeadFrame(0, -4, 0, t.x, t.z, 0);
    const b = clampLeadFrame(0, -4, 0, t.x, t.z, h);
    // lệch xuống (d) của đầu boss so với tâm khung: tD − h·k − Ld ≥ −ISO_TGT_UP khi còn khả thi
    const headD = (l: { x: number; z: number }) => t.z - h * ISO_HEIGHT_TO_GROUND - l.z;
    expect(headD(b)).toBeGreaterThanOrEqual(headD(a) - 1e-6);
    expect(headD(b)).toBeGreaterThanOrEqual(-ISO_HEAD_UP - 1e-6);
  });
  it('không có mục tiêu thì như clampLeadSafe', () => {
    expect(clampLeadFrame(30, 5, 0.3)).toEqual(clampLeadSafe(30, 5, 0.3));
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
