import { describe, expect, it } from 'vitest';
import { roadSamples } from './ckWonders';

describe('Thiên Lộ Giới: lấy mẫu đường', () => {
  it('các mẫu cách nhau ~ bước đã cho và hướng tiếp tuyến hữu hạn', () => {
    const f = roadSamples(4.5);
    expect(f.length).toBeGreaterThan(100);
    for (let i = 0; i < f.length - 1; i++) {
      const d = Math.hypot(f[i + 1]!.x - f[i]!.x, f[i + 1]!.z - f[i]!.z);
      expect(d, `mẫu ${i}`).toBeLessThan(5.2);
      expect(d).toBeGreaterThan(0.2);
      expect(Number.isFinite(f[i]!.yaw)).toBe(true);
    }
  });
});
