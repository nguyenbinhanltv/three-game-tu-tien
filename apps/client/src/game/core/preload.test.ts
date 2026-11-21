import { describe, expect, it } from 'vitest';
import { SECT, SPAWN_POINT } from '@dtl/shared';
import type { AcquireOptions, AssetCache } from './assets';
import { MONSTER_SKINS } from '../character/monsterSkins';
import { PREFETCH_PRIORITY, prefetchWorldAssets } from './preload';

// Không có `location` (test node): mọi cờ về mặc định, tức nhân vật v3 (N-7).

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
    expect(ids).toContain('chr_v3_de_tu_nam'); // model v3 khởi đầu (bộ đang mặc chưa biết trước khi vào room)
    expect(ids).toContain('anim_ual_native'); // thư viện clip UAL của nhân vật v3
    expect(ids).toContain('anim_human_base'); // thư viện clip cũ: chỉ còn NPC cần
    expect(ids).toContain('prop_kiem_thanh_phong'); // kiếm mặc định
    expect(ids).toContain('arch_sect');
    expect(ids).toContain('mon_soi_xam');
    expect(ids).toContain('prop_phi_kiem');
    expect(new Set(ids).size).toBe(ids.length); // ba loài sói dùng chung một asset, Kiếm Linh dùng chung asset cáo
    // Boss (skin `lazy`) chỉ nạp khi gặp trong bí cảnh, không tải trước.
    const monsters = [
      ...new Set(
        Object.values(MONSTER_SKINS)
          .filter((s) => !s.lazy)
          .map((s) => s.asset),
      ),
    ];
    expect(ids.some((id) => id.startsWith('boss_'))).toBe(false);
    const byRank = [...calls].sort((a, b) => rank(a[1], viewer[0]!) - rank(b[1], viewer[0]!)).map(([id]) => id);
    expect(byRank).toEqual([
      'chr_v3_de_tu_nam',
      'anim_ual_native',
      'prop_kiem_thanh_phong',
      'arch_sect',
      'anim_human_base',
      ...monsters,
      'prop_phi_kiem',
    ]);
    expect(calls.find(([id]) => id === 'arch_sect')![1].pos).toEqual({ x: SECT.x, z: SECT.z });
    expect(calls.find(([id]) => id === 'chr_v3_de_tu_nam')![1].priority).toBe(PREFETCH_PRIORITY.player);
    // Gói clip Tripo không còn nằm trên đường tải của nhân vật mình.
    expect(calls.find(([id]) => id === 'anim_human_base')![1].priority).toBe(PREFETCH_PRIORITY.monster);
    expect(ids.some((id) => /^chr_(kiem_tu|v2)_|^anim_human_(k3|ual)$|^set_/.test(id))).toBe(false);
  });

  it('?models=legacy thì không tải model nhân vật/quái', () => {
    const { cache, calls } = fakeCache();
    prefetchWorldAssets(cache, true);
    expect(calls.map(([id]) => id)).toEqual(['arch_sect', 'prop_phi_kiem']);
  });
});

describe('prefetchWorldAssets theo giới tính', () => {
  it('chỉ tải model của giới tính đang chọn', () => {
    const f = fakeCache();
    prefetchWorldAssets(f.cache, false, 'f');
    const ids = f.calls.map(([id]) => id);
    expect(ids).toContain('chr_v3_de_tu_nu');
    expect(ids).not.toContain('chr_v3_de_tu_nam');
  });
});
