import { describe, expect, it } from 'vitest';
import { shapeGeometry, shapeKind, type ShapeKey } from './fxShapes';

const SHAPES: ShapeKey[] = ['crescent', 'spike', 'shard', 'kite', 'ripple', 'burst', 'smoke', 'helix'];

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
  });
});
