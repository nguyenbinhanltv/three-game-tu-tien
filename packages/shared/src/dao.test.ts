import { describe, expect, it } from 'vitest';
import { canChooseDao, DAO_DOMAIN, DAO_MUL, DAO_UNLOCK_LEVEL, daoOf, daoOrigin, domainVariant, ROOT_IDS, type OriginDef } from './index';

const hoa: OriginDef = { id: 'hoa', group: 'real', elem: 'hoa', elemDmg: 0.08, stat: { atkPct: 0.05 }, color: 'ffffff' };
const loi: OriginDef = { id: 'loi', group: 'real', allDmg: 0.03, stat: { critRate: 0.03 }, color: 'ffffff' };

describe('Đạo (TN-3)', () => {
  it('mở từ Vấn Đỉnh sơ kỳ (cấp 36), một lần', () => {
    expect(DAO_UNLOCK_LEVEL).toBe(36);
    expect(canChooseDao(35, {})).toBe(false);
    expect(canChooseDao(36, {})).toBe(true);
    expect(canChooseDao(36, { dao: 'hoa' })).toBe(false);
    expect(canChooseDao(40, { dao: 'khong_co' })).toBe(true);
  });
  it('daoOf chỉ nhận nguồn người chơi mang', () => {
    expect(daoOf({ dao: 'loi' })).toBe('loi');
    for (const bad of ['sinh_tu', '', 5, null, undefined, '__proto__']) expect(daoOf({ dao: bad })).toBeNull();
    expect(daoOf(null)).toBeNull();
  });
  it('daoOrigin nhân một nửa thưởng và không đụng bảng gốc', () => {
    const d = daoOrigin(hoa)!;
    expect(DAO_MUL).toBe(0.5);
    expect(d.elemDmg).toBeCloseTo(0.04);
    expect(d.stat.atkPct).toBeCloseTo(0.025);
    expect(hoa.elemDmg).toBe(0.08);
    expect(hoa.stat.atkPct).toBe(0.05);
    const l = daoOrigin(loi)!;
    expect(l.allDmg).toBeCloseTo(0.015);
    expect(l.stat.critRate).toBeCloseTo(0.015);
    expect(daoOrigin(null)).toBeNull();
  });
  it('mỗi nguồn người chơi có biến thể lĩnh vực nhỏ (tối đa +6% crit / 6% giảm sát / 1% hồi)', () => {
    for (const id of ROOT_IDS) {
      const v = DAO_DOMAIN[id];
      expect(Object.keys(v).length, id).toBeGreaterThan(0);
      expect(v.crit ?? 0).toBeLessThanOrEqual(0.06);
      expect(v.reduce ?? 0).toBeLessThanOrEqual(0.06);
      expect(v.regen ?? 0).toBeLessThanOrEqual(0.01);
    }
    expect(domainVariant(null)).toEqual({});
  });
});
