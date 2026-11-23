import { describe, expect, it } from 'vitest';
import { ISO_GATE_OPACITY, ISO_GATE_SCALE, gateFlat } from './gates';

describe('gateFlat (camera iso)', () => {
  it('iso: đĩa cổng nằm phẳng, trừ cổng gương Kính Nguyệt', () => {
    expect(gateFlat({ to: 'gioi_tri' }, true)).toBe(true);
    expect(gateFlat({ to: undefined }, true)).toBe(true);
    expect(gateFlat({ to: 'kinh_nguyet' }, true)).toBe(false);
  });
  it('camera cũ: giữ cờ flat của cổng', () => {
    expect(gateFlat({ to: 'gioi_tri' }, false)).toBe(false);
    expect(gateFlat({ flat: true }, false)).toBe(true);
    expect(gateFlat({ to: 'kinh_nguyet', flat: true }, true)).toBe(true);
  });

  it('đĩa phẳng iso mờ và nhỏ hơn đĩa thường', () => {
    expect(ISO_GATE_OPACITY).toBeLessThan(0.3);
    expect(ISO_GATE_SCALE).toBeLessThan(1);
  });
});
