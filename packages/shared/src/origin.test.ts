import { describe, expect, it } from 'vitest';
import {
  computePlayerStats,
  CRIT_CHANCE,
  ORIGIN_TIER_MAX,
  originAtTier,
  originErrors,
  originOpen,
  originTierMul,
  skillDamageMul,
  type OriginDef,
} from './index';

const ELEMS = ['kim', 'moc', 'thuy', 'hoa', 'tho'];
const hoa: OriginDef = { id: 'hoa', group: 'real', elem: 'hoa', elemDmg: 0.08, stat: { atkPct: 0.05 }, color: 'e8562f' };
const loi: OriginDef = { id: 'loi', group: 'real', allDmg: 0.03, stat: { critRate: 0.03 }, color: '9a7bff' };
const sinhTu: OriginDef = { id: 'sinh_tu', group: 'void', chapter: 6, stat: {}, color: '7fd6c2' };
const satLuc: OriginDef = { id: 'sat_luc', group: 'special', chapter: 7, stat: {}, color: 'c2283a' };

describe('Bản Nguyên: thưởng vào chỉ số', () => {
  it('nguồn ngũ hành: cộng hệ của mình và chỉ số phụ, không có allDmg (đúng như linh căn trước TN-1)', () => {
    const base = computePlayerStats(20, []);
    const st = computePlayerStats(20, [], hoa);
    expect(st.elemDmg).toEqual({ hoa: 0.08 });
    expect(st.allDmg).toBe(0);
    expect(st.atk).toBe(Math.round(base.atk * 1.05));
    expect(skillDamageMul(st, 'hoa')).toBeCloseTo(1.08);
    expect(skillDamageMul(st, 'kim')).toBe(1);
    expect(skillDamageMul(st, undefined)).toBe(1);
  });

  it('Lôi: không cộng hệ nào, cộng mọi chiêu (kể cả chiêu không thuộc hệ) và bạo kích', () => {
    const st = computePlayerStats(20, [], loi);
    expect(st.elemDmg).toEqual({});
    expect(st.allDmg).toBe(0.03);
    expect(st.critRate).toBeCloseTo(CRIT_CHANCE + 0.03);
    for (const e of [...ELEMS, undefined]) expect(skillDamageMul(st, e)).toBeCloseTo(1.03);
  });

  it('không có nguồn: hệ số 1, allDmg 0; chỉ số thiếu allDmg (dữ liệu cũ) vẫn tính được', () => {
    expect(computePlayerStats(5, []).allDmg).toBe(0);
    expect(skillDamageMul({ elemDmg: { kim: 0.1 } }, 'kim')).toBeCloseTo(1.1);
  });
});

describe('bậc Bản Nguyên', () => {
  it('mỗi bậc +25%, chặn trong 0..3, bậc lạ coi như 0', () => {
    expect([0, 1, 2, 3].map(originTierMul)).toEqual([1, 1.25, 1.5, 1.75]);
    expect(originTierMul(ORIGIN_TIER_MAX + 5)).toBe(1.75);
    expect(originTierMul(-2)).toBe(1);
    expect(originTierMul(Number.NaN)).toBe(1);
    expect(originTierMul(1.9)).toBe(1.25);
  });

  it('bậc 0 trả đúng đối tượng gốc; bậc cao nhân mọi phần thưởng, không sửa bản gốc', () => {
    expect(originAtTier(hoa, 0)).toBe(hoa);
    expect(originAtTier(null, 3)).toBeNull();
    const h2 = originAtTier(hoa, 2);
    expect(h2.elemDmg).toBeCloseTo(0.12);
    expect(h2.stat.atkPct).toBeCloseTo(0.075);
    expect(hoa.elemDmg).toBe(0.08);
    const l3 = originAtTier(loi, 3);
    expect(l3.allDmg).toBeCloseTo(0.0525);
    expect(l3.stat.critRate).toBeCloseTo(0.0525);
    expect(l3.elemDmg).toBeUndefined();
    const st = computePlayerStats(20, [], h2);
    expect(st.elemDmg.hoa).toBeCloseTo(0.12);
    expect(st.atk).toBe(Math.round(computePlayerStats(20, []).atk * 1.075));
  });
});

describe('kiểm bảng Bản Nguyên', () => {
  const ok = [hoa, loi, sinhTu, satLuc];
  it('bảng hợp lệ không có lỗi; nguồn khóa/mở phân biệt bằng chapter', () => {
    expect(originErrors(ok, ELEMS, ['hoa'])).toEqual([]);
    expect([hoa, loi, sinhTu, satLuc].map(originOpen)).toEqual([true, true, false, false]);
  });

  it('bắt các lỗi dữ liệu', () => {
    const bad = (o: Partial<OriginDef>[], roots: string[] = ['hoa']) => originErrors(o as OriginDef[], ELEMS, roots).join('\n');
    expect(bad([hoa, hoa, sinhTu, satLuc])).toMatch(/trùng id/);
    expect(bad([{ ...hoa, color: 'xyz' }, sinhTu, satLuc])).toMatch(/color/);
    expect(bad([{ ...hoa, elemDmg: 0.2 }, sinhTu, satLuc])).toMatch(/elemDmg/);
    expect(bad([{ ...hoa, elem: 'kim' }, sinhTu, satLuc])).toMatch(/đúng hệ của mình/);
    expect(bad([{ ...hoa, stat: { atkPct: 0.05, defPct: 0.05 } }, sinhTu, satLuc])).toMatch(/đúng một chỉ số phụ/);
    expect(bad([hoa, { ...loi, allDmg: 0.2 }, sinhTu, satLuc])).toMatch(/allDmg/);
    expect(bad([hoa, { ...sinhTu, allDmg: 0.03 }, satLuc])).toMatch(/đang khóa chưa được có thưởng/);
    expect(bad([hoa, { ...sinhTu, chapter: undefined }, satLuc])).toMatch(/phải khai chapter/);
    expect(bad([hoa, { ...hoa, id: 'hoa2', chapter: 6, stat: {}, elem: undefined, elemDmg: undefined }, sinhTu, satLuc])).toMatch(
      /real không khóa/,
    );
    expect(bad([hoa, loi, satLuc])).toMatch(/thiếu nhóm void/);
    expect(bad([loi, hoa, sinhTu, satLuc])).toMatch(/vị trí 1 phải là "hoa"/);
    expect(bad([sinhTu, hoa, satLuc], ['sinh_tu'])).toMatch(/phải thuộc nhóm real và đã mở/);
  });
});
