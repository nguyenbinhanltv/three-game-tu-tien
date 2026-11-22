import { describe, expect, it } from 'vitest';
import {
  MARK_ORDER,
  markAdd,
  markAmp,
  markAny,
  markCount,
  markDefErrors,
  marksPrune,
  markTake,
  markTakeAny,
  packMarks,
  skillMarkErrors,
  unpackMarks,
  type MarkDef,
  type MarkRt,
} from './index';

const KIEM_AN: MarkDef = { id: 'kiem_an', on: 'mon', max: 3, dur: 8, method: 'lac_kiem_quyet', color: '9fd8ff' };
const TRUY_HON: MarkDef = { id: 'truy_hon', on: 'mon', max: 1, dur: 8, method: 'lac_kiem_quyet', amp: 0.2, color: 'c8b6ff' };
const TRAN_AN: MarkDef = { id: 'tran_an', on: 'mon', max: 1, dur: 6, method: 'bat_dong_kim_than', color: 'ffc95a' };
const MAT_THE: MarkDef = { id: 'mat_the', on: 'mon', max: 1, dur: 5, ampAll: 0.15, onApply: { stun: 1, posture: 0.2 }, color: 'ff8a5a' };
const MOC_AN: MarkDef = { id: 'moc_an', on: 'ally', max: 1, dur: 10, method: 'thanh_moc_dan_kinh', color: '7dffa0' };
const HON_AN: MarkDef = {
  id: 'hon_an',
  on: 'mon',
  max: 3,
  dur: 8,
  method: 'dan_hon_kinh',
  dot: { per: 0.12, leech: 0.2 },
  color: 'b9a8ff',
};
const DAO_NGAN: MarkDef = { id: 'dao_ngan', on: 'mon', max: 3, dur: 8, method: 'liet_nhan_dao_kinh', color: 'd9482f' };
const CO_DOC: MarkDef = {
  id: 'co_doc',
  on: 'mon',
  max: 3,
  dur: 10,
  method: 'duong_co_kinh',
  dot: { per: 0.07, leech: 0.15 },
  color: '7fc24a',
};
const LOI_AN: MarkDef = { id: 'loi_an', on: 'mon', max: 3, dur: 7, method: 'cuu_tieu_loi_kinh', color: '9a7bff' };
const CAM_AN: MarkDef = { id: 'cam_an', on: 'mon', max: 3, dur: 10, method: 'cam_che_kinh', color: '8f82ff' };
const ALL = [KIEM_AN, TRUY_HON, TRAN_AN, MAT_THE, MOC_AN, HON_AN, DAO_NGAN, CO_DOC, LOI_AN, CAM_AN];
const DEFS = new Map(ALL.map((d) => [d.id as string, d]));

describe('ấn trên mục tiêu (VS-2c)', () => {
  it('đặt cộng tầng tới trần, làm mới hạn; mỗi người đặt một mục riêng', () => {
    const list: MarkRt[] = [];
    expect(markAdd(list, KIEM_AN, 'a', 1, 1000)).toBe(1);
    expect(markAdd(list, KIEM_AN, 'a', 1, 2000)).toBe(2);
    expect(markAdd(list, KIEM_AN, 'a', 5, 3000)).toBe(3);
    expect(list).toHaveLength(1);
    expect(list[0]!.until).toBe(3000 + 8000);
    markAdd(list, KIEM_AN, 'b', 1, 3000);
    expect(list).toHaveLength(2);
    expect(markCount(list, 'kiem_an', 'a', 4000)).toBe(3);
    expect(markCount(list, 'kiem_an', 'b', 4000)).toBe(1);
    expect(markCount(list, 'kiem_an', 'c', 4000)).toBe(0);
  });
  it('ấn hết hạn không còn tính; đặt lại sau khi hết hạn bắt đầu từ đầu', () => {
    const list: MarkRt[] = [];
    markAdd(list, KIEM_AN, 'a', 3, 0);
    expect(markCount(list, 'kiem_an', 'a', 8000)).toBe(0);
    expect(markAdd(list, KIEM_AN, 'a', 1, 9000)).toBe(1);
    expect(marksPrune(list, 9000)).toBe(false);
    expect(marksPrune(list, 99_000)).toBe(true);
    expect(list).toHaveLength(0);
  });
  it('tiêu trả số tầng và gỡ ấn; chỉ tiêu ấn của chính mình; ấn hết hạn tiêu ra 0', () => {
    const list: MarkRt[] = [];
    markAdd(list, KIEM_AN, 'a', 2, 0);
    markAdd(list, KIEM_AN, 'b', 3, 0);
    expect(markTake(list, 'kiem_an', 'c', 100)).toBe(0);
    expect(markTake(list, 'kiem_an', 'a', 100)).toBe(2);
    expect(markTake(list, 'kiem_an', 'a', 100)).toBe(0);
    expect(markTake(list, 'kiem_an', 'b', 99_000)).toBe(0);
    expect(list).toHaveLength(0);
  });
  it('ấn dùng chung: ai cũng thấy và tiêu được', () => {
    const list: MarkRt[] = [];
    markAdd(list, MAT_THE, 'tank', 1, 0);
    expect(markAny(list, 'mat_the', 100)?.sid).toBe('tank');
    expect(markAny(list, 'mat_the', 6000)).toBeUndefined();
    expect(markTakeAny(list, 'mat_the', 100)?.sid).toBe('tank');
    expect(markTakeAny(list, 'mat_the', 100)).toBeUndefined();
  });
  it('thưởng sát thương: ấn của mình theo tầng (hoặc `mul`), ấn chung một lần cho mọi người', () => {
    const list: MarkRt[] = [];
    markAdd(list, TRUY_HON, 'a', 1, 0);
    markAdd(list, MAT_THE, 'tank', 1, 0);
    expect(markAmp(list, DEFS, 'a', 100)).toBeCloseTo(0.35);
    expect(markAmp(list, DEFS, 'b', 100)).toBeCloseTo(0.15);
    expect(markAmp(list, DEFS, 'a', 5500)).toBeCloseTo(0.2);
    markAdd(list, TRUY_HON, 'a', 1, 100, { mul: 0.4 });
    expect(markAmp(list, DEFS, 'a', 200)).toBeCloseTo(0.55);
    // Hai người cùng đặt ấn chung: vẫn chỉ cộng một lần.
    markAdd(list, MAT_THE, 'tank2', 1, 0);
    expect(markAmp(list, DEFS, 'b', 100)).toBeCloseTo(0.15);
  });
  it('gói bit: mỗi loại lấy tầng cao nhất, đọc lại đúng thứ tự cố định', () => {
    const list: MarkRt[] = [];
    markAdd(list, KIEM_AN, 'a', 2, 0);
    markAdd(list, KIEM_AN, 'b', 3, 0);
    markAdd(list, MAT_THE, 't', 1, 0);
    const mk = packMarks(list, 100);
    expect(unpackMarks(mk)).toEqual([
      { id: 'kiem_an', n: 3 },
      { id: 'mat_the', n: 1 },
    ]);
    expect(mk).toBeLessThan(65536);
    expect(packMarks(list, 99_000)).toBe(0);
    expect(unpackMarks(0)).toEqual([]);
    expect(unpackMarks(undefined)).toEqual([]);
    expect(unpackMarks(-5)).toEqual([]);
    expect(unpackMarks(Number.NaN)).toEqual([]);
    // Đủ mọi ấn ở tầng tối đa vẫn là số dương nằm trong uint32 (trường đồng bộ `mk`), đọc lại không mất ấn nào.
    const full: MarkRt[] = MARK_ORDER.map((id) => ({ id, sid: 'x', n: 7, until: 1e12 }));
    const packed = packMarks(full, 0);
    expect(packed).toBeGreaterThan(0);
    expect(packed).toBeLessThan(2 ** 31);
    expect(unpackMarks(packed).map((x) => x.id)).toEqual([...MARK_ORDER]);
  });
  it('TN-2: ấn có sát thương theo thời gian giữ nhịp khi đặt thêm tầng, đặt lại sau khi hết hạn thì bắt nhịp mới', () => {
    const list: MarkRt[] = [];
    markAdd(list, HON_AN, 'a', 1, 0, { per: 30 });
    expect(list[0]).toMatchObject({ n: 1, per: 30, nextAt: 1000 });
    markAdd(list, HON_AN, 'a', 1, 400, { per: 35 });
    expect(list[0]).toMatchObject({ n: 2, per: 35, nextAt: 1000 });
    // Ấn không có `per` (mọi ấn cũ) không sinh nhịp.
    markAdd(list, KIEM_AN, 'a', 1, 0);
    expect(list[1]!.nextAt).toBeUndefined();
    // Bỏ lâu rồi đặt lại (nhịp cũ đã quá hạn hơn một nhịp): bắt nhịp mới từ lúc đặt, không nổ bù.
    markAdd(list, HON_AN, 'a', 1, 30_000, { per: 30 });
    expect(list[0]).toMatchObject({ n: 1, nextAt: 31_000 });
  });
  it('kiểm bảng ấn', () => {
    expect(markDefErrors(ALL)).toEqual([]);
    expect(markDefErrors(ALL.slice(1)).join()).toMatch(/thiếu định nghĩa/);
    expect(markDefErrors([...ALL, KIEM_AN]).join()).toMatch(/trùng id/);
    expect(markDefErrors([{ ...KIEM_AN, max: 9 }, ...ALL.slice(1)]).join()).toMatch(/max/);
    expect(markDefErrors([{ ...KIEM_AN, color: 'xyz' }, ...ALL.slice(1)]).join()).toMatch(/hex/);
    expect(markDefErrors([...ALL.slice(0, 4), { ...MOC_AN, amp: 0.1 }, HON_AN]).join()).toMatch(/đạo hữu/);
    // TN-2: ấn có sát thương theo thời gian chỉ nằm trên quái, tổng mỗi giây không quá 100% công kích, rút máu không quá 50%.
    const hon = (d: Partial<MarkDef>) => markDefErrors([...ALL.slice(0, 5), { ...HON_AN, ...d }]).join();
    expect(hon({ dot: { per: 0.4 } })).toMatch(/dot\.per/);
    expect(hon({ dot: { per: 0.1, leech: 0.8 } })).toMatch(/leech/);
    expect(markDefErrors([...ALL.slice(0, 4), { ...MOC_AN, dot: { per: 0.1 } }, HON_AN]).join()).toMatch(/dot chỉ cho ấn trên quái/);
  });
  it('kiểm chiêu đặt/tiêu ấn', () => {
    const ok = (s: Parameters<typeof skillMarkErrors>[0]) => skillMarkErrors(s, DEFS);
    expect(ok({ id: 's', kind: 'damage', applyMark: { id: 'kiem_an' } })).toEqual([]);
    expect(ok({ id: 's', kind: 'damage', method: 'lac_kiem_quyet', consumeMark: { id: 'kiem_an', extraHit: 0.3 } })).toEqual([]);
    expect(ok({ id: 's', kind: 'hot', applyMark: { id: 'moc_an' } })).toEqual([]);
    expect(ok({ id: 's', kind: 'damage', applyMark: { id: 'moc_an' } }).join()).toMatch(/chỉ chiêu hồi/);
    expect(ok({ id: 's', kind: 'hot', applyMark: { id: 'kiem_an' } }).join()).toMatch(/chiêu hồi không đặt/);
    expect(ok({ id: 's', kind: 'damage', method: 'bat_dong_kim_than', applyMark: { id: 'kiem_an' } }).join()).toMatch(/công pháp khác/);
    expect(ok({ id: 's', kind: 'aoe', applyMark: { id: 'kiem_an', last: true } }).join()).toMatch(/last/);
    expect(ok({ id: 's', kind: 'damage', consumeMark: { id: 'kiem_an' } }).join()).toMatch(/không có tác dụng/);
    expect(ok({ id: 's', kind: 'aoe', consumeMark: { id: 'kiem_an', extraHit: 0.3 } }).join()).toMatch(/extraHit chỉ dùng/);
    expect(ok({ id: 's', kind: 'heal', consumeMark: { id: 'kiem_an', heal: 0.5 } }).join()).toMatch(/không tiêu bằng heal/);
    expect(ok({ id: 's', kind: 'damage', consumeMark: { id: 'moc_an', perMark: 0.2 } }).join()).toMatch(/chỉ tiêu bằng heal\/burst/);
    expect(ok({ id: 's', kind: 'aoe', consumeMark: { id: 'tran_an', then: { mark: 'moc_an', resCost: 40 } } }).join()).toMatch(
      /ấn trên quái/,
    );
    // @ts-expect-error id lạ phải bị bắt lúc chạy (dữ liệu JSON không có kiểu)
    expect(ok({ id: 's', kind: 'damage', applyMark: { id: 'zz' } }).join()).toMatch(/không phải ấn/);
  });
});
