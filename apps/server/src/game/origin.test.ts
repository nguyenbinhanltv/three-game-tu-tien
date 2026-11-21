import { beforeAll, describe, expect, it } from 'vitest';
import { HUYEN_CHAINS, huyenOriginTier, isRootId, originOpen, ROOT_IDS, setChainCleared, TRIB_DEFS } from '@dtl/shared';
import { ORIGINS, ROOT } from '@dtl/content';

process.env.DB_FILE = ':memory:';

let Character: typeof import('./character').Character;
let rootForName: typeof import('../db').rootForName;

beforeAll(async () => {
  ({ Character } = await import('./character'));
  ({ rootForName } = await import('../db'));
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

describe('nguồn chọn được (TN1-2)', () => {
  it('sáu nguồn Hành nguyên chọn được, có Lôi; tám nguồn khóa có dữ liệu nhưng server không nhận', () => {
    expect([...ROOT_IDS]).toEqual(ORIGINS.filter(originOpen).map((o) => o.id));
    expect(isRootId('loi')).toBe(true);
    for (const o of ORIGINS.filter((x) => !originOpen(x))) {
      expect(ROOT.has(o.id), o.id).toBe(true);
      expect(isRootId(o.id), o.id).toBe(false);
    }
  });

  it('tạo nhân vật mang Lôi: +3% mọi chiêu, không cộng hệ nào; lưu và nạp lại vẫn là Lôi', () => {
    const c = Character.create(940_000 + ++n, 'Loi' + n + Date.now(), null, 'loi');
    expect(c.root).toBe('loi');
    expect(c.stats.allDmg).toBeCloseTo(0.03);
    expect(c.stats.elemDmg).toEqual({});
    expect(Character.load(c.id)?.root).toBe('loi');
  });

  it('nhân vật cũ chưa có nguồn vẫn được gán trong năm nguồn ngũ hành như trước khi có Lôi', () => {
    const legacy = (name: string) => {
      let h = 0;
      for (const ch of name) h = (h * 31 + ch.codePointAt(0)!) >>> 0;
      return ['kim', 'moc', 'thuy', 'hoa', 'tho'][h % 5];
    };
    for (const name of ['An', 'Bình', 'Lạc Vân', 'tu_si_42', 'Hàn Giao', 'x', 'Đạp Thiên'])
      expect(rootForName(name), name).toBe(legacy(name));
  });
});
