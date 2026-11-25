import { describe, expect, it } from 'vitest';
import { birdScale } from './lacKiemBirds';

// Camera chéo: nghiêng 52°, cách ~20 m (người ở gốc, camera lùi về +z và lên cao).
const tilt = (52 * Math.PI) / 180;
const cam = [0, 20 * Math.sin(tilt), 20 * Math.cos(tilt)];
const foot = [0, 0, 0];

describe('birdScale: chim trên tia nhìn camera→người thu về 0', () => {
  it('chim nằm đúng trên tia nhìn ⇒ cỡ 0', () => {
    const chest = [0, 1.2, 0];
    for (const t of [0.3, 0.6, 0.9]) {
      const p = [chest[0]! + (cam[0]! - chest[0]!) * t, chest[1]! + (cam[1]! - chest[1]!) * t, chest[2]! + (cam[2]! - chest[2]!) * t];
      expect(birdScale(p, cam, foot)).toBe(0);
    }
  });
  it('chim ngay trên đầu người (xa tia nhìn hơn 6 m ở độ cao 10 m) vẫn đủ cỡ; lệch ~0,78·h về phía camera thì bị ẩn', () => {
    expect(birdScale([0, 10, 0], cam, foot)).toBeGreaterThan(0.7);
    expect(birdScale([0, 10, 10 / Math.tan(tilt)], cam, foot)).toBeLessThan(0.05);
  });
  it('chim xa người đủ cỡ 1', () => {
    expect(birdScale([30, 10, -20], cam, foot)).toBe(1);
  });
});
