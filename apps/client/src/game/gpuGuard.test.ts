import { describe, expect, it } from 'vitest';
import { BlankWatch, BLANK_STREAK, canFallback, frameStats, isBlankFrame, rendererChoice } from './gpuGuard';

const flat = (r: number, g: number, b: number, n = 100) => Uint8ClampedArray.from(Array.from({ length: n }, () => [r, g, b, 255]).flat());
const mixed = new Uint8ClampedArray([0, 0, 0, 255, 255, 255, 255, 255]);

describe('gpuGuard', () => {
  it('khung trơn: sd = 0, khung có chi tiết: sd lớn', () => {
    expect(frameStats(flat(10, 16, 32)).sd).toBeCloseTo(0, 5);
    expect(frameStats(mixed).sd).toBeGreaterThan(100);
    expect(frameStats([]).sd).toBe(0);
  });
  it('chỉ coi là hỏng khi có draw call', () => {
    const s = frameStats(flat(10, 16, 32));
    expect(isBlankFrame(s, 100)).toBe(true);
    expect(isBlankFrame(s, 0)).toBe(false);
  });
  it('cần đủ số lần trơn liên tiếp, khung tốt đặt lại chuỗi', () => {
    const w = new BlankWatch();
    const bad = frameStats(flat(0, 0, 0));
    const good = frameStats(mixed);
    for (let i = 0; i < BLANK_STREAK - 1; i++) expect(w.push(bad, 50)).toBe(false);
    expect(w.push(good, 50)).toBe(false);
    for (let i = 0; i < BLANK_STREAK - 1; i++) expect(w.push(bad, 50)).toBe(false);
    expect(w.push(bad, 50)).toBe(true);
  });
  it('?renderer=webgl2 chỉ áp một lần, webgpu/auto xóa nhớ', () => {
    expect(rendererChoice('webgl2', null)).toEqual({ forceWebGL: true, storage: null });
    expect(rendererChoice('webgpu', 'webgl2')).toEqual({ forceWebGL: false, storage: 'clear' });
    expect(rendererChoice('auto', 'webgl2')).toEqual({ forceWebGL: false, storage: 'clear' });
    expect(rendererChoice(null, 'webgl2').forceWebGL).toBe(true);
    expect(rendererChoice(null, null).forceWebGL).toBe(false);
  });
  it('không tự lùi khi đã ở WebGL2 hoặc đã lùi', () => {
    expect(canFallback(true, false)).toBe(true);
    expect(canFallback(false, false)).toBe(false);
    expect(canFallback(true, true)).toBe(false);
  });
});
