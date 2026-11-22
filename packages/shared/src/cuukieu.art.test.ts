import { describe, expect, it } from 'vitest';
import {
  CUU_KIEU_HUB,
  CUU_KIEU_RAIL,
  CUU_KIEU_REEDS,
  CUU_KIEU_ROAD,
  CUU_KIEU_ROAD_HALF,
  CUU_KIEU_ROCKS,
  CUU_KIEU_SPAN,
  CUU_KIEU_TREES,
} from './cuukieu.art';
import { terrainOf } from './terrain';

// TN-7 mỹ thuật: dữ liệu sinh bởi gen-cuu_kieu.mjs phải hợp lý (đường liền mạch trong vùng chơi, cây né đường, chín nhịp cầu nối nhau).
const C = 1024;
const PLAY = 660;
const distToRoad = (x: number, z: number): number => {
  let m = Infinity;
  for (let i = 0; i < CUU_KIEU_ROAD.length - 1; i++) {
    const [ax, az] = CUU_KIEU_ROAD[i]!;
    const [bx, bz] = CUU_KIEU_ROAD[i + 1]!;
    const dx = bx - ax;
    const dz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
    m = Math.min(m, Math.hypot(ax + t * dx - x, az + t * dz - z));
  }
  return m;
};

describe('Thiên Lộ Giới: dữ liệu mỹ thuật', () => {
  it('đường liền mạch, nằm trong vùng chơi, bắt đầu ở cổng Kiều Đầu và kết thúc ở Bậc Cuối', () => {
    const pts = CUU_KIEU_ROAD;
    expect(pts.length).toBeGreaterThan(60);
    for (const [x, z] of pts) {
      expect(Math.abs(x - C), `x ${x}`).toBeLessThan(PLAY);
      expect(Math.abs(z - C), `z ${z}`).toBeLessThan(PLAY);
    }
    for (let i = 0; i < pts.length - 1; i++) expect(Math.hypot(pts[i + 1]![0] - pts[i]![0], pts[i + 1]![1] - pts[i]![1])).toBeLessThan(16);
    const [sx, sz] = pts[0]!;
    expect(Math.hypot(sx - CUU_KIEU_HUB.gate.x, sz - CUU_KIEU_HUB.gate.z)).toBeLessThan(30);
    const [ex, ez] = pts.at(-1)!;
    expect(ez).toBeLessThan(C - 540); // tới Bậc Cuối (bắc)
    expect(Math.abs(ex - C)).toBeLessThan(40);
  });

  it('cây có va chạm và không mọc trên đường; cỏ lau trong vùng chơi', () => {
    for (const [x, z, s, , r] of CUU_KIEU_TREES) {
      expect(r).toBeGreaterThan(0);
      expect(s).toBeGreaterThan(0.4);
      expect(distToRoad(x, z), `cây ${x},${z}`).toBeGreaterThan(CUU_KIEU_ROAD_HALF + 4);
    }
    expect(CUU_KIEU_TREES.filter((t) => t[2] >= 1).length).toBeGreaterThanOrEqual(10); // cổ thụ
    for (const [x, z, r] of CUU_KIEU_REEDS) {
      expect(r).toBeGreaterThan(3);
      expect(Math.abs(x - C)).toBeLessThan(PLAY);
      expect(Math.abs(z - C)).toBeLessThan(PLAY);
    }
  });

  it('chuỗi cầu: mười điểm hạ cánh, đi về phía bắc, cao dần, mỗi nhịp dài 40–170 m', () => {
    expect(CUU_KIEU_SPAN).toHaveLength(10);
    for (let k = 1; k < CUU_KIEU_SPAN.length; k++) {
      const a = CUU_KIEU_SPAN[k - 1]!;
      const b = CUU_KIEU_SPAN[k]!;
      expect(b[1], `nhịp ${k}`).toBeLessThan(a[1]);
      expect(b[2], `nhịp ${k}`).toBeGreaterThan(a[2]);
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      expect(L).toBeGreaterThan(40);
      expect(L).toBeLessThan(170);
    }
    // nằm trong bản đồ 2048 m
    for (const [x, z] of CUU_KIEU_SPAN) {
      expect(x).toBeGreaterThan(0);
      expect(z).toBeGreaterThan(0);
    }
  });

  it('hub: cổng ở đầu đường, đình và rạp cách đường ít nhất 15 m', () => {
    expect(distToRoad(CUU_KIEU_HUB.gate.x, CUU_KIEU_HUB.gate.z)).toBeLessThan(6);
    expect(distToRoad(CUU_KIEU_HUB.pavilion.x, CUU_KIEU_HUB.pavilion.z)).toBeGreaterThan(15);
    expect(distToRoad(CUU_KIEU_HUB.tent.x, CUU_KIEU_HUB.tent.z)).toBeGreaterThan(15);
  });

  it('nhịp cầu đầu nối đúng điểm cuối đường, thẳng hàng hướng bắc (không chồng lên đường)', () => {
    const [ex, ez] = CUU_KIEU_ROAD.at(-1)!;
    const [sx, sz] = CUU_KIEU_SPAN[0]!;
    expect(Math.hypot(sx - ex, sz - ez)).toBeLessThan(12);
    const [bx, bz] = CUU_KIEU_SPAN[1]!;
    expect(Math.abs(bx - sx)).toBeLessThan(3); // nhịp đầu đi thẳng bắc
    expect(bz).toBeLessThan(sz);
  });

  it('lan can có lối băng ngang đều đặn (đường không chia đôi bản đồ) và đá tảng né đường', () => {
    const open = CUU_KIEU_RAIL.filter((f) => f[3] === 1).length;
    const closed = CUU_KIEU_RAIL.length - open;
    expect(closed).toBeGreaterThan(150);
    expect(open).toBeGreaterThanOrEqual(Math.floor(CUU_KIEU_RAIL.length / 10) * 2);
    // không có khoảng chắn liên tục dài hơn 45 m
    let run = 0;
    let longest = 0;
    for (const f of CUU_KIEU_RAIL) {
      run = f[3] === 1 ? 0 : run + 1;
      longest = Math.max(longest, run);
    }
    expect(longest * 4.5).toBeLessThanOrEqual(45);
    expect(CUU_KIEU_ROCKS.length).toBeGreaterThanOrEqual(40);
    for (const [x, z, s] of CUU_KIEU_ROCKS) {
      expect(s).toBeGreaterThan(0.5);
      expect(distToRoad(x, z), `đá ${x},${z}`).toBeGreaterThan(CUU_KIEU_ROAD_HALF + 4);
    }
  });
});
