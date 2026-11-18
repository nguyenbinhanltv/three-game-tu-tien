import { describe, expect, it } from 'vitest';
import { type Body, SEP_MAX, solveSeparation } from './separation';

const body = (x: number, z: number, r = 0.5, fixed = false): Body => ({ x, z, r, fixed, ox: 0, oz: 0 });
const dist = (a: Body, b: Body) => Math.hypot(a.x + a.ox - b.x - b.ox, a.z + a.oz - b.z - b.oz);

describe('solveSeparation', () => {
  it('hai quái chồng nhau thì tách ra tới tổng bán kính', () => {
    const a = body(0, 0);
    const b = body(0.2, 0);
    solveSeparation([a, b]);
    expect(dist(a, b)).toBeGreaterThanOrEqual(1 - 1e-6);
  });
  it('người chơi đứng yên, quái tự né; vị trí logic không đổi', () => {
    const p = body(0, 0, 0.4, true);
    const m = body(0.1, 0, 0.45);
    solveSeparation([p, m]);
    expect(p.ox).toBe(0);
    expect(p.oz).toBe(0);
    expect(m.x).toBe(0.1);
    expect(dist(p, m)).toBeGreaterThanOrEqual(0.85 - 1e-6);
  });
  it('thân nhỏ bị đẩy nhiều hơn thân lớn', () => {
    const big = body(0, 0, 1.4);
    const small = body(0.3, 0, 0.4);
    solveSeparation([big, small]);
    expect(Math.hypot(small.ox, small.oz)).toBeGreaterThan(Math.hypot(big.ox, big.oz) * 5);
  });
  it('đám 8 con quanh một người không chồng nhau', () => {
    const p = body(0, 0, 0.4, true);
    const bs = [p];
    for (let i = 0; i < 8; i++) bs.push(body(Math.cos(i) * 0.5, Math.sin(i) * 0.5, 0.45));
    solveSeparation(bs, bs.length, 8);
    for (let i = 0; i < bs.length; i++) for (let j = i + 1; j < bs.length; j++) expect(dist(bs[i]!, bs[j]!)).toBeGreaterThan(0.75);
  });
  it('trùng hẳn vẫn tách được và độ lệch bị chặn', () => {
    const a = body(3, 3);
    const b = body(3, 3);
    solveSeparation([a, b]);
    expect(dist(a, b)).toBeGreaterThan(0.9);
    const p = body(0, 0, 5, true);
    const m = body(0, 0.1, 0.5);
    solveSeparation([p, m]);
    expect(Math.hypot(m.ox, m.oz)).toBeLessThanOrEqual(SEP_MAX + 1e-9);
  });
});
