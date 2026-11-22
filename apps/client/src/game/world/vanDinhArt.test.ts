import { describe, expect, it } from 'vitest';
import '@dtl/content';
import { terrainOf } from '@dtl/shared';
import { faceBlend, faceTint, scatterVanDinh, vdMix } from './vanDinhArt';
import { GRADING, mixPreset, moodVariant } from '../../render/grading';

const tr = terrainOf('van_dinh');
const ctx = {
  def: tr.def,
  bounds: tr.playBounds,
  heightAt: (x: number, z: number) => tr.heightAt(x, z),
  clear: [{ x: 1024, z: 1546, r: 90 }],
  colliders: tr.colliders,
};

describe('Vấn Đỉnh: hai mặt (TN-3 mỹ thuật)', () => {
  it('faceBlend: 0 ở mặt Âm (tây), 1 ở mặt Dương (đông), đổi dần quanh Giới Tuyến', () => {
    expect(faceBlend(-300)).toBe(0);
    expect(faceBlend(300)).toBe(1);
    expect(faceBlend(0)).toBeCloseTo(0.5, 5);
    expect(faceBlend(-20)).toBeLessThan(faceBlend(20));
  });

  it('faceTint: mặt Âm ngả lam, mặt Dương ngả vàng đồng và bớt xanh rêu', () => {
    const am: [number, number, number] = [0.5, 0.55, 0.45];
    const du: [number, number, number] = [0.5, 0.55, 0.45];
    faceTint(-300, am);
    faceTint(300, du);
    expect(am[2]).toBeGreaterThan(am[0]);
    expect(du[0]).toBeGreaterThan(du[2]);
    expect(du[1] / du[0]).toBeLessThan(0.55 / 0.5);
  });

  it('bộ mood: tám preset vda_*/vdd_* có thật, khác hẳn nhau và trộn được', () => {
    for (const t of ['dawn', 'day', 'dusk', 'night'] as const) {
      expect(moodVariant('vda_dawn', t)).toBe(`vda_${t}`);
      expect(moodVariant('vdd_dusk', t)).toBe(`vdd_${t}`);
      const a = GRADING[`vda_${t}`];
      const d = GRADING[`vdd_${t}`];
      expect(a.saturation).not.toBe(d.saturation);
      expect(a.fogColor).not.toBe(d.fogColor);
      expect(mixPreset(a, d, 0.5).saturation).toBeCloseTo((a.saturation + d.saturation) / 2, 5);
    }
  });

  it('vdMix: mỗi vùng một bộ đồ khác nhau, hai mặt không dùng chung bảng', () => {
    const south = vdMix(-300, 230);
    const mid = vdMix(-330, -230);
    const north = vdMix(-10 - 50, -470);
    expect(new Set([south, mid, north]).size).toBe(3);
    expect(vdMix(300, 230)).not.toBe(south);
  });

  it('scatterVanDinh: xác định, đủ dày, theo mặt, tránh vòng cấm và Giới Tuyến', () => {
    const a = scatterVanDinh(ctx);
    const b = scatterVanDinh(ctx);
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(400);
    expect(a.length).toBeLessThan(4000);
    const cx = tr.def.size / 2;
    const west = a.filter((r) => r.x < cx).length;
    const east = a.length - west;
    expect(west).toBeGreaterThan(100);
    expect(east).toBeGreaterThan(100);
    for (const r of a) {
      expect(Math.hypot(r.x - 1024, r.z - 1546)).toBeGreaterThanOrEqual(90);
      expect(Math.abs(r.x - cx)).toBeGreaterThanOrEqual(18);
    }
    // Vùng rễ (tây giữa) nhiều rễ cổ; mặt Dương nhiều đá đỏ đồng
    const roots = a.filter((r) => r.id === 'prop_cay_goc_kho' && r.x < cx && r.z < cx - 120 && r.z > cx - 330).length;
    expect(roots).toBeGreaterThan(20);
  });
});
