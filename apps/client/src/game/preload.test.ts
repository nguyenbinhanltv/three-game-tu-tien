import { describe, expect, it, vi } from 'vitest';
import { SECT, SPAWN_POINT } from '@dtl/shared';
import type { AcquireOptions, AssetCache } from './assets';
import { MONSTER_SKINS } from './character/monsterSkins';
import { PREFETCH_PRIORITY, prefetchWorldAssets } from './preload';

// Nhân vật nền v2 chỉ bật khi có `location` (trình duyệt), nên ở node giả hai hàm chọn id để kiểm preload có chuyển kiểu tóc đã chọn.
vi.mock('./character/playerSkins', () => ({
  playerModelId: (g: string, hair?: string) => `chr_v2_${hair === 'b' ? 'hb_' : ''}${g === 'f' ? 'nu' : 'nam'}`,
  starterOutfitId: (g: string, hair?: string) => `set_de_tu_v2_${g === 'f' ? 'nu' : 'nam'}${hair === 'b' ? '' : ''}`,
}));

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
    expect(ids).toContain('chr_v2_nam');
    expect(ids).toContain('anim_human_base'); // thư viện clip chung (M2-3)
    expect(ids).toContain('prop_kiem_thanh_phong'); // kiếm mặc định
    expect(ids).toContain('arch_sect');
    expect(ids).toContain('mon_soi_xam');
    expect(ids).toContain('prop_phi_kiem');
    expect(new Set(ids).size).toBe(ids.length); // ba loài sói dùng chung một asset, Kiếm Linh dùng chung asset cáo
    // Boss (skin `lazy`) chỉ nạp khi gặp trong bí cảnh, không tải trước.
    const monsters = [...new Set(Object.values(MONSTER_SKINS).filter((s) => !s.lazy).map((s) => s.asset))];
    expect(ids.some((id) => id.startsWith('boss_'))).toBe(false);
    const byRank = [...calls].sort((a, b) => rank(a[1], viewer[0]) - rank(b[1], viewer[0])).map(([id]) => id);
    expect(byRank).toEqual(['chr_v2_nam', 'set_de_tu_v2_nam', 'anim_human_base', 'prop_kiem_thanh_phong', 'arch_sect', ...monsters, 'prop_phi_kiem']);
    expect(calls.find(([id]) => id === 'arch_sect')![1].pos).toEqual({ x: SECT.x, z: SECT.z });
    expect(calls.find(([id]) => id === 'chr_v2_nam')![1].priority).toBe(PREFETCH_PRIORITY.player);
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
    expect(ids).toContain('chr_v2_nu');
    expect(ids).not.toContain('chr_v2_nam');
  });
});

describe('prefetchWorldAssets theo kiểu tóc đã chọn (CHR-ROLLOUT)', () => {
  it('tóc B tải chr_v2_hb_*, không tải bản tóc A; đồ tân thủ tải cùng', () => {
    const f = fakeCache();
    prefetchWorldAssets(f.cache, false, 'f', 'b');
    const ids = f.calls.map(([id]) => id);
    expect(ids).toContain('chr_v2_hb_nu');
    expect(ids).not.toContain('chr_v2_nu');
    expect(ids).toContain('set_de_tu_v2_nu');
  });

  it('không chọn tóc thì tải bản tóc A', () => {
    const f = fakeCache();
    prefetchWorldAssets(f.cache, false, 'm');
    const ids = f.calls.map(([id]) => id);
    expect(ids).toContain('chr_v2_nam');
    expect(ids).not.toContain('chr_v2_hb_nam');
  });
});
