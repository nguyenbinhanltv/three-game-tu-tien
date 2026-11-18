import { describe, expect, it } from 'vitest';
import { SETS } from '@dtl/content';
import { motionAt } from './hoaMotion';
import { pickPortrait, realmArt, realmTier, swordArt } from './portraitPick';

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

describe('Thiên Giai: tầng cảnh giới', () => {
  it('nền và tầng theo cấp: Kết Đan 20, Nguyên Anh 24, Hóa Thần 28', () => {
    expect([15, 16, 20, 24, 28, 32].map(realmArt)).toEqual(['nk', 'tc', 'kd', 'na', 'ht', 'ab']);
    expect([19, 20, 23, 24, 27, 28, 31, 32].map(realmTier)).toEqual([0, 1, 1, 2, 2, 3, 3, 4]);
  });
  it('bộ Liệt Mạch có tranh riêng; đạo theo công pháp (kiếm tu / hộ pháp / đan sư)', () => {
    const LM = SETS.find((s) => s.id === 'set_liet_mach')!;
    const kiem = pickPortrait({ ...base, level: 28, worn: LM.pieces, gender: 'f', method: 'lac_kiem_quyet' });
    expect(kiem).toMatchObject({ char: 'liet_mach_nu', tier: 3, dao: 'kiem', realm: 'nen_ht' });
    expect(pickPortrait({ ...base, level: 28, worn: LM.pieces, method: 'bat_dong_kim_than' }).dao).toBe('ho_phap');
    expect(pickPortrait({ ...base, level: 32, worn: LM.pieces, method: 'thanh_moc_dan_kinh' })).toMatchObject({
      dao: 'dan_su',
      tier: 4,
      realm: 'nen_ab',
    });
  });
});

describe('Thiên Giai: bộ Kết Đan, Nguyên Anh và bộ chưa có tranh', () => {
  it('Địa Giáp / Phục Mạch có tranh riêng theo giới tính', () => {
    for (const [id, art] of [
      ['set_dia_giap', 'dia_giap'],
      ['set_phuc_mach', 'phuc_mach'],
    ] as const) {
      const set = SETS.find((s) => s.id === id)!;
      expect(pickPortrait({ ...base, level: 20, worn: set.pieces }).char).toBe(art + '_nam');
      expect(pickPortrait({ ...base, level: 20, worn: set.pieces, gender: 'f' }).char).toBe(art + '_nu');
    }
  });
  it('Kính Quang / Vân Kinh / Lưu Ly (Nguyên Anh) có tranh riêng theo giới tính', () => {
    for (const [id, art] of [
      ['set_kinh_quang', 'kinh_quang'],
      ['set_van_kinh', 'van_kinh'],
      ['set_luu_ly', 'luu_ly'],
    ] as const) {
      const set = SETS.find((s) => s.id === id)!;
      expect(pickPortrait({ ...base, level: 24, worn: set.pieces }).char).toBe(art + '_nam');
      expect(pickPortrait({ ...base, level: 24, worn: set.pieces, gender: 'f' }).char).toBe(art + '_nu');
    }
  });
  it('bộ chưa có tranh (Tinh Khuyết…) rơi về đồ đệ tử, không trỏ tới tệp chưa có', () => {
    const set = SETS.find((s) => s.id === 'set_tinh_khuyet')!;
    expect(pickPortrait({ ...base, level: 28, worn: set.pieces }).char).toBe('de_tu_nam');
    expect(pickPortrait({ ...base, level: 28, worn: set.pieces, gender: 'f' }).char).toBe('de_tu_nu');
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
