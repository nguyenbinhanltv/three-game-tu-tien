import { describe, expect, it } from 'vitest';
import { COUNTER_MUL, counterMul, ELEM_BEATS, elemCounter, RESIST_MUL } from './elements';
import { ELEMENTS } from './items';

describe('khắc chế ngũ hành', () => {
  it('vòng tương khắc kín: mỗi hệ khắc đúng một hệ và bị đúng một hệ khắc', () => {
    for (const e of ELEMENTS) {
      expect(elemCounter(e, ELEM_BEATS[e])).toBe(1);
      expect(elemCounter(ELEM_BEATS[e], e)).toBe(-1);
    }
    expect(new Set(Object.values(ELEM_BEATS)).size).toBe(5);
  });
  it('cùng hệ, thiếu hệ hoặc hệ lạ không khắc', () => {
    expect(elemCounter('kim', 'kim')).toBe(0);
    expect(elemCounter(undefined, 'moc')).toBe(0);
    expect(elemCounter('kim', undefined)).toBe(0);
    expect(elemCounter('kim', 'hoa')).toBe(-1);
    expect(elemCounter('xyz', 'moc')).toBe(0);
  });
  it('hệ số', () => {
    expect(counterMul(1)).toBe(COUNTER_MUL);
    expect(counterMul(-1)).toBe(RESIST_MUL);
    expect(counterMul(0)).toBe(1);
  });
});
