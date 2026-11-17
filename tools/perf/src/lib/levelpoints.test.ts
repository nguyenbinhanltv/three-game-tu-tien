import { describe, expect, it } from 'vitest';
import { terrainOf } from '@dtl/shared';
import { levelPoints, levelQuery, requireLevel } from './levelpoints';

describe('levelPoints (level thử nhỏ)', () => {
  const pts = levelPoints('thu_nho');
  it('có tâm từng vùng, tinh anh, boss và toàn cảnh; tên không trùng', () => {
    const names = pts.map((p) => p.name);
    expect(names).toEqual(expect.arrayContaining(['zone_tn_a', 'zone_tn_b', 'boss_han_giao', 'trencao']));
    expect(names.filter((n) => n.startsWith('elite_')).length).toBe(4);
    expect(new Set(names).size).toBe(names.length);
  });
  it('mọi điểm nằm trong vùng chơi của địa hình level', () => {
    const b = terrainOf('thu_nho').playBounds;
    for (const p of pts) {
      expect(p.x).toBeGreaterThanOrEqual(b.x0);
      expect(p.x).toBeLessThanOrEqual(b.x1);
      expect(p.z).toBeGreaterThanOrEqual(b.z0);
      expect(p.z).toBeLessThanOrEqual(b.z1);
    }
  });
  it('level lạ ném lỗi, query theo level', () => {
    expect(() => requireLevel('khong_co')).toThrow(/khong_co/);
    expect(levelQuery('van_lam')).toBe('');
    expect(levelQuery('thu_nho')).toBe('level=thu_nho');
  });
});
