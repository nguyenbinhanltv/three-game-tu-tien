import { describe, expect, it } from 'vitest';
import { draftFrom, itemsForSlot, lookKey, planApply, withChannel } from './model';

describe('wardrobe model', () => {
  it('không đổi gì thì không có lệnh', () => {
    const cur = { over: { robe: 'a' as const }, dye: ['x', 'y', 'z'] as [string, string, string] };
    expect(planApply({ over: { robe: 'a' }, dye: ['x', 'y', 'z'] }, draftFrom(cur))).toEqual([]);
    expect(planApply({ over: {} }, draftFrom({ over: {} }))).toEqual([]);
  });

  it('đổi ô, bỏ ô và nhuộm sinh đúng lệnh', () => {
    const cur = { over: { robe: 'r1', head: 'h1' } };
    const d = draftFrom(cur);
    d.over.robe = 'r2';
    d.over.head = null;
    d.over.weapon = 'w1';
    d.dye = ['a', 'b', 'c'];
    expect(planApply(cur, d)).toEqual([
      { kind: 'set', slot: 'weapon', id: 'w1' },
      { kind: 'set', slot: 'robe', id: 'r2' },
      { kind: 'set', slot: 'head', id: null },
      { kind: 'dye', dye: ['a', 'b', 'c'] },
    ]);
    const d2 = draftFrom({ over: {}, dye: ['a', 'b', 'c'] });
    d2.dye = null;
    expect(planApply({ over: {}, dye: ['a', 'b', 'c'] }, d2)).toEqual([{ kind: 'dye', dye: null }]);
  });

  it('itemsForSlot: lọc theo ô, đánh dấu sai giới', () => {
    const defs: Record<string, { kind: string; gender?: string }> = {
      r1: { kind: 'robe' },
      r2: { kind: 'robe', gender: 'f' },
      h1: { kind: 'head' },
    };
    const get = (id: string) => defs[id];
    expect(itemsForSlot(['r2', 'h1', 'r1', 'zz'], 'robe', 'm', get)).toEqual([
      { id: 'r1', ok: true },
      { id: 'r2', ok: false },
    ]);
  });

  it('withChannel khởi tạo từ màu gốc rồi đổi đúng kênh, không sửa bản cũ', () => {
    expect(withChannel(null, 1, 'b', 'base')).toEqual(['base', 'b', 'base']);
    const old: [string, string, string] = ['x', 'y', 'z'];
    expect(withChannel(old, 2, 'q', 'base')).toEqual(['x', 'y', 'q']);
    expect(old).toEqual(['x', 'y', 'z']);
  });

  it('lookKey theo nội dung: owned đổi mà look giữ nguyên thì khóa không đổi (bản nháp không bị reset)', () => {
    const a = { over: { robe: 'r1' as const, head: 'h1' as const }, dye: ['x', 'y', 'z'] as [string, string, string] };
    // object mới (như mỗi tin S.WARDROBE), thứ tự khóa khác, cùng nội dung
    const b = { dye: ['x', 'y', 'z'] as [string, string, string], over: { head: 'h1' as const, robe: 'r1' as const } };
    expect(lookKey(b)).toBe(lookKey(a));
    expect(lookKey({ over: {} })).toBe(lookKey({ over: {} }));
    // nội dung đổi thì khóa đổi
    expect(lookKey({ over: { robe: 'r2' } })).not.toBe(lookKey({ over: { robe: 'r1' } }));
    expect(lookKey({ over: {}, dye: ['x', 'y', 'z'] })).not.toBe(lookKey({ over: {} }));
  });
});
