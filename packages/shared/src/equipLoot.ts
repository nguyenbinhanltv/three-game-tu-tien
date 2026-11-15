// Rơi trang bị Phase 3-2 (hàm thuần, server gọi với rng thật; test và sim gọi với rng có seed).
// Bảng rơi (`EquipRollDef`) nằm ở loot.json: CHỈ server import, client không bao giờ biết tỉ lệ.

import type { EquipRollDef, EquipSlot, ItemDef } from './types';
import type { ItemSysData, Quality } from './items';
import { MAX_ILVL, QUALITY_COUNT } from './items';
import { clamp } from './noise';

export interface EquipDrop {
  id: string;
  ilvl: number;
  q: Quality;
}

/** Chọn chỉ số theo trọng số; trả -1 nếu tổng bằng 0. */
function pickWeighted(weights: number[], rng: () => number): number {
  let total = 0;
  for (const w of weights) total += w > 0 ? w : 0;
  if (total <= 0) return -1;
  let r = rng() * total;
  for (let i = 0; i < weights.length; i++) {
    if (weights[i] <= 0) continue;
    r -= weights[i];
    if (r < 0) return i;
  }
  return weights.length - 1;
}

export function pickQuality(weights: number[], rng: () => number): Quality | null {
  const i = pickWeighted(weights.slice(0, QUALITY_COUNT), rng);
  return i < 0 ? null : (i as Quality);
}

/** Các mẫu của ô `slot` hợp với `ilvl`: những mẫu có reqLevel cao nhất mà không vượt `ilvl` (tên đồ theo cảnh giới). */
export function templatesFor(items: readonly ItemDef[], slot: EquipSlot, ilvl: number): ItemDef[] {
  let best = -1;
  let out: ItemDef[] = [];
  for (const it of items) {
    if (it.kind !== slot) continue;
    const req = it.reqLevel ?? 1;
    if (req > ilvl) continue;
    if (req > best) {
      best = req;
      out = [it];
    } else if (req === best) out.push(it);
  }
  return out;
}

/** Ô nào có thể rơi: có chỉ số (trọng số ô > 0) và có ít nhất một mẫu. */
export function droppableSlots(data: ItemSysData, items: readonly ItemDef[]): EquipSlot[] {
  return data.slots.filter((s) => s.weight > 0 && items.some((i) => i.kind === s.id)).map((s) => s.id);
}

/**
 * Roll mọi `EquipRollDef` của một quái: mỗi lần qua xác suất thì chọn phẩm, ô, mẫu và ilvl (cấp quái ±1 + bonus).
 * Trả danh sách món cần `addRolled` (server tự roll dòng chính/phụ với seed riêng).
 */
export function rollEquipDrops(rolls: readonly EquipRollDef[] | undefined, data: ItemSysData, items: readonly ItemDef[], monLevel: number, rng: () => number): EquipDrop[] {
  const out: EquipDrop[] = [];
  if (!rolls) return out;
  const slots = droppableSlots(data, items);
  for (const r of rolls) {
    if (!(rng() < r.chance)) continue;
    const q = pickQuality(r.q, rng);
    if (q === null) continue;
    const pool = r.slots ? slots.filter((s) => (r.slots![s] ?? 0) > 0) : slots;
    const si = pickWeighted(pool.map((s) => (r.slots ? r.slots[s]! : 1)), rng);
    if (si < 0) continue;
    const ilvl = clamp(Math.round(monLevel + (r.ilvlBonus ?? 0) + Math.floor(rng() * 3) - 1), 1, MAX_ILVL);
    const tpls = templatesFor(items, pool[si], ilvl);
    if (!tpls.length) continue;
    out.push({ id: tpls[Math.floor(rng() * tpls.length)].id, ilvl, q });
  }
  return out;
}
