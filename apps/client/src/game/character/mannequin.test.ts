import { describe, expect, it } from 'vitest';
import { baseClipOf, JOG_SPEED } from './mannequin';
import type { AnimState } from './view';

const st = (o: Partial<AnimState> = {}): AnimState => ({ speed: 0, flying: false, meditating: false, dead: false, casting: false, airborne: false, ...o });

describe('baseClipOf (v3, clip UAL)', () => {
  it('chọn clip nền theo trạng thái, chết thắng mọi thứ', () => {
    expect(baseClipOf(st())).toBe('Idle_Loop');
    expect(baseClipOf(st({ combat: true }))).toBe('Sword_Idle');
    expect(baseClipOf(st({ speed: 3 }))).toBe('Jog_Fwd_Loop');
    expect(baseClipOf(st({ meditating: true }))).toBe('Sitting_Idle_Loop');
    expect(baseClipOf(st({ casting: true }))).toBe('Spell_Simple_Idle_Loop');
    expect(baseClipOf(st({ airborne: true }))).toBe('Jump_Loop');
    expect(baseClipOf(st({ flying: true }))).toBe('NinjaJump_Idle_Loop');
    expect(baseClipOf(st({ dead: true, speed: 3, flying: true }))).toBe('Death01');
  });
  it('tốc độ chạy tham chiếu của UAL khớp số đo (5,36 m/s)', () => {
    expect(JOG_SPEED).toBeCloseTo(5.36, 2);
  });
});
