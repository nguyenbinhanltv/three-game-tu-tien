import { describe, expect, it } from 'vitest';
import { HIT_FEEL } from '@dtl/shared';
import { HitReact } from './hitreact';

/** Giật lùi lớn nhất (m) trong 0,6 s sau một đòn. */
function peakKnock(cls: keyof typeof HIT_FEEL, o: { crit?: boolean; heavy?: boolean }): number {
  const h = new HitReact();
  h.feel = HIT_FEEL[cls];
  h.react({ ...o, dirX: 1, dirZ: 0 });
  let peak = 0;
  for (let t = 0; t < 0.6; t += 1 / 120) {
    h.update(1 / 120);
    peak = Math.max(peak, Math.hypot(h.kx, h.kz));
  }
  return peak;
}

function peakShake(cls: keyof typeof HIT_FEEL, o: { heavy?: boolean }): number {
  const h = new HitReact();
  h.feel = HIT_FEEL[cls];
  h.react({ ...o, dirX: 1 });
  let peak = 0;
  for (let t = 0; t < 0.4; t += 1 / 240) {
    h.update(1 / 240);
    peak = Math.max(peak, Math.abs(h.shake));
  }
  return peak;
}

describe('hit feel theo hạng thân (P2-E1)', () => {
  it('quái nhỏ giật lùi nhiều hơn vừa, lớn, boss', () => {
    const k = (['small', 'medium', 'large', 'boss'] as const).map((c) => peakKnock(c, {}));
    for (let i = 1; i < k.length; i++) expect(k[i]).toBeLessThan(k[i - 1]!);
    // Boss gần như không lùi (< 2 cm đòn thường), sói nhỏ lùi rõ (> 20 cm).
    expect(k[3]).toBeLessThan(0.02);
    expect(k[0]).toBeGreaterThan(0.2);
  });
  it('đòn nặng rõ hơn đòn thường ở mọi hạng (lùi và rung)', () => {
    for (const c of ['small', 'medium', 'large', 'boss'] as const) {
      expect(peakKnock(c, { heavy: true })).toBeGreaterThan(peakKnock(c, {}) * 1.5);
      expect(peakShake(c, { heavy: true })).toBeGreaterThan(peakShake(c, {}));
    }
  });
  it('boss vẫn rung thân khi bị đánh', () => {
    expect(peakShake('boss', {})).toBeGreaterThan(0.02);
  });
  it('boss khựng ngắn hơn quái nhỏ', () => {
    const stop = (c: keyof typeof HIT_FEEL) => {
      const h = new HitReact();
      h.feel = HIT_FEEL[c];
      h.react({});
      let t = 0;
      while (h.stopped && t < 1) {
        h.update(1 / 240);
        t += 1 / 240;
      }
      return t;
    };
    expect(stop('boss')).toBeLessThan(stop('small'));
  });
});
