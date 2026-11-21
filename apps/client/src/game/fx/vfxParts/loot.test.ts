import { describe, expect, it } from 'vitest';
import { LOOT_NEAR_FULL, LOOT_NEAR_MIN, lootNearK } from './loot';

describe('đồ rơi mờ khi gần camera (duyệt ảnh #447)', () => {
  it('sát camera thì 0, đủ xa thì 1, ở giữa tăng đều', () => {
    expect(lootNearK(0, 0.5)).toBe(0);
    expect(lootNearK(LOOT_NEAR_MIN + 0.5, 0.5)).toBe(0);
    expect(lootNearK(LOOT_NEAR_FULL + 0.5, 0.5)).toBe(1);
    expect(lootNearK(999, 0.5)).toBe(1);
    const mid = lootNearK((LOOT_NEAR_MIN + LOOT_NEAR_FULL) / 2 + 0.5, 0.5);
    expect(mid).toBeCloseTo(0.5, 6);
  });
  it('camera mặc định cách nhân vật khoảng 18 m: đồ rơi quanh nhân vật hiện đủ, đồ rơi nằm giữa đường ngắm thì mờ', () => {
    for (const d of [15, 18, 22]) expect(lootNearK(d, 0.55), `${d} m`).toBe(1);
    expect(lootNearK(9, 0.55)).toBeLessThan(0.4);
    expect(LOOT_NEAR_FULL).toBeLessThan(15);
  });
});
