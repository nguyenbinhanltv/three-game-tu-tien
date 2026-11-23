import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { installVfxLab, labDt, type VfxLabApi } from './vfxLab';

const win: { __vfxlab?: VfxLabApi } = {};

beforeAll(() => {
  vi.stubGlobal('window', win);
});

describe('labDt (điều khiển thời gian phòng thử)', () => {
  afterEach(() => {
    win.__vfxlab?.pause(false);
    win.__vfxlab?.scale(1);
  });
  it('mặc định giữ nguyên dt', () => {
    installVfxLab({} as never);
    expect(labDt(0.016)).toBe(0.016);
  });
  it('chậm ×0,25 nhân dt', () => {
    installVfxLab({} as never);
    win.__vfxlab!.scale(0.25);
    expect(labDt(0.04)).toBeCloseTo(0.01, 6);
  });
  it('tạm dừng cho 0, bước đơn cho đúng một lần', () => {
    installVfxLab({} as never);
    win.__vfxlab!.pause(true);
    expect(labDt(0.016)).toBe(0);
    win.__vfxlab!.step(30);
    expect(labDt(0.016)).toBeCloseTo(0.03, 6);
    expect(labDt(0.016)).toBe(0);
  });
});
