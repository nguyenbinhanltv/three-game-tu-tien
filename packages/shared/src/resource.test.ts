import { describe, expect, it } from 'vitest';
import {
  resAdd,
  resFromHeal,
  resFromTaken,
  resMax,
  resNow,
  resourceErrors,
  resSpend,
  resSpendAt,
  skillResErrors,
  type ResourceDef,
} from './index';

const KIEM_Y: ResourceDef = { id: 'kiem_y', max: 5, ui: 'pips', gain: { basic: 1 }, decay: { after: 10 } };
const HUYET_KHI: ResourceDef = {
  id: 'huyet_khi',
  max: 100,
  ui: 'bar',
  gain: { takenPct: 2.5, takenMin: 4 },
  decay: { after: 8, perSec: 10 },
  auto: { perPoint: 0.004 },
};
const DAN_HOA: ResourceDef = { id: 'dan_hoa', max: 100, ui: 'bar', gain: { healPct: 1, dot: 2 }, decay: { after: 12, perSec: 5 } };

describe('tài nguyên riêng của công pháp (VS-2a)', () => {
  it('Kiếm ý rụng hết sau `after` giây không tích; trước đó giữ nguyên', () => {
    expect(resNow(KIEM_Y, 3, 1000, 10_999)).toBe(3);
    expect(resNow(KIEM_Y, 3, 1000, 11_000)).toBe(0);
    expect(resNow(KIEM_Y, 0, 1000, 1000)).toBe(0);
  });
  it('Huyết khí rụng dần `perSec` mỗi giây sau `after`, không âm', () => {
    expect(resNow(HUYET_KHI, 60, 0, 8000)).toBe(60);
    expect(resNow(HUYET_KHI, 60, 0, 10_000)).toBe(40);
    expect(resNow(HUYET_KHI, 60, 0, 60_000)).toBe(0);
  });
  it('tích không vượt trần; lượng âm, NaN, vô cực không đổi gì', () => {
    expect(resAdd(KIEM_Y, 4, 3)).toBe(5);
    expect(resAdd(KIEM_Y, 2, -1)).toBe(2);
    expect(resAdd(KIEM_Y, 2, Number.NaN)).toBe(2);
    expect(resAdd(KIEM_Y, 2, Number.POSITIVE_INFINITY)).toBe(2);
  });
  it('nhận đòn tích theo phần trăm khí huyết mất, tối thiểu `takenMin`', () => {
    expect(resFromTaken(HUYET_KHI, 100, 1000)).toBeCloseTo(25);
    expect(resFromTaken(HUYET_KHI, 1, 1000)).toBe(4);
    expect(resFromTaken(HUYET_KHI, 0, 1000)).toBe(0);
    expect(resFromTaken(KIEM_Y, 100, 1000)).toBe(0);
  });
  it('hồi tích theo phần hồi thật', () => {
    expect(resFromHeal(DAN_HOA, 200, 1000)).toBeCloseTo(20);
    expect(resFromHeal(DAN_HOA, 0, 1000)).toBe(0);
    expect(resFromHeal(HUYET_KHI, 200, 1000)).toBe(0);
  });
  it('xả hết: mỗi điểm cộng `perPoint`; chiêu của tài nguyên khác không xả', () => {
    const sp = resSpend(KIEM_Y, 5, { id: 'kiem_y', spendAll: true, perPoint: 0.15 }, false);
    expect(sp).toEqual({ left: 0, spent: 5, mul: 1.75 });
    expect(resSpend(KIEM_Y, 5, { id: 'dan_hoa', spendAll: true, perPoint: 0.15 }, true).spent).toBe(0);
    expect(resSpend(KIEM_Y, 0, { id: 'kiem_y', spendAll: true, perPoint: 0.15 }, false).mul).toBe(1);
  });
  it('luật auto (Huyết khí): chiêu gây sát thương có hồi chiêu xả hết; chiêu khai `res` riêng thì theo `res`', () => {
    expect(resSpend(HUYET_KHI, 100, undefined, true).mul).toBeCloseTo(1.4);
    expect(resSpend(HUYET_KHI, 100, undefined, false).spent).toBe(0);
    // Trấn Sơn Ấn khai `gain`: không bị luật auto xả.
    expect(resSpend(HUYET_KHI, 100, { id: 'huyet_khi', gain: 20 }, true).spent).toBe(0);
    // Kiếm ý không có auto.
    expect(resSpend(KIEM_Y, 5, undefined, true).spent).toBe(0);
  });
  it('`cost`: đủ thì trừ và thưởng, thiếu thì không trừ không thưởng', () => {
    const sr = { id: 'dan_hoa', cost: 40, bonusMul: 1.5 } as const;
    expect(resSpend(DAN_HOA, 55, sr, false)).toEqual({ left: 15, spent: 40, mul: 1.5 });
    expect(resSpend(DAN_HOA, 39.9, sr, false)).toEqual({ left: 39.9, spent: 0, mul: 1 });
  });
  it('xả lúc đang rụng: mốc dời để phần đã rụng không bị trừ hai lần, và rụng tiếp ngay', () => {
    // Đan hỏa 100 tại t0; t0+16s đã rụng 4 giây × 5 = còn 80; xả 40 còn 40.
    const now = 16_000;
    const cur = resNow(DAN_HOA, 100, 0, now);
    expect(cur).toBe(80);
    const sp = resSpend(DAN_HOA, cur, { id: 'dan_hoa', cost: 40, bonusMul: 1.5 }, false);
    const at = resSpendAt(DAN_HOA, 0, now);
    expect(resNow(DAN_HOA, sp.left, at, now)).toBe(40);
    // Không được làm mới thời gian giữ: 2 giây sau rụng tiếp 10 điểm.
    expect(resNow(DAN_HOA, sp.left, at, now + 2000)).toBe(30);
    // Chưa tới lúc rụng thì mốc giữ nguyên (xả không kéo dài thời gian giữ).
    expect(resSpendAt(DAN_HOA, 5000, 9000)).toBe(5000);
    // Kiếm ý (rụng hết một lần): còn sống thì mốc không đổi.
    expect(resSpendAt(KIEM_Y, 1000, 6000)).toBe(1000);
  });
  it('luật nhánh: trần cộng thêm, giữ lại khi xả, nhân tích, không rụng', () => {
    expect(resMax(KIEM_Y, { max: 2 })).toBe(7);
    expect(resAdd(KIEM_Y, 6, 3, { max: 2 })).toBe(7);
    const sp = resSpend(KIEM_Y, 5, { id: 'kiem_y', spendAll: true, perPoint: 0.1 }, false, { keep: 2 });
    expect(sp).toEqual({ left: 2, spent: 3, mul: 1.3 });
    expect(resAdd(HUYET_KHI, 0, 10, { gainMul: 1.3 })).toBeCloseTo(13);
    expect(resNow(HUYET_KHI, 60, 0, 60_000, { noDecay: true })).toBe(60);
  });
  it('kiểm dữ liệu', () => {
    for (const d of [KIEM_Y, HUYET_KHI, DAN_HOA]) expect(resourceErrors(d, 'x')).toEqual([]);
    expect(resourceErrors({ ...KIEM_Y, max: 20 }, 'x').length).toBeGreaterThan(0);
    expect(resourceErrors({ ...KIEM_Y, gain: {} }, 'x').length).toBeGreaterThan(0);
    expect(resourceErrors({ ...HUYET_KHI, auto: { perPoint: 0.5 } }, 'x').length).toBeGreaterThan(0);
    expect(skillResErrors({ id: 'kiem_y', spendAll: true, perPoint: 0.15 }, 5, 's')).toEqual([]);
    expect(skillResErrors({ id: 'kiem_y', spendAll: true }, 5, 's').length).toBeGreaterThan(0);
    expect(skillResErrors({ id: 'dan_hoa', cost: 40 }, 100, 's').length).toBeGreaterThan(0);
    expect(skillResErrors({ id: 'dan_hoa', cost: 40, bonusMul: 1.5, spendAll: true, perPoint: 0.001 }, 100, 's').length).toBeGreaterThan(0);
    expect(skillResErrors({ id: 'dan_hoa' }, 100, 's').length).toBeGreaterThan(0);
    expect(skillResErrors({ id: 'dan_hoa', gain: 5 }, undefined, 's').length).toBeGreaterThan(0);
  });
});
