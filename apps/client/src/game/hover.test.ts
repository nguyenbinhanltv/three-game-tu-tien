import { describe, expect, it } from 'vitest';
import { HOVER_BOB, HOVER_LOW, hoverBob, hoverTarget, stepHover } from './hover';

describe('bay lơ lửng (E3-B)', () => {
  it('đích: đủ cao, hạ thấp khi lộ yếu điểm, xuống đất khi chết, không bay thì 0', () => {
    expect(hoverTarget(5, false, false)).toBe(5);
    expect(hoverTarget(5, false, true)).toBeCloseTo(5 * HOVER_LOW);
    expect(hoverTarget(5, true, false)).toBe(0);
    expect(hoverTarget(0, false, true)).toBe(0);
  });
  it('tiến dần về đích và dừng đúng đích', () => {
    let h = 0;
    for (let i = 0; i < 600; i++) h = stepHover(h, 5, 1 / 60, false);
    expect(h).toBe(5);
    const half = stepHover(0, 5, 0.1, false);
    expect(half).toBeGreaterThan(0);
    expect(half).toBeLessThan(5);
    expect(stepHover(5, 0, 0.1, true)).toBeLessThan(stepHover(5, 0, 0.1, false));
  });
  it('nhấp nhô trong biên độ, không nhấp khi đã xuống đất', () => {
    for (let t = 0; t < 8; t += 0.3) expect(Math.abs(hoverBob(5, 5, t, 1))).toBeLessThanOrEqual(HOVER_BOB + 1e-9);
    expect(hoverBob(5, 0, 1, 0)).toBe(0);
    expect(hoverBob(0, 0, 1, 0)).toBe(0);
  });
});
