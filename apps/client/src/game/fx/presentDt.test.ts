import { describe, expect, it } from 'vitest';
import { presentDt } from './vfxParts/common';

describe('slowmo chỉ làm chậm hình của chính mình (VS-1)', () => {
  it('mục đánh dấu slow (chiêu của mình) nhân scale; mục khác luôn dt thật', () => {
    expect(presentDt(true, 0.016, 0.25)).toBeCloseTo(0.004);
    expect(presentDt(false, 0.016, 0.25)).toBe(0.016);
    expect(presentDt(undefined, 0.016, 0.25)).toBe(0.016);
  });
  it('vạch báo quái / chiêu người khác (không slow) không trễ dù slowmo kéo dài 300 ms', () => {
    // 300 ms thật ở 60 Hz: đồng hồ vạch báo quái (slow=false) phải tích đủ 0,3 s, đồng hồ của mình chỉ 0,075 s.
    let monClock = 0;
    let myClock = 0;
    for (let i = 0; i < 18; i++) {
      monClock += presentDt(false, 1 / 60, 0.25);
      myClock += presentDt(true, 1 / 60, 0.25);
    }
    expect(monClock).toBeCloseTo(0.3);
    expect(myClock).toBeCloseTo(0.075);
  });
  it('scale 1 (không slowmo) không đổi gì', () => {
    expect(presentDt(true, 0.02, 1)).toBe(0.02);
  });
});
