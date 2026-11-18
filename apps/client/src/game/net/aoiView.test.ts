import { describe, expect, it } from 'vitest';
import { visibleMap, visibleView } from './aoiView';
import type { WorldView } from '../entities/entities';

describe('AOI: che bản ghi rỗng của thực thể ngoài tầm', () => {
  const mk = () =>
    new Map<string, { t?: string; x: number }>([
      ['m1', { t: 'mon_soi_xam', x: 5 }],
      ['m2', { t: '', x: 0 }],
      ['m3', { t: undefined, x: 0 }],
      ['m4', { t: 'elite_x', x: 9 }],
    ]);

  it('get/has/forEach/size/lặp chỉ thấy thực thể có dữ liệu', () => {
    const src = mk();
    const v = visibleMap(src, (m) => !!m.t);
    expect(v.size).toBe(2);
    expect(v.get('m1')?.x).toBe(5);
    expect(v.get('m2')).toBeUndefined();
    expect(v.has('m3')).toBe(false);
    expect(v.has('m4')).toBe(true);
    expect(v.has('khong_co')).toBe(false);
    const seen: string[] = [];
    v.forEach((_m, k) => seen.push(k));
    expect(seen).toEqual(['m1', 'm4']);
    expect([...v.keys()]).toEqual(['m1', 'm4']);
    expect([...v.values()].map((m) => m.x)).toEqual([5, 9]);
    expect([...v].map(([k]) => k)).toEqual(['m1', 'm4']);
  });
  it('theo dõi nguồn sống: thực thể vào tầm thì hiện ra ngay', () => {
    const src = mk();
    const v = visibleMap(src, (m) => !!m.t);
    src.set('m2', { t: 'mon_yeu_lang', x: 1 });
    expect(v.has('m2')).toBe(true);
    expect(v.size).toBe(3);
    src.get('m1')!.t = undefined;
    expect(v.has('m1')).toBe(false);
  });
  it('visibleView lọc quái theo `t`, người theo `name`, giữ nguyên node và level', () => {
    const nodes = new Map();
    const state = {
      level: 'van_lam',
      players: new Map([
        ['me', { name: 'a' }],
        ['xa', { name: '' }],
      ]),
      monsters: new Map([
        ['m1', { t: 'x' }],
        ['m2', { t: '' }],
      ]),
      nodes,
    } as unknown as WorldView;
    const v = visibleView(state);
    expect(v.level).toBe('van_lam');
    expect(v.players.has('me')).toBe(true);
    expect(v.players.has('xa')).toBe(false);
    expect(v.monsters.has('m1')).toBe(true);
    expect(v.monsters.has('m2')).toBe(false);
    expect(v.nodes).toBe(nodes);
    state.level = 'kiem_trung';
    expect(v.level).toBe('kiem_trung');
  });
});
