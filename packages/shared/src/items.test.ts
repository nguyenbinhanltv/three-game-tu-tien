import { describe, expect, it } from 'vitest';
import {
  affixIlvlScale,
  type AffixRoll,
  budget,
  computePlayerStats,
  type ItemInst,
  type ItemSysData,
  mainLine,
  parseInst,
  playerBaseStats,
  QUALITY_MUL,
  rollAffixes,
  rollItemInstance,
  sellPrice,
  seededRng,
  STAT_CAPS,
  STAT_PER_POINT,
} from './index';

// Bảng thu nhỏ đủ để thử công thức; bảng thật được `pnpm content:check` kiểm.
const SYS: ItemSysData = {
  slots: [
    { id: 'weapon', weight: 1.3, main: { atk: 1 } },
    { id: 'robe', weight: 1.2, main: { def: 0.5, hp: 0.5 } },
    { id: 'bracer', weight: 0.7, main: { atk: 1 } },
    { id: 'boots', weight: 0.7, main: { def: 1 } },
    { id: 'belt', weight: 0.8, main: { hp: 1 } },
    { id: 'jade', weight: 0.7, main: { mp: 1 } },
    { id: 'ring', weight: 0.6, main: { atk: 1 } },
    { id: 'artifact', weight: 0, main: {} },
  ],
  qualities: [0, 1, 2, 3, 4].map((i) => ({ id: i as 0, color: '#ffffff', affixes: i, affixFrac: [0, 0.2, 0.3, 0.4, 0.5][i] })),
  affixes: [
    { id: 'atk_pct', min: 0.02, max: 0.04, weight: 10 },
    { id: 'crit_rate', min: 0.015, max: 0.03, weight: 8 },
    { id: 'crit_dmg', min: 0.06, max: 0.12, weight: 8 },
    { id: 'hp_pct', min: 0.03, max: 0.06, weight: 10 },
    { id: 'skill_dmg', min: 0.08, max: 0.15, weight: 6, param: 'skill' },
    { id: 'move_speed', min: 0.02, max: 0.04, weight: 10, slots: ['boots'] },
  ],
  params: { skill: ['skl_a', 'skl_b'], element: ['kim', 'moc', 'thuy', 'hoa', 'tho'] },
};

describe('ngân sách chỉ số', () => {
  it('khớp công thức (6 + 2,2·ilvl) × phẩm × ô', () => {
    expect(budget(10, 0, 1)).toBeCloseTo(28);
    expect(budget(10, 4, 1.3)).toBeCloseTo(28 * 1.75 * 1.3);
    expect(QUALITY_MUL).toEqual([1, 1.15, 1.3, 1.5, 1.75]);
  });
  it('phẩm cao mạnh hơn rõ nhưng không gấp đôi', () => {
    for (const il of [1, 8, 15]) expect(budget(il, 4, 1) / budget(il, 0, 1)).toBeLessThan(2);
  });
  it('dòng chính theo ngân sách còn lại sau dòng phụ', () => {
    const m = mainLine(SYS, 'weapon', 10, 0, 0.5);
    expect(m.atk).toBe(Math.round(budget(10, 0, 1.3)));
    const hi = mainLine(SYS, 'weapon', 10, 4, 0.5);
    expect(hi.atk).toBe(Math.round(budget(10, 4, 1.3) * 0.5));
    expect(hi.atk! / m.atk!).toBeLessThan(1.1);
  });
  it('robe chia hp/def theo tỉ lệ và đơn vị đổi điểm', () => {
    const m = mainLine(SYS, 'robe', 10, 0, 0.5);
    const pts = budget(10, 0, 1.2);
    expect(m.def).toBe(Math.round(pts * 0.5 * STAT_PER_POINT.def));
    expect(m.hp).toBe(Math.round(pts * 0.5 * STAT_PER_POINT.hp));
  });
  it('hệ số ilvl của dòng phụ tăng rồi bão hòa', () => {
    expect(affixIlvlScale(0)).toBeCloseTo(0.6);
    expect(affixIlvlScale(15)).toBeCloseTo(1);
    expect(affixIlvlScale(60)).toBeCloseTo(1);
  });
});

describe('roll', () => {
  it('cùng seed cho cùng kết quả, khác seed khác kết quả', () => {
    const a = rollItemInstance(SYS, 'weapon', 12, 4, seededRng(7));
    const b = rollItemInstance(SYS, 'weapon', 12, 4, seededRng(7));
    const c = rollItemInstance(SYS, 'weapon', 12, 4, seededRng(8));
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });
  it('số dòng phụ đúng phẩm, không trùng, qua parseInst', () => {
    const rng = seededRng(1);
    for (const slot of ['weapon', 'robe', 'boots', 'ring'] as const) {
      for (let q = 0; q < 5; q++) {
        for (let n = 0; n < 50; n++) {
          const inst = rollItemInstance(SYS, slot, 1 + (n % 20), q as 0, rng);
          expect(inst.affixes).toHaveLength(q);
          expect(new Set(inst.affixes.map((x) => x.id + (x.p ?? ''))).size).toBe(q);
          expect(parseInst(SYS, slot, JSON.parse(JSON.stringify(inst)))).toEqual(inst);
        }
      }
    }
  });
  it('move_speed chỉ xuất hiện trên giày', () => {
    const rng = seededRng(3);
    for (let n = 0; n < 300; n++) {
      expect(rollAffixes(SYS, 'weapon', 4, 10, 4, rng).some((a) => a.id === 'move_speed')).toBe(false);
    }
    let seen = false;
    for (let n = 0; n < 300 && !seen; n++) seen = rollAffixes(SYS, 'boots', 4, 10, 4, rng).some((a) => a.id === 'move_speed');
    expect(seen).toBe(true);
  });
  it('dòng có tham số mang tham số hợp lệ; giá trị trong khoảng', () => {
    const rng = seededRng(5);
    for (let n = 0; n < 200; n++) {
      for (const a of rollAffixes(SYS, 'robe', 4, 15, 4, rng)) {
        const def = SYS.affixes.find((d) => d.id === a.id)!;
        expect(a.v).toBeGreaterThan(0);
        expect(a.v).toBeLessThanOrEqual(def.max);
        if (def.param) expect(SYS.params[def.param]).toContain(a.p);
        else expect(a.p).toBeUndefined();
      }
    }
  });
  it('dòng chính không vượt ngân sách quá 5%', () => {
    const rng = seededRng(11);
    for (let n = 0; n < 200; n++) {
      const q = (n % 5) as 0;
      const inst = rollItemInstance(SYS, 'weapon', 10, q, rng);
      expect(inst.main.atk!).toBeLessThanOrEqual(Math.ceil(budget(10, q, 1.3) * (1 - SYS.qualities[q].affixFrac) * 1.05));
    }
  });
  it('pháp bảo phụ chưa có chỉ số hay dòng phụ', () => {
    const inst = rollItemInstance(SYS, 'artifact', 10, 4, seededRng(1));
    expect(inst.main).toEqual({});
    expect(inst.affixes).toEqual([]);
  });
  it('lỗ khảm theo phẩm', () => {
    expect(rollItemInstance(SYS, 'weapon', 5, 0, seededRng(1)).gems).toHaveLength(0);
    expect(rollItemInstance(SYS, 'weapon', 5, 4, seededRng(1)).gems).toHaveLength(2);
  });
});

describe('parseInst chặn dữ liệu hỏng', () => {
  const good = rollItemInstance(SYS, 'weapon', 10, 2, seededRng(9));
  const bad = (m: (i: ItemInst) => void) => {
    const x = JSON.parse(JSON.stringify(good)) as ItemInst;
    m(x);
    return parseInst(SYS, 'weapon', x);
  };
  it('phẩm hoặc ilvl hỏng thì bác cả món', () => {
    expect(bad((i) => ((i as { q: number }).q = 9))).toBeNull();
    expect(bad((i) => (i.ilvl = 0))).toBeNull();
    expect(parseInst(SYS, 'weapon', null)).toBeNull();
    expect(parseInst(SYS, 'weapon', 'x')).toBeNull();
  });
  it('phần hỏng chỉ bị bỏ riêng, giữ phẩm, ilvl, dòng khác và ràng buộc', () => {
    const x = bad((i) => {
      i.bound = true;
      i.main.atk = 99999;
      i.affixes = [
        { id: 'move_speed', v: 0.03 },
        { id: 'atk_pct', v: 5 },
        { id: 'hp_pct', v: 0.04 },
        { id: 'hp_pct', v: 0.05 },
      ];
    })!;
    expect(x).toMatchObject({ q: 2, ilvl: 10, bound: true, main: {}, affixes: [{ id: 'hp_pct', v: 0.04 }] });
    expect(parseInst(SYS, 'artifact', { ...good, main: { hp: 8 }, affixes: [] })?.main).toEqual({});
  });
  it('hạ trần cân bằng không làm mất dòng đã roll', () => {
    const tuned: ItemSysData = { ...SYS, affixes: SYS.affixes.map((a) => (a.id === 'hp_pct' ? { ...a, max: 0.04 } : a)) };
    const inst: ItemInst = { ...good, bound: true, affixes: [{ id: 'hp_pct', v: 0.06 }] };
    expect(parseInst(tuned, 'weapon', inst)).toEqual(inst);
  });
  it('bản tốt đi qua', () => {
    expect(parseInst(SYS, 'weapon', good)).toEqual(good);
  });
});

describe('tổng chỉ số nhân vật', () => {
  it('không trang bị = chỉ số gốc, bạo kích gốc', () => {
    const s = computePlayerStats(5, []);
    expect(s).toMatchObject(playerBaseStats(5));
    expect(s.critRate).toBeCloseTo(0.1);
    expect(s.critMul).toBeCloseTo(1.6);
    expect(s.moveSpeed).toBe(1);
  });
  it('đồ cũ cộng đúng như trước (chỉ số mẫu × cường hóa)', () => {
    const b = playerBaseStats(10);
    const s = computePlayerStats(10, [{ item: { id: 'x', n: 1, plus: 5 }, tpl: { atk: 22, hp: 80 } }]);
    expect(s.atk).toBe(b.atk + Math.round(22 * 1.4));
    expect(s.hp).toBe(b.hp + Math.round(80 * 1.4));
  });
  it('cộng nhiều ô, nhân phần trăm sau cộng phẳng', () => {
    const w = rollItemInstance(SYS, 'weapon', 10, 0, seededRng(2));
    const r = rollItemInstance(SYS, 'robe', 10, 4, seededRng(6));
    const s = computePlayerStats(10, [{ item: { id: 'w', n: 1, inst: w } }, { item: { id: 'r', n: 1, inst: r, plus: 2 } }]);
    const b = playerBaseStats(10);
    const pct = (id: string) => r.affixes.filter((a) => a.id === id).reduce((n, a) => n + a.v, 0);
    expect(s.atk).toBe(Math.round((b.atk + w.main.atk!) * (1 + pct('atk_pct'))));
    expect(s.hp).toBe(Math.round((b.hp + Math.round(r.main.hp! * 1.16)) * (1 + pct('hp_pct'))));
  });
  it('trần: bạo kích 40%, sát thương bạo kích +100%, tốc độ chạy', () => {
    const one = (id: AffixRoll['id']): ItemInst => ({ q: 4, ilvl: 10, main: {}, gems: [], bound: false, affixes: [{ id, v: 0.1 }] });
    const ids: AffixRoll['id'][] = ['crit_rate', 'crit_dmg', 'move_speed'];
    const items = Array.from({ length: 30 }, (_, i) => ({ item: { id: 'x' + i, n: 1, inst: one(ids[i % 3]) } }));
    const s = computePlayerStats(10, items);
    expect(s.critRate).toBe(STAT_CAPS.critRate);
    expect(s.critMul).toBeCloseTo(1.6 + STAT_CAPS.critDmg);
    expect(s.moveSpeed).toBeCloseTo(1 + STAT_CAPS.moveSpeed);
  });
  it('dòng có tham số cộng theo tham số', () => {
    const inst: ItemInst = { q: 2, ilvl: 5, main: {}, gems: [], bound: false, affixes: [{ id: 'skill_dmg', p: 'skl_a', v: 0.1 }] };
    const s = computePlayerStats(1, [{ item: { id: 'a', n: 1, inst } }, { item: { id: 'b', n: 1, inst } }]);
    expect(s.skillDmg.skl_a).toBeCloseTo(0.2);
  });
});

describe('giá bán trang bị đã roll', () => {
  const inst = (q: 0 | 1 | 2 | 3 | 4, ilvl: number) => ({
    id: 'x',
    n: 1,
    inst: { q, ilvl, main: {}, affixes: [], gems: [], bound: false },
  });
  it('đồ cũ không inst: giá mẫu; đồ roll: (3 + ilvl) × hệ số phẩm, không vượt giá mẫu', () => {
    expect(sellPrice({ id: 'x', n: 1 }, { sell: 700 })).toBe(700);
    expect(sellPrice(inst(0, 15), { sell: 1500 })).toBe(18);
    expect(sellPrice(inst(4, 16), { sell: 1500 })).toBe(33);
    expect(sellPrice(inst(0, 15), { sell: 8 })).toBe(8);
    expect(sellPrice(inst(2, 12), { sell: 0 })).toBe(0);
  });
  it('phẩm cao và ilvl cao bán được nhiều hơn', () => {
    for (let q = 1; q < 5; q++)
      expect(sellPrice(inst(q as 1, 12), { sell: 9999 })).toBeGreaterThan(sellPrice(inst((q - 1) as 0, 12), { sell: 9999 }));
    expect(sellPrice(inst(2, 15), { sell: 9999 })).toBeGreaterThan(sellPrice(inst(2, 5), { sell: 9999 }));
  });
});
