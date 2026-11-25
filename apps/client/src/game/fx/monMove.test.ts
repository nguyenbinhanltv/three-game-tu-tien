import { describe, expect, it } from 'vitest';
import { MONSTER } from '@dtl/content';
import { moveOfHazard, movesOf } from './monMove';

const han = MONSTER.get('boss_han_giao')!;
const ngo = MONSTER.get('boss_thon_mach_ngo_cong_vuong')!;
const xichSa = MONSTER.get('elite_xich_sa_ngo_cong')!;
const loiVan = MONSTER.get('elite_loi_van_su_vuong')!;

describe('moveOfHazard', () => {
  it('Hàn Giao: nhận slam, chant, sweep theo hình/bán kính/thời gian báo', () => {
    expect(moveOfHazard(han, { r: 5.5, delay: 1.7 })).toBe('slam');
    expect(moveOfHazard(han, { r: 12, delay: 0.9 })).toBe('chant');
    expect(moveOfHazard(han, { r: 13, delay: 0.9 })).toBe('chant'); // pha 3
    expect(moveOfHazard(han, { r: 14, delay: 1.5, sh: 'cone' })).toBe('sweep');
  });
  it('Ngô Công: nhận slam, chant, chui đất (vòng r4, báo 2 s) và trồi lên (quạt r14, báo 1,5 s)', () => {
    expect(moveOfHazard(ngo, { r: 5.5, delay: 1.7 })).toBe('slam');
    expect(moveOfHazard(ngo, { r: 4, delay: 2 })).toBe('burrow');
    expect(moveOfHazard(ngo, { r: 14, delay: 1.5, sh: 'cone' })).toBe('emerge');
  });
  it('tinh anh: đòn niệm caster (quạt/tròn), chui đất, nhảy vồ', () => {
    expect(moveOfHazard(xichSa, { r: 12, delay: 1.3, sh: 'cone' })).toBe('caster');
    expect(moveOfHazard(xichSa, { r: 3, delay: 2 })).toBe('burrow');
    expect(moveOfHazard(xichSa, { r: 10, delay: 1.6, sh: 'cone' })).toBe('emerge');
    expect(moveOfHazard(loiVan, { r: 4, delay: 1.2 })).toBe('caster');
    expect(moveOfHazard(loiVan, { r: 4, delay: 1.0 })).toBe('leap');
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
