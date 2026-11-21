import { describe, expect, it } from 'vitest';
import { LOOT_GAP_FULL, LOOT_GAP_HIDE, lootNearK } from './loot';

const R = 0.55;
// Khoảng cách camera → người trên mặt bằng: camDist 13 × cos(pitch 0,38) ≈ 12 m; vùng kiem_trung (distMul 0,74) ≈ 9 m; zoom gần tới 3 m.
describe('đồ rơi mờ khi chắn giữa camera và nhân vật (duyệt ảnh #447)', () => {
  it.each([12, 9, 3])('camera cách người %i m: đồ rơi quanh chân nhân vật (lệch -0,5…+1,2 m) hiện đủ', (d) => {
    for (const off of [-0.5, 0, 1.2]) expect(lootNearK(d + off, d, R), `lệch ${off}`).toBe(1);
  });
  it('đồ rơi nằm giữa camera và người thì mờ dần, hết hẳn khi gần camera hơn người từ LOOT_GAP_HIDE', () => {
    expect(lootNearK(12 - LOOT_GAP_FULL, 12, R)).toBe(1);
    expect(lootNearK(12 - LOOT_GAP_HIDE, 12, R)).toBe(0);
    const mid = lootNearK(12 - (LOOT_GAP_FULL + LOOT_GAP_HIDE) / 2, 12, R);
    expect(mid).toBeCloseTo(0.5, 6);
  });
  it('camera nằm trong cột thì mờ hết, kể cả khi chưa biết vị trí người', () => {
    expect(lootNearK(0.5, null, R)).toBe(0);
    expect(lootNearK(10, null, R)).toBe(1);
    expect(lootNearK(0.5, 0.6, R)).toBe(0);
  });
});
