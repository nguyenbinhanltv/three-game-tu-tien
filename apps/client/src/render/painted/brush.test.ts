import { describe, expect, it } from 'vitest';
import { BRUSH_SIZE, makeBrushData } from './brush';

describe('texture nét cọ', () => {
  const a = makeBrushData(128, 7);
  it('đúng kích thước, xác định theo hạt giống', () => {
    expect(a.length).toBe(128 * 128 * 4);
    expect(Array.from(makeBrushData(128, 7).slice(0, 64))).toEqual(Array.from(a.slice(0, 64)));
    expect(Array.from(makeBrushData(128, 8).slice(0, 4096))).not.toEqual(Array.from(a.slice(0, 4096)));
    expect(BRUSH_SIZE).toBe(512);
  });
  it('R có cả vùng sáng và tối hơn nền; G có biến thiên; alpha = 255', () => {
    let rLo = 0;
    let rHi = 0;
    let gVar = 0;
    for (let i = 0; i < 128 * 128; i++) {
      if (a[i * 4]! < 100) rLo++;
      if (a[i * 4]! > 160) rHi++;
      if (Math.abs(a[i * 4 + 1]! - 128) > 20) gVar++;
      expect(a[i * 4 + 3]).toBe(255);
    }
    expect(rLo).toBeGreaterThan(50);
    expect(rHi).toBeGreaterThan(50);
    expect(gVar).toBeGreaterThan(50);
  });
  it('liền mạch: nét vẽ qua mép không để lại đường cắt (cột cuối và cột đầu cùng phân bố)', () => {
    let diffEdge = 0;
    let diffMid = 0;
    const n = 128;
    for (let y = 0; y < n; y++) {
      diffEdge += Math.abs(a[(y * n + n - 1) * 4]! - a[y * n * 4]!);
      diffMid += Math.abs(a[(y * n + 63) * 4]! - a[(y * n + 64) * 4]!);
    }
    expect(diffEdge).toBeLessThan(diffMid * 3 + 500);
  });
});
