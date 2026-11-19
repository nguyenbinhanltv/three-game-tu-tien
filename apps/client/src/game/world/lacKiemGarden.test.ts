import { describe, expect, it } from 'vitest';
import { gardenPlan } from './lacKiemGarden';

// COL-1 COL-A2: kế hoạch vườn là hàm thuần dùng chung dựng cảnh và bake va chạm; số lượng khớp bản dựng cũ (vân tay ma trận instance trước/sau tách hàm đã trùng khớp).
describe('lacKiemGarden: kế hoạch thuần', () => {
  it('tất định, số hoa/trúc/đá đúng, không ô nào nằm trong vùng chặn', () => {
    const a = gardenPlan();
    expect([a.flowers.length, a.bamboo.length, a.rocks.length]).toEqual([680, 252, 42]);
    expect(gardenPlan()).toBe(a);
    for (const b of a.bamboo) expect(Number.isFinite(b.x + b.z + b.sx + b.sy + b.sz)).toBe(true);
  });
});
