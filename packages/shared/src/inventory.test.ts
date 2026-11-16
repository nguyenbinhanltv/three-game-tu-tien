import { describe, expect, it } from 'vitest';
import { applyInvMsg, combatPower, INV_SIZE, itemCategory, planSort, type InvSlot, type ItemDef } from './index';

const def = (o: Partial<ItemDef> & { id: string }): ItemDef => ({ kind: 'material', stack: 99, price: 0, sell: 1, rarity: 0, icon: o.id, ...o });
const DEFS: Record<string, ItemDef> = {
  mat: def({ id: 'mat' }),
  pill: def({ id: 'pill', kind: 'consumable' }),
  sword: def({ id: 'sword', kind: 'weapon', stack: 1, rarity: 2 }),
  quest: def({ id: 'quest', quest: true }),
};
const ctx = { def: (id: string) => DEFS[id], name: (it: { id: string }) => it.id };

describe('itemCategory', () => {
  it('theo kind và cờ quest', () => {
    expect(itemCategory(DEFS.sword)).toBe('gear');
    expect(itemCategory(DEFS.pill)).toBe('pill');
    expect(itemCategory(DEFS.mat)).toBe('material');
    expect(itemCategory(DEFS.quest)).toBe('quest');
    expect(itemCategory(undefined)).toBe('other');
  });
});

describe('combatPower', () => {
  it('tăng theo công/thủ/máu và bạo kích; làm tròn nguyên', () => {
    const a = combatPower({ hp: 100, mp: 50, atk: 10, def: 5 });
    expect(a).toBe(Math.round(40 + 15 + 20 + 5));
    expect(combatPower({ hp: 100, mp: 50, atk: 20, def: 5 })).toBeGreaterThan(a);
    expect(combatPower({ hp: 100, mp: 50, atk: 10, def: 5, critRate: 0.2, critMul: 2 })).toBeGreaterThan(a);
  });
});

describe('planSort', () => {
  it('loại → phẩm; gộp chồng; tất định; ô trống dồn cuối', () => {
    const inv: InvSlot[] = new Array(INV_SIZE).fill(null);
    inv[3] = { id: 'mat', n: 60 };
    inv[9] = { id: 'mat', n: 60 };
    inv[20] = { id: 'pill', n: 1 };
    inv[30] = { id: 'sword', n: 1 };
    inv[31] = { id: 'quest', n: 1 };
    const out = planSort(inv, ctx);
    expect(out.length).toBe(INV_SIZE);
    expect(out.slice(0, 5).map((s) => s?.id)).toEqual(['sword', 'pill', 'mat', 'mat', 'quest']);
    expect(out.slice(2, 4).map((s) => s!.n)).toEqual([99, 21]);
    expect(out.slice(5).every((s) => s === null)).toBe(true);
    expect(planSort(out, ctx)).toEqual(out);
  });
});

describe('applyInvMsg', () => {
  it('delta áp lên bản cũ không sửa bản cũ; bỏ chỉ số ngoài phạm vi', () => {
    const prev: InvSlot[] = new Array(INV_SIZE).fill(null);
    const next = applyInvMsg(prev, { d: [[5, { id: 'mat', n: 1 }], [999, { id: 'x', n: 1 }]], equip: {} });
    expect(next[5]?.id).toBe('mat');
    expect(prev[5]).toBeNull();
    expect(next.length).toBe(INV_SIZE);
  });
});
