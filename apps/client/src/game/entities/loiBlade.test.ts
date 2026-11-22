import { describe, expect, it } from 'vitest';
import { LOI_METHOD } from '@dtl/shared';
import { PATH } from '@dtl/content';
import { ARC_AMP, ARC_POINTS, arcFrame, bladeLook, LOI_FLICKER_HZ, loiArc } from './loiBlade';

describe('kiếm điện của Lôi tu', () => {
  it('Lôi tu: ánh kiếm trắng xanh điện của hướng, phát sáng tối thiểu bậc 2; công pháp khác không đổi', () => {
    const rim = PATH.get('loi_tu')!.palette.rim;
    expect(bladeLook(LOI_METHOD, '', 0, 0)).toEqual({ tint: `#${rim}`, glow: 2 });
    expect(bladeLook('lac_kiem_quyet', '', 0, 5)).toEqual({ tint: '', glow: 0 });
    expect(bladeLook(undefined, '#112233', 2, 5)).toEqual({ tint: '#112233', glow: 2 });
  });
  it('chập chờn: màu đổi theo khung (~12 lần/giây), tất định theo thời gian, luôn ở giữa lõi trắng xanh và thân tím lam', () => {
    const seen = new Set<string>();
    for (let f = 0; f < 12; f++) seen.add(bladeLook(LOI_METHOD, '', 0, f / LOI_FLICKER_HZ + 0.001).tint);
    expect(seen.size).toBeGreaterThanOrEqual(4);
    expect(bladeLook(LOI_METHOD, '', 0, 0.3).tint).toBe(bladeLook(LOI_METHOD, '', 0, 0.3).tint);
    // trong cùng một khung màu không đổi
    expect(bladeLook(LOI_METHOD, '', 0, 0.2).tint).toBe(bladeLook(LOI_METHOD, '', 0, 0.2 + 0.5 / LOI_FLICKER_HZ).tint);
    const pal = PATH.get('loi_tu')!.palette;
    for (const t of seen) {
      for (let i = 0; i < 3; i++) {
        const v = parseInt(t.slice(1 + 2 * i, 3 + 2 * i), 16);
        const lo = Math.min(parseInt(pal.rim.slice(2 * i, 2 * i + 2), 16), parseInt(pal.body.slice(2 * i, 2 * i + 2), 16));
        const hi = Math.max(parseInt(pal.rim.slice(2 * i, 2 * i + 2), 16), parseInt(pal.body.slice(2 * i, 2 * i + 2), 16));
        expect(v).toBeGreaterThanOrEqual(lo);
        expect(v).toBeLessThanOrEqual(hi);
      }
    }
  });
  it('bộ trang bị có màu lưỡi riêng và cường hóa cao hơn vẫn thắng', () => {
    expect(bladeLook(LOI_METHOD, '#aabbcc', 3, 1.7)).toEqual({ tint: '#aabbcc', glow: 3 });
  });

  it('tia điện dọc kiếm: chỉ Lôi tu; tất định theo khung; hai đầu lưỡi bám kiếm, lệch trong biên độ; có khung ẩn để không thành dải liên tục', () => {
    expect(loiArc(LOI_METHOD)).toBe(true);
    expect(loiArc('lac_kiem_quyet')).toBe(false);
    expect(loiArc(undefined)).toBe(false);
    expect(arcFrame(5, 3)).toEqual(arcFrame(5, 3));
    let hidden = 0;
    for (let f = 0; f < 120; f++) {
      const a = arcFrame(f, 7);
      expect(a.x).toHaveLength(ARC_POINTS);
      expect(Math.abs(a.x[0]!)).toBeLessThan(1e-9);
      expect(Math.abs(a.y[ARC_POINTS - 1]!)).toBeLessThan(1e-9);
      for (const v of [...a.x, ...a.y]) expect(Math.abs(v)).toBeLessThanOrEqual(ARC_AMP);
      if (!a.vis) hidden++;
    }
    expect(hidden).toBeGreaterThan(8);
    expect(hidden).toBeLessThan(50);
  });
});
