import { describe, expect, it } from 'vitest';
import { GRADING } from '../../render/grading';
import { daPreset } from './daMood';

const base = GRADING.lk_night;
const ch = (c: number) => [(c >> 16) & 255, (c >> 8) & 255, c & 255] as const;

describe('daPreset (mood Dạ Cảnh theo loại trận)', () => {
  it('nền thường: hạ tương phản và bão hòa so với đêm gốc, không đổi preset gốc', () => {
    const snap = JSON.stringify(base);
    const p = daPreset(base, 0, 0);
    expect(p.contrast).toBeLessThan(base.contrast);
    expect(p.saturation).toBeLessThan(base.saturation);
    expect(p.fogColor).toBe(base.fogColor);
    expect(JSON.stringify(base)).toBe(snap);
  });

  it('có sàn sáng: đáy đen không tối hơn đêm gốc (máy không có đèn lồng thật không đen đặc)', () => {
    const p = daPreset(base, 0, 0);
    const a = ch(base.blackLift);
    const b = ch(p.blackLift);
    expect(b[0] + b[1] + b[2]).toBeGreaterThanOrEqual(a[0] + a[1] + a[2]);
    expect(p.exposure).toBeGreaterThanOrEqual(base.exposure);
  });

  it('boss: sương ngả đỏ sẫm và dày hơn; tinh anh nhẹ hơn boss', () => {
    const n = daPreset(base, 0, 0);
    const e = daPreset(base, 1, 0);
    const b = daPreset(base, 0, 1);
    const red = (c: number) => ch(c)[0] - ch(c)[2];
    expect(red(b.fogColor)).toBeGreaterThan(red(e.fogColor));
    expect(red(e.fogColor)).toBeGreaterThan(red(n.fogColor));
    expect(b.fogDensity).toBeGreaterThan(e.fogDensity);
    expect(e.fogDensity).toBeGreaterThan(n.fogDensity);
    // Nền vẫn tối: sương boss không sáng (tổng kênh thấp), không phải đỏ vạch báo.
    const f = ch(b.fogColor);
    expect(f[0] + f[1] + f[2]).toBeLessThan(160);
  });

  it('boss lấn tinh anh; trọng số ngoài [0, 1] bị kẹp', () => {
    expect(daPreset(base, 1, 1)).toEqual(daPreset(base, 0, 1));
    expect(daPreset(base, 5, -3)).toEqual(daPreset(base, 1, 0));
  });
});
