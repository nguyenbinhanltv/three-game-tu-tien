import { describe, expect, it } from 'vitest';
import { SECT, SPAWN_POINT } from '@dtl/shared';
import type { AcquireOptions, AssetCache } from './assets';
import { MONSTER_SKINS } from './character/monsterSkins';
import { PREFETCH_PRIORITY, prefetchWorldAssets } from './preload';

function fakeCache() {
  const calls: [string, AcquireOptions][] = [];
  const viewer: [number, number][] = [];
  const cache = {
    prefetch: (id: string, o: AcquireOptions = {}) => calls.push([id, o]),
    setViewer: (x: number, z: number) => viewer.push([x, z]),
  } as unknown as AssetCache;
  return { cache, calls, viewer };
}

/** Thứ hạng như AssetCache: có `pos` thì theo khoảng cách tới người xem, không thì `priority`. */
const rank = (o: AcquireOptions, v: [number, number]) => (o.pos ? Math.hypot(o.pos.x - v[0], o.pos.z - v[1]) : (o.priority ?? 0));

describe('prefetchWorldAssets (M6-1)', () => {
  it('tải trước nhân vật, kiến trúc, quái, phi kiếm theo thứ tự gần người chơi trước', () => {
    const { cache, calls, viewer } = fakeCache();
    prefetchWorldAssets(cache, false);
    expect(viewer).toEqual([[SPAWN_POINT.x, SPAWN_POINT.z]]);
    const ids = calls.map(([id]) => id);
    expect(ids).toContain('chr_kiem_tu_nam');
    expect(ids).toContain('anim_human_base'); // thư viện clip chung (M2-3)
    expect(ids).toContain('arch_sect');
    expect(ids).toContain('mon_soi_xam');
    expect(ids).toContain('prop_phi_kiem');
    expect(new Set(ids).size).toBe(ids.length); // ba loài sói dùng chung một asset, Kiếm Linh dùng chung asset cáo
    // Boss (skin `lazy`) chỉ nạp khi gặp trong bí cảnh, không tải trước.
    const monsters = [...new Set(Object.values(MONSTER_SKINS).filter((s) => !s.lazy).map((s) => s.asset))];
    expect(ids.some((id) => id.startsWith('boss_'))).toBe(false);
    const byRank = [...calls].sort((a, b) => rank(a[1], viewer[0]) - rank(b[1], viewer[0])).map(([id]) => id);
    expect(byRank).toEqual(['chr_kiem_tu_nam', 'anim_human_base', 'arch_sect', ...monsters, 'prop_phi_kiem']);
    expect(calls.find(([id]) => id === 'arch_sect')![1].pos).toEqual({ x: SECT.x, z: SECT.z });
    expect(calls.find(([id]) => id === 'chr_kiem_tu_nam')![1].priority).toBe(PREFETCH_PRIORITY.player);
  });

  it('?models=legacy thì không tải model nhân vật/quái', () => {
    const { cache, calls } = fakeCache();
    prefetchWorldAssets(cache, true);
    expect(calls.map(([id]) => id)).toEqual(['arch_sect', 'prop_phi_kiem']);
  });
});
