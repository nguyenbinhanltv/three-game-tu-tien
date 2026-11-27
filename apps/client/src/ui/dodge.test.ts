import { describe, expect, it } from 'vitest';
import { boxesHit, dodgeOffset, overlapArea } from './dodge';

const bounds = { minY: 96, minX: 330, maxX: 1080 };
const toasts = { x: 490, y: 96, w: 300, h: 90 };

describe('dodgeOffset', () => {
  it('không có nhãn hoặc không đè thì đứng yên', () => {
    expect(dodgeOffset(toasts, null, bounds)).toEqual({ dx: 0, dy: 0 });
    expect(dodgeOffset(toasts, { x: 560, y: 300, w: 150, h: 56 }, bounds)).toEqual({ dx: 0, dy: 0 });
  });
  it('còn chỗ phía trên thì dời lên trên nhãn', () => {
    const label = { x: 560, y: 240, w: 150, h: 56 };
    const box = { ...toasts, y: 200 };
    const o = dodgeOffset(box, label, bounds);
    expect(o.dx).toBe(0);
    expect(o.dy).toBeLessThan(0);
    expect(boxesHit({ ...box, y: box.y + o.dy }, label)).toBe(false);
  });
  it('hết chỗ phía trên thì sang phải, kín phải thì sang trái', () => {
    const label = { x: 560, y: 150, w: 150, h: 56 };
    const r = dodgeOffset(toasts, label, bounds);
    expect(r.dy).toBe(0);
    expect(r.dx).toBeGreaterThan(0);
    expect(overlapArea({ ...toasts, x: toasts.x + r.dx }, label)).toBe(0);
    const l = dodgeOffset(toasts, label, { ...bounds, minX: 200, maxX: 900 });
    expect(l.dx).toBeLessThan(0);
    expect(overlapArea({ ...toasts, x: toasts.x + l.dx }, label)).toBe(0);
  });
  it('kín cả hai bên thì xuống dưới nhãn', () => {
    const label = { x: 560, y: 150, w: 150, h: 56 };
    const o = dodgeOffset(toasts, label, { minY: 96, minX: 480, maxX: 800 });
    expect(o.dx).toBe(0);
    expect(o.dy).toBeGreaterThan(0);
    expect(overlapArea({ ...toasts, y: toasts.y + o.dy }, label)).toBe(0);
  });
});
