import { describe, expect, it } from 'vitest';
import {
  armorOpen,
  armorTakeMul,
  burrowSpots,
  resistMul,
  chargeEnd,
  coneGeom,
  facePhase,
  faceTakeMul,
  inHazard,
  leapPos,
  LEAP_AIR,
  lineGeom,
  monSkillsOf,
  reflectPhase,
  reflectSplit,
  reflectWindow,
  revealMul,
  summonRoom,
  summonSpots,
  SUMMON_ROOM_MAX,
} from './index';

describe('monskill (hàm thuần quái mở rộng)', () => {
  it('lineGeom/coneGeom khớp inHazard: trong vạch trúng, ngoài bề ngang/sau lưng/quá dài thì không', () => {
    const l = lineGeom(0, 0, 0, 10, 2);
    expect(inHazard(l, 0.9, 5)).toBe(true);
    expect(inHazard(l, 1.2, 5)).toBe(false);
    expect(inHazard(l, 0, -1)).toBe(false);
    expect(inHazard(l, 0, 10.5)).toBe(false);
    const c = coneGeom(0, 0, 0, 10, 30);
    expect(inHazard(c, 2, 8)).toBe(true);
    expect(inHazard(c, 8, 2)).toBe(false);
  });

  it('chargeEnd dừng ở bước trước khi gặp chỗ không đi được', () => {
    expect(chargeEnd(0, 0, 0, 10, () => true).len).toBe(10);
    const r = chargeEnd(0, 0, 0, 10, (_x, z) => z < 4.2);
    expect(r.len).toBe(4);
    expect(r.z).toBeCloseTo(4);
    expect(chargeEnd(0, 0, 0, 10, () => false).len).toBe(0);
  });

  it('leapPos đứng yên tới LEAP_AIR cuối rồi bay thẳng, tới đúng at', () => {
    const at = 5000;
    expect(leapPos(0, 0, 10, 0, at, at - LEAP_AIR * 1000 - 500)).toMatchObject({ x: 0, k: 0 });
    expect(leapPos(0, 0, 10, 0, at, at - (LEAP_AIR * 1000) / 2).x).toBeCloseTo(5);
    expect(leapPos(0, 0, 10, 0, at, at + 100)).toMatchObject({ x: 10, k: 1 });
  });

  it('burrowSpots cách tâm đúng spread, thử xoay khi chỗ xấu, hết cách thì về tâm', () => {
    const s = burrowSpots(0, 0, 3, 5, 0, () => true);
    expect(s).toHaveLength(3);
    for (const p of s) expect(Math.hypot(p.x, p.z)).toBeCloseTo(5);
    const bad = burrowSpots(0, 0, 2, 5, 0, () => false);
    expect(bad).toEqual([
      { x: 0, z: 0 },
      { x: 0, z: 0 },
    ]);
  });

  it('reflect: warn → on → off; phản bị chặn bởi cap, quái nhận take', () => {
    const cfg = { cd: 10, warn: 1, dur: 2, ratio: 0.5, cap: 0.1, take: 0.25 };
    const w = reflectWindow(cfg, 1000);
    expect(reflectPhase(cfg, null, 1000)).toBe('off');
    expect(reflectPhase(cfg, w, 1500)).toBe('warn');
    expect(reflectPhase(cfg, w, 2000)).toBe('on');
    expect(reflectPhase(cfg, w, 4000)).toBe('off');
    expect(reflectSplit(cfg, 100, 1000)).toEqual({ taken: 25, back: 50 });
    expect(reflectSplit(cfg, 10_000, 1000)).toEqual({ taken: 2500, back: 100 });
  });

  it('revealMul, summonRoom, summonSpots, monSkillsOf', () => {
    expect(revealMul(undefined, false)).toBe(1);
    expect(revealMul({ cd: 8, dur: 2, mul: 1.5, guard: 0.6 }, true)).toBe(1.5);
    expect(revealMul({ cd: 8, dur: 2, mul: 1.5, guard: 0.6 }, false)).toBe(0.6);
    expect(revealMul({ cd: 8, dur: 2, mul: 1.5 }, false)).toBe(1);
    expect(summonRoom(1, 2, 3, 0)).toBe(2);
    expect(summonRoom(2, 2, 3, 0)).toBe(1);
    expect(summonRoom(3, 2, 3, 0)).toBe(0);
    expect(summonRoom(0, 4, 8, SUMMON_ROOM_MAX - 1)).toBe(1);
    const sp = summonSpots(10, 10, 4, 3, 0);
    expect(sp).toHaveLength(4);
    for (const p of sp) expect(Math.hypot(p.x - 10, p.z - 10)).toBeCloseTo(3);
    expect(monSkillsOf({ combo: { chance: 1, delay: 1, mul: 1 }, reveal: { cd: 8, dur: 2, mul: 1.5 } })).toEqual(['reveal']);
  });
});

describe('facePhase: hai mặt Âm/Dương', () => {
  const cfg = { duong: 14, am: 8, warn: 2, take: 0 };
  const T = 5_000;

  it('mặt Dương trước, rồi Âm, lặp theo chu kỳ 22 giây', () => {
    expect(facePhase(cfg, T, T).face).toBe('duong');
    expect(facePhase(cfg, T, T + 13_999).face).toBe('duong');
    expect(facePhase(cfg, T, T + 14_000).face).toBe('am');
    expect(facePhase(cfg, T, T + 21_999).face).toBe('am');
    expect(facePhase(cfg, T, T + 22_000).face).toBe('duong');
    expect(facePhase(cfg, T, T + 22_000 + 14_000).face).toBe('am');
  });

  it('lượt lật (turn) tăng đúng một ở mỗi lần lật; flipAt và left khớp', () => {
    const a = facePhase(cfg, T, T + 3_000);
    expect(a).toMatchObject({ turn: 0, flipAt: T + 14_000, warning: false });
    expect(a.left).toBeCloseTo(11, 5);
    expect(facePhase(cfg, T, T + 14_000).turn).toBe(1);
    expect(facePhase(cfg, T, T + 22_000).turn).toBe(2);
    expect(facePhase(cfg, T, T + 22_000 * 5 + 15_000).turn).toBe(11);
  });

  it('báo trước trong `warn` giây cuối của mỗi mặt', () => {
    expect(facePhase(cfg, T, T + 11_999).warning).toBe(false);
    expect(facePhase(cfg, T, T + 12_000).warning).toBe(true);
    expect(facePhase(cfg, T, T + 13_999).warning).toBe(true);
    expect(facePhase(cfg, T, T + 14_000).warning).toBe(false);
    expect(facePhase(cfg, T, T + 20_000).warning).toBe(true);
  });

  it('đồng hồ chưa tới lúc bắt đầu thì coi như 0 giây', () => {
    expect(facePhase(cfg, T, T - 500)).toMatchObject({ face: 'duong', turn: 0 });
  });

  it('faceTakeMul: Dương nhận đủ, Âm nhận `take`', () => {
    expect(faceTakeMul(cfg, 'duong')).toBe(1);
    expect(faceTakeMul(cfg, 'am')).toBe(0);
    expect(faceTakeMul({ ...cfg, take: 0.1 }, 'am')).toBe(0.1);
  });
});

describe('giáp phá và kháng nguồn (TN-7)', () => {
  const armor = { cycle: 30, window: 8, take: 0.15 };
  it('armorTakeMul: giáp còn ở đầu chu kỳ, vỡ ở cửa sổ cuối, lặp lại mỗi chu kỳ', () => {
    expect(armorTakeMul(armor, 0)).toBe(0.15);
    expect(armorTakeMul(armor, 21_999)).toBe(0.15);
    expect(armorTakeMul(armor, 22_000)).toBe(1);
    expect(armorTakeMul(armor, 29_999)).toBe(1);
    expect(armorTakeMul(armor, 30_000)).toBe(0.15);
    expect(armorOpen(armor, 52_000)).toBe(true);
    expect(armorTakeMul(armor, -5)).toBe(0.15);
  });
  const rs = { forms: ['kim', 'thuy', 'hoa'], same: 0.35, counter: 1.5 };
  it('resistMul: cùng hệ giảm, khắc hệ tăng, còn lại nguyên; hình thái ngoài khoảng kẹp về đầu/cuối', () => {
    expect(resistMul(rs, 0, 'kim')).toBe(0.35);
    expect(resistMul(rs, 0, 'hoa')).toBe(1.5);
    expect(resistMul(rs, 0, 'moc')).toBe(1);
    expect(resistMul(rs, 0, undefined)).toBe(1);
    expect(resistMul(rs, 9, 'hoa')).toBe(0.35);
    expect(resistMul(rs, -1, 'kim')).toBe(0.35);
  });
});
