import { describe, expect, it } from 'vitest';
import { CAST_PARTICLE_CAP, emitCount, particleScale } from './fxSettings';

describe('emitCount (mật độ hạt theo preset)', () => {
  it('Vừa (mật độ 1) giữ nguyên số hạt cũ', () => {
    expect(emitCount(40, 'high', true, 1, 0)).toBe(Math.round(40 * particleScale('high', true)));
  });
  it('chỉ chiêu của mình và hiệu ứng Cao mới được nhân mật độ', () => {
    expect(emitCount(40, 'high', true, 1.7, 0)).toBe(68);
    expect(emitCount(40, 'high', false, 1.7, 0)).toBe(Math.round(40 * particleScale('high', false)));
    expect(emitCount(40, 'medium', true, 1.7, 0)).toBe(Math.round(40 * particleScale('medium', true)));
    expect(emitCount(40, 'low', true, 1.7, 0)).toBe(Math.round(40 * particleScale('low', true)));
  });
  it('trần 1.500 hạt tính trên cả chiêu, tối thiểu 1', () => {
    expect(emitCount(1000, 'high', true, 1.7, 0)).toBe(CAST_PARTICLE_CAP);
    expect(emitCount(1000, 'high', true, 1.7, 1400)).toBe(100);
    expect(emitCount(1000, 'high', true, 1.7, 1500)).toBe(1);
  });
});
