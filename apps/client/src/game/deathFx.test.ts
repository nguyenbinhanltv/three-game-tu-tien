import { describe, expect, it } from 'vitest';
import { DeathFx, INK_IN, INK_OUT, PANEL_INK } from './deathFx';

const run = (fx: DeathFx, secs: number, dead: boolean): void => {
  for (let t = 0; t < secs; t += 1 / 60) fx.update(1 / 60, dead);
};

describe('DeathFx', () => {
  it('đứng yên khi còn sống', () => {
    const fx = new DeathFx();
    run(fx, 3, false);
    expect(fx.active).toBe(false);
    expect(fx.out.ink).toBe(0);
    expect(fx.out.panel).toBe(false);
  });

  it('chết: mực loang kín, bảng hiện sau khi mực phủ quá ngưỡng', () => {
    const fx = new DeathFx();
    fx.update(1 / 60, true);
    expect(fx.died).toBe(true);
    expect(fx.out.panel).toBe(false);
    run(fx, INK_IN + 0.1, true);
    expect(fx.out.ink).toBeCloseTo(1, 5);
    expect(fx.out.ink).toBeGreaterThanOrEqual(PANEL_INK);
    expect(fx.out.panel).toBe(true);
    expect(fx.died).toBe(false);
  });

  it('hồi sinh: bật revived đúng một khung, mực rút về 0 và bảng ẩn ngay', () => {
    const fx = new DeathFx();
    run(fx, INK_IN + 0.5, true);
    fx.update(1 / 60, false);
    expect(fx.revived).toBe(true);
    expect(fx.out.panel).toBe(false);
    fx.update(1 / 60, false);
    expect(fx.revived).toBe(false);
    run(fx, INK_OUT + 0.2, false);
    expect(fx.out.ink).toBe(0);
    expect(fx.out.drift).toBe(0);
    expect(fx.active).toBe(false);
  });

  it('sống lại ngay khi mực mới chớm thì không nổ linh quang', () => {
    const fx = new DeathFx();
    fx.update(1 / 60, true);
    fx.update(1 / 60, false);
    expect(fx.revived).toBe(false);
  });

  it('reset xóa sạch trạng thái', () => {
    const fx = new DeathFx();
    run(fx, 4, true);
    fx.reset();
    expect(fx.active).toBe(false);
    expect(fx.out.ink).toBe(0);
  });
});
