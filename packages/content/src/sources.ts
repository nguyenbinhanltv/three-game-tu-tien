// Nguồn rơi của vật phẩm cho tooltip (TD-C): chỉ danh sách quái có thể rơi, KHÔNG có tỉ lệ hay số lượng.
// Dữ liệu sinh từ loot.json (chỉ server được đọc) ra `data/itemsources.json` để client dùng mà không lộ bảng rơi.
// Sinh lại: `pnpm --filter @dtl/content sources:build`; `content:check` báo lỗi nếu tệp lệch.
import { LOOT } from './loot';

/** id vật phẩm → id quái có thể rơi (theo thứ tự id). */
export function buildItemSources(): Record<string, string[]> {
  const out = new Map<string, Set<string>>();
  for (const [mon, loot] of LOOT) {
    for (const d of loot.drops) {
      if (!out.has(d.item)) out.set(d.item, new Set());
      out.get(d.item)!.add(mon);
    }
  }
  const res: Record<string, string[]> = {};
  for (const id of [...out.keys()].sort()) res[id] = [...out.get(id)!].sort();
  return res;
}
