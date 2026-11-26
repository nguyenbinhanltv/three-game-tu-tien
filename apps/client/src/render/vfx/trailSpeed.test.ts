import { describe, expect, it } from 'vitest';
import { PUFF_RESERVE_MINE, pickPuffSlot, TRAIL_OTHERS, trailRate, trailWidth, type PuffSlot } from './trail';

// V-P10 đợt 3c: vệt phi kiếm dài/rộng theo tốc độ bay; vệt người khác mờ một nửa.
describe('vệt bay theo tốc độ', () => {
  it('bay nhanh thì lấy mẫu chậm hơn (dải dài hơn về thời gian) và dày hơn', () => {
    expect(trailRate(1)).toBeLessThan(trailRate(0.5));
    expect(trailRate(0.5)).toBeLessThan(trailRate(0));
    expect(trailWidth(1)).toBeGreaterThan(trailWidth(0));
  });
  it('kẹp ngoài [0,1]', () => {
    expect(trailRate(5)).toBe(trailRate(1));
    expect(trailRate(-3)).toBe(trailRate(0));
    expect(trailWidth(9)).toBe(trailWidth(1));
  });
  it('dải nhanh nhất dài hơn dải chậm nhất khoảng 1,67 lần (1,25 / 0,75)', () => {
    expect(trailRate(0) / trailRate(1)).toBeGreaterThan(1.5);
  });
  it('người khác mờ còn ≤ một nửa', () => {
    expect(TRAIL_OTHERS).toBeLessThanOrEqual(0.5);
  });
});

describe('pool đuôi mây ưu tiên của mình', () => {
  const MAX = 10;
  const slots = (n: number, mine: boolean, age = 0): PuffSlot[] => Array.from({ length: n }, () => ({ live: true, mine, age }));

  it('người khác không được chiếm quá MAX − chỗ dành cho mình', () => {
    const others = slots(MAX - PUFF_RESERVE_MINE, false);
    expect(pickPuffSlot(others, false, MAX)).toBeNull();
    expect(pickPuffSlot(others.slice(1), false, MAX)).not.toBeNull();
  });
  it('3 người khác nhả hết hạn mức: mình vẫn nhả được (chỗ dành riêng)', () => {
    // Pool đầy: 4 cụm người khác (hạn mức) + 6 cụm của mình đang sống → mình hết chỗ nên lấy lại cụm già nhất của người khác.
    const full: PuffSlot[] = [...slots(MAX - PUFF_RESERVE_MINE, false, 0.1), ...slots(PUFF_RESERVE_MINE, true, 0.2)];
    full[1]!.age = 0.5;
    const pick = pickPuffSlot(full, true, MAX);
    expect(pick).toEqual({ idx: 1, evict: true });
  });
  it('mình có chỗ trống thì dùng ngay (không đuổi ai); pool chưa đầy thì thêm chỗ mới', () => {
    const s = slots(MAX, true);
    s[3]!.live = false;
    expect(pickPuffSlot(s, true, MAX)).toEqual({ idx: 3, evict: false });
    expect(pickPuffSlot(slots(2, false), true, MAX)).toEqual({ idx: 2, evict: false });
  });
  it('pool đầy toàn cụm của mình thì bỏ (không đuổi cụm của chính mình)', () => {
    expect(pickPuffSlot(slots(MAX, true), true, MAX)).toBeNull();
  });
});
