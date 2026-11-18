import { describe, expect, it } from 'vitest';
import { FOREST, KIEM_TRUNG, LAKE, SECT, VALLEY } from '@dtl/shared';
import { AmbientParticles, ambientRates, ambientScaleFor } from './ambient';
import { PARTICLE_BUDGET, Particles } from '../../render/vfx/particles';

describe('hạt môi trường theo vùng', () => {
  it('mỗi vùng có loại hạt riêng', () => {
    const sect = ambientRates(SECT.x, SECT.z, 3);
    expect(sect.mote).toBeGreaterThan(20);
    expect(sect.petal).toBeGreaterThan(0);
    expect(sect.leaf).toBe(0);
    const valley = ambientRates(VALLEY.x, VALLEY.z, 3);
    expect(valley.pollen).toBeGreaterThan(valley.leaf);
    const forest = ambientRates(FOREST.x, FOREST.z, 3);
    expect(forest.leaf).toBeGreaterThan(5);
    expect(forest.jade).toBeGreaterThan(0);
    const lake = ambientRates(LAKE.x, LAKE.z, 3);
    expect(lake.mist).toBeGreaterThan(valley.mist);
    const tomb = ambientRates(KIEM_TRUNG.x, KIEM_TRUNG.z, 3);
    expect(tomb.ash).toBeGreaterThan(20);
    expect(tomb.pollen + tomb.petal + tomb.leaf).toBe(0);
  });
  it('Vân Hải không có sương billboard, lá, phấn hoa (E3-H): chỉ bụi sáng và linh khí', () => {
    const r = ambientRates(1024, 1036, 3, undefined, 'van_hai');
    expect(r.mist + r.leaf + r.pollen + r.petal + r.ash).toBe(0);
    expect(r.mote).toBeGreaterThan(0);
  });
  it('bay cao thì hết sương/lá sát đất', () => {
    const r = ambientRates(FOREST.x, FOREST.z, 60);
    expect(r.mist + r.leaf).toBe(0);
  });
  it('lượng hạt sống nhỏ so với ngân sách preset, Thấp ít hơn Cao', () => {
    const alive: Record<string, number> = {};
    for (const q of ['low', 'high']) {
      const ps = new Particles();
      ps.setQuality(q);
      const a = new AmbientParticles(ps);
      a.setQuality(q);
      const cam = { x: SECT.x, y: 160, z: SECT.z + 10 };
      const foot = { x: SECT.x, y: 150, z: SECT.z };
      for (let f = 0; f < 60 * 20; f++) {
        a.update(1 / 60, cam, foot);
        ps.update(1 / 60);
      }
      alive[q] = ps.aliveCount().total;
      expect(alive[q]).toBeLessThan(PARTICLE_BUDGET[q] * 0.15);
    }
    expect(alive.low).toBeLessThan(alive.high);
    expect(alive.low).toBeGreaterThan(0);
  });
});

describe('hạt môi trường theo preset', () => {
  it('sương `mist` (mảng billboard mờ to) không bao giờ vượt mức Vừa; hạt nhỏ sắc nét tăng theo preset', () => {
    for (const q of ['low', 'medium', 'high', 'ultra']) expect(ambientScaleFor('mist', q)).toBeLessThanOrEqual(1);
    expect(ambientScaleFor('mist', 'low')).toBeLessThan(1);
    expect(ambientScaleFor('mote', 'high')).toBeGreaterThan(ambientScaleFor('mote', 'medium'));
    expect(ambientScaleFor('mote', 'ultra')).toBeGreaterThan(ambientScaleFor('mote', 'high'));
    expect(ambientScaleFor('jade', 'ultra')).toBeLessThanOrEqual(2);
  });
});
