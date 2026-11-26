import { describe, expect, it } from 'vitest';
import { FOCUS_MAX, FOCUS_R0, FOCUS_R1, focusDarkAt } from '../../render/post';
import { stepFocus } from './daFocus';

describe('lớp tối quanh trận (Dạ Cảnh)', () => {
  it('quanh tâm trận không tối; xa dần thì tối dần tới trần, không vượt trần', () => {
    expect(focusDarkAt(0)).toBe(0);
    expect(focusDarkAt(FOCUS_R0)).toBe(0);
    expect(focusDarkAt((FOCUS_R0 + FOCUS_R1) / 2)).toBeCloseTo(FOCUS_MAX / 2);
    expect(focusDarkAt(FOCUS_R1)).toBeCloseTo(FOCUS_MAX);
    expect(focusDarkAt(5)).toBeCloseTo(FOCUS_MAX);
    // Trần đủ thấp để vẫn thấy quái ở mép khung (không đen đặc).
    expect(FOCUS_MAX).toBeLessThanOrEqual(0.5);
  });

  it('vào trận nhanh, ra trận chậm, tới đích thì dừng hẳn', () => {
    const inn = stepFocus(0, 1, 0.1);
    const out = 1 - stepFocus(1, 0, 0.1);
    expect(inn).toBeGreaterThan(out);
    let v = 0;
    for (let i = 0; i < 200; i++) v = stepFocus(v, 1, 1 / 60);
    expect(v).toBe(1);
    for (let i = 0; i < 600; i++) v = stepFocus(v, 0, 1 / 60);
    expect(v).toBe(0);
  });
});
