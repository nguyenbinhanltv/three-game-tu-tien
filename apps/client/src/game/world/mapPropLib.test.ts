import { describe, expect, it, vi } from 'vitest';
import { prefetchMapProps } from './mapPropLib';
import { prefetchWorldAssets } from '../core/preload';
import type { AssetCache } from '../core/assets';

describe('mapPropLib', () => {
  it('prefetch đúng prop của bản đồ', () => {
    const prefetch = vi.fn();
    const ids = prefetchMapProps('van_hai', { prefetch } as unknown as AssetCache);
    expect(ids).toContain('prop_cau_may');
    expect(ids).not.toContain('prop_cong_thanh_vo');
    expect(prefetch).toHaveBeenCalledTimes(ids.length);
  });
  it('tải đầu của Vân Lam không nạp prop bản đồ mới', () => {
    const prefetch = vi.fn();
    prefetchWorldAssets({ prefetch, setViewer: vi.fn() } as unknown as AssetCache);
    const asked = prefetch.mock.calls.map((c) => c[0] as string);
    for (const id of ['prop_cong_thanh_vo', 'prop_cau_may', 'prop_cong_khai_mach', 'prop_than_nien_chau']) expect(asked).not.toContain(id);
  });
});
