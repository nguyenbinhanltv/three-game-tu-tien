import { describe, expect, it } from 'vitest';
import { checkFxCover, FX_OVERDRAW_LAYERS_MAX, FX_SCREEN_GROUND_M2, fxCoverEstimate, fxEventArea } from './fxcover';
import type { FxEvent } from './fxtimeline';

const decal = (r: number, extra: Partial<FxEvent> = {}): FxEvent =>
  ({ type: 'decal', tex: 'scorch', t: 0, r, dur: 1, ...extra }) as FxEvent;
const sprite = (scale: number, extra: Partial<FxEvent> = {}): FxEvent =>
  ({ type: 'mesh', shape: 'sprite', t: 0, dur: 1, scale, billboard: false, sprite: 'x', ...extra }) as FxEvent;

describe('ước lượng phủ màn của FX (B10)', () => {
  it('diện tích decal tròn, quạt, dải; sprite phẳng và đứng', () => {
    expect(fxEventArea(decal(2), { mul: 1 })).toBeCloseTo(Math.PI * 4, 5);
    expect(fxEventArea(decal(2), { mul: 2 })).toBeCloseTo(Math.PI * 16, 5);
    expect(fxEventArea(decal(8, { sector: 90 } as Partial<FxEvent>), { mul: 1 })).toBeCloseTo(0.5 * Math.PI * 64, 5);
    expect(fxEventArea(decal(8, { strip: [20, 4] } as Partial<FxEvent>), { mul: 3 })).toBe(80);
    expect(fxEventArea(sprite(2), { mul: 1 })).toBeCloseTo(16 * 0.7, 5);
    expect(fxEventArea(sprite(2, { billboard: true } as Partial<FxEvent>), { mul: 1 })).toBeCloseTo(16 * 0.35, 5);
    expect(fxEventArea({ type: 'shake', t: 0, amp: 1, dur: 1 } as unknown as FxEvent, { mul: 1 })).toBe(0);
  });
  it('phủ = tổng độ đậm × diện tích các lớp cùng sống; overdraw = số lớp chồng', () => {
    const ev = [decal(5, { alpha: 0.5 } as Partial<FxEvent>), sprite(3), sprite(3, { t: 5 } as Partial<FxEvent>)];
    const est = fxCoverEstimate(ev, { mul: 1 });
    expect(est.overdraw).toBe(2); // lớp thứ ba bắt đầu sau khi hai lớp đầu hết
    expect(est.cover).toBeCloseTo((0.5 * Math.PI * 25 + 36 * 0.7) / FX_SCREEN_GROUND_M2, 5);
  });
  it('báo lỗi khi phủ hiệu chỉnh hoặc số lớp vượt trần', () => {
    expect(checkFxCover('t', { cover: 1, overdraw: 3 }, { screenCover: 0.2 })).toEqual([]);
    expect(checkFxCover('t', { cover: 3, overdraw: 3 }, { screenCover: 0.2 })[0]).toContain('phủ màn');
    expect(checkFxCover('t', { cover: 0.1, overdraw: FX_OVERDRAW_LAYERS_MAX + 1 }, { screenCover: 0.2 })[0]).toContain('lớp phủ');
  });
});
