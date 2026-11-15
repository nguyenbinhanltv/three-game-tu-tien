import { describe, expect, it } from 'vitest';
import { breakGoal } from './breakGoal';
import { uiScaleFor } from './uiScale';
import { keepMonsterTarget } from '../game/targetRange';

describe('mốc đột phá trên khung nhân vật', () => {
  const c = (level: number, bk: number, full = false) => ({ level, bk, xp: full ? 100 : 40, xpNeed: 100 });

  it('mốc kế là bình cảnh chưa vượt gần nhất, rồi tới độ kiếp', () => {
    expect(breakGoal(c(1, 0))).toEqual({ kind: 'bk', level: 5, ready: false });
    expect(breakGoal(c(5, 0))).toEqual({ kind: 'bk', level: 5, ready: false });
    expect(breakGoal(c(6, 5))).toEqual({ kind: 'bk', level: 10, ready: false });
    expect(breakGoal(c(12, 10))).toEqual({ kind: 'bk', level: 15, ready: false });
    expect(breakGoal(c(15, 15))).toEqual({ kind: 'trib', level: 15, ready: false });
  });

  it('nút sáng khi tu vi đầy đúng ở mốc', () => {
    expect(breakGoal(c(5, 0, true)).ready).toBe(true);
    expect(breakGoal(c(4, 0, true)).ready).toBe(false); // đầy tu vi ở tầng thường thì tự lên tầng, không phải đột phá
    expect(breakGoal(c(15, 10, true))).toEqual({ kind: 'bk', level: 15, ready: true });
    expect(breakGoal(c(15, 15, true))).toEqual({ kind: 'trib', level: 15, ready: true });
  });

  it('Trúc Cơ trở lên: MVP không còn mốc', () => {
    expect(breakGoal(c(16, 15, true))).toEqual({ kind: null, level: 0, ready: false });
  });
});

describe('hệ số phóng UI', () => {
  it('1 tới 1920×1080, phóng theo cạnh hẹp hơn, có trần', () => {
    expect(uiScaleFor(1280, 720)).toBe(1);
    expect(uiScaleFor(1920, 1080)).toBe(1);
    expect(uiScaleFor(2560, 1440)).toBe(1.35);
    expect(uiScaleFor(3840, 2160)).toBe(2);
    expect(uiScaleFor(3440, 1440)).toBe(1.35); // siêu rộng: theo chiều cao
    expect(uiScaleFor(7680, 4320)).toBe(2);
    expect(uiScaleFor(0, 0)).toBe(1);
  });
});

describe('tầm giữ mục tiêu', () => {
  it('quái thường bỏ ở 90 m, boss ở 140 m', () => {
    expect(keepMonsterTarget(30, false)).toBe(true);
    expect(keepMonsterTarget(91, false)).toBe(false);
    expect(keepMonsterTarget(120, true)).toBe(true);
    expect(keepMonsterTarget(448, true)).toBe(false);
    expect(keepMonsterTarget(NaN, true)).toBe(false);
  });
});
