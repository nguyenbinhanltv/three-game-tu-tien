import { describe, expect, it } from 'vitest';
import {
  addCharge,
  CHARGE_MAX,
  chargeFromDealt,
  chargeFromTaken,
  clampSkillLevel,
  empowerVariant,
  healAmount,
  reduceDamage,
  resolveSkill,
  skillLevelMods,
  skillUpgradeCost,
  stackMul,
  stacksAlive,
  activeVariant,
  type SkillDef,
  type SkillVariant,
} from './index';

const SK: SkillDef = { id: 'x', kind: 'damage', icon: 'x', unlock: 1, range: 26, cast: 1.5, cd: 20, mp: 40, power: 4, radius: 8, duration: 6, fx: 'f' };
const VAR = {
  a: { id: 'a', hits: [0.6, 0.6], fx: 'twin' } as SkillVariant,
  b: { id: 'b', castMul: 0, powerMul: 0.75, radiusMul: 1.3, fx: 'quick' } as SkillVariant,
};

describe('cấp chiêu', () => {
  it('cấp chẵn tăng sức mạnh, cấp lẻ từ 3 giảm hồi chiêu', () => {
    expect(skillLevelMods(1)).toEqual({ powerMul: 1, cdMul: 1 });
    expect(skillLevelMods(2).powerMul).toBeCloseTo(1.07);
    expect(skillLevelMods(2).cdMul).toBe(1);
    expect(skillLevelMods(3).cdMul).toBeCloseTo(0.92);
    expect(skillLevelMods(4).powerMul).toBeCloseTo(1.14);
    expect(skillLevelMods(5).cdMul).toBeCloseTo(0.84);
    // mỗi bước 6–8%
    for (let l = 2; l <= 5; l++) {
      const a = skillLevelMods(l - 1);
      const b = skillLevelMods(l);
      const step = Math.max(b.powerMul - a.powerMul, a.cdMul - b.cdMul);
      expect(step).toBeGreaterThanOrEqual(0.06 - 1e-9);
      expect(step).toBeLessThanOrEqual(0.08 + 1e-9);
    }
  });
  it('cấp ngoài khoảng hoặc rác thì kẹp lại', () => {
    expect(clampSkillLevel(0)).toBe(1);
    expect(clampSkillLevel(99)).toBe(5);
    expect(clampSkillLevel(NaN)).toBe(1);
    expect(clampSkillLevel('4')).toBe(1);
    expect(clampSkillLevel(3.9)).toBe(3);
  });
  it('chi phí nâng chỉ có cho cấp 2..5 và tăng dần', () => {
    expect(skillUpgradeCost(1)).toBeNull();
    expect(skillUpgradeCost(6)).toBeNull();
    expect(skillUpgradeCost(1.5)).toBeNull();
    let prev = 0;
    for (let l = 2; l <= 5; l++) {
      const c = skillUpgradeCost(l)!;
      expect(c.scrolls).toBeGreaterThan(0);
      expect(c.gold).toBeGreaterThan(prev);
      prev = c.gold;
    }
  });
});

describe('biến thức', () => {
  it('chưa tới cấp 3 hoặc chưa chọn thì không có biến thức', () => {
    expect(activeVariant(VAR, 2, 'a')).toBeNull();
    expect(activeVariant(VAR, 3, undefined)).toBeNull();
    expect(activeVariant(VAR, 3, 'c')).toBeNull();
    expect(activeVariant(undefined, 5, 'a')).toBeNull();
    expect(activeVariant(VAR, 3, 'a')?.fx).toBe('twin');
  });
  it('cấp 5 làm phần thưởng mạnh thêm, không đụng phần đánh đổi', () => {
    const e = empowerVariant(VAR.a);
    expect(e.hits![0]).toBeCloseTo(0.75);
    const q = empowerVariant({ id: 'b', powerMul: 0.75, radiusMul: 1.3, castMul: 0, fx: 'q' });
    expect(q.powerMul).toBe(0.75);
    expect(q.radiusMul).toBe(1.3);
    expect(q.castMul).toBe(0);
    expect(empowerVariant({ id: 'a', powerMul: 1.4, fx: 'f' }).powerMul).toBeCloseTo(1.5);
  });
  it('resolveSkill gộp cấp và biến thức', () => {
    const r1 = resolveSkill(SK, 1, VAR, 'a');
    expect(r1.hits).toEqual([4]);
    expect(r1.cast).toBe(1.5);
    const r3 = resolveSkill(SK, 3, VAR, 'a');
    expect(r3.hits.length).toBe(2);
    expect(r3.hits[0]).toBeCloseTo(0.6 * 4 * 1.07);
    expect(r3.cd).toBeCloseTo(18.4);
    const q = resolveSkill(SK, 3, VAR, 'b');
    expect(q.cast).toBe(0);
    expect(q.radius).toBeCloseTo(10.4);
    expect(q.power).toBeCloseTo(4 * 1.07 * 0.75);
    expect(resolveSkill(SK, 5, VAR, 'b').power).toBeCloseTo(4 * 1.14 * 0.75);
  });
});

describe('sạc và nội tại', () => {
  it('sạc có trần mỗi lần và trần vòng', () => {
    expect(chargeFromDealt(0, 10)).toBe(0);
    expect(chargeFromDealt(10, 0)).toBe(0);
    expect(chargeFromDealt(1e6, 10)).toBe(14);
    expect(chargeFromTaken(1e6, 100)).toBe(20);
    expect(chargeFromTaken(50, 100)).toBeCloseTo(30 > 20 ? 20 : 30);
    expect(addCharge(95, 20)).toBe(CHARGE_MAX);
    expect(addCharge(5, -20)).toBe(0);
  });
  it('một nhát cơ bản cho ít sạc: cần cả chục nhát mới đầy', () => {
    expect(CHARGE_MAX / chargeFromDealt(30, 30)).toBeGreaterThan(30);
  });
  it('kiếm ý/thế tăng sát thương theo tầng, rụng theo thời gian', () => {
    expect(stackMul(0, 0.15, 5)).toBe(1);
    expect(stackMul(5, 0.15, 5)).toBeCloseTo(1.75);
    expect(stackMul(99, 0.15, 5)).toBeCloseTo(1.75);
    expect(stacksAlive(3, 1000, 5000, 10)).toBe(3);
    expect(stacksAlive(3, 1000, 11000, 10)).toBe(0);
  });
  it('hồi phục và giảm sát thương', () => {
    expect(healAmount(100, 0.2)).toBe(120);
    expect(healAmount(100, undefined)).toBe(100);
    expect(reduceDamage(100, 0.6)).toBe(40);
    expect(reduceDamage(100, 5)).toBe(10);
    expect(reduceDamage(1, 0.9)).toBe(1);
  });
});
