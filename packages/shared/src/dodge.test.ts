import { describe, expect, it } from 'vitest';
import { DODGE_CHARGES, DODGE_RECHARGE_MS, dodgeRefill, dodgeSpend, newDodgeBank } from './aim';

describe('kho lượt né (S5)', () => {
  it('bắt đầu đầy, dùng được đúng DODGE_CHARGES lần liên tiếp', () => {
    const b = newDodgeBank();
    expect(b.charges).toBe(DODGE_CHARGES);
    for (let i = 0; i < DODGE_CHARGES; i++) expect(dodgeSpend(b, 1000)).toBe(true);
    expect(dodgeSpend(b, 1000)).toBe(false);
  });
  it('nạp tuần tự: mỗi DODGE_RECHARGE_MS một lượt, đếm bắt đầu từ lần dùng đầu khi kho đầy', () => {
    const b = newDodgeBank();
    dodgeSpend(b, 1000);
    dodgeSpend(b, 1100);
    expect(b.nextAt).toBe(1000 + DODGE_RECHARGE_MS);
    dodgeRefill(b, 1000 + DODGE_RECHARGE_MS - 1);
    expect(b.charges).toBe(0);
    dodgeRefill(b, 1000 + DODGE_RECHARGE_MS);
    expect(b.charges).toBe(1);
    dodgeRefill(b, 1000 + 2 * DODGE_RECHARGE_MS);
    expect(b.charges).toBe(2);
  });
  it('dài hạn vẫn không nhanh hơn 1 lượt / DODGE_RECHARGE_MS: dùng liên tục 30 s không quá 30000/2500 + 2 lần', () => {
    const b = newDodgeBank();
    let used = 0;
    for (let t = 0; t <= 30_000; t += 50) if (dodgeSpend(b, t)) used++;
    expect(used).toBeLessThanOrEqual(30_000 / DODGE_RECHARGE_MS + DODGE_CHARGES);
  });
  it('không bao giờ vượt DODGE_CHARGES dù chờ rất lâu', () => {
    const b = newDodgeBank();
    dodgeSpend(b, 0);
    dodgeRefill(b, 1e9);
    expect(b.charges).toBe(DODGE_CHARGES);
  });
});
