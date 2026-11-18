import { at } from './arr';
import { describe, expect, it } from 'vitest';
import { bodyClassOf, bodyRadiusOf, HIT_FEEL } from './bodyfeel';

describe('bodyfeel', () => {
  it('xếp hạng theo scale và cờ boss', () => {
    expect(bodyClassOf({ scale: 1, boss: undefined })).toBe('small');
    expect(bodyClassOf({ scale: 1.2, boss: undefined })).toBe('small');
    expect(bodyClassOf({ scale: 1.5, boss: undefined })).toBe('medium');
    expect(bodyClassOf({ scale: 1.8, boss: undefined })).toBe('large');
    expect(bodyClassOf({ scale: 1.0, boss: true })).toBe('boss');
  });
  it('giật lùi giảm dần theo hạng, đòn nặng luôn mạnh hơn', () => {
    const o = ['small', 'medium', 'large', 'boss'] as const;
    for (let i = 1; i < o.length; i++) expect(HIT_FEEL[at(o, i)].knock).toBeLessThan(HIT_FEEL[at(o, i - 1)].knock);
    for (const c of o) expect(HIT_FEEL[c].heavyKnock).toBeGreaterThan(1);
  });
  it('bán kính tăng theo scale', () => {
    expect(bodyRadiusOf({ model: 'wolf', scale: 2.3 })).toBeGreaterThan(bodyRadiusOf({ model: 'wolf', scale: 1 }) * 2);
  });
});
