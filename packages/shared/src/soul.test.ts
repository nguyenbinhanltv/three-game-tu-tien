import { describe, expect, it } from 'vitest';
import { FLY_SPEED, STEP, TRUC_CO_FREE_FLY_ALT, freeFlight, stepMove, type MoveCtx, type MoveInput, type MoveState } from './movement';
import { SKY_ALT, SKY_SPEED_MUL, SOUL_ALT, SOUL_RANGE, SOUL_UNLOCK_LEVEL, blinkReplaces, inSkyBand, soulUnlocked } from './soul';
import { VAN_LAM, groundAt } from './terrain';

// E3-K: ngự không (Nguyên Anh, ≤ 30 m, chậm hơn 15%, miễn linh lực) và nguyên anh xuất khiếu (xuyên kiến trúc, giới hạn tầm/độ cao).

const fwd = (yaw: number): MoveInput => ({ s: 0, mx: 0, mz: 1, yaw, f: 2 });
const state = (x: number, z: number, y = groundAt(x, z) + 5): MoveState => ({ x, y, z, vy: 0, grounded: false, flying: true });
const ctx = (extra: Partial<MoveCtx> = {}): MoveCtx => ({ canFly: true, frozen: false, speedMul: 1, ...extra });

describe('ngự không', () => {
  it('mở từ Nguyên Anh; miễn linh lực dưới 30 m (Trúc Cơ chỉ 20 m)', () => {
    expect(soulUnlocked(SOUL_UNLOCK_LEVEL - 1)).toBe(false);
    expect(soulUnlocked(SOUL_UNLOCK_LEVEL)).toBe(true);
    const x = 2040;
    const z = 2040;
    const g = groundAt(x, z);
    expect(freeFlight(18, x, g + 25, z)).toBe(false);
    expect(freeFlight(18, x, g + TRUC_CO_FREE_FLY_ALT - 1, z)).toBe(true);
    expect(freeFlight(SOUL_UNLOCK_LEVEL, x, g + 25, z)).toBe(true);
    expect(freeFlight(SOUL_UNLOCK_LEVEL, x, g + SKY_ALT + 5, z)).toBe(false);
    expect(inSkyBand(SOUL_UNLOCK_LEVEL, g + 10, g)).toBe(true);
    expect(inSkyBand(SOUL_UNLOCK_LEVEL, g + 60, g)).toBe(false);
    expect(inSkyBand(SOUL_UNLOCK_LEVEL - 1, g + 10, g)).toBe(false);
  });

  it('bay trong tầm ngự không chậm hơn ngự kiếm đúng 15%, trên 30 m thì ngự kiếm đủ tốc', () => {
    const run = (s: MoveState, c: MoveCtx) => {
      const x0 = s.x;
      for (let i = 0; i < 20; i++) stepMove(s, fwd(-Math.PI / 2), c);
      return (s.x - x0) / (20 * STEP);
    };
    const low = state(2040, 2040);
    const sword = run({ ...low }, ctx());
    const sky = run({ ...low }, ctx({ sky: true }));
    expect(sword).toBeCloseTo(FLY_SPEED, 1);
    expect(sky / sword).toBeCloseTo(SKY_SPEED_MUL, 2);
    const high = state(2040, 2040, groundAt(2040, 2040) + SKY_ALT + 20);
    expect(run({ ...high }, ctx({ sky: true })) / sword).toBeCloseTo(1, 2);
  });
});

describe('nguyên anh xuất khiếu (ghost)', () => {
  const col = VAN_LAM.colliders.find((c) => c.r >= 2 && c.r <= 8) ?? VAN_LAM.colliders[0];

  it('xuyên kiến trúc; người thường bị đẩy ra ngoài vòng va chạm', () => {
    const start = (): MoveState => state(col.x - col.r - 3, col.z, groundAt(col.x, col.z) + 2);
    const walk = (c: MoveCtx) => {
      const s = start();
      let min = Infinity;
      for (let i = 0; i < 40; i++) {
        stepMove(s, fwd(-Math.PI / 2), c);
        min = Math.min(min, Math.hypot(s.x - col.x, s.z - col.z));
      }
      return min;
    };
    expect(walk(ctx())).toBeGreaterThanOrEqual(col.r + 0.5 - 1e-6);
    expect(walk(ctx({ ghost: { x: col.x - col.r - 3, z: col.z, r: SOUL_RANGE } }))).toBeLessThan(col.r);
  });

  it('không rời thân xác quá SOUL_RANGE và không cao quá SOUL_ALT, dù bấm bay lên và không bấm bay', () => {
    const bx = 2040;
    const bz = 2040;
    const s = state(bx, bz, groundAt(bx, bz) + 1);
    const c = ctx({ canFly: false, ghost: { x: bx, z: bz, r: SOUL_RANGE } });
    for (let i = 0; i < 400; i++) stepMove(s, { s: 0, mx: 0, mz: 1, yaw: -Math.PI / 2, f: 4 }, c);
    expect(Math.hypot(s.x - bx, s.z - bz)).toBeLessThanOrEqual(SOUL_RANGE + 1e-6);
    expect(s.flying).toBe(true);
    expect(s.y - groundAt(s.x, s.z)).toBeLessThanOrEqual(SOUL_ALT + 1e-6);
  });

  it('thuấn di thay Lướt cơ bản từ Nguyên Anh; chiêu xuyên/đẩy giữ nguyên', () => {
    expect(blinkReplaces(SOUL_UNLOCK_LEVEL, {})).toBe(true);
    expect(blinkReplaces(SOUL_UNLOCK_LEVEL - 1, {})).toBe(false);
    expect(blinkReplaces(SOUL_UNLOCK_LEVEL, { pierce: { r: 2 } })).toBe(false);
    expect(blinkReplaces(SOUL_UNLOCK_LEVEL, { push: 6 })).toBe(false);
  });
});
