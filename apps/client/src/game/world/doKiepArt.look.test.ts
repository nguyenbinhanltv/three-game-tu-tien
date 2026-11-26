import { describe, expect, it } from 'vitest';
import { ARC_INK, RAIN_LOOK } from './doKiepArt';

// V-P10 sân độ kiếp: hồ quang có lõi mực tối hai bên (đọc được ban ngày), mưa không cộng sáng.
const lum = (hex: number): number => (((hex >> 16) & 255) * 0.299 + ((hex >> 8) & 255) * 0.587 + (hex & 255) * 0.114) / 255;

describe('sân độ kiếp: hồ quang và mưa', () => {
  it('lõi mực hồ quang tối (độ sáng < 0,15), đủ đậm, và có ≥ 2 bản sao lệch hai phía của đường sáng', () => {
    expect(lum(ARC_INK.color)).toBeLessThan(0.15);
    expect(ARC_INK.opacity).toBeGreaterThanOrEqual(0.8);
    expect(ARC_INK.offsets.length).toBeGreaterThanOrEqual(2);
    const ys = ARC_INK.offsets.map((o) => Math.sign(o.y));
    expect(new Set(ys).size, 'lệch cả hai phía').toBe(2);
    for (const o of ARC_INK.offsets) expect(o.length(), 'lệch vài cm, không tách khỏi tia').toBeLessThan(0.25);
  });
  it('mưa đủ đặc để thấy trên nền sáng nhưng không chói (opacity 0,3–0,6, tông trung)', () => {
    expect(RAIN_LOOK.opacity).toBeGreaterThanOrEqual(0.3);
    expect(RAIN_LOOK.opacity).toBeLessThanOrEqual(0.6);
    expect(lum(RAIN_LOOK.color)).toBeGreaterThan(0.3);
    expect(lum(RAIN_LOOK.color)).toBeLessThan(0.75);
  });
});
