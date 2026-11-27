import { describe, expect, it } from 'vitest';
import { FootSlide, type FootSample } from './footSlide';

const DT = 1 / 60;

/**
 * Dáng đi tổng hợp: thân tiến đều `speed` m/s; mỗi chân nửa chu kỳ trụ (đứng yên trong thế giới nếu `match` = 1), nửa chu kỳ vung lên cao 12 cm.
 * `match` < 1: chân trụ bị kéo theo thân một phần (clip chậm hơn tốc độ đi) → trượt.
 */
function walk(fs: FootSlide, speed: number, match: number, seconds: number, key = 'Jog_Fwd'): void {
  const period = 0.6;
  let rootZ = 0;
  const foot = [
    { z: 0, y: 0.09 },
    { z: 0, y: 0.09 },
  ];
  for (let t = 0; t < seconds; t += DT) {
    rootZ += speed * DT;
    const feet: FootSample[] = foot.map((f, i) => {
      const ph = (t / period + i * 0.5) % 1;
      if (ph < 0.5) {
        // Trụ: chân đứng yên, trừ phần bị kéo theo thân.
        f.z += speed * DT * (1 - match);
        f.y = 0.09;
      } else {
        // Vung: bắt kịp thân, nhấc lên.
        f.z = rootZ + 0.3 * (ph - 0.75) * 4 * 0.5;
        f.y = 0.09 + 0.12 * Math.sin((ph - 0.5) * 2 * Math.PI);
      }
      return { x: i ? 0.1 : -0.1, y: f.y, z: f.z, ground: 0 };
    });
    fs.push(DT, key, 0, rootZ, feet);
  }
}

describe('FootSlide (đo trượt chân)', () => {
  it('chân trụ đứng yên trong thế giới thì gần như không trượt', () => {
    const fs = new FootSlide();
    walk(fs, 5, 1, 4);
    const [r] = fs.rows();
    expect(r!.key).toBe('Jog_Fwd');
    expect(r!.travel).toBeGreaterThan(19);
    expect(r!.planted).toBeGreaterThan(2);
    expect(r!.cmPerM!).toBeLessThan(1);
  });

  it('clip chậm hơn tốc độ đi 20% thì đo ra khoảng 10 cm trượt mỗi mét (mỗi chân trụ nửa thời gian)', () => {
    const fs = new FootSlide();
    walk(fs, 5, 0.8, 6);
    const [r] = fs.rows();
    // Mỗi chân trụ ~một nửa thời gian và trượt 20% quãng thân đi trong lúc đó; hai chân cộng lại ≈ 20% quãng đường.
    expect(r!.cmPerM!).toBeGreaterThan(14);
    expect(r!.cmPerM!).toBeLessThan(22);
    expect(r!.peak).toBeGreaterThan(0.8);
    expect(r!.peak).toBeLessThan(1.2);
  });

  it('tách số đo theo clip, bỏ khung dừng hình và khung quá dài, đứng yên thì không có cm/m', () => {
    const fs = new FootSlide();
    walk(fs, 5, 1, 2, 'Jog_Fwd');
    walk(fs, 2, 0.5, 2, 'Walk_Fwd');
    const still: FootSample[] = [
      { x: 0, y: 0.09, z: 0, ground: 0 },
      { x: 0.2, y: 0.09, z: 0, ground: 0 },
    ];
    for (let i = 0; i < 60; i++) fs.push(DT, 'Idle', 0, 0, still);
    fs.push(0, 'Idle', 0, 0, still);
    fs.push(0.5, 'Idle', 3, 3, still);
    const rows = fs.rows();
    expect(rows.map((r) => r.key).sort()).toEqual(['Idle', 'Jog_Fwd', 'Walk_Fwd']);
    const idle = rows.find((r) => r.key === 'Idle')!;
    expect(idle.cmPerM).toBeNull();
    expect(idle.slide).toBe(0);
    expect(rows.find((r) => r.key === 'Walk_Fwd')!.cmPerM!).toBeGreaterThan(30);
  });

  it('dịch chuyển tức thời (một khung nhảy 2 m) không tính là trượt', () => {
    const fs = new FootSlide();
    const at = (z: number): FootSample[] => [{ x: 0, y: 0.09, z, ground: 0 }];
    for (let i = 0; i < 30; i++) fs.push(DT, 'Idle', 0, 0, at(0));
    fs.push(DT, 'Idle', 0, 0, at(2));
    for (let i = 0; i < 30; i++) fs.push(DT, 'Idle', 0, 0, at(2));
    expect(fs.rows()[0]!.peak).toBe(0);
    expect(fs.rows()[0]!.slide).toBe(0);
  });
});
