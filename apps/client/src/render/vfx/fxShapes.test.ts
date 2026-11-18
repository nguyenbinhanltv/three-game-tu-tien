import { describe, expect, it } from 'vitest';
import { GUST_STREAKS, shapeGeometry, shapeKind, type ShapeKey } from './fxShapes';

const SHAPES: ShapeKey[] = [
  'crescent',
  'spike',
  'shard',
  'kite',
  'ripple',
  'burst',
  'smoke',
  'helix',
  'ribbon',
  'dragon',
  'statue',
  'card',
  'gust',
];

describe('lưới FX vẽ tay', () => {
  for (const s of SHAPES) {
    it(`${s}: không có NaN, có uv, bán kính bao hữu hạn`, () => {
      const g = shapeGeometry(s);
      const p = g.getAttribute('position').array;
      expect([...p].every(Number.isFinite)).toBe(true);
      expect(g.getAttribute('uv').count).toBe(g.getAttribute('position').count);
      g.computeBoundingSphere();
      expect(Number.isFinite(g.boundingSphere!.radius)).toBe(true);
    });
  }
  it('kiểu material theo hình', () => {
    expect(shapeKind('spike')).toBe('crystal');
    expect(shapeKind('crescent')).toBe('toon');
    expect(shapeKind('burst')).toBe('burst');
    expect(shapeKind('smoke')).toBe('decal');
    expect(shapeKind('gust')).toBe('wind');
  });
  it('gust: chỉ số vệt nằm ở phần nguyên của uv.y, ngang dải < 1', () => {
    const uv = shapeGeometry('gust').getAttribute('uv');
    const seen = new Set<number>();
    for (let i = 0; i < uv.count; i++) {
      const v = uv.getY(i);
      seen.add(Math.floor(v));
      expect(v - Math.floor(v)).toBeLessThan(0.99);
    }
    expect(seen.size).toBe(GUST_STREAKS);
  });
});
