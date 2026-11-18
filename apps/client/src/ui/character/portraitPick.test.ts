import { describe, expect, it } from 'vitest';
import { SETS } from '@dtl/content';
import { motionAt } from './HoaTruc';
import { pickPortrait, realmArt, swordArt } from './portraitPick';

const LK = SETS.find((s) => s.id === 'set_lac_kiem')!;
const base = { sets: SETS, gender: 'm', level: 5, hasWeapon: false };

describe('Hoa Trúc: chọn tranh', () => {
  it('không mặc bộ nào → đồ đệ tử, theo giới tính', () => {
    expect(pickPortrait({ ...base, worn: [] }).char).toBe('de_tu_nam');
    expect(pickPortrait({ ...base, worn: [], gender: 'f' }).char).toBe('de_tu_nu');
  });
  it('mặc đủ ngưỡng bộ Lạc Kiếm → tranh Lạc Kiếm; đủ cả bộ → full', () => {
    const two = pickPortrait({ ...base, worn: LK.pieces.slice(0, 2) });
    expect(two.char).toBe('lac_kiem_nam');
    expect(two.full).toBe(false);
    expect(two.setId).toBe('set_lac_kiem');
    expect(pickPortrait({ ...base, worn: LK.pieces, gender: 'f' })).toMatchObject({ char: 'lac_kiem_nu', full: true });
  });
  it('nền theo cảnh giới, kiếm theo mẫu', () => {
    expect(realmArt(15)).toBe('nk');
    expect(realmArt(16)).toBe('tc');
    expect(pickPortrait({ ...base, worn: [], level: 18 }).realm).toBe('canh_tc');
    expect(swordArt('prop_kiem_han_quang')).toBe('han_quang');
    expect(swordArt('prop_kiem_thanh_phong')).toBe('thanh_phong');
    expect(pickPortrait({ ...base, worn: [] }).sword).toBeNull();
    expect(pickPortrait({ ...base, worn: [], hasWeapon: true, swordModel: 'prop_kiem_han_giao' }).sword).toBe('kiem_han_quang');
  });
});

describe('Hoa Trúc: bản đồ chuyển động', () => {
  it('đầu (v nhỏ, giữa ngang) gần như đứng yên; vạt dưới và mép đung đưa nhiều hơn', () => {
    const head = Math.abs(motionAt(0.5, 0.05, 1.3)[0]);
    const hem = Math.max(...[0, 1, 2, 3, 4, 5].map((i) => Math.abs(motionAt(0.9, 0.95, i * 0.7)[0])));
    expect(head).toBeLessThan(0.2);
    expect(hem).toBeGreaterThan(1);
  });
  it('độ lệch có giới hạn (không rách tranh)', () => {
    for (let t = 0; t < 8; t += 0.37)
      for (let v = 0; v <= 1; v += 0.1) for (let u = 0; u <= 1; u += 0.1) expect(Math.hypot(...motionAt(u, v, t))).toBeLessThan(6);
  });
});
