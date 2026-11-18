import { describe, expect, it } from 'vitest';
import type { Equipment, InvItem, ItemInst } from '@dtl/shared';
import { affixText, compareLines, diffLines, equipDiff, gearQuality, itemLines, itemSub, pctText, tierText } from './gear';
import { ITEM } from '@dtl/content';

const inst = (q: 0 | 1 | 2 | 3 | 4, atk: number, extra: Partial<ItemInst> = {}): ItemInst => ({
  q,
  ilvl: 12,
  main: { atk },
  affixes: [],
  gems: [],
  bound: false,
  ...extra,
});
const sword = (i: ItemInst, plus = 0): InvItem => ({ id: 'itm_thanh_phong_kiem', n: 1, inst: i, ...(plus ? { plus } : {}) });
const def = ITEM.get('itm_thanh_phong_kiem')!;

describe('hiển thị trang bị', () => {
  it('phẩm lấy từ inst, đồ cũ lấy từ rarity của mẫu', () => {
    expect(gearQuality(sword(inst(3, 10)))).toBe(3);
    expect(gearQuality({ id: 'itm_thanh_phong_kiem', n: 1 })).toBe(1);
  });

  it('dòng chính nhân cường hóa, dòng phụ có tham số hệ và chiêu qua i18n', () => {
    const it = sword(
      inst(2, 20, {
        affixes: [
          { id: 'crit_rate', v: 0.025 },
          { id: 'elem_dmg', p: 'hoa', v: 0.06 },
          { id: 'skill_dmg', p: 'skl_phi_kiem', v: 0.1 },
        ],
      }),
      5,
    );
    const lines = itemLines(it, def).map((l) => l.text);
    expect(lines[0]).toMatch(/^Công \+\d+$/);
    expect(Number(lines[0].match(/\d+/)![0])).toBeGreaterThan(20);
    expect(lines).toContain('Tỉ lệ bạo kích +2,5%');
    expect(lines).toContain('Sát thương hệ Hỏa +6%');
    expect(lines.some((l) => l.includes('Phi Kiếm') && l.endsWith('+10%'))).toBe(true);
    expect(itemSub(it, def)).toBe('Huyền phẩm · Pháp kiếm · Cấp vật phẩm 12');
    expect(affixText({ id: 'atk_pct', v: 0.03 })).toBe('Công kích +3%');
    expect(pctText(0.0125)).toBe('1,3');
  });
});

describe('so sánh với món đang mặc', () => {
  const worn: Equipment = { weapon: sword(inst(1, 30)) };

  it('món mạnh hơn: công kích tăng (xanh), món yếu hơn giảm (đỏ), cùng món không đổi', () => {
    const better = diffLines(equipDiff(12, worn, 'weapon', sword(inst(3, 50))));
    expect(better[0].tone).toBe('good');
    expect(better[0].text).toMatch(/^Công kích \d+ → \d+ \(\+20\)$/);
    const worse = diffLines(equipDiff(12, worn, 'weapon', sword(inst(0, 10))));
    expect(worse[0].tone).toBe('bad');
    expect(worse[0].text).toMatch(/\(-20\)$/);
    expect(equipDiff(12, worn, 'weapon', worn.weapon!)).toEqual([]);
  });

  it('dòng phụ làm đổi chỉ số tỉ lệ: bạo kích hiển thị phần trăm, chỉ liệt kê chỉ số có đổi', () => {
    const cand = sword(inst(2, 30, { affixes: [{ id: 'crit_rate', v: 0.03 }] }));
    const d = equipDiff(12, worn, 'weapon', cand);
    expect(d.map((x) => x.key)).toEqual(['critRate']);
    expect(diffLines(d)[0]).toEqual({ text: 'Tỉ lệ bạo kích 10% → 13% (+3%)', tone: 'good' });
  });

  it('ô trống: so với ô trống; chưa đủ cảnh giới thì có dòng đỏ; vật không phải trang bị thì rỗng', () => {
    const lines = compareLines(1, {}, sword(inst(2, 30)), def);
    expect(lines[0].text).toBe('So với ô đang trống');
    expect(lines.some((l) => l.tone === 'bad' && l.text.startsWith('Yêu cầu'))).toBe(true);
    expect(compareLines(12, {}, { id: 'itm_linh_thao', n: 1 }, ITEM.get('itm_linh_thao')!)).toEqual([]);
    expect(compareLines(12, worn, worn.weapon!, def).some((l) => l.text === 'Không đổi chỉ số')).toBe(true);
  });
});

describe('đồ bậc 3 (E3-F)', () => {
  const kq = ITEM.get('itm_kinh_quang_kiem')!;
  const lm = ITEM.get('itm_liet_mach_kiem')!;
  const mk = (id: string, ilvl: number, atk: number): InvItem => ({
    id,
    n: 1,
    inst: { q: 2, ilvl, main: { atk }, affixes: [], gems: ['', '', ''], bound: false },
  });

  it('dòng phụ ghi bậc 3 và cấp vật phẩm', () => {
    expect(itemSub(mk(kq.id, 21, 100), kq)).toBe('Huyền phẩm · Pháp kiếm · Cấp vật phẩm 21 · Bậc 3');
  });

  it('so với kiếm bậc 2 đang mặc: công kích tăng (xanh); đòi cảnh giới 20 nên dưới đó có dòng đỏ', () => {
    const worn: Equipment = { weapon: mk(lm.id, 17, 150) };
    const d = diffLines(equipDiff(20, worn, 'weapon', mk(kq.id, 21, 230)));
    expect(d[0].tone).toBe('good');
    expect(d[0].text).toMatch(/^Công kích \d+ → \d+ \(\+80\)$/);
    expect(compareLines(19, worn, mk(kq.id, 21, 230), kq).some((l) => l.tone === 'bad' && l.text.startsWith('Yêu cầu'))).toBe(true);
  });

  it('hiệu ứng 4 món của ba bộ mới có chữ đúng giá trị', () => {
    expect(tierText({ n: 4, fx: 'nghich_kiem', v: 0.4 })).toContain('40%');
    expect(tierText({ n: 4, fx: 'dich_son', v: 0.5 })).toContain('0,5');
    expect(tierText({ n: 4, fx: 'ngung_dan', v: 0.05 })).toContain('5%');
  });

  it('hiệu ứng 4 món của ba bộ bậc 4 có chữ đúng giá trị', () => {
    expect(tierText({ n: 4, fx: 'phan_anh', v: 1 })).toContain('100%');
    expect(tierText({ n: 4, fx: 'anh_thiet', v: 0.2 })).toContain('20%');
    expect(tierText({ n: 4, fx: 'anh_duoc', v: 0.15 })).toContain('15%');
  });

  it('hiệu ứng 4 món của ba bộ bậc 5 có chữ đúng giá trị', () => {
    expect(tierText({ n: 4, fx: 'thuan_tram', v: 0.3 })).toContain('30%');
    expect(tierText({ n: 4, fx: 'thuan_ho', v: 0.3 })).toContain('30%');
    expect(tierText({ n: 4, fx: 'cuu_vien', v: 0.15 })).toContain('15%');
  });
});
