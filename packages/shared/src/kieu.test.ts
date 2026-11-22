import { describe, expect, it } from 'vitest';
import {
  KIEU_COUNT,
  KIEU_IDS,
  MAX_LEVEL,
  kieuCleared,
  kieuClearOk,
  kieuEntryDeny,
  kieuIdem,
  kieuIsFirstClear,
  kieuLevelCap,
  kieuLevelId,
  kieuMinClearSec,
  kieuMinLevel,
  kieuPower,
  xpNeed,
} from './index';

describe('Cửu Kiều (TN-7)', () => {
  it('chín cầu, mã khớp số lượng', () => {
    expect(KIEU_COUNT).toBe(9);
    expect(KIEU_IDS).toHaveLength(9);
    expect(kieuLevelId(3)).toBe('kieu_3');
  });

  it('tiến độ hỏng được làm sạch', () => {
    expect(kieuCleared(undefined)).toBe(0);
    expect(kieuCleared('3')).toBe(0);
    expect(kieuCleared(NaN)).toBe(0);
    expect(kieuCleared(-4)).toBe(0);
    expect(kieuCleared(4.9)).toBe(4);
    expect(kieuCleared(99)).toBe(9);
  });

  it('trần cấp mở theo cầu: 45 → 46 (từ cầu 3) → 47 (từ cầu 6), không vượt MAX_LEVEL', () => {
    expect([0, 1, 2].map(kieuLevelCap)).toEqual([45, 45, 45]);
    expect([3, 4, 5].map(kieuLevelCap)).toEqual([46, 46, 46]);
    expect([6, 7, 8, 9].map(kieuLevelCap)).toEqual([47, 47, 47, 47]);
    expect(kieuLevelCap(1e9)).toBe(MAX_LEVEL);
    expect(MAX_LEVEL).toBe(47);
  });

  it('cấp tối thiểu vào cầu tăng theo ba cầu một bậc', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9].map(kieuMinLevel)).toEqual([44, 44, 44, 45, 45, 45, 46, 46, 46]);
  });

  it('chỉ vào được cầu kế tiếp hoặc luyện lại cầu đã qua; không nhảy cóc', () => {
    expect(kieuEntryDeny(44, 0, 1)).toBeNull();
    expect(kieuEntryDeny(44, 0, 2)).toBe('order');
    expect(kieuEntryDeny(44, 2, 3)).toBeNull();
    expect(kieuEntryDeny(44, 2, 5)).toBe('order');
    expect(kieuEntryDeny(46, 5, 2)).toBeNull(); // luyện lại
    expect(kieuEntryDeny(44, 3, 4)).toBe('level'); // cầu 4 cần cấp 45
    expect(kieuEntryDeny(45, 3, 4)).toBeNull();
    for (const bad of [0, 10, -1, 1.5, NaN, '1', null, undefined]) expect(kieuEntryDeny(47, 9, bad)).toBe('bad');
  });

  it('lượt đầu so với luyện lại', () => {
    expect(kieuIsFirstClear(0, 1)).toBe(true);
    expect(kieuIsFirstClear(2, 3)).toBe(true);
    expect(kieuIsFirstClear(2, 2)).toBe(false);
    expect(kieuIsFirstClear(2, 4)).toBe(false);
  });

  it('điều kiện ghi cầu: có mặt, đóng góp, không nhanh bất thường', () => {
    const ok = { present: true, contributed: true, elapsedSec: 200 };
    expect(kieuClearOk(3, ok)).toBe(true);
    expect(kieuClearOk(3, { ...ok, present: false })).toBe(false);
    expect(kieuClearOk(3, { ...ok, contributed: false })).toBe(false);
    expect(kieuClearOk(3, { ...ok, elapsedSec: kieuMinClearSec(3) - 1 })).toBe(false);
    expect(kieuClearOk(3, { ...ok, elapsedSec: kieuMinClearSec(3) })).toBe(true);
  });

  it('Kiều Lực 1% mỗi cầu, tối đa 9%; khóa chống trùng riêng từng cầu và nhân vật', () => {
    expect(kieuPower(0)).toBe(0);
    expect(kieuPower(9)).toBeCloseTo(0.09);
    expect(kieuPower(50)).toBeCloseTo(0.09);
    expect(new Set([kieuIdem(1, 1), kieuIdem(1, 2), kieuIdem(2, 1)]).size).toBe(3);
  });

  it('thang tu vi Dương Thực: 44–46 có mức đầy, 47 là trần', () => {
    expect(xpNeed(44)).toBeGreaterThan(xpNeed(43));
    expect(xpNeed(46)).toBeLessThan(99_999_999);
    expect(xpNeed(47)).toBe(99_999_999);
  });
});
