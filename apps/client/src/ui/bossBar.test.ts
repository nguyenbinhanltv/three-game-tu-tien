import { describe, expect, it } from 'vitest';
import { bossLayers, bossPhase, layerColor } from './bossBar';

describe('thanh máu boss nhiều lớp', () => {
  it('boss nhỏ là một lớp', () => {
    expect(bossLayers(1000, 2000)).toEqual({ n: 1, cur: 0, frac: 0.5 });
  });
  it('48300 máu = 4 lớp; đầy máu ở lớp trên cùng, lớp đầy', () => {
    const l = bossLayers(48300, 48300);
    expect(l).toEqual({ n: 4, cur: 3, frac: 1 });
  });
  it('xuống lớp kế khi máu chạm ranh giới', () => {
    expect(bossLayers(36225, 48300)).toMatchObject({ n: 4, cur: 2, frac: 1 });
    expect(bossLayers(36224, 48300).cur).toBe(2);
    expect(bossLayers(1, 48300).cur).toBe(0);
  });
  it('chết = lớp 0 trống; trần 6 lớp', () => {
    expect(bossLayers(0, 48300)).toMatchObject({ cur: 0, frac: 0 });
    expect(bossLayers(1e6, 1e6).n).toBe(6);
  });
  it('màu lớp quay vòng, lớp trên cùng màu 0', () => {
    const l = bossLayers(48300, 48300);
    expect(layerColor(l)).toBe(0);
    expect(layerColor(l, 0)).toBe(3);
  });
  it('pha theo ngưỡng máu', () => {
    expect(bossPhase(100, 100, [0.7, 0.4])).toEqual({ n: 1, max: 3 });
    expect(bossPhase(60, 100, [0.7, 0.4])).toEqual({ n: 2, max: 3 });
    expect(bossPhase(30, 100, [0.7, 0.4])).toEqual({ n: 3, max: 3 });
    // đúng ngưỡng: server đã sang pha kế (frac <= hp)
    expect(bossPhase(70, 100, [0.7, 0.4])).toEqual({ n: 2, max: 3 });
    expect(bossPhase(40, 100, [0.7, 0.4])).toEqual({ n: 3, max: 3 });
    expect(bossPhase(30, 100, undefined)).toBeNull();
  });
});
