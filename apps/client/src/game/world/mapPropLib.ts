import { propLibForMap, type PropMapId } from '@dtl/shared';
import { type AssetCache, assets } from '../core/assets';

/**
 * Nạp lười thư viện prop của một bản đồ mở rộng (E2). KHÔNG gọi từ `preload.ts`: tải đầu của Vân Lam không
 * được cộng thêm byte nào. Bản đồ gọi khi vào room (hoặc khi gần cổng truyền tống) để GLB về cache trước lúc rải.
 * Trả về các id đã yêu cầu; gọi nhiều lần không sao (AssetCache dùng chung request).
 */
export function prefetchMapProps(map: PropMapId, cache: AssetCache = assets, priority = 200): string[] {
  const ids: string[] = [];
  for (const p of propLibForMap(map)) {
    cache.prefetch(p.id, { priority });
    ids.push(p.id);
  }
  return ids;
}
