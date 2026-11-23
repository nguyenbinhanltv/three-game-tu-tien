import { describe, expect, it } from 'vitest';
import { buildRecap, newMatchStat, recapShare, type RecapRow } from './recap';

const row = (name: string, dealt: number, o: Partial<RecapRow> = {}): RecapRow => ({
  sid: name,
  name,
  level: 10,
  dead: false,
  ...newMatchStat(),
  dealt,
  ...o,
});

describe('bảng tổng kết trận', () => {
  it('xếp theo sát thương giảm dần, hòa thì theo tên', () => {
    const r = buildRecap('dungeon', 90, [row('B', 10), row('A', 10), row('C', 50)]);
    expect(r.rows.map((x) => x.name)).toEqual(['C', 'A', 'B']);
  });
  it('làm sạch số liệu xấu (âm, NaN) và làm tròn', () => {
    const r = buildRecap('d', -5, [row('A', 12.6, { taken: -3, heal: NaN })]);
    expect(r.secs).toBe(0);
    expect(r.rows[0]).toMatchObject({ dealt: 13, taken: 0, heal: 0, reflect: 0 });
  });
  it('phần trăm đóng góp', () => {
    expect(recapShare(25, 100)).toBe(25);
    expect(recapShare(5, 0)).toBe(0);
  });
});
