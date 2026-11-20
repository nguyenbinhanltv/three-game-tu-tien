import { describe, expect, it } from 'vitest';
import { C, S } from './protocol';
import {
  canShow,
  decodeDye3,
  DISPLAY_SLOTS,
  emptyLook,
  encodeDye3,
  isDisplaySlot,
  isEmptyLook,
  outfitLookFromDb,
  outfitLookToDb,
  parseDye,
  parseLookDyeMsg,
  parseLookSetMsg,
  sanitizeOutfitLook,
  visualEquip,
  type WardrobeItemLookup,
} from './wardrobe';

const ITEMS: Record<string, { kind: string; gender?: string }> = {
  robe_a: { kind: 'robe' },
  robe_b: { kind: 'robe' },
  robe_f: { kind: 'robe', gender: 'f' },
  head_a: { kind: 'head' },
  sword_a: { kind: 'weapon' },
  ring_a: { kind: 'ring' },
  skin_a: { kind: 'skin' },
};
const item: WardrobeItemLookup = (id) => (Object.hasOwn(ITEMS, id) ? ITEMS[id] : undefined);
const dyes = new Set(['c1', 'c2', 'c3']);
const owned = new Set(['robe_a', 'robe_f', 'head_a', 'sword_a', 'ring_a', 'skin_a']);

describe('wardrobe', () => {
  it('ô hiển thị không gồm jade/ring/artifact/skin', () => {
    expect([...DISPLAY_SLOTS]).toEqual(['weapon', 'robe', 'bracer', 'boots', 'belt', 'head']);
    for (const s of ['jade', 'ring', 'artifact', 'skin', '', 'toString', 7, null]) expect(isDisplaySlot(s)).toBe(false);
  });

  it('mã tin nhắn mới không trùng mã nào khác cùng hướng', () => {
    const count = (o: Record<string, string>, v: string) => Object.values(o).filter((x) => x === v).length;
    for (const v of [C.LOOK_SET, C.LOOK_DYE, C.LOOK_RESET]) expect(count(C, v)).toBe(1);
    expect(count(S, S.WARDROBE)).toBe(1);
  });

  it('canShow: phải sở hữu, đúng ô, đúng giới', () => {
    expect(canShow('robe', 'robe_a', 'm', item, owned)).toBe(true);
    expect(canShow('robe', 'robe_b', 'm', item, owned)).toBe(false); // chưa mở khóa
    expect(canShow('head', 'robe_a', 'm', item, owned)).toBe(false); // sai ô
    expect(canShow('robe', 'robe_f', 'm', item, owned)).toBe(false); // sai giới
    expect(canShow('robe', 'robe_f', 'f', item, owned)).toBe(true);
    expect(canShow('robe', 'nope', 'm', item, new Set(['nope']))).toBe(false); // mẫu không tồn tại
    expect(canShow('robe', 'skin_a', 'm', item, owned)).toBe(false);
  });

  it('parseDye: đủ 3 id có trong bảng', () => {
    expect(parseDye(dyes, ['c1', 'c2', 'c3'])).toEqual(['c1', 'c2', 'c3']);
    expect(parseDye(dyes, ['c1', 'c2'])).toBeNull();
    expect(parseDye(dyes, ['c1', 'c2', 'c3', 'c1'])).toBeNull();
    expect(parseDye(dyes, ['c1', '#ff0000', 'c3'])).toBeNull();
    expect(parseDye(dyes, ['c1', 'c2', 5])).toBeNull();
    expect(parseDye(dyes, 'c1,c2,c3')).toBeNull();
    expect(parseDye(dyes, null)).toBeNull();
  });

  it('parseLookSetMsg / parseLookDyeMsg chỉ nhận cấu trúc đúng, bỏ trường thừa', () => {
    expect(parseLookSetMsg({ slot: 'robe', id: 'robe_a', r: 'x', evil: 1 })).toEqual({ slot: 'robe', id: 'robe_a', r: 'x' });
    expect(parseLookSetMsg({ slot: 'head', id: null })).toEqual({ slot: 'head', id: null, r: undefined });
    for (const bad of [
      null,
      'x',
      [],
      {},
      { slot: 'skin', id: 'a' },
      { slot: 'robe', id: 3 },
      { slot: 'robe', id: '' },
      { slot: 'robe', id: 'x'.repeat(65) },
      { slot: 'robe' },
    ])
      expect(parseLookSetMsg(bad)).toBeNull();
    expect(parseLookDyeMsg(dyes, { dye: ['c1', 'c2', 'c3'], r: 1 })).toEqual({ dye: ['c1', 'c2', 'c3'], r: 1 });
    expect(parseLookDyeMsg(dyes, { dye: null })).toEqual({ dye: null, r: undefined });
    for (const bad of [null, [], {}, { dye: ['c1'] }, { dye: ['c1', 'c2', 'zz'] }, { dye: 'c1' }])
      expect(parseLookDyeMsg(dyes, bad)).toBeNull();
  });

  it('sanitizeOutfitLook: bỏ từng mục hỏng, giữ mục tốt', () => {
    const raw = {
      over: { robe: 'robe_b', head: 'head_a', weapon: 'robe_a', boots: 'nope', skin: 'skin_a', toString: 'x' },
      dye: ['c1', 'c2', 'c3'],
    };
    expect(sanitizeOutfitLook(raw, 'm', item, owned, dyes)).toEqual({ over: { head: 'head_a' }, dye: ['c1', 'c2', 'c3'] });
    // một màu lạ: bỏ cả bộ ba
    expect(sanitizeOutfitLook({ over: {}, dye: ['c1', 'zz', 'c3'] }, 'm', item, owned, dyes)).toEqual({ over: {} });
    // sai giới
    expect(sanitizeOutfitLook({ over: { robe: 'robe_f' } }, 'm', item, owned, dyes).over).toEqual({});
    for (const junk of [null, undefined, 3, 'x', [], { over: [] }, { over: 'x' }])
      expect(sanitizeOutfitLook(junk, 'm', item, owned, dyes)).toEqual({ over: {} });
  });

  it('DB: JSON hỏng thành rỗng, vòng ghi/đọc giữ nguyên, look rỗng ghi chuỗi rỗng', () => {
    expect(outfitLookFromDb('', 'm', item, owned, dyes)).toEqual(emptyLook());
    expect(outfitLookFromDb('{hỏng', 'm', item, owned, dyes)).toEqual(emptyLook());
    const l = { over: { robe: 'robe_a' as const }, dye: ['c1', 'c2', 'c3'] as [string, string, string] };
    expect(outfitLookFromDb(outfitLookToDb(l), 'm', item, owned, dyes)).toEqual(l);
    expect(outfitLookToDb(emptyLook())).toBe('');
    expect(isEmptyLook(emptyLook())).toBe(true);
    expect(isEmptyLook(l)).toBe(false);
  });

  it('visualEquip: ghi đè ô, giữ ô khác, không sửa trang bị thật', () => {
    const equip = { weapon: { id: 'sword_real', plus: 5 }, robe: { id: 'robe_real' }, ring: { id: 'ring_a' } };
    const snap = JSON.stringify(equip);
    const v = visualEquip(equip, { over: { robe: 'robe_a', head: 'head_a' } });
    expect(v).toEqual({ weapon: { id: 'sword_real' }, robe: { id: 'robe_a' }, ring: { id: 'ring_a' }, head: { id: 'head_a' } });
    expect(JSON.stringify(equip)).toBe(snap);
    expect(visualEquip(equip, emptyLook()).robe?.id).toBe('robe_real');
  });

  it('dye3: mã hóa/giải mã, sai định dạng thì bỏ', () => {
    expect(encodeDye3(undefined)).toBe('');
    expect(encodeDye3(['c1', 'c2', 'c3'])).toBe('c1,c2,c3');
    expect(decodeDye3(dyes, 'c1,c2,c3')).toEqual(['c1', 'c2', 'c3']);
    expect(decodeDye3(dyes, '')).toBeUndefined();
    expect(decodeDye3(dyes, 'c1,c2')).toBeUndefined();
    expect(decodeDye3(dyes, 'c1,c2,zz')).toBeUndefined();
  });
});
