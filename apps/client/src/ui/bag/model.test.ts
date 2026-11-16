import { describe, expect, it } from 'vitest';
import { INV_PAGE, INV_SIZE, type InvSlot, type ItemDef } from '@dtl/shared';
import { clampSplit, diffNew, firstEmptyIn, fold, matchesFilter, NO_FILTER, pageCounts, pageOf, planDrop, usedCount } from './model';

const defs: Record<string, ItemDef> = {
  sword: { id: 'sword', kind: 'weapon', rarity: 1, stack: 1, sell: 1 } as unknown as ItemDef,
  ring: { id: 'ring', kind: 'ring', rarity: 1, stack: 1, sell: 1 } as unknown as ItemDef,
  pill: { id: 'pill', kind: 'consumable', rarity: 0, stack: 99, sell: 1 } as unknown as ItemDef,
  ore: { id: 'ore', kind: 'material', rarity: 0, stack: 99, sell: 1 } as unknown as ItemDef,
  key: { id: 'key', kind: 'material', quest: true, rarity: 0, stack: 1, sell: 0 } as unknown as ItemDef,
};
const defOf = (id: string): ItemDef | undefined => defs[id];
const empty = (): InvSlot[] => new Array<InvSlot>(INV_SIZE).fill(null);

describe('lọc túi', () => {
  it('fold bỏ dấu và đ', () => {
    expect(fold('Đạp Thiên Lộ')).toBe('dap thien lo');
  });
  it('tab lọc theo itemCategory, nhiệm vụ riêng', () => {
    const f = { ...NO_FILTER, tab: 'gear' as const };
    expect(matchesFilter({ id: 'sword', n: 1 }, defs.sword, 'Kiếm', 0, f)).toBe(true);
    expect(matchesFilter({ id: 'pill', n: 3 }, defs.pill, 'Đan', 0, f)).toBe(false);
    expect(matchesFilter({ id: 'key', n: 1 }, defs.key, 'Chìa', 0, { ...NO_FILTER, tab: 'quest' })).toBe(true);
    expect(matchesFilter({ id: 'key', n: 1 }, defs.key, 'Chìa', 0, { ...NO_FILTER, tab: 'material' })).toBe(false);
  });
  it('tìm theo tên không dấu, lọc phẩm, ô trống mờ khi đang lọc', () => {
    expect(matchesFilter({ id: 'ore', n: 1 }, defs.ore, 'Thiết Quặng', 0, { ...NO_FILTER, query: 'thiet' })).toBe(true);
    expect(matchesFilter({ id: 'ore', n: 1 }, defs.ore, 'Thiết Quặng', 0, { ...NO_FILTER, query: 'xyz' })).toBe(false);
    expect(matchesFilter({ id: 'sword', n: 1 }, defs.sword, 'Kiếm', 2, { ...NO_FILTER, quality: 3 })).toBe(false);
    expect(matchesFilter(null, undefined, '', 0, { ...NO_FILTER, query: 'a' })).toBe(false);
    expect(matchesFilter(null, undefined, '', 0, NO_FILTER)).toBe(true);
  });
  it('lọc không đổi túi', () => {
    const inv = empty();
    inv[3] = { id: 'ore', n: 5 };
    const before = JSON.stringify(inv);
    matchesFilter(inv[3], defs.ore, 'x', 0, { ...NO_FILTER, tab: 'gear' });
    expect(JSON.stringify(inv)).toBe(before);
  });
});

describe('trang', () => {
  it('đếm ô dùng và từng trang', () => {
    const inv = empty();
    inv[0] = { id: 'ore', n: 1 };
    inv[INV_PAGE + 1] = { id: 'ore', n: 1 };
    inv[INV_PAGE * 3] = { id: 'ore', n: 1 };
    expect(usedCount(inv)).toBe(3);
    expect(pageCounts(inv)).toEqual([1, 1, 0, 1]);
    expect(pageOf(INV_PAGE * 3)).toBe(3);
    expect(firstEmptyIn(inv, 1)).toBe(INV_PAGE);
    expect(firstEmptyIn(inv, 0)).toBe(1);
  });
});

describe('thả', () => {
  const inv = empty();
  inv[0] = { id: 'pill', n: 10 };
  inv[1] = { id: 'sword', n: 1 };
  inv[2] = { id: 'ring', n: 1 };
  it('ô → ô: move', () => {
    expect(planDrop(inv, 0, { kind: 'cell', slot: 5 }, false, defOf)).toEqual({ cmd: 'move', a: 0, b: 5 });
  });
  it('thả lên số trang: ô trống đầu của trang đó, sang trang khác', () => {
    expect(planDrop(inv, 0, { kind: 'page', page: 2 }, false, defOf)).toEqual({ cmd: 'move', a: 0, b: INV_PAGE * 2 });
  });
  it('trang đầy thì không làm gì', () => {
    const full = empty().map((_, i) => (i >= INV_PAGE && i < INV_PAGE * 2 ? { id: 'ore', n: 1 } : null)) as InvSlot[];
    full[0] = { id: 'pill', n: 2 };
    expect(planDrop(full, 0, { kind: 'page', page: 1 }, false, defOf)).toEqual({ cmd: 'none', why: 'full' });
  });
  it('lên ô trang bị: đúng loại thì mặc, sai loại thì bỏ', () => {
    expect(planDrop(inv, 1, { kind: 'equip', slot: 'weapon' }, false, defOf)).toEqual({ cmd: 'equip', slot: 1 });
    expect(planDrop(inv, 2, { kind: 'equip', slot: 'weapon' }, false, defOf)).toEqual({ cmd: 'none', why: 'kind' });
    expect(planDrop(inv, 0, { kind: 'equip', slot: 'weapon' }, false, defOf)).toEqual({ cmd: 'none', why: 'kind' });
  });
  it('Shift: tách chồng vào ô trống, hỏi số lượng tối đa n-1', () => {
    expect(planDrop(inv, 0, { kind: 'cell', slot: 7 }, true, defOf)).toEqual({ cmd: 'split', slot: 0, to: 7, max: 9 });
    expect(planDrop(inv, 0, { kind: 'cell', slot: 1 }, true, defOf)).toEqual({ cmd: 'none', why: 'split_busy' });
    // chồng 1 món: Shift như kéo thường
    expect(planDrop(inv, 1, { kind: 'cell', slot: 7 }, true, defOf)).toEqual({ cmd: 'move', a: 1, b: 7 });
  });
  it('thả lên chính nó / ô trống nguồn', () => {
    expect(planDrop(inv, 0, { kind: 'cell', slot: 0 }, false, defOf)).toEqual({ cmd: 'none', why: 'same' });
    expect(planDrop(inv, 9, { kind: 'cell', slot: 1 }, false, defOf)).toEqual({ cmd: 'none' });
  });
  it('clampSplit', () => {
    expect(clampSplit(0, 9)).toBe(1);
    expect(clampSplit(99, 9)).toBe(9);
    expect(clampSplit(4.7, 9)).toBe(4);
    expect(clampSplit(NaN, 9)).toBe(1);
  });
});

describe('dấu mới', () => {
  it('nhặt thêm thì đánh dấu, đổi chỗ thì không, hết đồ thì gỡ', () => {
    const a = empty();
    a[0] = { id: 'ore', n: 2 };
    const b = empty();
    b[5] = { id: 'ore', n: 2 };
    expect(diffNew(a, b, {})).toEqual({});
    const c = empty();
    c[0] = { id: 'ore', n: 4 };
    c[1] = { id: 'pill', n: 1 };
    expect(diffNew(a, c, {})).toEqual({ ore: true, pill: true });
    expect(diffNew(c, empty(), { ore: true })).toEqual({});
  });
});
