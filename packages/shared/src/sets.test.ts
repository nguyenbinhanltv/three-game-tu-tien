import { describe, expect, it } from 'vitest';
import { computePlayerStats, seededRng, type EquippedEntry } from './items';
import { lookSet, NO_SET_FX, setFxOf, setStatuses, type SetDef } from './sets';
import { rollEquipDrops } from './equipLoot';
import type { ItemDef } from './types';

const SET: SetDef = {
  id: 's1',
  pieces: ['a', 'b', 'c', 'd'],
  tiers: [{ n: 2, lines: [{ id: 'atk_pct', v: 0.05 }] }, { n: 4, fx: 'phi_kiem_extra', v: 0.2 }],
  look: { hex: '#112233', trim: '#445566', blade: '#778899' },
  src: 'forge',
};
const worn = (...ids: string[]): EquippedEntry[] => ids.map((id) => ({ item: { id, n: 1 } }));

describe('bộ trang bị', () => {
  it('đếm đúng số món, bậc kích hoạt theo số món, mỗi món một lần', () => {
    expect(setStatuses([SET], ['x'])).toEqual([]);
    expect(setStatuses([SET], ['a'])[0].active).toEqual([]);
    expect(setStatuses([SET], ['a', 'b'])[0].active.map((t) => t.n)).toEqual([2]);
    expect(setStatuses([SET], ['a', 'a', 'b'])[0].n).toBe(2);
    expect(setStatuses([SET], ['a', 'b', 'c', 'd'])[0].active.map((t) => t.n)).toEqual([2, 4]);
  });

  it('thưởng 2 món cộng vào công kích đúng một lần, 1 món thì không', () => {
    const none = computePlayerStats(10, [], null, [SET]).atk;
    expect(computePlayerStats(10, worn('a'), null, [SET]).atk).toBe(none);
    expect(computePlayerStats(10, worn('a', 'b'), null, [SET]).atk).toBe(Math.round(none * 1.05));
    // Không truyền bảng bộ thì không có thưởng.
    expect(computePlayerStats(10, worn('a', 'b')).atk).toBe(none);
  });

  it('hiệu ứng combat chỉ bật ở bậc cao; bộ nhiều món nhất quyết định màu', () => {
    expect(computePlayerStats(10, worn('a', 'b', 'c'), null, [SET]).setFx).toEqual(NO_SET_FX);
    expect(computePlayerStats(10, worn('a', 'b', 'c', 'd'), null, [SET]).setFx.phiKiemExtra).toBe(0.2);
    const other: SetDef = { ...SET, id: 's2', pieces: ['x', 'y', 'z'], tiers: [{ n: 2, lines: [{ id: 'def_pct', v: 0.08 }] }, { n: 3, fx: 'crit_slow', v: 1 }] };
    expect(lookSet(setStatuses([SET, other], ['a']))).toBeNull();
    expect(lookSet(setStatuses([SET, other], ['a', 'b', 'x']))?.id).toBe('s1');
    expect(lookSet(setStatuses([SET, other], ['a', 'b', 'x', 'y', 'z']))?.id).toBe('s2');
    expect(setFxOf(setStatuses([other], ['x', 'y', 'z'])).critSlowSec).toBe(1);
  });
});

describe('rơi theo bộ', () => {
  const items: ItemDef[] = [
    { id: 'plain', kind: 'robe', stack: 1, price: 0, sell: 1, rarity: 0, icon: 'p', reqLevel: 1 },
    { id: 'a', kind: 'robe', stack: 1, price: 0, sell: 1, rarity: 2, icon: 'a', reqLevel: 13, set: 's1' },
    { id: 'b', kind: 'belt', stack: 1, price: 0, sell: 1, rarity: 2, icon: 'b', reqLevel: 13, set: 's1' },
  ];
  const data = { slots: [{ id: 'robe', weight: 1, main: { def: 1 } }, { id: 'belt', weight: 1, main: { hp: 1 } }], qualities: [], affixes: [], params: { skill: [], element: [] } } as never;
  it('chỉ ra món của bộ khi bảng có set, và bảng chung không bao giờ ra món bộ', () => {
    const rng = seededRng(7);
    for (let i = 0; i < 50; i++) {
      const d = rollEquipDrops([{ chance: 1, q: [0, 0, 1, 1, 0], set: 's1' }], data, items, 15, rng);
      expect(d).toHaveLength(1);
      expect(['a', 'b']).toContain(d[0].id);
      const g = rollEquipDrops([{ chance: 1, q: [1, 0, 0, 0, 0], slots: { robe: 1 } }], data, items, 15, rng);
      expect(g[0].id).toBe('plain');
    }
  });
});
