import { describe, expect, it } from 'vitest';
import { METHOD_SKILLS, SKILLS } from '@dtl/content';
import { canCancel, hitDirOf, hitsPassed, locoAngleOf, locoDirOf, lungeOffset, skillPhaseAt, skillTiming } from '@dtl/shared';
import type { SkillDef } from '@dtl/shared';

const sk = (id: string) => [...SKILLS, ...METHOD_SKILLS].find((s) => s.id === id) as SkillDef;

describe('skillTiming', () => {
  it('đọc windup/hitAt/recovery từ dữ liệu, không viết cứng', () => {
    const s = sk('skl_phi_kiem');
    const tm = skillTiming(s);
    expect(tm.hitAt).toEqual(s.hitAt);
    expect(tm.end).toBeCloseTo(s.hitAt![0]! + s.recovery!, 6);
    expect(tm.windup).toBe(s.windup);
  });
  it('đòn trong chuỗi dùng hitAt của combo, đòn cuối đẩy lùi', () => {
    const s = sk('skl_phi_kiem');
    expect(skillTiming(s, 0).kb).toBe(false);
    expect(skillTiming(s, 2).kb).toBe(true);
    expect(skillTiming(s, 1).hitAt[0]).toBe(s.combo!.hits[1]!.hitAt);
  });
  it('mọi chiêu: windup ≤ hitAt đầu, đòn cuối ≤ mốc hủy ≤ hết', () => {
    for (const s of [...SKILLS, ...METHOD_SKILLS]) {
      const tm = skillTiming(s);
      expect(tm.windup).toBeLessThanOrEqual(tm.hitAt[0]! + 1e-9);
      expect(tm.cancelMove).toBeGreaterThanOrEqual(tm.hitAt[tm.hitAt.length - 1]! - 1e-9);
      expect(tm.cancelMove).toBeLessThanOrEqual(tm.end + 1e-9);
    }
  });
});

describe('pha và cửa sổ hủy', () => {
  const s = sk('skl_phi_kiem');
  const tm = skillTiming(s);
  it('windup → recovery → done', () => {
    expect(skillPhaseAt(tm, 0)).toBe('windup');
    expect(skillPhaseAt(tm, tm.hitAt[0]! + 0.01)).toBe('recovery');
    expect(skillPhaseAt(tm, tm.end + 0.01)).toBe('done');
  });
  it('hitsPassed đếm mốc đã qua', () => {
    expect(hitsPassed(tm, 0)).toBe(0);
    expect(hitsPassed(tm, tm.hitAt[0]!)).toBe(1);
  });
  it('không hủy trước đòn; đi lại hủy được từ cancel.move; lướt hủy từ ngay sau đòn', () => {
    expect(canCancel(tm, s.hitAt![0]! - 0.01, 'move')).toBe(false);
    expect(canCancel(tm, s.cancel!.move - 0.01, 'move')).toBe(false);
    expect(canCancel(tm, s.cancel!.move + 0.01, 'move')).toBe(true);
    expect(canCancel(tm, tm.end + 0.01, 'move')).toBe(false);
    expect(canCancel(tm, s.hitAt![0]! + 0.001, 'dash')).toBe(true);
    expect(canCancel(tm, s.hitAt![0]! - 0.01, 'dash')).toBe(false);
  });
});

describe('hướng', () => {
  it('locoDirOf theo mặt nhân vật', () => {
    expect(locoDirOf(0, 0, 1)).toBe('forward');
    expect(locoDirOf(0, 0, -1)).toBe('back');
    expect(locoDirOf(0, 1, 0)).toBe('left');
    expect(locoDirOf(0, -1, 0)).toBe('right');
    expect(locoDirOf(Math.PI / 2, 1, 0)).toBe('forward');
    expect(locoDirOf(Math.PI / 2, 0, -1)).toBe('left');
  });
  it('locoAngleOf liên tục, cùng quy ước locoDirOf', () => {
    expect(locoAngleOf(0, 0, 1)).toBeCloseTo(0);
    expect(locoAngleOf(0, 1, 0)).toBeCloseTo(Math.PI / 2);
    expect(locoAngleOf(0, -1, 0)).toBeCloseTo(-Math.PI / 2);
    expect(Math.abs(locoAngleOf(0, 0, -1))).toBeCloseTo(Math.PI);
    expect(locoAngleOf(Math.PI / 2, 0, -1)).toBeCloseTo(Math.PI / 2);
    expect(locoAngleOf(0, 0, 0)).toBe(0);
  });
  it('hitDirOf: kẻ địch ở trước thì đòn đẩy về sau → front', () => {
    expect(hitDirOf(0, 0, -1)).toBe('front');
    expect(hitDirOf(0, 0, 1)).toBe('back');
    expect(hitDirOf(0, -1, 0)).toBe('left');
    expect(hitDirOf(0, 1, 0)).toBe('right');
  });
});

describe('lungeOffset', () => {
  const tm = skillTiming(sk('skl_phi_kiem'), 2);
  it('0 ở đầu và cuối, đỉnh ở mốc đòn', () => {
    expect(lungeOffset(tm, 0, 1)).toBe(0);
    expect(lungeOffset(tm, tm.end, 1)).toBe(0);
    expect(lungeOffset(tm, tm.hitAt[0]!, 1.2)).toBeCloseTo(1.2, 6);
  });
  it('không đổi khi reach 0', () => expect(lungeOffset(tm, 0.2, 0)).toBe(0));
});
