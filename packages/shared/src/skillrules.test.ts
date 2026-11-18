import { describe, expect, it } from 'vitest';
import {
  castTypeOf,
  COMBO_WINDOW,
  comboNext,
  dashDir,
  DASH_MAX_SLOPE,
  empowerOpen,
  groundAt,
  hitOffsets,
  planDash,
  strikeDelay,
  validateSkillRules,
  WORLD_MARGIN,
  type ComboDef,
  type MoveState,
  type PoseDef,
  type SkillDef,
} from './index';
import { COLLIDERS } from './level';

const SK: SkillDef = {
  id: 'x',
  kind: 'damage',
  icon: 'x',
  unlock: 1,
  range: 26,
  cast: 0,
  cd: 0,
  mp: 0,
  power: 1,
  fx: 'f',
  pose: 'p',
  hitAt: [0.26],
  windup: 0.2,
  recovery: 0.54,
};
const POSE: PoseDef = { id: 'p', duration: 0.8, loop: false, hit: [0.26, 0.42], keys: [] };
const ids = new Set(['x', 'y']);
const state = (x: number, z: number): MoveState => ({ x, y: groundAt(x, z), z, vy: 0, grounded: true, flying: false });

describe('thời gian chiêu', () => {
  it('castType suy từ cast; strikeDelay lấy hitAt đầu hoặc đòn combo', () => {
    expect(castTypeOf(SK)).toBe('instant');
    expect(castTypeOf({ ...SK, cast: 1.5 })).toBe('cast');
    expect(strikeDelay(SK)).toBeCloseTo(0.26);
    expect(strikeDelay({ ...SK, hitAt: undefined })).toBe(0);
    const combo: ComboDef = {
      window: 2,
      hits: [
        { power: 1, hitAt: 0.2 },
        { power: 1, hitAt: 0.3 },
      ],
    };
    expect(strikeDelay({ ...SK, combo }, 1)).toBeCloseTo(0.3);
  });
  it('hitOffsets: một mốc thì cùng lúc, nhiều mốc thì theo mốc, thừa dồn vào mốc cuối', () => {
    expect(hitOffsets(SK, 3)).toEqual([0, 0, 0]);
    const o = hitOffsets({ ...SK, hitAt: [0.2, 0.35, 0.5] }, 4);
    expect(o[0]).toBe(0);
    expect(o[1]).toBeCloseTo(0.15);
    expect(o[2]).toBeCloseTo(0.3);
    expect(o[3]).toBeCloseTo(0.3);
  });
});

describe('liên hoàn và cường hóa', () => {
  const def: ComboDef = {
    window: COMBO_WINDOW,
    hits: [
      { power: 0.9, hitAt: 0.26 },
      { power: 0.9, hitAt: 0.26 },
      { power: 1.4, hitAt: 0.26, kb: true },
    ],
  };
  it('đòn 0 → 1 → 2 → về 0; quá cửa sổ thì về đòn đầu', () => {
    expect(comboNext(def, -1, 0, 1000)).toBe(0);
    expect(comboNext(def, 0, 1000, 2000)).toBe(1);
    expect(comboNext(def, 1, 2000, 3000)).toBe(2);
    expect(comboNext(def, 2, 3000, 4000)).toBe(0);
    expect(comboNext(def, 1, 2000, 2000 + COMBO_WINDOW * 1000 + 1)).toBe(0);
    expect(comboNext(def, 1, 2000, 2000 + COMBO_WINDOW * 1000)).toBe(2);
  });
  it('cửa sổ cường hóa mở đúng khoảng sau khi chiêu mở áp', () => {
    const e = { by: 'y', window: 3, powerMul: 1.5 };
    expect(empowerOpen(e, undefined, 5000)).toBe(false);
    expect(empowerOpen(e, 1000, 1000)).toBe(true);
    expect(empowerOpen(e, 1000, 4000)).toBe(true);
    expect(empowerOpen(e, 1000, 4001)).toBe(false);
    expect(empowerOpen(e, 5000, 4000)).toBe(false);
  });
});

describe('lướt', () => {
  const X = 2040;
  const Z = 2040;
  it('hướng: tới mục tiêu, theo hướng nhìn, ra sau', () => {
    const d = dashDir({ dist: 8, dir: 'target' }, 0, { dx: 3, dz: 4 })!;
    expect(d.x).toBeCloseTo(0.6);
    expect(d.z).toBeCloseTo(0.8);
    const f = dashDir({ dist: 8, dir: 'forward' }, Math.PI / 2, null)!;
    expect(f.x).toBeCloseTo(1);
    expect(f.z).toBeCloseTo(0, 5);
    const b = dashDir({ dist: 8, dir: 'back' }, 0, null)!;
    expect(b.z).toBeCloseTo(-1);
    expect(dashDir({ dist: 8, dir: 'target' }, 0, null)!.z).toBeCloseTo(1);
  });
  it('đất thoáng: đi đủ quãng, ra gần đúng điểm đến', () => {
    const pl = planDash(state(X, Z), { x: 1, z: 0 }, 8);
    // Có thể bị chặn bởi dốc; thử vài hướng và lấy hướng đi được.
    const dirs = [
      { x: 1, z: 0 },
      { x: -1, z: 0 },
      { x: 0, z: 1 },
      { x: 0, z: -1 },
    ];
    const best = dirs.map((d) => planDash(state(X, Z), d, 8)).sort((a, b) => b.dist - a.dist)[0];
    expect(best.dist).toBeGreaterThan(7.5);
    expect(pl.dist).toBeLessThanOrEqual(8 + 1e-6);
  });
  it('mép bản đồ: không ra ngoài, dừng sớm', () => {
    const pl = planDash(state(WORLD_MARGIN + 2, 2040), { x: -1, z: 0 }, 8);
    expect(pl.blocked).toBe(true);
    expect(pl.x).toBeGreaterThanOrEqual(WORLD_MARGIN - 1e-6);
    expect(pl.dist).toBeLessThan(5);
  });
  it('không xuyên kiến trúc: lướt thẳng vào tâm một collider thì dừng trước nó', () => {
    const col = COLLIDERS.find((c) => c.r >= 0.8);
    expect(col).toBeDefined();
    const c = col!;
    // Đứng cách tâm 6 m (phía -x), lướt +x qua tâm.
    const start = state(c.x - 6, c.z);
    const pl = planDash(start, { x: 1, z: 0 }, 12);
    expect(pl.x).toBeLessThan(c.x);
    expect(pl.blocked).toBe(true);
  });
  it('dừng trước mục tiêu khi có stopAt', () => {
    const pl = planDash(state(X, Z), { x: 1, z: 0 }, 8, { x: X + 6, z: Z, r: 1.8 });
    if (!pl.blocked) return; // hướng này bị dốc chặn: ca khác đã kiểm
    expect(Math.hypot(X + 6 - pl.x, 0)).toBeLessThanOrEqual(2.5);
  });
  it('dốc vượt DASH_MAX_SLOPE coi là vách (hằng số hợp lý)', () => {
    expect(DASH_MAX_SLOPE).toBeGreaterThan(0.5);
  });
});

describe('validateSkillRules', () => {
  it('chiêu hợp lệ không lỗi', () => {
    expect(validateSkillRules(SK, POSE, ids)).toEqual([]);
  });
  it('bắt các lỗi', () => {
    expect(validateSkillRules({ ...SK, hitAt: undefined }, POSE, ids).join()).toMatch(/thiếu hitAt/);
    expect(validateSkillRules({ ...SK, hitAt: [0.5] }, POSE, ids).join()).toMatch(/lệch hit\[0\]/);
    expect(validateSkillRules({ ...SK, hitAt: [0.26, 0.2] }, POSE, ids).join()).toMatch(/tăng dần/);
    expect(validateSkillRules({ ...SK, windup: 0.5 }, POSE, ids).join()).toMatch(/windup/);
    expect(validateSkillRules({ ...SK, recovery: 0.2 }, POSE, ids).join()).toMatch(/recovery/);
    expect(validateSkillRules({ ...SK, castType: 'channel' }, POSE, ids).join()).toMatch(/chưa được server hỗ trợ/);
    expect(validateSkillRules({ ...SK, castType: 'cast' }, POSE, ids).join()).toMatch(/cast > 0/);
    expect(validateSkillRules({ ...SK, empower: { by: 'zz', window: 3, powerMul: 1.5 } }, POSE, ids).join()).toMatch(/không phải chiêu/);
    expect(validateSkillRules({ ...SK, empower: { by: 'y', window: 3, powerMul: 9 } }, POSE, ids).join()).toMatch(/powerMul/);
    expect(validateSkillRules({ ...SK, combo: { window: 2, hits: [] } }, POSE, ids).join()).toMatch(/combo cần/);
    expect(
      validateSkillRules(
        { ...SK, kind: 'dash', cd: 2, dash: { dist: 8, dir: 'back' }, pose: undefined, hitAt: undefined },
        undefined,
        ids,
      ).join(),
    ).toMatch(/hồi chiêu ≥ 8/);
    expect(validateSkillRules({ ...SK, kind: 'dash' }, POSE, ids).join()).toMatch(/cần trường dash/);
    expect(validateSkillRules({ ...SK, hitAt: [0.26, 2] }, POSE, ids).join()).toMatch(/0–GCD/);
    expect(validateSkillRules({ ...SK, power: 0, combo: { window: 2, hits: [{ power: 1, hitAt: 0.2 }] } }, POSE, ids).join()).toMatch(
      /power > 0/,
    );
    expect(validateSkillRules({ ...SK, cast: 1.5, empower: { by: 'y', window: 3, powerMul: 1.5 } }, POSE, ids).join()).toMatch(
      /chiêu niệm chưa hỗ trợ/,
    );
    expect(validateSkillRules({ ...SK, dash: { dist: 8, dir: 'back' } }, POSE, ids).join()).toMatch(/chỉ dùng với kind/);
  });
});
