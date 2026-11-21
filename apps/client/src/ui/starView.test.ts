import { describe, expect, it } from 'vitest';
import { COTHAN_METHOD } from '@dtl/shared';
import { STARS } from '@dtl/content';
import { starView } from './starView';

const base = { table: STARS, method: COTHAN_METHOD, mats: 99, gold: 99999 };

describe('thang sao (giao diện)', () => {
  it('chưa rèn: chín ô trống, sao kế tiếp là Nhất Tinh, đủ điều kiện thì không bị chặn', () => {
    const v = starView({ ...base, stars: 0, level: 28 });
    expect(v.pips.filter(Boolean)).toHaveLength(0);
    expect(v.pips).toHaveLength(9);
    expect(v.next?.star).toBe(1);
    expect(v.block).toBe('');
    expect(v.bonus).toEqual({ hp: 0, reduce: 0 });
  });
  it('thiếu cảnh giới, vật phẩm, linh thạch, sai công pháp thì báo đúng lý do', () => {
    expect(starView({ ...base, stars: 0, level: 27 }).block).toBe('level');
    expect(starView({ ...base, stars: 0, level: 28, mats: 0 }).block).toBe('mats');
    expect(starView({ ...base, stars: 0, level: 28, gold: 0 }).block).toBe('gold');
    expect(starView({ ...base, stars: 0, level: 28, method: 'bat_dong_kim_than' }).block).toBe('method');
  });
  it('Cửu Tinh: hết sao kế tiếp, bị chặn "max"; sao lạ từ tin bị kẹp; thưởng cộng dồn tăng theo sao', () => {
    const top = starView({ ...base, stars: 9, level: 44 });
    expect(top.next).toBeUndefined();
    expect(top.block).toBe('max');
    expect(starView({ ...base, stars: 99, level: 44 }).stars).toBe(9);
    expect(starView({ ...base, stars: -3, level: 44 }).stars).toBe(0);
    expect(starView({ ...base, stars: 3, level: 44 }).bonus.hp).toBeGreaterThan(starView({ ...base, stars: 1, level: 44 }).bonus.hp);
  });
});
