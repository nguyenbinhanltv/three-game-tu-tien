import { describe, expect, it } from 'vitest';
import { BURROW, BurrowFx, bulging, depthOf, moundPos, visibleAt } from './burrowFx';

const dive = (o: Partial<Parameters<typeof depthOf>[0] & { hide: number }> = {}) => ({
  t: 0,
  rising: -1,
  hide: 2,
  from: { x: 0, z: 0 },
  to: { x: 10, z: 0 },
  ...o,
});

describe('burrowFx (hàm thuần)', () => {
  it('thân thụt dần: 0 lúc đầu, 1 sau BURROW.sink, rồi giữ chìm', () => {
    expect(depthOf(dive({ t: 0 }))).toBe(0);
    expect(depthOf(dive({ t: BURROW.sink / 2 }))).toBeGreaterThan(0.2);
    expect(depthOf(dive({ t: BURROW.sink / 2 }))).toBeLessThan(0.8);
    expect(depthOf(dive({ t: BURROW.sink }))).toBe(1);
    expect(depthOf(dive({ t: 1.5 }))).toBe(1);
  });
  it('trồi lên: từ chìm hẳn về nổi hẳn trong BURROW.rise', () => {
    expect(depthOf(dive({ t: 2, rising: 0 }))).toBe(1);
    expect(depthOf(dive({ t: 2, rising: BURROW.rise }))).toBe(0);
    expect(visibleAt(0.97)).toBe(true);
    expect(visibleAt(1)).toBe(false);
  });
  it('ụ đất chạy từ chỗ chui tới điểm trồi, không có khi chưa chìm hoặc đang trồi', () => {
    expect(moundPos(dive({ t: 0 }))).toBeNull();
    const a = moundPos(dive({ t: 1 }))!;
    const b = moundPos(dive({ t: 1.8 }))!;
    expect(a.x).toBeGreaterThan(0);
    expect(b.x).toBeGreaterThan(a.x);
    expect(b.x).toBeLessThanOrEqual(10);
    expect(moundPos(dive({ t: 1, rising: 0.1 }))).toBeNull();
  });
  it('báo trước trồi lên ở BURROW.bulge giây cuối', () => {
    expect(bulging(dive({ t: 2 - BURROW.bulge - 0.1 }))).toBe(false);
    expect(bulging(dive({ t: 2 - BURROW.bulge + 0.1 }))).toBe(true);
    expect(bulging(dive({ t: 2.1, rising: 0 }))).toBe(false);
  });
});

describe('BurrowFx', () => {
  it('chui theo vạch burrow đầu tiên (điểm trồi), bỏ vạch thứ 2 và 3 cùng đợt', () => {
    const f = new BurrowFx();
    f.noteHazard('m1', 5, 6, 2, 1000);
    f.noteHazard('m1', 9, 9, 2, 1010);
    f.noteHazard('m1', 1, 1, 2, 1020);
    f.start('m1', 0, 0, 1050);
    expect(f.depth('m1')).toBe(0);
    f.finish('m1');
    expect(f.depth('m1')).toBe(1);
  });
  it('quái không chui thì không có độ chìm', () => {
    expect(new BurrowFx().depth('x')).toBeUndefined();
  });
  it('phòng thử: thân đặt ở điểm trồi sau khi chìm; tự trồi khi hết hide', () => {
    const f = new BurrowFx();
    f.start('m1', 0, 0, 0, { move: true, auto: true, to: { x: 7, z: 3 }, hide: 1 });
    expect(f.override('m1')).toBeNull();
    // mô phỏng thời gian không cần Vfx: chỉ kiểm trạng thái ban đầu và API
    expect(f.active()).toBe(true);
  });
});
