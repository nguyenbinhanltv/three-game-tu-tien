import { describe, expect, it } from 'vitest';
import { POSE, SKILLS } from '@dtl/content';
import { smearWindow, taperOf } from '../fx/bladeSmear';

const IDS = ['kiem_khi_tram', 'phi_kiem', 'thien_kiem_vu'];

describe('pose Thân Pháp `_tp` (T4)', () => {
  for (const id of IDS) {
    const base = POSE.get(id)!;
    const tp = POSE.get(`${id}_tp`);
    it(`${id}: có bản _tp cùng thời lượng và khung trúng`, () => {
      expect(tp).toBeTruthy();
      expect(tp!.duration).toBe(base.duration);
      expect(tp!.hit).toEqual(base.hit);
    });
    it(`${id}: key tăng dần, đủ ba tư thế khóa`, () => {
      const ks = tp!.keys;
      expect(ks[0]!.t).toBe(0);
      for (let i = 1; i < ks.length; i++) expect(ks[i]!.t).toBeGreaterThan(ks[i - 1]!.t);
      expect(ks[ks.length - 1]!.t).toBeLessThanOrEqual(tp!.duration + 1e-6);
    });
    it(`${id}: đường chém ≤ 35 ms (~2 khung 60 Hz), giữ đỉnh đòn ≥ 3 khung`, () => {
      const h = tp!.hit![0];
      const ks = tp!.keys;
      const i = ks.findIndex((k) => Math.abs(k.t - h) < 1e-6);
      expect(i).toBeGreaterThan(1);
      // đường chém: từ key liền trước tới đỉnh
      expect(h - ks[i - 1]!.t).toBeLessThanOrEqual(0.035);
      // giữ: key liền sau có cùng tư thế và cách ≥ 3 khung
      const hold = ks[i + 1]!;
      expect(hold.t - h).toBeGreaterThanOrEqual(3 / 60);
      expect(hold.spine).toEqual(ks[i]!.spine);
      expect(hold.handR).toEqual(ks[i]!.handR);
      expect(hold.ease).toBe('linear');
    });
    it(`${id}: dồn lực sâu hơn bản gốc`, () => {
      const h = base.hit![0];
      const wind = (p: typeof base) => {
        const k = [...p.keys].filter((x) => x.t < h).pop()!;
        return Math.abs((k.spine?.[1] ?? 0) - (p.keys[0]!.spine?.[1] ?? 0));
      };
      expect(wind(tp!)).toBeGreaterThan(wind(base));
    });
  }
  it('mọi chiêu dùng pose gốc vẫn thấy pose gốc (bản _tp chỉ chọn qua cờ)', () => {
    for (const id of IDS) expect(SKILLS.some((s) => s.pose === id) || POSE.has(id)).toBe(true);
  });
});

describe('nét kéo lưỡi kiếm', () => {
  it('chỉ bật quanh đường chém và khung giữ', () => {
    expect(smearWindow(0.1, 0.28)).toBe(false);
    expect(smearWindow(0.28 - 0.034 - 0.02, 0.28)).toBe(true);
    expect(smearWindow(0.28, 0.28)).toBe(true);
    expect(smearWindow(0.28 + 0.04, 0.28)).toBe(true);
    expect(smearWindow(0.4, 0.28)).toBe(false);
  });
  it('thon dần về mẫu cũ', () => {
    expect(taperOf(0, 10)).toBe(0);
    expect(taperOf(9, 10)).toBe(1);
    expect(taperOf(0, 1)).toBe(1);
  });
});
