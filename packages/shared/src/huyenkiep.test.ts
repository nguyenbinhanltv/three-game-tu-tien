import { describe, expect, it } from 'vitest';
import {
  HK_MECHANICS,
  HK_PARAMS,
  HUYEN_CHAINS,
  TRIB_DEFS,
  chainBlockedBy,
  chainCleared,
  chainDone,
  hkInRect,
  hkLuanAngle,
  hkLuanSafe,
  hkSealAfter,
  hkSheltered,
  huyenKiepCleared,
  huyenOriginTier,
  isHkMechanic,
  sanitizeChainMeta,
  setChainCleared,
} from './index';

describe('Huyền Kiếp: hàm thuần', () => {
  it('chín cơ chế theo thứ tự ba chuỗi × ba kiếp, đủ thông số khai báo', () => {
    const mech = HUYEN_CHAINS.flatMap((id) => TRIB_DEFS[id].phases.map((p) => p.mechanic));
    expect(mech).toEqual([...HK_MECHANICS]);
    for (const id of HUYEN_CHAINS)
      for (const p of TRIB_DEFS[id].phases) {
        expect(isHkMechanic(p.mechanic)).toBe(true);
        expect(Object.keys(p.hk ?? {}).sort()).toEqual([...HK_PARAMS[p.mechanic as keyof typeof HK_PARAMS]].sort());
      }
    expect(isHkMechanic('suy_linh')).toBe(false);
  });

  it('tiến độ: Ngũ Suy giữ khóa `suy`, Huyền Kiếp ở `chain`; dữ liệu hỏng được làm sạch', () => {
    const meta: { suy?: number; chain?: Record<string, number> } = {};
    setChainCleared(meta, TRIB_DEFS.ngu_suy, 2);
    setChainCleared(meta, TRIB_DEFS.huyen_ngoai, 5);
    expect(meta).toEqual({ suy: 2, chain: { huyen_ngoai: 3 } });
    expect(chainCleared(meta, TRIB_DEFS.ngu_suy)).toBe(2);
    expect(chainDone(meta, TRIB_DEFS.huyen_ngoai)).toBe(true);
    expect(chainDone(meta, TRIB_DEFS.truc_co)).toBe(false);
    const bad = { suy: Number.NaN, chain: { huyen_noi: -4, huyen_hon: 99, ngu_suy: 5, la: 2, truc_co: 1 } as Record<string, number> };
    sanitizeChainMeta(bad);
    expect(bad).toEqual({ suy: 0, chain: { huyen_noi: 0, huyen_hon: 3 } });
    const junk = { chain: 'x' as unknown as Record<string, number> };
    sanitizeChainMeta(junk);
    expect(junk.chain).toEqual({});
  });

  it('thứ tự Ngoại → Nội → Hồn; bậc Bản Nguyên = số chuỗi qua đủ', () => {
    const meta: { chain?: Record<string, number> } = {};
    expect(chainBlockedBy(meta, TRIB_DEFS.huyen_ngoai)).toBeNull();
    expect(chainBlockedBy(meta, TRIB_DEFS.huyen_noi)?.id).toBe('huyen_ngoai');
    expect(chainBlockedBy(meta, TRIB_DEFS.huyen_hon)?.id).toBe('huyen_noi');
    setChainCleared(meta, TRIB_DEFS.huyen_ngoai, 3);
    expect(chainBlockedBy(meta, TRIB_DEFS.huyen_noi)).toBeNull();
    expect(huyenOriginTier(meta)).toBe(1);
    setChainCleared(meta, TRIB_DEFS.huyen_noi, 2);
    expect(huyenKiepCleared(meta)).toBe(5);
    expect(huyenOriginTier(meta)).toBe(1);
  });

  it('chắn gió: chỉ phía SAU trụ theo chiều gió, không quá sâu, không lệch ngang', () => {
    // Trụ ở gốc, gió thổi về +Z.
    expect(hkSheltered(0, 0, 0, 1, 0, 2, 5, 2.2)).toBe(true);
    expect(hkSheltered(0, 0, 0, 1, 0, -2, 5, 2.2)).toBe(false);
    expect(hkSheltered(0, 0, 0, 1, 0, 6, 5, 2.2)).toBe(false);
    expect(hkSheltered(0, 0, 0, 1, 3, 2, 5, 2.2)).toBe(false);
    expect(hkSheltered(0, 0, 0, 1, 2, 2, 5, 2.2)).toBe(true);
    expect(hkSheltered(0, 0, 0, 1, 0, 0.1, 5, 2.2)).toBe(false);
  });

  it('ấn đổi chỗ xoay vòng; vạch chém kiểm đúng chiều dài và bề rộng', () => {
    expect(hkSealAfter(2, 1, 3)).toBe(0);
    expect(hkSealAfter(0, 2, 3)).toBe(2);
    expect(hkSealAfter(1, -1, 3)).toBe(0);
    expect(hkInRect(0, 0, 0, 20, 2.6, 0, 10)).toBe(true);
    expect(hkInRect(0, 0, 0, 20, 2.6, 1.2, 10)).toBe(true);
    expect(hkInRect(0, 0, 0, 20, 2.6, 1.4, 10)).toBe(false);
    expect(hkInRect(0, 0, 0, 20, 2.6, 0, 21)).toBe(false);
    expect(hkInRect(0, 0, 0, 20, 2.6, 0, -1)).toBe(false);
    expect(hkInRect(0, 0, Math.PI / 2, 20, 2.6, 10, 0.5)).toBe(true);
  });

  it('cung sinh: xoay theo thời gian, kẹp góc; tâm vòng và ngoài bán kính đều không an toàn', () => {
    const c = { x: 0, z: 0 };
    expect(hkLuanAngle(0, 0.5, 2)).toBeCloseTo(1);
    expect(hkLuanAngle(0.2, -0.5, 2)).toBeCloseTo(Math.PI * 2 - 0.8);
    const th = 1;
    expect(hkLuanSafe(c, th, 6, 13, Math.sin(th) * 6, Math.cos(th) * 6)).toBe(true);
    expect(hkLuanSafe(c, th, 6, 13, Math.sin(th + 0.5) * 6, Math.cos(th + 0.5) * 6)).toBe(true);
    expect(hkLuanSafe(c, th, 6, 13, Math.sin(th + 0.6) * 6, Math.cos(th + 0.6) * 6)).toBe(false);
    expect(hkLuanSafe(c, th, 6, 13, Math.sin(th) * 14, Math.cos(th) * 14)).toBe(false);
    expect(hkLuanSafe(c, th, 6, 13, 0.2, 0.2)).toBe(false);
    // Vắt qua 0/2π.
    expect(hkLuanSafe(c, 0.1, 6, 13, Math.sin(-0.3) * 6, Math.cos(-0.3) * 6)).toBe(true);
  });
});
