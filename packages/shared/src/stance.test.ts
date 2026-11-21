import { describe, expect, it } from 'vitest';
import { stanceActive, stanceBar, stanceErrors, withStanceRes, type StanceDef } from './index';

const DEF: StanceDef = { dur: 10, swap: { a: 'sa', b: 'sb', c: 'sc' } };
const sk = (id: string, o: Record<string, unknown> = {}) => ({ id, kind: 'damage', unlock: 1, cd: 0, cast: 0, ...o });
const COMMON = new Set(['a', 'b', 'c', 'd']);
const GOOD = [
  sk('a'),
  sk('b'),
  sk('c'),
  sk('d'),
  sk('st', { kind: 'stance', method: 'm', unlock: 12, cd: 45, stance: DEF }),
  sk('sa', { method: 'm', unlock: 12, stanceOf: 'st' }),
  sk('sb', { method: 'm', unlock: 12, cd: 3, stanceOf: 'st' }),
  sk('sc', { method: 'm', unlock: 12, cd: 6, stanceOf: 'st' }),
];

describe('tư thế (VS-2e)', () => {
  it('đang giữ tư thế tới đúng hạn', () => {
    expect(stanceActive({ id: 'st', until: 5000 }, 4999)).toBe(true);
    expect(stanceActive({ id: 'st', until: 5000 }, 5000)).toBe(false);
    expect(stanceActive(null, 0)).toBe(false);
    expect(stanceActive({ id: '', until: 9e9 }, 0)).toBe(false);
  });
  it('đổi ô theo swap, ô khác giữ nguyên; chiêu thay không tra được thì giữ ô cũ', () => {
    const bar = [{ id: 'a' }, { id: 'x' }, { id: 'b' }];
    const by = (id: string) => (id === 'sa' ? { id: 'sa' } : undefined);
    expect(stanceBar(bar, DEF, by).map((s) => s.id)).toEqual(['sa', 'x', 'b']);
    expect(stanceBar(bar, undefined, by).map((s) => s.id)).toEqual(['a', 'x', 'b']);
  });
  it('gộp luật tài nguyên của nhánh với tư thế', () => {
    expect(withStanceRes({ max: 2 }, { noDecay: true })).toEqual({ max: 2, noDecay: true });
    expect(withStanceRes({ gainMul: 1.3 }, { gainMul: 1.5 })).toEqual({ gainMul: 1.3 * 1.5 });
    expect(withStanceRes(undefined, undefined)).toBeUndefined();
  });
  it('kiểm dữ liệu', () => {
    expect(stanceErrors(GOOD as never, COMMON)).toEqual([]);
    const bad = (patch: (list: typeof GOOD) => unknown[]) => stanceErrors(patch(GOOD.map((x) => ({ ...x }))) as never, COMMON).join(' | ');
    expect(bad((l) => [...l.slice(0, 4), { ...l[4]!, stance: { ...DEF, dur: 30 } }, ...l.slice(5)])).toMatch(/stance\.dur/);
    expect(bad((l) => [...l.slice(0, 4), { ...l[4]!, cd: 12 }, ...l.slice(5)])).toMatch(/gấp đôi/);
    expect(bad((l) => [...l.slice(0, 4), { ...l[4]!, stance: { dur: 10, swap: { a: 'sa' } } }, ...l.slice(5)])).toMatch(/cần 3–4 ô/);
    expect(bad((l) => [...l.slice(0, 4), { ...l[4]!, stance: { dur: 10, swap: { a: 'sa', b: 'sb', zz: 'sc' } } }, ...l.slice(5)])).toMatch(
      /chiêu chung/,
    );
    expect(bad((l) => [...l.slice(0, 5), { ...l[5]!, stanceOf: undefined }, ...l.slice(6)])).toMatch(/phải khai stanceOf/);
    expect(bad((l) => [...l.slice(0, 5), { ...l[5]!, method: 'khac' }, ...l.slice(6)])).toMatch(/cùng công pháp/);
    expect(bad((l) => [...l.slice(0, 6), { ...l[6]!, cd: 20 }, ...l.slice(7)])).toMatch(/dài hơn tư thế/);
    expect(bad((l) => [...l, sk('le', { method: 'm', stanceOf: 'st' })])).toMatch(/không nằm trong stance\.swap/);
    expect(bad((l) => [...l, sk('gia', { kind: 'stance', method: 'm' })])).toMatch(/đi cùng nhau/);
  });
});
