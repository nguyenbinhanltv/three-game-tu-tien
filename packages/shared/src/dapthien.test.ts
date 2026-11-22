import { describe, expect, it } from 'vitest';
import { canChooseDap, DAP_BONUS, DAP_IDS, dapBonus, dapOf, hasDapTitle, isDapId } from './index';

describe('Đạp Thiên (kết game)', () => {
  it('bốn nguồn Cực nguyên, mỗi nguồn nghiêng một hướng, tổng thưởng 9–14%', () => {
    expect(DAP_IDS).toHaveLength(4);
    for (const id of DAP_IDS) {
      const b = DAP_BONUS[id];
      const sum = b.hp + b.mp + b.atk + b.def;
      expect(sum, id).toBeGreaterThanOrEqual(0.09);
      expect(sum, id).toBeLessThanOrEqual(0.14);
    }
    expect(new Set(DAP_IDS.map((i) => JSON.stringify(DAP_BONUS[i]))).size).toBe(4);
  });

  it('danh hiệu và quyền chọn theo số cầu; dữ liệu hỏng không có tác dụng', () => {
    expect(hasDapTitle({ kieu: 8 })).toBe(false);
    expect(hasDapTitle({ kieu: 9 })).toBe(true);
    expect(canChooseDap({ kieu: 9 })).toBe(true);
    expect(canChooseDap({ kieu: 9, dap: 'tich_diet' })).toBe(false);
    expect(canChooseDap({ kieu: 3 })).toBe(false);
    expect(dapOf({ dap: 'khong_co' })).toBeNull();
    expect(dapOf({ dap: 5 })).toBeNull();
    expect(isDapId('kim')).toBe(false);
    expect(dapBonus({ dap: 'zzz' })).toEqual({ hp: 0, mp: 0, atk: 0, def: 0 });
    expect(dapBonus({ dap: 'cam_che' }).def).toBeGreaterThan(0);
  });
});
