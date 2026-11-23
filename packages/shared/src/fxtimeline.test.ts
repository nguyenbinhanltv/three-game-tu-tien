import { describe, expect, it } from 'vitest';
import {
  FX_QUALITY_TIER,
  FX_SKILL_DRAW_MAX,
  FX_MESH_MAX,
  FX_SOUND_MAX,
  fxDrawCount,
  fxEventsFor,
  fxParticleCount,
  fxTierFor,
  fxHierarchy,
  validateFxTimeline,
  type FxTimeline,
} from './fxtimeline';

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
    const over: FxTimeline = {
      skill: 'a',
      events: [...shapes.map((s) => ({ type: 'mesh' as const, shape: s, dur: 0.3, t: 0 })), bolt(), bolt(), bolt(), bolt()],
    };
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
    const bad: FxTimeline = {
      skill: 'a',
      events: [
        { type: 'hitstop', ms: 200, t: 0 },
        { type: 'shake', level: 2, t: 0 },
        { type: 'flash', amount: 1, t: 0 },
        { type: 'mesh', shape: 'ripple', dur: 9, t: 0 },
      ],
    };
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
        ...Array.from({ length: 4 }, () => ({
          type: 'particles' as const,
          kind: 'spark' as const,
          n: 400,
          speed: 1,
          spread: 1,
          life: 0.3,
          size: 0.05,
          t: 0,
        })),
      ],
    };
    const errs = validateFxTimeline(many, () => true).join('\n');
    expect(errs).toMatch(/draw > 12/);
    expect(errs).toMatch(/hạt > 1500/);
  });

  describe('VS-1: sự kiện mới và ngân sách cả chiêu', () => {
    const ok = (events: FxTimeline['events']) => validateFxTimeline({ skill: 'a', events }, () => true);
    it('slowmo/vignette/soundAt/camera.fov hợp lệ trong khoảng cho phép', () => {
      expect(
        ok([
          { type: 'slowmo', t: 0, scale: 0.4, ms: 200 },
          { type: 'vignette', t: 0, amount: 0.3, ms: 400, tone: 'light' },
          { type: 'soundAt', t: 0, id: 'x', rate: 1.1, jitter: 0.1 },
          { type: 'camera', t: 0, pull: 0.1, dur: 1, fov: 4 },
        ]),
      ).toEqual([]);
    });
    it('bác giá trị ngoài khoảng', () => {
      const errs = ok([
        { type: 'slowmo', t: 0, scale: 0.05, ms: 200 },
        { type: 'slowmo', t: 0, scale: 0.5, ms: 900 },
        { type: 'vignette', t: 0, amount: 0.9, ms: 400 },
        { type: 'soundAt', t: 0, id: 'x', rate: 3, jitter: 0.9, gain: 5 },
        { type: 'camera', t: 0, pull: 0.1, dur: 1, fov: 20 },
      ]).join('\n');
      expect(errs).toMatch(/slowmo scale=0.05/);
      expect(errs).toMatch(/slowmo scale=0.5 ms=900/);
      expect(errs).toMatch(/vignette amount=0.9/);
      expect(errs).toMatch(/soundAt rate=3/);
      expect(errs).toMatch(/soundAt jitter=0.9/);
      expect(errs).toMatch(/soundAt gain=5/);
      expect(errs).toMatch(/camera fov=20/);
    });
    it('hai slowmo cùng một mốc trúng bị bác', () => {
      expect(
        ok([
          { type: 'slowmo', t: 0, scale: 0.5, ms: 100 },
          { type: 'slowmo', t: 0.1, scale: 0.5, ms: 100 },
        ]).join(),
      ).toMatch(/slowmo cùng một mốc/);
    });
    it('hình flip cần atlas hợp lệ; atlas không gắn vào hình khác', () => {
      expect(ok([{ type: 'mesh', shape: 'flip', dur: 0.5, t: 0, flip: 'ink_smoke' }])).toEqual([]);
      expect(ok([{ type: 'mesh', shape: 'flip', dur: 0.5, t: 0 }]).join()).toMatch(/thiếu\/sai atlas/);
      expect(ok([{ type: 'mesh', shape: 'spike', dur: 0.5, t: 0, flip: 'ink_smoke' }]).join()).toMatch(/chỉ hình flip/);
    });
    it('ngân sách cả chiêu ≤ 25 draw (hợp mọi mốc/đòn/biến thức) dù mỗi mốc ≤ 12', () => {
      const shapes = ['crescent', 'spike', 'kite', 'ripple', 'burst', 'smoke', 'helix', 'ribbon', 'dragon', 'flip', 'card'] as const;
      const mk = (a: number, b: number) =>
        shapes
          .slice(a, b)
          .map((shape) => ({ type: 'mesh' as const, shape, dur: 0.3, t: 0, ...(shape === 'flip' ? { flip: 'ink_smoke' as const } : {}) }));
      const combo: Record<string, FxTimeline['events']> = {};
      const decals = (tex: 'crack' | 'rune' | 'scorch' | 'strike') => ({ type: 'decal' as const, tex, r: 1, dur: 1, t: 0 });
      for (let i = 0; i < 6; i++)
        combo[String(i)] = [decals(['crack', 'rune', 'scorch', 'strike'][i % 4] as 'crack'), { type: 'trail', dur: 0.2, t: 0 }];
      const big: FxTimeline = {
        skill: 'a',
        events: mk(0, 11),
        combo,
        variants: {
          v: [
            { type: 'bolt', t: 0 },
            { type: 'bolt', t: 0 },
            { type: 'bolt', t: 0 },
            { type: 'bolt', t: 0 },
            { type: 'bolt', t: 0 },
          ],
        },
      };
      expect(FX_SKILL_DRAW_MAX).toBe(25);
      expect(validateFxTimeline(big, () => true).join('\n')).toMatch(/draw cả chiêu/);
    });
    it('tối đa FX_SOUND_MAX âm mỗi đòn (giữ voice cho âm quan trọng)', () => {
      const snd = Array.from({ length: FX_SOUND_MAX + 1 }, (_, k) => ({ type: 'soundAt' as const, t: k * 0.01, id: 'x' }));
      expect(ok(snd).join()).toMatch(/âm > 8/);
      expect(ok(snd.slice(0, FX_SOUND_MAX))).toEqual([]);
    });
    it('tối đa FX_MESH_MAX sự kiện mesh mỗi đòn (số lưới sống)', () => {
      const m = Array.from({ length: FX_MESH_MAX + 1 }, () => ({ type: 'mesh' as const, shape: 'spike' as const, t: 0, dur: 0.3 }));
      expect(ok(m).join()).toMatch(/sự kiện mesh >/);
      expect(ok(m.slice(0, FX_MESH_MAX)).join()).not.toMatch(/sự kiện mesh >/);
    });
  });
});

describe('luật thứ bậc và khung va chạm (V-P0)', () => {
  it('chiêu của mình và đối thủ nguyên vẹn; đồng đội chỉ giảm độ sáng, giữ kích thước', () => {
    expect(fxHierarchy(true, false)).toEqual({ size: 1, alpha: 1 });
    expect(fxHierarchy(true, true)).toEqual({ size: 1, alpha: 1 });
    expect(fxHierarchy(false, false, true)).toEqual({ size: 1, alpha: 1 });
    expect(fxHierarchy(false, true, true)).toEqual({ size: 1, alpha: 1 });
    expect(fxHierarchy(false, false)).toEqual({ size: 1, alpha: 0.5 });
    expect(fxHierarchy(false, true)).toEqual({ size: 1, alpha: 0.25 });
  });
  it('impact chỉ cho 1–2 khung', () => {
    const ok: FxTimeline = { skill: 'a', events: [{ type: 'impact', t: 0, frames: 2 }] };
    expect(validateFxTimeline(ok, () => true)).toEqual([]);
    const bad = { skill: 'a', events: [{ type: 'impact', t: 0, frames: 3 }] } as unknown as FxTimeline;
    expect(validateFxTimeline(bad, () => true).join()).toMatch(/impact frames/);
  });
});
