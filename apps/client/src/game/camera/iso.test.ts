import { describe, expect, it } from 'vitest';
import {
  clampLeadFrame,
  isoClearScale,
  ISO_OCC_MIN,
  isoTopEq,
  isoFrameBoss,
  isoLeadable,
  ISO_LEAD_RANGE,
  ISO_SAFE_X_BOSS,
  isoDistFor,
  clampLeadSafe,
  ISO_TGT_UP,
  ISO_TGT_X,
  ISO_SAFE_DOWN,
  ISO_SAFE_UP,
  ISO_SAFE_DOWN_BOSS,
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
  it('boss cao: đỉnh thân cũng trong vùng an toàn, người vẫn trong vùng an toàn', () => {
    const yaw = 0.785;
    const t = { x: -3, z: -3 }; // boss phía xa camera (lên màn hình)
    const topEq = isoTopEq(6);
    expect(topEq).toBeGreaterThan(1.5);
    expect(isoTopEq(40)).toBe(2);
    const l = clampLeadFrame(t.x * 0.5, t.z * 0.5, yaw, t.x, t.z, topEq);
    const tg = project(l.x, l.z, yaw, t.x, t.z);
    const me = project(l.x, l.z, yaw, 0, 0);
    expect(tg.d - topEq).toBeGreaterThanOrEqual(-ISO_TGT_UP - 1e-6);
    expect(me.d).toBeGreaterThanOrEqual(-ISO_SAFE_UP - 1e-6);
    expect(me.d).toBeLessThanOrEqual(ISO_SAFE_DOWN_BOSS + 1e-6);
    // không có topEq thì đỉnh boss tụt ra ngoài khung
    const l0 = clampLeadFrame(t.x * 0.5, t.z * 0.5, yaw, t.x, t.z);
    expect(project(l0.x, l0.z, yaw, t.x, t.z).d - topEq).toBeLessThan(tg.d - topEq + 1e-9);
  });
  it('quái thấp không đổi (topEq = 0)', () => {
    expect(isoTopEq(3)).toBe(0);
  });
  it('không có mục tiêu thì như clampLeadSafe', () => {
    expect(clampLeadFrame(30, 5, 0.3)).toEqual(clampLeadSafe(30, 5, 0.3));
  });
});

describe('khung boss lệch ngang', () => {
  it('boss cao cho phép người lệch ngang tới ISO_SAFE_X_BOSS để cả hai lọt khung', () => {
    const yaw = 0;
    // boss cách người 11 m về bên phải (r = +11): quái thường kẹt ở ISO_SAFE_X, boss cao kéo khung xa hơn
    const normal = clampLeadFrame(5, 0, yaw, 11, 0, 0);
    const tall = clampLeadFrame(5, 0, yaw, 11, 0, isoTopEq(8));
    expect(tall.x).toBeGreaterThan(normal.x);
    expect(Math.abs(tall.x)).toBeLessThanOrEqual(ISO_SAFE_X_BOSS + 1e-6);
    // sau khi kẹp, boss ở (11 - lead) so với tâm khung: gần tâm hơn bản thường
    expect(11 - tall.x).toBeLessThan(11 - normal.x);
  });
  it('isoLeadable: mục tiêu ngoài màn hình (> ISO_LEAD_RANGE) không kéo khung', () => {
    expect(isoLeadable(10)).toBe(true);
    expect(isoLeadable(ISO_LEAD_RANGE)).toBe(true);
    expect(isoLeadable(30)).toBe(false);
  });
  it('isoFrameBoss: chỉ boss cao, còn sống, trong tầm; quái/tinh anh to không phải boss thì không', () => {
    expect(isoFrameBoss(true, 7, 10, false)).toBe(true);
    expect(isoFrameBoss(false, 7, 10, false)).toBe(false); // tinh anh/quái to, không phải boss
    expect(isoFrameBoss(true, 3, 10, false)).toBe(false);
    expect(isoFrameBoss(true, 7, 30, false)).toBe(false);
    expect(isoFrameBoss(true, 7, 10, true)).toBe(false);
  });
});

describe('isoDistFor', () => {
  it('phòng boss khổng lồ xa hơn, phòng thường giữ ISO_DIST', () => {
    expect(isoDistFor('lac_kiem_tong')).toBe(ISO_DIST);
    // bản đồ mở có boss ngoài trời (Thiên Khuyết) giữ khoảng cách chung ở mọi nơi
    expect(isoDistFor('thien_khuyet')).toBe(ISO_DIST);
    expect(isoDistFor('kieu_5')).toBeGreaterThan(ISO_DIST);
    expect(isoDistFor('kieu_9')).toBe(isoDistFor('kieu_5'));
  });
});

describe('isoClearScale', () => {
  const look = { x: 0, y: 1, z: 0 };
  const cam = { x: 14, y: 16, z: 14 };
  it('đất phẳng thấp: không co', () => {
    expect(isoClearScale(look, cam, () => 0)).toBe(1);
  });
  it('vách chắn giữa đoạn: co lại tới khi camera ở phía trước vách', () => {
    // vách cao 30 m ở x > 6 (xa điểm nhìn hơn 6 m)
    const wall = (x: number) => (x > 6 ? 30 : 0);
    const k = isoClearScale(look, cam, wall);
    expect(k).toBeLessThan(1);
    expect(k).toBeGreaterThanOrEqual(ISO_OCC_MIN);
    expect(look.x + (cam.x - look.x) * k).toBeLessThanOrEqual(6.5);
  });
  it('bị chắn hoàn toàn: dừng ở mức tối thiểu', () => {
    expect(isoClearScale(look, cam, () => 100)).toBe(ISO_OCC_MIN);
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
