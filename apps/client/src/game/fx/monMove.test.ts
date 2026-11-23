import { describe, expect, it } from 'vitest';
import { MONSTER } from '@dtl/content';
import { moveOfHazard, movesOf } from './monMove';

const han = MONSTER.get('boss_han_giao')!;

describe('moveOfHazard', () => {
  it('Hàn Giao: nhận slam, chant, sweep theo hình/bán kính/thời gian báo', () => {
    expect(moveOfHazard(han, { r: 5.5, delay: 1.7 })).toBe('slam');
    expect(moveOfHazard(han, { r: 12, delay: 0.9 })).toBe('chant');
    expect(moveOfHazard(han, { r: 13, delay: 0.9 })).toBe('chant'); // pha 3
    expect(moveOfHazard(han, { r: 14, delay: 1.5, sh: 'cone' })).toBe('sweep');
  });
  it('khác hình hoặc lệch xa thì không đoán (dùng timeline chung)', () => {
    expect(moveOfHazard(han, { r: 8, delay: 1, sh: 'rect' })).toBeUndefined();
    expect(moveOfHazard(han, { r: 30, delay: 5 })).toBeUndefined();
    expect(moveOfHazard(undefined, { r: 5, delay: 1 })).toBeUndefined();
  });
  it('liệt kê chiêu của mọi pha', () => {
    expect(movesOf(han).map((m) => m.move)).toEqual(['slam', 'chant', 'sweep', 'slam', 'chant']);
  });
});
