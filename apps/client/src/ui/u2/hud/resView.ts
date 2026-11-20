// Trạng thái thanh tài nguyên riêng (VS-2a) tại một thời điểm: hàm thuần, tách khỏi component để test không cần store.
import { resMax, resNow, type ResourceDef, type ResourceMods } from '@dtl/shared';

export interface ResView {
  def: ResourceDef;
  max: number;
  /** Lượng đang có (đã tính rụng), 0..max. */
  v: number;
  full: boolean;
}

/** `serverNow`: giờ server (ms) = giờ máy trừ độ lệch `methodOff`. */
export function resView(def: ResourceDef, res: number, resAt: number, serverNow: number, mods?: ResourceMods): ResView {
  const max = resMax(def, mods);
  const v = resNow(def, res, resAt, serverNow, mods);
  return { def, max, v, full: v >= max };
}
