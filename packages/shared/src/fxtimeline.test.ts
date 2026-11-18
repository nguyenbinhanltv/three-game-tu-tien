import { describe, expect, it } from 'vitest';
import { FX_QUALITY_TIER, fxDrawCount, fxEventsFor, fxParticleCount, fxTierFor, validateFxTimeline, type FxTimeline } from './fxtimeline';

const tl: FxTimeline = {
  skill: 'a',
  events: [
    { type: 'mesh', shape: 'crescent', dur: 0.3, t: -0.1 },
    { type: 'mesh', shape: 'crescent', dur: 0.3, t: 0 },
    { type: 'mesh', shape: 'spike', dur: 0.4, t: 0.05 },
    { type: 'particles', kind: 'spark', n: 30, speed: 5, spread: 1, life: 0.3, size: 0.07, t: 0 },
    { type: 'decal', tex: 'crack', r: 2, dur: 2, t: 0.1 },
    { type: 'trail', dur: 0.2, t: -0.1 },
  ],
  combo: { '2': [{ type: 'mesh', shape: 'kite', dur: 0.2, t: 0 }] },
};

describe('dòng thời gian hiệu ứng', () => {
  it('đếm draw theo nhóm instanced, không theo số lưới', () => {
    // crescent (+ bóng), spike, decal crack, trail = 5 nhóm; hai lưới crescent chung nhóm.
    expect(fxDrawCount(tl.events)).toBe(5);
    expect(fxDrawCount(fxEventsFor(tl, 2))).toBe(6);
  });

  it('tia sét không gộp: mỗi tia một draw + ba nhóm chung (cầu, vòng, vũng sáng); kiểm tầm và số tia', () => {
    const bolt = (scale?: number) => ({ type: 'bolt' as const, t: 0, scale });
    expect(fxDrawCount([bolt(), bolt(), bolt()])).toBe(6);
    expect(fxDrawCount([])).toBe(0);
    // Tầm tia hợp lệ là (0, 4] (nới từ V5 cho sét của boss): 4 qua, 5 và 0 bị bác.
    expect(validateFxTimeline({ skill: 'a', events: [bolt(4)] }, () => true).join(',')).not.toMatch(/bolt scale/);
    const bad: FxTimeline = { skill: 'a', events: [bolt(5), bolt(0), bolt(), bolt(), bolt()] };
    const errs = validateFxTimeline(bad, () => true).join(',');
    expect(errs).toMatch(/bolt scale=5/);
    expect(errs).toMatch(/bolt scale=0/);
    expect(errs).toMatch(/5 tia sét > 4/);
    // 4 tia + 9 nhóm khác vượt 12 draw.
    const shapes = ['crescent', 'spike', 'kite', 'ripple', 'burst', 'smoke', 'helix'] as const;
    const over: FxTimeline = { skill: 'a', events: [...shapes.map((s) => ({ type: 'mesh' as const, shape: s, dur: 0.3, t: 0 })), bolt(), bolt(), bolt(), bolt()] };
    expect(validateFxTimeline(over, () => true).join(',')).toMatch(/draw > 12/);
  });

  it('đếm hạt và chọn sự kiện theo đòn', () => {
    expect(fxParticleCount(tl.events)).toBe(30);
    expect(fxEventsFor(tl, 0)).toHaveLength(6);
    expect(fxEventsFor(tl, 2)).toHaveLength(7);
    expect(fxEventsFor(tl, -1)).toHaveLength(6);
  });

  it('chất lượng hiệu ứng: người khác hạ một bậc', () => {
    expect(FX_QUALITY_TIER).toEqual({ low: 0, medium: 1, high: 2 });
    expect(fxTierFor('high', true)).toBe(2);
    expect(fxTierFor('high', false)).toBe(1);
    expect(fxTierFor('medium', false)).toBe(0);
    expect(fxTierFor('low', false)).toBe(0);
  });

  it('kiểm: hợp lệ và bắt lỗi ngoài giới hạn', () => {
    expect(validateFxTimeline(tl, () => true)).toEqual([]);
    expect(validateFxTimeline(tl, () => false)[0]).toMatch(/không có chiêu/);
    const bad: FxTimeline = { skill: 'a', events: [{ type: 'hitstop', ms: 200, t: 0 }, { type: 'shake', level: 2, t: 0 }, { type: 'flash', amount: 1, t: 0 }, { type: 'mesh', shape: 'ripple', dur: 9, t: 0 }] };
    const errs = validateFxTimeline(bad, () => true).join('\n');
    expect(errs).toMatch(/hitstop 200/);
    expect(errs).toMatch(/rung 2/);
    expect(errs).toMatch(/chớp 1/);
    expect(errs).toMatch(/dur=9/);
  });

  it('kiểm: vượt ngân sách 12 draw hoặc 1.500 hạt', () => {
    const shapes = ['crescent', 'spike', 'kite', 'ripple', 'burst', 'smoke', 'helix'] as const;
    const many: FxTimeline = {
      skill: 'a',
      events: [
        ...shapes.map((s) => ({ type: 'mesh' as const, shape: s, dur: 0.3, t: 0 })),
        { type: 'decal', tex: 'crack', r: 1, dur: 1, t: 0 },
        { type: 'decal', tex: 'rune', r: 1, dur: 1, t: 0 },
        { type: 'decal', tex: 'scorch', r: 1, dur: 1, t: 0 },
        { type: 'trail', dur: 0.2, t: 0 },
        ...Array.from({ length: 4 }, () => ({ type: 'particles' as const, kind: 'spark' as const, n: 400, speed: 1, spread: 1, life: 0.3, size: 0.05, t: 0 })),
      ],
    };
    const errs = validateFxTimeline(many, () => true).join('\n');
    expect(errs).toMatch(/draw > 12/);
    expect(errs).toMatch(/hạt > 1500/);
  });
});
