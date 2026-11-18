import { at } from './arr';
import { describe, expect, it } from 'vitest';
import { DUEL_ARENA, hasResonance, inArena, nextTurn, partyXpPool, splitXp, xpShareWeight, XP_FAR, XP_NEAR } from './party';

describe('chia tu vi', () => {
  it('một người nhận trọn', () => expect(splitXp(100, [1])).toEqual([100]));
  it('tổng tăng theo số người nhưng mỗi người ít hơn đánh một mình', () => {
    const r = splitXp(100, [1, 1, 1, 1]);
    expect(r).toEqual([40, 40, 40, 40]);
    expect(partyXpPool(4)).toBeCloseTo(1.6);
    expect(r.reduce((a, b) => a + b, 0)).toBeGreaterThan(100);
  });
  it('xa chỉ nhận nửa, quá xa không nhận và không làm loãng phần', () => {
    expect(xpShareWeight(0)).toBe(1);
    expect(xpShareWeight(XP_NEAR)).toBe(1);
    expect(xpShareWeight(XP_NEAR + 1)).toBe(0.5);
    expect(xpShareWeight(XP_FAR + 1)).toBe(0);
    expect(splitXp(100, [1, 0])).toEqual([100, 0]);
    const r = splitXp(100, [1, 0.5]);
    expect(at(r, 0)).toBeGreaterThan(at(r, 1));
  });
  it('đầu vào xấu', () => {
    expect(splitXp(0, [1, 1])).toEqual([0, 0]);
    expect(splitXp(50, [])).toEqual([]);
    expect(xpShareWeight(NaN)).toBe(0);
  });
});

describe('cộng hưởng và chia đồ', () => {
  it('đủ 3 vai trò mới có cộng hưởng', () => {
    expect(hasResonance(['dps', 'tank', 'support'])).toBe(true);
    expect(hasResonance(['dps', 'dps', 'tank', 'support'])).toBe(true);
    expect(hasResonance(['dps', 'tank', ''])).toBe(false);
    expect(hasResonance([])).toBe(false);
  });
  it('lượt đi vòng và bỏ qua người không đủ điều kiện', () => {
    expect(nextTurn(4, -1, () => true)).toBe(0);
    expect(nextTurn(4, 0, () => true)).toBe(1);
    expect(nextTurn(4, 3, () => true)).toBe(0);
    expect(nextTurn(4, 0, (i) => i === 3)).toBe(3);
    expect(nextTurn(4, 1, (i) => i === 1)).toBe(1);
    expect(nextTurn(3, 0, () => false)).toBe(-1);
  });
});

describe('võ đài', () => {
  it('trong và ngoài vòng', () => {
    expect(inArena(DUEL_ARENA.x, DUEL_ARENA.z)).toBe(true);
    expect(inArena(DUEL_ARENA.x + DUEL_ARENA.r + 1, DUEL_ARENA.z)).toBe(false);
    expect(inArena(DUEL_ARENA.x + DUEL_ARENA.r + 1, DUEL_ARENA.z, 6)).toBe(true);
  });
});
