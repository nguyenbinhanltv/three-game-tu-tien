import { describe, expect, it } from 'vitest';
import { chainBonus, chainDeadline, chainDepth, chainErrors, chainMp, NO_CHAIN, type ChainDef, type SkillDef } from './index';

const sk = (id: string, o: Partial<SkillDef> = {}): SkillDef => ({
  id,
  kind: 'damage',
  icon: id,
  unlock: 1,
  range: 20,
  cast: 0,
  cd: 6,
  mp: 10,
  power: 1,
  fx: 'x',
  ...o,
});

describe('chuỗi chiêu (VS-2b)', () => {
  const def: ChainDef = { after: ['a', 'b'], window: 3, powerMul: 1.5 };
  it('cửa sổ mở từ lúc chiêu mở áp xong tới hết `window` giây', () => {
    const opened = new Map([['a', 1000]]);
    const at = (id: string) => opened.get(id);
    expect(chainDeadline(def, at, 999)).toBe(0);
    expect(chainDeadline(def, at, 1000)).toBe(4000);
    expect(chainDeadline(def, at, 4000)).toBe(4000);
    expect(chainDeadline(def, at, 4001)).toBe(0);
    expect(chainDeadline(def, () => undefined, 2000)).toBe(0);
  });
  it('nhiều chiêu mở: lấy hạn muộn nhất còn hiệu lực', () => {
    const opened = new Map([
      ['a', 1000],
      ['b', 2500],
    ]);
    expect(chainDeadline(def, (id) => opened.get(id), 3000)).toBe(5500);
    expect(chainDeadline(def, (id) => opened.get(id), 4500)).toBe(5500);
  });
  it('thưởng mặc định là 1; linh lực làm tròn lên, không âm', () => {
    expect(chainBonus({ after: ['a'], window: 3, mpMul: 0.7 })).toEqual({ powerMul: 1, mpMul: 0.7, cdMul: 1 });
    expect(chainMp(34, { ...NO_CHAIN, mpMul: 0.7 })).toBe(24);
    expect(chainMp(30, NO_CHAIN)).toBe(30);
    expect(chainMp(0, { ...NO_CHAIN, mpMul: 0.5 })).toBe(0);
  });
  it('độ sâu đồ thị và phát hiện vòng', () => {
    const list = [
      sk('a'),
      sk('b', { chain: { after: ['a'], window: 3, powerMul: 1.5 } }),
      sk('c', { chain: { after: ['b'], window: 3, powerMul: 1.2 } }),
    ];
    const byId = new Map(list.map((s) => [s.id, s]));
    expect(chainDepth('a', byId)).toBe(0);
    expect(chainDepth('c', byId)).toBe(2);
    expect(chainErrors(list)).toEqual([]);
    const loop = [
      sk('a', { chain: { after: ['b'], window: 3, powerMul: 1.5 } }),
      sk('b', { chain: { after: ['a'], window: 3, powerMul: 1.5 } }),
    ];
    expect(chainErrors(loop).join()).toMatch(/có vòng/);
  });
  it('bắt lỗi dữ liệu', () => {
    const bad = (o: Partial<SkillDef>, extra: SkillDef[] = []) => chainErrors([sk('a'), sk('x', o), ...extra]).join();
    expect(bad({ chain: { after: [], window: 3, powerMul: 1.5 } })).toMatch(/cần 1–4/);
    expect(bad({ chain: { after: ['zz'], window: 3, powerMul: 1.5 } })).toMatch(/không phải chiêu/);
    expect(bad({ chain: { after: ['x'], window: 3, powerMul: 1.5 } })).toMatch(/chính nó/);
    expect(bad({ chain: { after: ['a', 'a'], window: 3, powerMul: 1.5 } })).toMatch(/trùng/);
    expect(bad({ chain: { after: ['a'], window: 30, powerMul: 1.5 } })).toMatch(/window/);
    expect(bad({ chain: { after: ['a'], window: 3, powerMul: 9 } })).toMatch(/powerMul/);
    expect(bad({ chain: { after: ['a'], window: 3, mpMul: 0 } })).toMatch(/mpMul/);
    expect(bad({ chain: { after: ['a'], window: 3, cdMul: 1.2 } })).toMatch(/cdMul/);
    expect(bad({ chain: { after: ['a'], window: 3 } })).toMatch(/không có thưởng/);
    expect(bad({ cast: 1.5, chain: { after: ['a'], window: 3, powerMul: 1.5 } })).toMatch(/chiêu niệm/);
    expect(bad({ ult: true, chain: { after: ['a'], window: 3, powerMul: 1.5 } })).toMatch(/tối thượng/);
    expect(bad({ kind: 'dash', chain: { after: ['a'], window: 3, cdMul: 0.8 } })).toMatch(/chiêu lướt/);
    expect(bad({ mp: 0, chain: { after: ['a'], window: 3, mpMul: 0.5 } })).toMatch(/mp > 0/);
    // Chiêu công pháp không nối sau chiêu của công pháp khác; nối sau chiêu chung thì được.
    expect(bad({ method: 'm1', chain: { after: ['o'], window: 3, powerMul: 1.5 } }, [sk('o', { method: 'm2' })])).toMatch(/công pháp khác/);
    expect(chainErrors([sk('a'), sk('x', { method: 'm1', chain: { after: ['a'], window: 3, powerMul: 1.5 } })])).toEqual([]);
    // Đường dài quá 4 bậc.
    const long = [sk('s0'), ...[1, 2, 3, 4, 5].map((i) => sk(`s${i}`, { chain: { after: [`s${i - 1}`], window: 3, powerMul: 1.1 } }))];
    expect(chainErrors(long).join()).toMatch(/tối đa 4/);
  });
});
