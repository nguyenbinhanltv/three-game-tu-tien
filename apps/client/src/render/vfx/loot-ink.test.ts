import { describe, expect, it } from 'vitest';
import { ITEMS } from '@dtl/content';
import { FxPool } from '../materials/vfx';
import { INK_DEATH, INK_HIT, inkEvict, inkPhase, MAX_INK } from './ink';
import { gearLootTier, lootColor, lootPulse, BEAM_GEO, LOOT_ARC, LOOT_BOUNCE, LOOT_TIERS, lootDuration, lootHop, lootTier } from './loot';
import { SIGIL_GEO } from './sigil';
import { bellPartials } from '../../game/audio/lootBell';
import { flyPoint } from '../../game/fx/lootFly';

describe('lootTier (M4-6)', () => {
  it('ba bậc theo rarity, rarity 2 và 3 cùng bậc cao nhất', () => {
    expect(lootTier(0)).toBe(0);
    expect(lootTier(undefined)).toBe(0);
    expect(lootTier(1)).toBe(1);
    expect(lootTier(2)).toBe(2);
    expect(lootTier(3)).toBe(2);
  });
  it('mọi vật phẩm trong dữ liệu đều ra một bậc hợp lệ', () => {
    for (const it of ITEMS) expect([0, 1, 2]).toContain(lootTier(it.rarity));
  });
  it('bậc cao hơn: cột cao hơn, rộng hơn, đậm hơn, nằm lâu hơn; màu khác nhau', () => {
    for (let i = 1; i < 6; i++) {
      const a = LOOT_TIERS[i - 1]!;
      const b = LOOT_TIERS[i]!;
      expect(b.height).toBeGreaterThan(a.height);
      // Địa/Thiên phẩm cột hẹp hơn bậc 2 để không chiếm quá 5% khung hình; chỉ bậc 0..2 rộng dần.
      if (i <= 2) expect(b.radius).toBeGreaterThan(a.radius);
      if (i <= 2 || i >= 4) expect(b.alpha).toBeGreaterThan(a.alpha);
      expect(b.hold).toBeGreaterThan(a.hold);
    }
    expect(new Set(LOOT_TIERS.map((t) => t.color)).size).toBe(6);
    // Đồ quý dùng kim quang `spirit_gold` (art bible), không tím.
    expect(LOOT_TIERS[2]!.color).toBe(0xffde96);
  });
});

describe('trang bị theo phẩm (3-2)', () => {
  it('phẩm 0..5 ra bậc 0..5, ngoài khoảng bị chặn', () => {
    expect([0, 1, 2, 3, 4, 5].map(gearLootTier)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(gearLootTier(9)).toBe(5);
    expect(gearLootTier(-1)).toBe(0);
  });
  it('Huyền phẩm lam, Địa tử kim, Thiên vàng kim, Thần hồng ngọc; mỗi phẩm một màu', () => {
    const cols = [0, 1, 2, 3, 4, 5].map((q) => lootColor(gearLootTier(q), q));
    expect(new Set(cols).size).toBe(6);
    expect(cols[2]).toBe(0x6fb4f0);
  });
  it('Thiên phẩm cao xuyên trời (>= 25 m) và xung nhịp; Địa phẩm giữ cột hẹp (ngân sách khung hình)', () => {
    expect(LOOT_TIERS[4]!.height).toBeGreaterThanOrEqual(25);
    expect(LOOT_TIERS[3]!.radius).toBeLessThan(0.6);
    const vals = Array.from({ length: 40 }, (_, i) => lootPulse(4, i * 0.1));
    expect(Math.max(...vals) - Math.min(...vals)).toBeGreaterThan(0.2);
    expect(lootPulse(3, 1.234)).toBe(1);
  });
});

describe('lootHop', () => {
  it('vồng lên rồi chạm đất ở LOOT_ARC, nảy thấp hơn rồi nằm yên', () => {
    expect(lootHop(0)).toBe(0);
    expect(lootHop(LOOT_ARC / 2)).toBeCloseTo(1.6);
    expect(lootHop(LOOT_ARC)).toBeCloseTo(0);
    const bounce = lootHop(LOOT_ARC + LOOT_BOUNCE / 2);
    expect(bounce).toBeGreaterThan(0);
    expect(bounce).toBeLessThan(0.5);
    expect(lootHop(LOOT_ARC + LOOT_BOUNCE + 0.01)).toBe(0);
  });
  it('thời lượng đủ cho nảy + nằm + tan cột', () => {
    for (const t of [0, 1, 2, 3, 4, 5] as const) expect(lootDuration(t)).toBeGreaterThan(LOOT_ARC + LOOT_BOUNCE + LOOT_TIERS[t]!.hold);
  });
});

describe('vết mực (M4-14)', () => {
  it('loang hết trong thời gian spread, chưa tan tới fadeAt, tan hết ở cuối', () => {
    expect(inkPhase(0, INK_DEATH).spread).toBe(0);
    expect(inkPhase(INK_DEATH.spread, INK_DEATH).spread).toBe(1);
    expect(inkPhase(INK_DEATH.fadeAt, INK_DEATH).dissolve).toBe(0);
    expect(inkPhase(INK_DEATH.dur, INK_DEATH).dissolve).toBe(1);
    const mid = inkPhase((INK_HIT.fadeAt + INK_HIT.dur) / 2, INK_HIT).dissolve;
    expect(mid).toBeGreaterThan(0.4);
    expect(mid).toBeLessThan(0.6);
  });
  it('vượt giới hạn thì chọn vết cũ nhất chưa bị ép tan', () => {
    const ages = Array.from({ length: MAX_INK }, (_, i) => i);
    const forced = ages.map(() => false);
    expect(inkEvict(ages, forced)).toBe(MAX_INK - 1);
    forced[MAX_INK - 1] = true;
    // Còn MAX_INK - 1 vết sống: chưa phải ép thêm.
    expect(inkEvict(ages, forced)).toBe(-1);
    ages.push(100);
    forced.push(false);
    expect(inkEvict(ages, forced)).toBe(MAX_INK);
    expect(inkEvict([], [])).toBe(-1);
  });
});

describe('FxPool với cột sáng và vết mực', () => {
  it('đổi kiểu qua lại không tạo lưới mới, tái dùng material dùng chung', () => {
    const pool = new FxPool(2);
    const a = pool.acquire(BEAM_GEO, 'beam', 0xffde96, 0.7);
    const b = pool.acquire(SIGIL_GEO, 'inkpool', 0x1d2424, 0.8);
    const beamMat = a.material;
    pool.release(a);
    pool.release(b);
    const c = pool.acquire(SIGIL_GEO, 'inkpool', 0x1d2424, 0.8);
    const d = pool.acquire(BEAM_GEO, 'beam', 0x7fe3d0, 0.6);
    expect(pool.created).toBe(2);
    expect(d.material).toBe(beamMat);
    expect(c.material).not.toBe(beamMat);
  });
});

describe('chuông đồ rơi', () => {
  it('bậc cao: nhiều bồi âm hơn, ngân lâu hơn, chuông trầm hơn', () => {
    const p = [0, 1, 2, 3, 4, 5].map((t) => bellPartials(t as 0 | 1 | 2 | 3 | 4 | 5));
    expect(p[1]!.length).toBeGreaterThan(p[0]!.length);
    expect(p[2]!.length).toBeGreaterThan(p[1]!.length);
    expect(p[4]!.length).toBeGreaterThan(p[3]!.length);
    expect(p[5]!.length).toBeGreaterThan(p[4]!.length);
    const longest = p.map((x) => Math.max(...x.map((q) => q.dur)));
    for (let i = 1; i < 6; i++) expect(longest[i]).toBeGreaterThan(longest[i - 1]!);
    // Bồi âm không hài hòa (có tỉ lệ không nguyên) như chuông thật.
    const base = p[2]![1]!.freq;
    expect(p[2]!.some((q) => Math.abs(q.freq / base - Math.round(q.freq / base)) > 0.1)).toBe(true);
    for (const x of p) for (const q of x) expect(q.gain).toBeLessThanOrEqual(0.3);
  });
});

describe('flyPoint', () => {
  it('đi từ điểm đầu tới nút túi, vồng lên giữa đường', () => {
    const o = { x: 0, y: 0 };
    flyPoint(0, 100, 400, 900, 700, 110, o);
    expect(o).toEqual({ x: 100, y: 400 });
    flyPoint(1, 100, 400, 900, 700, 110, o);
    expect(o.x).toBeCloseTo(900);
    expect(o.y).toBeCloseTo(700);
    flyPoint(0.5, 100, 400, 900, 700, 110, o);
    expect(o.y).toBeLessThan(550);
  });
});

import { lootCrowd } from './loot';
describe('lootCrowd (nhiều món rơi cùng lúc, E3-B)', () => {
  it('1 món giữ nguyên, đông thì mờ dần, không dưới 0,3', () => {
    expect(lootCrowd(0)).toBe(1);
    expect(lootCrowd(1)).toBe(1);
    expect(lootCrowd(4)).toBeCloseTo(0.5);
    expect(lootCrowd(100)).toBe(0.3);
  });
});
