import { describe, expect, it } from 'vitest';
import {
  allGemIds,
  bindOnEquip,
  enhanceChance,
  enhanceCost,
  enhanceFail,
  enhanceTable,
  gemAffixes,
  gemId,
  gemMergeCost,
  gemRemoveCost,
  gemSocketCost,
  glowStage,
  parseGem,
  refineCost,
  salvageYield,
  tradable,
  ELEMENTS,
  GEM_STATS,
  MAX_ENHANCE,
  type ItemInst,
} from './index';

describe('cường hóa +10', () => {
  it('tỉ lệ giảm dần, +0..+4 chắc chắn, +10 là trần', () => {
    const tbl = enhanceTable();
    expect(tbl).toHaveLength(MAX_ENHANCE);
    for (let p = 0; p < 5; p++) expect(tbl[p].chance).toBe(1);
    for (let p = 1; p < tbl.length; p++) expect(tbl[p].chance).toBeLessThanOrEqual(tbl[p - 1].chance);
    expect(enhanceChance(9)).toBe(0.3);
  });

  it('rủi ro rớt cấp chỉ từ +7; Hộ Phù giữ cấp; không bao giờ về dưới 0', () => {
    for (let p = 0; p < 7; p++) expect(enhanceFail(p, false)).toEqual({ plus: p, wardUsed: false });
    expect(enhanceFail(7, false)).toEqual({ plus: 6, wardUsed: false });
    expect(enhanceFail(9, false)).toEqual({ plus: 8, wardUsed: false });
    expect(enhanceFail(7, true)).toEqual({ plus: 7, wardUsed: true });
    // Dưới +7 không tiêu phù.
    expect(enhanceFail(3, true).wardUsed).toBe(false);
  });

  it('chi phí tăng theo cấp (linh thạch không giảm, nguyên liệu 1..4)', () => {
    let g = 0;
    for (let p = 0; p < MAX_ENHANCE; p++) {
      const c = enhanceCost(p, 280);
      expect(c.gold).toBeGreaterThanOrEqual(g);
      g = c.gold;
      expect(c.ore).toBeGreaterThanOrEqual(1);
    }
    expect(enhanceCost(0, 280).ore).toBe(1);
    expect(enhanceCost(9, 280).ore).toBe(4);
  });

  it('bậc phát sáng: 0 dưới +7, 1 từ +7, 2 từ +10', () => {
    expect([0, 6, 7, 9, 10].map(glowStage)).toEqual([0, 0, 1, 1, 2]);
  });
});

describe('linh ngọc', () => {
  it('15 viên (5 hệ × 3 cấp), id đọc ngược được, id lạ bị bác', () => {
    const ids = allGemIds();
    expect(ids).toHaveLength(15);
    expect(new Set(ids).size).toBe(15);
    for (const e of ELEMENTS) for (let t = 1; t <= 3; t++) expect(parseGem(gemId(e, t))).toEqual({ elem: e, tier: t });
    for (const bad of ['gem_kim_0', 'gem_kim_4', 'gem_dat_1', 'gem_kim', '', 7, null, undefined, 'itm_thiet_tinh']) expect(parseGem(bad)).toBeNull();
  });

  it('giá trị tăng theo cấp; mỗi viên có dòng chính + sát thương theo hệ của nó', () => {
    for (const e of ELEMENTS) {
      const v = GEM_STATS[e].v;
      expect(v[0]).toBeLessThan(v[1]);
      expect(v[1]).toBeLessThan(v[2]);
      const a = gemAffixes(gemId(e, 2));
      expect(a).toHaveLength(2);
      expect(a[1]).toMatchObject({ id: 'elem_dmg', p: e });
    }
    expect(gemAffixes('khong_phai_ngoc')).toEqual([]);
  });

  it('phí khảm/tháo/ghép tăng theo cấp', () => {
    expect(gemSocketCost(1)).toBeLessThan(gemSocketCost(3));
    expect(gemRemoveCost(1)).toBeLessThan(gemRemoveCost(3));
    expect(gemMergeCost(1).gold).toBeLessThan(gemMergeCost(2).gold);
    expect(gemMergeCost(2).dust).toBeGreaterThan(gemMergeCost(1).dust);
  });
});

describe('tẩy luyện, phân giải, ràng buộc', () => {
  it('phí tẩy luyện tăng theo cấp vật phẩm và phẩm', () => {
    expect(refineCost(5, 1).gold).toBeLessThan(refineCost(15, 1).gold);
    expect(refineCost(10, 1).gold).toBeLessThan(refineCost(10, 4).gold);
    expect(refineCost(10, 4).stones).toBe(1);
  });

  it('phân giải: Phàm không ra Linh Trần, phẩm cao ra nhiều hơn, cường hóa cộng thêm Thiết Tinh', () => {
    expect(salvageYield(0, 0)).toEqual({ ore: 1, dust: 0 });
    expect(salvageYield(1, 0).dust).toBe(1);
    expect(salvageYield(4, 0).ore).toBeGreaterThan(salvageYield(2, 0).ore);
    expect(salvageYield(2, 6).ore).toBe(salvageYield(2, 0).ore + 3);
  });

  it('ràng buộc: Địa/Thiên phẩm khi mặc; Phàm..Huyền không; đã ràng buộc thì không giao dịch', () => {
    const mk = (q: 0 | 1 | 2 | 3 | 4, bound = false): ItemInst => ({ q, ilvl: 5, main: {}, affixes: [], gems: [], bound });
    for (const q of [0, 1, 2] as const) expect(bindOnEquip(mk(q)).bound).toBe(false);
    for (const q of [3, 4] as const) expect(bindOnEquip(mk(q)).bound).toBe(true);
    expect(tradable({ id: 'x', n: 1, inst: mk(3, true) })).toBe(false);
    expect(tradable({ id: 'x', n: 1, inst: mk(3) })).toBe(true);
    expect(tradable({ id: 'x', n: 1 })).toBe(true);
    const orig = mk(4);
    bindOnEquip(orig);
    expect(orig.bound).toBe(false);
  });
});
