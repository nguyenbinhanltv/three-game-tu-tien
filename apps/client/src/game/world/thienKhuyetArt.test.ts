import { describe, expect, it } from 'vitest';
import '@dtl/content';
import { terrainOf } from '@dtl/shared';
import { pavedWeight, scatterThienKhuyet, tkGrassDensity, tkGroundColor } from './thienKhuyetArt';

const tr = terrainOf('thien_khuyet');
const def = tr.def;
const ctx = { def, bounds: tr.playBounds, heightAt: (x: number, z: number) => tr.heightAt(x, z), clear: [{ x: 1024, z: 1036, r: 60 }], colliders: tr.colliders };

describe('thienKhuyetArt (E4-I)', () => {
  it('lõi trạm và đại lộ là mặt lát; ngoài thành là đất', () => {
    expect(pavedWeight(def, 1024, 1024)).toBe(1);
    expect(pavedWeight(def, 1025, 890)).toBe(1);
    expect(pavedWeight(def, 400, 400)).toBe(0);
  });

  it('màu mặt đất sáng hơn trên sân lát, hợp lệ 0..1, dốc đứng ngả sang màu vách', () => {
    const a: [number, number, number] = [0, 0, 0];
    const b: [number, number, number] = [0, 0, 0];
    tkGroundColor(def, 1024, 1024, 1, a);
    tkGroundColor(def, 400, 400, 1, b);
    expect(a[0] + a[1] + a[2]).toBeGreaterThan(b[0] + b[1] + b[2]);
    for (const v of [...a, ...b]) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it('cỏ thưa trên sân lát hơn ngoài đất, không mọc trên dốc đứng', () => {
    let on = 0;
    let off = 0;
    for (let i = 0; i < 200; i++) {
      on += tkGrassDensity(def, 1020 + (i % 10) * 2, 1020 + Math.floor(i / 10) * 2, 0.1);
      off += tkGrassDensity(def, 500 + (i % 10) * 2, 500 + Math.floor(i / 10) * 2, 0.1);
    }
    expect(on).toBeLessThan(off * 0.5);
    expect(tkGrassDensity(def, 500, 500, 2.5)).toBe(0);
  });

  it('đá vỡ xác định, có cột đổ nghiêng, không rải lên sân lát hay trong vòng cấm', () => {
    const a = scatterThienKhuyet(ctx);
    const b = scatterThienKhuyet(ctx);
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(150);
    expect(a.some((r) => r.id === 'prop_tru_da_khac_van' && r.lean > 0.9)).toBe(true);
    for (const r of a) {
      expect(pavedWeight(def, r.x, r.z)).toBeLessThanOrEqual(0.15);
      expect(Math.hypot(r.x - 1024, r.z - 1036)).toBeGreaterThanOrEqual(60);
    }
  });
});
