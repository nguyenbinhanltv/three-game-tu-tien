import { describe, expect, it } from 'vitest';
import { fxSeed } from '@dtl/shared';
import { seededRandom, seedOr } from './common';
import { BOLT_MAX_PTS, boltPhase, boltShape } from './lightning';
import { PARTICLE_BUDGET, Particles } from './particles';
import { RAIN_SWORDS, rainLayout } from './swordRain';

describe('seededRandom', () => {
  it('cùng seed cùng dãy, khác seed khác dãy', () => {
    const a = seededRandom(42);
    const b = seededRandom(42);
    const c = seededRandom(43);
    const sa = [a(), a(), a()];
    expect([b(), b(), b()]).toEqual(sa);
    expect([c(), c(), c()]).not.toEqual(sa);
    for (const v of sa) expect(v).toBeGreaterThanOrEqual(0);
  });
  it('seedOr chỉ nhận số hữu hạn', () => {
    expect(seedOr(123)).toBe(123);
    expect(seedOr(-7)).toBe(7);
    expect(Number.isFinite(seedOr('x'))).toBe(true);
    expect(Number.isFinite(seedOr(Infinity))).toBe(true);
  });
  it('fxSeed của server là uint31', () => {
    for (let i = 0; i < 50; i++) {
      const s = fxSeed();
      expect(Number.isInteger(s)).toBe(true);
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThan(2 ** 31);
    }
  });
});

describe('boltShape', () => {
  it('hai client cùng seed thấy cùng một tia', () => {
    const a = boltShape(987654, 62, 7, 1.2);
    const b = boltShape(987654, 62, 7, 1.2);
    expect(b.n).toBe(a.n);
    expect(Array.from(b.pts.subarray(0, b.n * 4))).toEqual(Array.from(a.pts.subarray(0, a.n * 4)));
    expect(b.strands).toEqual(a.strands);
    const c = boltShape(987655, 62, 7, 1.2);
    expect(Array.from(c.pts.subarray(0, 40))).not.toEqual(Array.from(a.pts.subarray(0, 40)));
  });
  it('thân chính cắm đúng điểm đánh, đỉnh ở trên cao; không tràn bộ đệm', () => {
    for (let s = 1; s < 40; s++) {
      const b = boltShape(s * 7919);
      const last = (b.strands[0].count - 1) * 4;
      expect(b.pts[last]).toBeCloseTo(0);
      expect(b.pts[last + 1]).toBeCloseTo(0);
      expect(b.pts[last + 2]).toBeCloseTo(0);
      expect(b.pts[1]).toBeCloseTo(62);
      expect(b.n).toBeLessThanOrEqual(BOLT_MAX_PTS);
      expect(b.strands.length).toBeGreaterThanOrEqual(3);
    }
  });
  it('ghi đè vào bộ đệm có sẵn (không cấp phát)', () => {
    const a = boltShape(1);
    const pts = a.pts;
    boltShape(2, 62, 7, 1, a);
    expect(a.pts).toBe(pts);
  });
  it('nhịp: tia dẫn lộ dần rồi bừng sáng', () => {
    expect(boltPhase(0).head).toBe(0);
    expect(boltPhase(0.12).head).toBe(1);
    expect(boltPhase(0.15).lum).toBe(1);
    expect(boltPhase(0.3).lum).toBeLessThan(0.3);
    expect(boltPhase(1).lum).toBeCloseTo(0);
  });
});

describe('rainLayout', () => {
  it('cùng seed cùng vị trí kiếm, nằm trong vùng chiêu', () => {
    const a = rainLayout(555, 10, -20, 9);
    expect(a).toEqual(rainLayout(555, 10, -20, 9));
    expect(a).toHaveLength(RAIN_SWORDS);
    for (const d of a) {
      expect(Math.hypot(d.x - 10, d.z + 20)).toBeLessThanOrEqual(9);
      expect(d.delay).toBeGreaterThanOrEqual(0);
      expect(d.delay).toBeLessThan(0.36);
    }
  });
});

describe('Particles', () => {
  it('số hạt sống không vượt ngân sách preset', () => {
    for (const q of ['low', 'medium', 'high']) {
      const p = new Particles();
      p.setQuality(q);
      for (let i = 0; i < 30000; i++) p.emit(i & 1 ? 'glow' : 'dust', 0, 0, 0, 0, 1, 0, 5, 0.1, 0.1, 0xffffff);
      p.update(0.1);
      const n = p.aliveCount();
      expect(n.total).toBeLessThanOrEqual(PARTICLE_BUDGET[q]);
      expect(n.total).toBeGreaterThan(PARTICLE_BUDGET[q] * 0.9);
    }
  });
  it('hạt chết theo tuổi thọ; hạ preset cắt bớt hạt đang sống', () => {
    const p = new Particles();
    p.setQuality('high');
    for (let i = 0; i < 100; i++) p.emit('glow', 0, 0, 0, 0, 0, 0, 0.5, 0.1, 0.1, 0xffffff);
    p.update(0.1);
    expect(p.aliveCount().glow).toBe(100);
    p.update(0.6);
    expect(p.aliveCount().glow).toBe(0);
    for (let i = 0; i < 20000; i++) p.emit('glow', 0, 0, 0, 0, 0, 0, 5, 0.1, 0.1, 0xffffff);
    p.setQuality('low');
    expect(p.aliveCount().total).toBeLessThanOrEqual(PARTICLE_BUDGET.low);
  });
});
