// Giao thức kéo thả túi → ô trang bị (TD-C). Ô túi (TD-B) đặt `dataTransfer.setData(DND_BAG_SLOT, String(chỉ số ô))` khi bắt đầu kéo;
// ô trang bị ở bảng nhân vật nhận và gửi C.EQUIP. Client chỉ gửi ý định; server kiểm tra ô và món.
import { type EquipSlot, type InvSlot, isEquipSlot } from '@dtl/shared';
import { ITEM } from '@dtl/content';

export const DND_BAG_SLOT = 'application/x-dtl-bag-slot';

/** Kéo từ túi đang lơ lửng trên ô trang bị này? (Chỉ biết được kiểu dữ liệu lúc `dragover`, chưa đọc được giá trị.) */
export function isBagDrag(types: readonly string[]): boolean {
  return types.includes(DND_BAG_SLOT);
}

/** Món ở ô túi `idx` mặc được vào ô trang bị `slot`? */
export function canDropOn(inv: readonly InvSlot[], idx: number, slot: EquipSlot): boolean {
  const it = inv[idx];
  const def = it ? ITEM.get(it.id) : undefined;
  return !!def && isEquipSlot(def.kind) && def.kind === slot;
}

export function parseBagSlot(raw: string): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 ? n : null;
}
