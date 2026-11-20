import { describe, expect, it } from 'vitest';
import { FLIP_ATLASES } from '@dtl/shared';
import { FLIP_COLS, FLIP_FRAMES, flipSample, makeFlipSheet } from './flipbook';

describe('flipbook thủ tục (VS-1)', () => {
  const size = 256; // nhỏ cho test; hình học khung theo tỉ lệ
  const sheet = makeFlipSheet(size);
  const px = (id: number, f: number, x: number, y: number) => {
    const atlas = size / 2;
    const frame = atlas / FLIP_COLS;
    const ox = (id % 2) * atlas + (f % FLIP_COLS) * frame;
    const oy = Math.floor(id / 2) * atlas + Math.floor(f / FLIP_COLS) * frame;
    const i = ((oy + y) * size + ox + x) * 4;
    return { r: sheet[i]!, a: sheet[i + 3]! };
  };
  const coverage = (id: number, f: number) => {
    const frame = size / 2 / FLIP_COLS;
    let n = 0;
    for (let y = 0; y < frame; y++) for (let x = 0; x < frame; x++) n += px(id, f, x, y).a;
    return n / (frame * frame * 255);
  };

  it('bố cục: 4 atlas × 16 khung trong một tấm', () => {
    expect(FLIP_ATLASES.length).toBe(4);
    expect(FLIP_FRAMES).toBe(16);
    expect(sheet.length).toBe(size * size * 4);
  });
  it('xác định: sinh hai lần cho cùng kết quả', () => {
    expect(Buffer.from(makeFlipSheet(64)).equals(Buffer.from(makeFlipSheet(64)))).toBe(true);
  });
  it('mỗi atlas có hình thật: khung giữa phủ > 0, khung đầu/cuối mỏng hơn khung giữa', () => {
    for (let id = 0; id < FLIP_ATLASES.length; id++) {
      const mid = Math.max(coverage(id, 5), coverage(id, 7), coverage(id, 9));
      expect(mid).toBeGreaterThan(0.01);
      expect(coverage(id, FLIP_FRAMES - 1)).toBeLessThan(mid);
    }
  });
  it('mẫu luôn trong 0..1 và không NaN', () => {
    for (let id = 0; id < 4; id++)
      for (const t of [0, 0.3, 0.6, 1])
        for (const u of [0, 0.25, 0.5, 0.99])
          for (const v of [0, 0.5, 1]) {
            const [r, a] = flipSample(id, u, v, t);
            expect(Number.isFinite(r) && Number.isFinite(a)).toBe(true);
            expect(a).toBeGreaterThanOrEqual(0);
            expect(a).toBeLessThanOrEqual(1.0001);
          }
  });
});
