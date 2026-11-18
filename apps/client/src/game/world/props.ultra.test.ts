import { describe, expect, it } from 'vitest';
import { GRASS_PRESETS } from './grass';
import { TRI_HIGH, TRI_LOW, ULTRA_RANGE, ULTRA_TRI_CAP, governScale, ultraRangeScale } from './props';

describe('Cực cao: cây/đá/cỏ dày hơn, có điều tiết', () => {
  it('cỏ Cực cao rộng và dày hơn Cao', () => {
    expect(GRASS_PRESETS.ultra!.radius).toBeGreaterThan(GRASS_PRESETS.high!.radius);
    expect(GRASS_PRESETS.ultra!.spacing).toBeLessThan(GRASS_PRESETS.high!.spacing);
  });
  it('tầm cây/đá theo bản đồ: Vân Lam > Vân Hải > Thiên Khuyết > bản đồ khác, luôn ≥ Cao (1,15)', () => {
    const g = 1;
    expect(ultraRangeScale('van_lam', g)).toBeGreaterThan(ultraRangeScale('van_hai', g));
    expect(ultraRangeScale('van_hai', g)).toBeGreaterThan(ultraRangeScale('thien_khuyet', g));
    expect(ultraRangeScale('thien_khuyet', g)).toBeGreaterThan(ultraRangeScale('bac_hoang', g));
    for (const lv of [...Object.keys(ULTRA_RANGE), 'bac_hoang', 'xich_tan_khich'])
      expect(ultraRangeScale(lv, 0.6)).toBeGreaterThanOrEqual(1.15);
  });
  it('điều tiết: vượt ngưỡng thì co dần (tối thiểu 0,6), dưới ngưỡng thì nở lại (tối đa 1), giữa hai ngưỡng giữ nguyên', () => {
    let g = 1;
    for (let i = 0; i < 20; i++) g = governScale(g, ULTRA_TRI_CAP);
    expect(g).toBeCloseTo(0.6);
    expect(governScale(0.8, (TRI_HIGH + TRI_LOW) / 2)).toBe(0.8);
    let h = 0.6;
    for (let i = 0; i < 30; i++) h = governScale(h, 1_000_000);
    expect(h).toBe(1);
  });
  it('mô phỏng cảnh nặng: tam giác tỉ lệ với tầm² vẫn được kéo về dưới trần 2,5M', () => {
    // 1,5M tam giác ở tầm 1,15; cảnh dày ở Vân Lam (tầm 1,6) ~ ×(1,6/1,15)² ≈ 2,9M nếu không điều tiết
    const trisAt = (scale: number) => 1_500_000 * (scale / 1.15) ** 2;
    let g = 1;
    for (let i = 0; i < 40; i++) g = governScale(g, trisAt(ultraRangeScale('van_lam', g)));
    expect(trisAt(ultraRangeScale('van_lam', g))).toBeLessThanOrEqual(ULTRA_TRI_CAP);
  });
});
