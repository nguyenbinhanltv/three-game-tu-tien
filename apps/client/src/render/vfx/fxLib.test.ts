import { describe, expect, it } from 'vitest';
import { FX_LIB_SHAPES, FX_TOON_SHAPES } from '@dtl/shared';
import { libGeometry } from './fxLib';
import { shapeGeometry, shapeKind } from './fxShapes';

const tris = (s: (typeof FX_LIB_SHAPES)[number]) => {
  const g = libGeometry(s);
  return (g.index ? g.index.count : g.getAttribute('position').count) / 3;
};

describe('thư viện hình mesh VFX (VS-1)', () => {
  it('đủ 28 hình, mỗi hình dựng được và dùng chung một bản (memo)', () => {
    expect(FX_LIB_SHAPES.length).toBe(28);
    for (const s of FX_LIB_SHAPES) {
      expect(libGeometry(s)).toBe(libGeometry(s));
      expect(shapeGeometry(s)).toBe(libGeometry(s));
    }
  });

  it('có vị trí, UV, pháp tuyến, chỉ mục tuần tự hợp lệ; không NaN', () => {
    for (const s of FX_LIB_SHAPES) {
      const g = libGeometry(s);
      const p = g.getAttribute('position');
      const uv = g.getAttribute('uv');
      expect(g.getAttribute('normal'), s).toBeTruthy();
      expect(uv.count, s).toBe(p.count);
      expect(g.index, s).toBeTruthy();
      const max = Math.max(...Array.from(g.index!.array));
      expect(max, s).toBeLessThan(p.count);
      for (let i = 0; i < p.count; i++) {
        expect(Number.isFinite(p.getX(i) + p.getY(i) + p.getZ(i)), `${s} đỉnh ${i}`).toBe(true);
        expect(uv.getX(i), s).toBeGreaterThanOrEqual(-1e-6);
        expect(uv.getX(i), s).toBeLessThanOrEqual(1 + 1e-6);
        expect(uv.getY(i), s).toBeGreaterThanOrEqual(-1e-6);
        expect(uv.getY(i), s).toBeLessThanOrEqual(1 + 1e-6);
      }
    }
  });

  it('ngân sách tam giác: mỗi hình ≤ 2.500 (kiếm khổng lồ), còn lại ≤ 1.800; cả thư viện ≤ 16.000', () => {
    let total = 0;
    for (const s of FX_LIB_SHAPES) {
      const n = tris(s);
      total += n;
      expect(n, s).toBeLessThanOrEqual(s === 'blade_giant' ? 2500 : 1800);
      expect(n, s).toBeGreaterThan(0);
    }
    expect(total).toBeLessThanOrEqual(16000);
  });

  it('kích thước cục bộ hợp lý (bán kính bao 0,3–4 m ở scale 1)', () => {
    for (const s of FX_LIB_SHAPES) {
      const r = libGeometry(s).boundingSphere!.radius;
      expect(r, s).toBeGreaterThan(0.3);
      expect(r, s).toBeLessThan(4);
    }
  });

  it('vết chém và kiếm có KHỐI (độ dày thật), không phải tấm phẳng', () => {
    for (const s of [
      'slash_thick',
      'slash_cross',
      'blade_flying',
      'blade_giant',
      'blade_stuck',
      'rubble_a',
      'rubble_b',
      'rubble_c',
      'seal_block',
      'bell_cage',
      'rock_spire',
      'shield_plate',
      'diamond_cage',
    ] as const) {
      const bb = libGeometry(s).boundingBox!;
      const dims = [bb.max.x - bb.min.x, bb.max.y - bb.min.y, bb.max.z - bb.min.z].sort((a, b) => a - b);
      expect(dims[0]!, s).toBeGreaterThan(0.04);
    }
  });

  it('hình toon có `v` đủ dải mép trong → ngoài; hình crystal có `v` từ gốc tới mũi', () => {
    for (const s of FX_LIB_SHAPES) {
      const uv = libGeometry(s).getAttribute('uv');
      let lo = 1;
      let hi = 0;
      for (let i = 0; i < uv.count; i++) {
        lo = Math.min(lo, uv.getY(i));
        hi = Math.max(hi, uv.getY(i));
      }
      expect(hi - lo, s).toBeGreaterThan(0.5);
    }
  });

  it('kiểu material: hình toon trong FX_TOON_SHAPES, thanh/đá là crystal', () => {
    for (const s of FX_LIB_SHAPES) {
      const k = shapeKind(s);
      expect(k === 'toon' || k === 'crystal', s).toBe(true);
      expect(k === 'toon', s).toBe(FX_TOON_SHAPES.has(s));
    }
  });
});
