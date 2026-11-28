import { describe, expect, it } from 'vitest';
import { PLANT_DOWN, PLANT_UP, PlantDetector } from './footPlant';

/** Độ cao bàn chân của một bước giả: trụ ở 0,02 m, nhấc hình sin lên `peak` trong nửa đầu chu kỳ `period` giây, trụ nửa sau. */
const gait = (t: number, period: number, peak: number): number => {
  const p = (t / period) % 1;
  return 0.02 + (p < 0.5 ? peak * Math.sin(p * 2 * Math.PI) : 0);
};

describe('PlantDetector', () => {
  it('mỗi bước chạy một lần chạm đất, ở cuối pha nhấc', () => {
    const d = new PlantDetector();
    const dt = 1 / 60;
    const period = 0.6;
    const hits: number[] = [];
    for (let t = 0; t < 3.0; t += dt) if (d.update(dt, gait(t, period, 0.18))) hits.push(t);
    expect(hits.length).toBeGreaterThanOrEqual(4);
    expect(hits.length).toBeLessThanOrEqual(5);
    for (const t of hits) {
      const p = (t / period) % 1;
      expect(p).toBeGreaterThan(0.35);
      expect(p).toBeLessThan(0.58);
    }
  });

  it('đứng yên và nhiễu độ cao nhỏ hơn ngưỡng thì im', () => {
    const d = new PlantDetector();
    let n = 0;
    for (let i = 0; i < 600; i++) if (d.update(1 / 60, 0.02 + (i % 2 ? 0.003 : -0.003) + 0.012 * Math.sin(i))) n++;
    expect(n).toBe(0);
  });

  it('nhấc rồi hạ lơ lửng (chưa về đế) không tính; về đế mới tính một lần', () => {
    const d = new PlantDetector();
    d.update(1 / 60, 0.02);
    d.update(1 / 60, 0.02 + PLANT_UP + 0.05);
    expect(d.update(1 / 60, 0.02 + PLANT_DOWN + 0.01)).toBe(false);
    expect(d.update(1 / 60, 0.02 + PLANT_DOWN - 0.005)).toBe(true);
    expect(d.update(1 / 60, 0.02)).toBe(false);
  });

  it('đế dâng theo khi bước lên cao (dốc, bậc): vẫn dò được chạm đất ở mức mới', () => {
    const d = new PlantDetector();
    for (let i = 0; i < 120; i++) d.update(1 / 60, 0.02);
    let n = 0;
    for (let t = 0; t < 8; t += 1 / 60) if (d.update(1 / 60, 0.1 + gait(t, 0.6, 0.18))) n++;
    expect(n).toBeGreaterThanOrEqual(10);
  });

  it('reset quên đế: khung sau không bắn tiếng dù chân đang cao', () => {
    const d = new PlantDetector();
    d.update(1 / 60, 0.02);
    d.update(1 / 60, 0.3);
    d.reset();
    expect(d.update(1 / 60, 0.02)).toBe(false);
    expect(d.update(1 / 60, 0.02)).toBe(false);
  });

  it('giá trị không hữu hạn bị bỏ qua', () => {
    const d = new PlantDetector();
    expect(d.update(1 / 60, NaN)).toBe(false);
    expect(d.update(1 / 60, Infinity)).toBe(false);
  });
});
