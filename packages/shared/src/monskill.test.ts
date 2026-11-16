import { describe, expect, it } from 'vitest';
import { burrowSpots, chargeEnd, coneGeom, inHazard, leapPos, LEAP_AIR, lineGeom, monSkillsOf, reflectPhase, reflectSplit, reflectWindow, revealMul, summonRoom, summonSpots, SUMMON_ROOM_MAX } from './index';

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
    expect(bad).toEqual([{ x: 0, z: 0 }, { x: 0, z: 0 }]);
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
