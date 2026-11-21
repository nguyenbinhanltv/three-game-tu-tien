import { beforeAll, describe, expect, it } from 'vitest';
import { HUYEN_CHAINS, huyenOriginTier, isRootId, setChainCleared, TRIB_DEFS } from '@dtl/shared';
import { ROOT } from '@dtl/content';

process.env.DB_FILE = ':memory:';

let Character: typeof import('./character').Character;

beforeAll(async () => {
  ({ Character } = await import('./character'));
});

let n = 0;
const fresh = (root: 'hoa' | 'kim') => {
  const c = Character.create(940_000 + ++n, 'Bn' + n + Date.now(), null, root);
  c.level = 20;
  c.recalc();
  return c;
};

describe('bậc Bản Nguyên nối Huyền Kiếp (TN-1 ↔ TN-6)', () => {
  it('chưa qua chuỗi nào: chỉ số đúng như linh căn cũ', () => {
    const c = fresh('hoa');
    expect(huyenOriginTier(c.meta)).toBe(0);
    expect(c.stats.elemDmg.hoa).toBeCloseTo(0.08);
    expect(c.stats.allDmg).toBe(0);
  });

  it('mỗi chuỗi Huyền Kiếp qua đủ nhân thưởng của nguồn thêm 25%; chuỗi dở dang không tính', () => {
    const c = fresh('hoa');
    const atk0 = c.stats.atk;
    const base = Math.round(atk0 / 1.05);
    setChainCleared(c.meta, TRIB_DEFS[HUYEN_CHAINS[0]!], 2);
    c.recalc();
    expect(c.stats.elemDmg.hoa).toBeCloseTo(0.08);
    setChainCleared(c.meta, TRIB_DEFS[HUYEN_CHAINS[0]!], 3);
    c.recalc();
    expect(huyenOriginTier(c.meta)).toBe(1);
    expect(c.stats.elemDmg.hoa).toBeCloseTo(0.1);
    expect(Math.abs(c.stats.atk - base * 1.0625)).toBeLessThanOrEqual(1);
    for (const id of HUYEN_CHAINS) setChainCleared(c.meta, TRIB_DEFS[id], 3);
    c.recalc();
    expect(huyenOriginTier(c.meta)).toBe(3);
    expect(c.stats.elemDmg.hoa).toBeCloseTo(0.14);
    expect(c.stats.atk).toBeGreaterThan(atk0);
  });

  it('qua Thiên Nhân Ngũ Suy (không phải Huyền Kiếp) không nâng bậc', () => {
    const c = fresh('kim');
    setChainCleared(c.meta, TRIB_DEFS.ngu_suy, 99);
    c.recalc();
    expect(huyenOriginTier(c.meta)).toBe(0);
    expect(c.stats.elemDmg.kim).toBeCloseTo(0.08);
  });
});

describe('nguồn chọn được', () => {
  it('TN1-1 chưa mở thêm nguồn nào cho người chơi: Lôi và tám nguồn khóa có dữ liệu nhưng server chưa nhận', () => {
    expect(ROOT.get('loi')?.allDmg).toBeGreaterThan(0);
    for (const id of ['loi', 'sinh_tu', 'luan_hoi', 'sat_luc']) {
      expect(ROOT.has(id), id).toBe(true);
      expect(isRootId(id), id).toBe(false);
    }
  });
});
