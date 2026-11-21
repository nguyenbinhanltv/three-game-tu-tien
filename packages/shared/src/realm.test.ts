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
  MAX_LEVEL,
  monsterStats,
  PEAK_LEVELS,
  playerBaseStats,
  realmMul,
  majorRealmOf,
  realmStageOf,
  rootChangeCost,
  type RootDef,
  shadowStats,
  xpNeed,
} from './index';

const hoa: RootDef = { id: 'hoa', group: 'real', elem: 'hoa', elemDmg: 0.08, stat: { atkPct: 0.05 }, color: 'ffffff' };
const kim: RootDef = { id: 'kim', group: 'real', elem: 'kim', elemDmg: 0.08, stat: { critRate: 0.05 }, color: 'ffffff' };

describe('bình cảnh', () => {
  it('ở Ngưng Khí 5/10/15 và hai nút mỗi đại cảnh giới sau đó (17, 19, 21, 23, 25, 27)', () => {
    expect(BOTTLENECK_LEVELS).toEqual([5, 10, 15, 17, 19, 21, 23, 25, 27, 29, 31, 33, 35, 37, 39, 41, 43]);
    expect(PEAK_LEVELS).toEqual([15, 19, 23, 27, 31, 35, 39, 43]);
    for (let l = 1; l <= MAX_LEVEL; l++) expect(bottleneckBlocked(l, 0)).toBe(BOTTLENECK_LEVELS.includes(l));
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
    expect([1, 5, 6, 10, 11, 15, 16, 17, 18, 19, 20, 28].map(initialBottleneck)).toEqual([0, 0, 5, 5, 10, 10, 15, 15, 17, 17, 19, 27]);
  });
  it('vượt tầng 5/10 lên 1 tầng; tầng 15 giữ nguyên (còn độ kiếp)', () => {
    expect(levelAfterBottleneck(5)).toBe(6);
    expect(levelAfterBottleneck(10)).toBe(11);
    expect(levelAfterBottleneck(15)).toBe(15);
  });
  it('Trúc Cơ → Nguyên Anh: nút trung kỳ lên 1 cấp, đại viên mãn giữ nguyên (còn độ kiếp)', () => {
    for (const l of [17, 21, 25]) expect(levelAfterBottleneck(l)).toBe(l + 1);
    for (const l of [19, 23, 27, MAX_LEVEL]) expect(levelAfterBottleneck(l)).toBe(l);
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
    expect(isRootId('loi')).toBe(true);
    expect(isRootId('lôi')).toBe(false);
    expect(isRootId('sinh_tu')).toBe(false);
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
  it('nk1…nk15, tc/kd/na/ht, tc1…tc4 và số cấp', async () => {
    const { parseRealmCode } = await import('./realm');
    expect(parseRealmCode('nk1')).toBe(1);
    expect(parseRealmCode(' NK15 ')).toBe(15);
    expect(parseRealmCode('tc')).toBe(16);
    expect(parseRealmCode('ab4')).toBe(35);
    expect(parseRealmCode('vd')).toBe(36);
    expect(parseRealmCode('ah4')).toBe(43);
    expect(parseRealmCode('dt')).toBe(44);
    expect(parseRealmCode('tc1')).toBe(16);
    expect(parseRealmCode('tc3')).toBe(18);
    expect(parseRealmCode('tc4')).toBe(19);
    expect(parseRealmCode('kd')).toBe(20);
    expect(parseRealmCode('kd4')).toBe(23);
    expect(parseRealmCode('na1')).toBe(24);
    expect(parseRealmCode('na4')).toBe(27);
    expect(parseRealmCode('ht')).toBe(28);
    expect(parseRealmCode('7')).toBe(7);
    expect(parseRealmCode('28')).toBe(28);
    expect(parseRealmCode(28)).toBe(28);
    for (const bad of [
      '',
      'nk0',
      'nk16',
      'tc0',
      'tc5',
      'kd5',
      'na5',
      'ht5',
      'ab5',
      'vd5',
      'ah5',
      'dt2',
      'tc10',
      '45',
      '0',
      'nk1x',
      '1e1',
      0,
      45,
      2.5,
      NaN,
      null,
      undefined,
      {},
      [],
    ])
      expect(parseRealmCode(bad), String(bad)).toBeNull();
  });
});

describe('thang 28 cấp (E1-C)', () => {
  const sum = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => xpNeed(a + i)).reduce((x, y) => x + y, 0);
  it('xpNeed khớp bảng thiết kế, tích lũy 242k / 439k / 686k', () => {
    expect(MAX_LEVEL).toBe(44);
    expect([16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27].map(xpNeed)).toEqual([
      56000, 59000, 62000, 65000, 102500, 107500, 112000, 117000, 162000, 168500, 174500, 181000,
    ]);
    expect(sum(16, 19)).toBe(242_000);
    expect(sum(20, 23)).toBe(439_000);
    expect(sum(24, 27)).toBe(686_000);
    expect(xpNeed(44)).toBe(99_999_999);
    // Chương 6 (TN-3): Anh Biến 32–35 ~2 giờ, Vấn Đỉnh 36–39 và Âm Hư 40–43 ~5 giờ mỗi đại cảnh giới (thu nhập 450·(12+7L)/giờ).
    expect([32, 33, 34, 35].map(xpNeed)).toEqual([53000, 54500, 56000, 58000]);
    expect(sum(36, 39)).toBe(618_000);
    expect(sum(40, 43)).toBe(680_500);
    expect([28, 29, 30, 31].map(xpNeed)).toEqual([234000, 242000, 250000, 257500]);
    expect(sum(28, 31)).toBe(983_500);
    expect(realmMul(32)).toBe(7.8);
    expect([35, 36, 39, 40, 43, 44].map(realmMul)).toEqual([7.8, 11, 11, 15.5, 15.5, 22]);
    expect([32, 35, 36, 40, 44].map(majorRealmOf)).toEqual([5, 5, 6, 7, 8]);
    expect(xpNeed(15)).toBe(90 * 15 * 15);
  });
  it('hệ số cảnh giới 1 / 1,6 / 2,5 / 3,8 / 5,5 và đại cảnh giới', () => {
    expect([1, 15, 16, 19, 20, 23, 24, 27, 28].map(realmMul)).toEqual([1, 1, 1.6, 1.6, 2.5, 2.5, 3.8, 3.8, 5.5]);
    expect([15, 16, 19, 20, 23, 24, 27, 28].map(majorRealmOf)).toEqual([0, 1, 1, 2, 2, 3, 3, 4]);
    expect([1, 12, 15, 16, 19, 20, 24, 28].map(realmStageOf)).toEqual([1, 12, 15, 1, 4, 1, 1, 1]);
  });
  it('chỉ số người chơi khớp bảng 2.3', () => {
    const row = (l: number) => {
      const b = playerBaseStats(l);
      return [b.hp, b.mp, b.atk, b.def];
    };
    expect(row(16)).toEqual([1008, 464, 120, 43]);
    expect(row(19)).toEqual([1171, 531, 140, 51]);
    expect(row(20)).toEqual([1915, 865, 230, 84]);
    expect(row(23)).toEqual([2170, 970, 261, 96]);
    expect(row(24)).toEqual([3428, 1528, 413, 151]);
    expect(row(27)).toEqual([3815, 1687, 461, 169]);
    expect(row(28)).toEqual([5709, 2519, 690, 254]);
  });
  it('quái nhân cùng hệ số: hp/atk nhảy theo cảnh giới, def không đổi, cấp ≤ 15 không đổi', () => {
    const m15 = monsterStats(15, 1, 1);
    expect(m15.hp).toBe(60 + 42 * 15);
    const a = monsterStats(19, 1, 1);
    const b = monsterStats(20, 1, 1);
    expect(b.hp / (60 + 42 * 20)).toBeCloseTo(2.5, 2);
    expect(a.hp / (60 + 42 * 19)).toBeCloseTo(1.6, 2);
    expect(b.atk / (7 + 3.4 * 20)).toBeCloseTo(2.5, 1);
    expect(b.def).toBe(Math.round(1 + 1.3 * 20));
  });
});
