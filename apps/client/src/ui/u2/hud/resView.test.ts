import { describe, expect, it } from 'vitest';
import { METHODS } from '@dtl/content';
import { resView } from './resView';

const def = (id: string) => METHODS.find((m) => m.resource.id === id)!.resource;

describe('thanh tài nguyên riêng (VS-2a)', () => {
  it('mỗi công pháp một tài nguyên, kiểu vẽ khớp thang đo', () => {
    expect(METHODS.map((m) => m.resource.id).sort()).toEqual(['co', 'dan_hoa', 'hon_luc', 'huyet_khi', 'khi_the', 'kiem_y']);
    expect(def('kiem_y').ui).toBe('pips');
    expect(def('huyet_khi').ui).toBe('bar');
  });
  it('tự tính phần rụng theo giờ server: Kiếm ý rụng hết, Huyết khí rụng dần', () => {
    const k = def('kiem_y');
    expect(resView(k, 5, 1000, 2000)).toMatchObject({ v: 5, max: 5, full: true });
    expect(resView(k, 5, 1000, 1000 + k.decay.after * 1000 + 1).v).toBe(0);
    const h = def('huyet_khi');
    const mid = resView(h, 100, 0, (h.decay.after + 2) * 1000);
    expect(mid.v).toBeCloseTo(100 - 2 * h.decay.perSec!);
    expect(mid.full).toBe(false);
  });
  it('luật nhánh đổi trần thì thanh theo trần mới', () => {
    expect(resView(def('kiem_y'), 7, 0, 0, { max: 2 })).toMatchObject({ v: 7, max: 7, full: true });
  });
});
