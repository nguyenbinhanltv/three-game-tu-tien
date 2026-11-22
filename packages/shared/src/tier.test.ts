import { at } from './arr';
import { describe, expect, it } from 'vitest';
import {
  type ItemSysData,
  MAX_SOCKETS,
  mainLine,
  parseInst,
  promoteGold,
  promoteInst,
  promoteOpen,
  promotePlus,
  rollItemInstance,
  seededRng,
  socketsFor,
  TIER_MUL,
  TIER_OPEN,
} from './index';

const DATA: ItemSysData = {
  slots: [{ id: 'robe', weight: 1.2, main: { def: 0.5, hp: 0.5 } }],
  qualities: [0, 1, 2, 3, 4, 5].map((id) => ({ id: id as 0, color: '#fff', affixes: id, affixFrac: id === 0 ? 0 : 0.2 })),
  affixes: [
    { id: 'atk_pct', min: 0.02, max: 0.05, weight: 1 },
    { id: 'def_pct', min: 0.02, max: 0.05, weight: 1 },
    { id: 'hp_pct', min: 0.02, max: 0.05, weight: 1 },
    { id: 'crit_rate', min: 0.02, max: 0.05, weight: 1 },
  ],
  params: { skill: [], element: [] },
};

describe('bậc trang bị', () => {
  it('hệ số bậc tăng đều và bậc 1 giữ nguyên chỉ số cũ', () => {
    expect(TIER_MUL[1]).toBe(1);
    for (let i = 2; i < TIER_MUL.length; i++) expect(at(TIER_MUL, i)).toBeGreaterThan(at(TIER_MUL, i - 1));
    const a = mainLine(DATA, 'robe', 15, 2, 0.5);
    const b = mainLine(DATA, 'robe', 15, 2, 0.5, 1);
    expect(a).toEqual(b);
    const t2 = mainLine(DATA, 'robe', 15, 2, 0.5, 2);
    expect(t2.def!).toBeGreaterThan(a.def! * 1.55);
    expect(t2.def!).toBeLessThan(a.def! * 1.65);
  });

  it('lỗ khảm: bậc cao thêm lỗ cho đồ từ Huyền phẩm, trần 3, Phàm/Linh không có lỗ', () => {
    expect(socketsFor(0, 4)).toBe(0);
    expect(socketsFor(1, 2)).toBe(0);
    expect(socketsFor(2, 1)).toBe(1);
    expect(socketsFor(2, 2)).toBe(2);
    expect(socketsFor(3, 2)).toBe(3);
    expect(socketsFor(4, 4)).toBe(MAX_SOCKETS);
    expect(socketsFor(5, 1)).toBe(MAX_SOCKETS); // Thần phẩm: 3 lỗ ngay từ bậc 1
  });

  it('roll theo bậc nằm trong trần của parseInst (đọc DB không bác đồ bậc cao)', () => {
    for (const tier of [1, 2, 3, 4]) {
      const inst = rollItemInstance(DATA, 'robe', 30, 4, seededRng(7 + tier), tier);
      expect(parseInst(DATA, 'robe', JSON.parse(JSON.stringify(inst)))).toEqual(inst);
    }
  });
});

describe('Thăng Bậc (hàm thuần)', () => {
  it('chỉ bậc đã mở mới thăng được; phí = 0,4 × thu nhập giờ chương đích; cường hóa trừ 3 tối thiểu +0', () => {
    expect(TIER_OPEN).toBe(6);
    expect(promoteOpen(1)).toBe(true);
    expect(promoteOpen(2)).toBe(true);
    expect(promoteOpen(3)).toBe(true);
    expect(promoteOpen(4)).toBe(true);
    expect(promoteOpen(5)).toBe(true);
    expect(promoteOpen(6)).toBe(false);
    expect(promoteGold(4)).toBe(3520);
    expect(promoteGold(5)).toBe(4080);
    expect(promoteGold(6)).toBe(4640);
    expect(promoteGold(2)).toBe(2400);
    expect(promoteGold(3)).toBe(2960);
    expect(promotePlus(7)).toBe(4);
    expect(promotePlus(2)).toBe(0);
    expect(promotePlus(0)).toBe(0);
  });

  it('giữ phẩm, dòng phụ, ngọc, ràng buộc; chính tính lại; lỗ thêm; ilvl nâng lên đầu chương', () => {
    const old = rollItemInstance(DATA, 'robe', 13, 3, seededRng(3));
    old.gems = ['gem_kim_2', ''];
    old.bound = true;
    const up = promoteInst(DATA, 'robe', old, 2, seededRng(9));
    expect(up.q).toBe(old.q);
    expect(up.affixes).toEqual(old.affixes);
    expect(up.bound).toBe(true);
    expect(up.gems).toEqual(['gem_kim_2', '', '']);
    expect(up.ilvl).toBeGreaterThanOrEqual(17);
    expect(up.main.def!).toBeGreaterThan(old.main.def! * 1.5);
    // xác định theo seed
    expect(promoteInst(DATA, 'robe', old, 2, seededRng(9))).toEqual(up);
    // không sửa bản gốc
    expect(old.gems).toEqual(['gem_kim_2', '']);
  });
});

describe('đan phá cảnh theo bậc (E3-F)', () => {
  it('cấp ≤ 16 đan thường, 17–20 Mạch Phá Cảnh Đan, từ 21 Vân Phá Cảnh Đan', async () => {
    const { bottleneckPill } = await import('./realm');
    expect(bottleneckPill(15)).toBe('itm_pha_canh_dan');
    expect(bottleneckPill(17)).toBe('itm_pha_canh_dan_2');
    expect(bottleneckPill(19)).toBe('itm_pha_canh_dan_2');
    expect(bottleneckPill(21)).toBe('itm_pha_canh_dan_3');
    expect(bottleneckPill(27)).toBe('itm_pha_canh_dan_3');
    expect(bottleneckPill(29)).toBe('itm_pha_canh_dan_3');
    for (const l of [33, 37, 41]) expect(bottleneckPill(l)).toBe('itm_pha_canh_dan_4');
  });
});
