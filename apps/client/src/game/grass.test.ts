import { describe, expect, it } from 'vitest';
import { KIEM_TRUNG, SECT, VALLEY } from '@dtl/shared';
import { buildGrassChunk, buildTuftGeometry, GRASS_PRESETS, Grass, GRASS_PUSH_SLOTS, pickPushers, type Pusher } from './grass';

const slots = (): Pusher[] => Array.from({ length: GRASS_PUSH_SLOTS }, () => ({ x: 0, y: 0, z: 0, r: 0 }));
const count = (cx: number, cz: number) => buildGrassChunk(Math.floor(cx / 16), Math.floor(cz / 16), 1).length / 8;

describe('pickPushers', () => {
  it('ô 0 là mình, rồi 5 thực thể gần nhất theo thứ tự', () => {
    const out = slots();
    const others: Pusher[] = [];
    for (let i = 1; i <= 9; i++) others.push({ x: 100 + (10 - i) * 2, y: 0, z: 100, r: i });
    pickPushers({ x: 100, y: 0, z: 100, r: 0.9 }, others, out);
    expect(out[0]).toEqual({ x: 100, y: 0, z: 100, r: 0.9 });
    // Gần nhất là i = 9 (cách 2 m), rồi 8, 7, 6, 5.
    expect(out.slice(1).map((p) => p.r)).toEqual([9, 8, 7, 6, 5]);
  });
  it('ô thừa có r = 0; bỏ thực thể quá xa', () => {
    const out = slots();
    pickPushers({ x: 0, y: 0, z: 0, r: 1 }, [{ x: 3, y: 0, z: 0, r: 2 }, { x: 500, y: 0, z: 0, r: 2 }], out);
    expect(out[1].r).toBe(2);
    expect(out.slice(2).every((p) => p.r === 0)).toBe(true);
  });
});

describe('chỗ mọc cỏ', () => {
  it('đồng cỏ thung lũng dày, sân đá tông môn và Kiếm Trủng không có', () => {
    expect(count(VALLEY.x + 40, VALLEY.z + 40)).toBeGreaterThan(120);
    expect(count(SECT.x, SECT.z)).toBe(0);
    expect(count(KIEM_TRUNG.x, KIEM_TRUNG.z)).toBe(0);
  });
  it('dữ liệu ô xác định (mọi client thấy cỏ cùng chỗ)', () => {
    expect(buildGrassChunk(160, 165, 1)).toEqual(buildGrassChunk(160, 165, 1));
  });
  it('một bụi cỏ rẻ: 6 lá × 3 tam giác', () => {
    const g = buildTuftGeometry();
    expect(g.getIndex()!.count / 3).toBe(18);
  });
});

describe('Grass', () => {
  it('Thấp tắt cỏ; Vừa có cỏ quanh người chơi, không vượt trần', () => {
    const g = new Grass();
    const at = { x: VALLEY.x + 30, y: 42, z: VALLEY.z + 30 };
    const p = slots();
    g.setQuality('medium');
    for (let i = 0; i < 80; i++) g.update(0.016, at, p, 4);
    expect(g.count).toBeGreaterThan(1500);
    expect(g.count).toBeLessThanOrEqual(20000);
    expect(g.mesh.visible).toBe(true);
    g.setQuality('low');
    g.update(0.016, at, p);
    expect(g.count).toBe(0);
    expect(g.mesh.visible).toBe(false);
    expect(GRASS_PRESETS.low.radius).toBe(0);
  });
  it('preset Cao nhiều cỏ hơn Vừa', () => {
    const at = { x: VALLEY.x, y: 42, z: VALLEY.z };
    const n: Record<string, number> = {};
    for (const q of ['medium', 'high']) {
      const g = new Grass();
      g.setQuality(q);
      for (let i = 0; i < 120; i++) g.update(0.016, at, slots(), 4);
      n[q] = g.count;
    }
    expect(n.high).toBeGreaterThan(n.medium * 1.5);
  });
});
