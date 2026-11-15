import { describe, expect, it } from 'vitest';
import {
  bottleneckBlocked,
  bottleneckReady,
  BOTTLENECK_LEVELS,
  computePlayerStats,
  elemDamageMul,
  initialBottleneck,
  isRootId,
  levelAfterBottleneck,
  playerBaseStats,
  rootChangeCost,
  type RootDef,
  shadowStats,
  xpNeed,
} from './index';

const hoa: RootDef = { id: 'hoa', elem: 'hoa', elemDmg: 0.08, stat: { atkPct: 0.05 } };
const kim: RootDef = { id: 'kim', elem: 'kim', elemDmg: 0.08, stat: { critRate: 0.05 } };

describe('bình cảnh', () => {
  it('chỉ ở tầng 5, 10, 15', () => {
    expect(BOTTLENECK_LEVELS).toEqual([5, 10, 15]);
    for (let l = 1; l <= 18; l++) expect(bottleneckBlocked(l, 0)).toBe(BOTTLENECK_LEVELS.includes(l));
  });
  it('vượt rồi (bk >= tầng) thì không kẹt nữa', () => {
    expect(bottleneckBlocked(5, 5)).toBe(false);
    expect(bottleneckBlocked(10, 5)).toBe(true);
    expect(bottleneckBlocked(15, 10)).toBe(true);
    expect(bottleneckBlocked(15, 15)).toBe(false);
  });
  it('chỉ "sẵn sàng" khi tu vi đầy', () => {
    expect(bottleneckReady(5, 0, xpNeed(5) - 1, xpNeed(5))).toBe(false);
    expect(bottleneckReady(5, 0, xpNeed(5), xpNeed(5))).toBe(true);
    expect(bottleneckReady(6, 5, 99999, xpNeed(6))).toBe(false);
  });
  it('nhân vật cũ: các mốc nhỏ hơn cấp hiện tại coi như đã vượt', () => {
    expect([1, 5, 6, 10, 11, 15, 16, 18].map(initialBottleneck)).toEqual([0, 0, 5, 5, 10, 10, 15, 15]);
  });
  it('vượt tầng 5/10 lên 1 tầng; tầng 15 giữ nguyên (còn độ kiếp)', () => {
    expect(levelAfterBottleneck(5)).toBe(6);
    expect(levelAfterBottleneck(10)).toBe(11);
    expect(levelAfterBottleneck(15)).toBe(15);
  });
  it('bóng tâm ma yếu hơn người chơi nhưng không tầm thường', () => {
    for (const lv of [5, 10, 15]) {
      const b = playerBaseStats(lv);
      const s = shadowStats(lv, b.atk, b.def);
      expect(s.atk).toBeLessThan(b.atk);
      expect(s.def).toBeLessThan(b.def);
      expect(s.hp).toBeGreaterThan(b.atk * 20);
    }
  });
});

describe('linh căn', () => {
  it('nhận diện id', () => {
    expect(isRootId('kim')).toBe(true);
    expect(isRootId('lôi')).toBe(false);
    expect(isRootId(3)).toBe(false);
  });
  it('không có linh căn thì chỉ số như cũ', () => {
    expect(computePlayerStats(7, [])).toEqual(computePlayerStats(7, [], null));
  });
  it('Hỏa: +8% sát thương hệ Hỏa, +5% công kích', () => {
    const base = computePlayerStats(10, []);
    const s = computePlayerStats(10, [], hoa);
    expect(s.elemDmg.hoa).toBeCloseTo(0.08);
    expect(s.atk).toBe(Math.round(playerBaseStats(10).atk * 1.05));
    expect(s.def).toBe(base.def);
  });
  it('Kim: +5% bạo kích trên gốc 10%', () => {
    expect(computePlayerStats(3, [], kim).critRate).toBeCloseTo(0.15);
  });
  it('hệ số sát thương theo hệ', () => {
    expect(elemDamageMul({ kim: 0.08 }, 'kim')).toBeCloseTo(1.08);
    expect(elemDamageMul({ kim: 0.08 }, 'hoa')).toBe(1);
    expect(elemDamageMul({ kim: 0.08 }, undefined)).toBe(1);
  });
  it('phí đổi tăng theo cảnh giới', () => {
    expect(rootChangeCost(15)).toBeGreaterThan(rootChangeCost(1));
  });
});

describe('mã cảnh giới kiểm thử', () => {
  it('nk1…nk15, tc, tc1…tc3 và số cấp', async () => {
    const { parseRealmCode } = await import('./realm');
    expect(parseRealmCode('nk1')).toBe(1);
    expect(parseRealmCode(' NK15 ')).toBe(15);
    expect(parseRealmCode('tc')).toBe(16);
    expect(parseRealmCode('tc1')).toBe(16);
    expect(parseRealmCode('tc3')).toBe(18);
    expect(parseRealmCode('7')).toBe(7);
    expect(parseRealmCode(18)).toBe(18);
    for (const bad of ['', 'nk0', 'nk16', 'tc0', 'tc4', '19', '0', 'kd', 'nk1x', '1e1', 0, 19, 2.5, NaN, null, undefined, {}, []]) expect(parseRealmCode(bad), String(bad)).toBeNull();
  });
});
