// Phẩm chất của vật phẩm nhắc trong dòng chat (U2-7b): cùng thang 0..5 (Phàm..Thần) với `inst.q` và `ui.quality.N`.
import { legacyQuality } from '@dtl/shared';

/** Trang bị đã roll có phẩm riêng (`q` từ `sys.loot`, dùng thẳng, không cộng bù); còn lại chuẩn hóa `rarity` của mẫu như chỗ khác (kẹp 0..5). */
export function itemQuality(q: number | undefined, rarity: number): number {
  return q ?? legacyQuality(rarity);
}
