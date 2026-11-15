// Bộ trang bị Phase 3-4: đếm số món đang mặc, thưởng 2 món (chỉ số) và hiệu ứng bậc cao (hook combat ở server).
// Hàm thuần. Bảng bộ nằm ở packages/content/data/equipment/sets.json và được truyền vào qua `SetDef[]`.
// Server quyết định kích hoạt (tính từ trang bị thật); client chỉ dùng cùng hàm này để hiển thị x/4 và dòng sáng.

import type { AffixStat } from './items';
import { EQUIP_SLOTS, type EquipSlot } from './types';

/** Hiệu ứng combat của bậc cao: server đọc cờ này trong `executeSkill`/`hitMonster`/`damagePlayer`. */
export type SetFxId = 'phi_kiem_extra' | 'shield_boost' | 'heal_share' | 'crit_slow';

export interface SetLine {
  id: AffixStat;
  /** Tham số (ngũ hành) cho dòng `elem_res`. */
  p?: string;
  v: number;
}

export interface SetTier {
  /** Số món cần mặc. */
  n: number;
  /** Cộng chỉ số (cùng dạng dòng phụ, tính chung với trần trong `computePlayerStats`). */
  lines?: SetLine[];
  /** Hiệu ứng combat. */
  fx?: SetFxId;
  /** Tham số hiệu ứng (tỉ lệ ra thêm, +% khiên, hồi cho đồng đội...). */
  v?: number;
  /** Tham số phụ (phản sát thương, thời gian làm chậm...). */
  w?: number;
}

export interface SetLook {
  hex: string;
  trim: string;
  /** Màu ánh kiếm khi mặc món vũ khí của bộ hoặc đủ bộ. */
  blade: string;
}

export interface SetDef {
  id: string;
  /** id các món của bộ (mỗi món một ô). */
  pieces: string[];
  tiers: SetTier[];
  /** Phối màu đạo bào/vũ khí khi mặc từ `LOOK_MIN` món. */
  look: SetLook;
  /** Nguồn: chế tạo ở Thiết lão hay rơi từ ai (chỉ để hiển thị tooltip, server đọc từ loot.json/forge.json). */
  src: 'forge' | 'drop';
}

/** Từ số món này trở lên nhân vật đổi màu áo theo bộ (nhìn là biết bộ nào). */
export const SET_LOOK_MIN = 2;

export interface SetStatus {
  set: SetDef;
  /** Số món của bộ đang mặc. */
  n: number;
  /** Các bậc đã kích hoạt (n ≤ số món). */
  active: SetTier[];
}

export interface SetFx {
  /** Xác suất Phi Kiếm bắn thêm một thanh. 0 = không. */
  phiKiemExtra: number;
  /** Khiên Linh Khí Hộ Thể đỡ thêm (phân số) và phản lại (phân số phần sát thương khiên đã đỡ). */
  shieldBoost: number;
  shieldReflect: number;
  /** Hồi Nguyên Thuật hồi thêm cho đồng đội gần: tỉ lệ so với lượng hồi bản thân. */
  healShare: number;
  /** Đòn bạo kích làm chậm mục tiêu, số giây. 0 = không. */
  critSlowSec: number;
}

export const NO_SET_FX: SetFx = { phiKiemExtra: 0, shieldBoost: 0, shieldReflect: 0, healShare: 0, critSlowSec: 0 };

/** Đếm món bộ đang mặc theo `setOf(itemId)`; chỉ tính mỗi món một lần (mỗi ô một món nên tự khác nhau). */
export function setStatuses(sets: readonly SetDef[], wornIds: readonly string[]): SetStatus[] {
  const out: SetStatus[] = [];
  for (const set of sets) {
    const n = wornIds.filter((id, i) => set.pieces.includes(id) && wornIds.indexOf(id) === i).length;
    if (n > 0) out.push({ set, n, active: set.tiers.filter((t) => t.n <= n) });
  }
  return out;
}

/** Bộ đang quyết định màu áo: bộ có nhiều món nhất (từ `SET_LOOK_MIN`), hòa thì bộ khai báo trước. */
export function lookSet(statuses: readonly SetStatus[]): SetDef | null {
  let best: SetStatus | null = null;
  for (const s of statuses) if (s.n >= SET_LOOK_MIN && (!best || s.n > best.n)) best = s;
  return best ? best.set : null;
}

export function setFxOf(statuses: readonly SetStatus[]): SetFx {
  const fx: SetFx = { ...NO_SET_FX };
  for (const s of statuses) {
    for (const t of s.active) {
      switch (t.fx) {
        case 'phi_kiem_extra': fx.phiKiemExtra = Math.max(fx.phiKiemExtra, t.v ?? 0); break;
        case 'shield_boost': fx.shieldBoost = Math.max(fx.shieldBoost, t.v ?? 0); fx.shieldReflect = Math.max(fx.shieldReflect, t.w ?? 0); break;
        case 'heal_share': fx.healShare = Math.max(fx.healShare, t.v ?? 0); break;
        case 'crit_slow': fx.critSlowSec = Math.max(fx.critSlowSec, t.v ?? 0); break;
      }
    }
  }
  return fx;
}

// ---------- chế tạo ở Thiết lão ----------

/** Công thức chế một món của bộ. Phẩm do server roll theo `q` (trọng số 5 phẩm), dòng chính/phụ roll như đồ rơi. */
export interface ForgeRecipe {
  id: string;
  npc: string;
  /** id món của bộ (mẫu). */
  output: string;
  /** Cấp vật phẩm của món chế ra. */
  ilvl: number;
  /** Trọng số 5 phẩm Phàm..Thiên. */
  q: number[];
  inputs: { id: string; n: number }[];
  gold: number;
}

// ---------- phụ kiện hình dáng (hiển thị) ----------

/** Thứ tự ô trong mã phụ kiện (mỗi ô một ký tự), khớp `EQUIP_SLOTS`. */
const ACC_SLOTS: readonly EquipSlot[] = EQUIP_SLOTS;

/**
 * Mã phụ kiện của người chơi cho client dựng hình: mỗi ô trang bị một ký tự, '0' = không phải đồ bộ, '1'..'9' = thứ tự
 * (từ 1) của bộ trong bảng `sets`. Trả '' nếu không mặc món bộ nào (đa số người chơi), để schema không tốn byte.
 * Không phụ thuộc số món, nên một món lẻ cũng hiện phụ kiện của nó.
 */
export function accessoryCode(sets: readonly SetDef[], equip: Partial<Record<EquipSlot, { id: string } | undefined>>): string {
  let any = false;
  let out = '';
  for (const slot of ACC_SLOTS) {
    const id = equip[slot]?.id;
    const i = id ? sets.findIndex((s) => s.pieces.includes(id)) : -1;
    if (i >= 0 && i < 9) any = true;
    out += i >= 0 && i < 9 ? String(i + 1) : '0';
  }
  return any ? out : '';
}

/** Giải mã `accessoryCode`: id bộ theo ô (ô không có phụ kiện thì vắng mặt). Mã lạ bị bỏ qua từng ký tự. */
export function parseAccessoryCode(sets: readonly SetDef[], code: string): Partial<Record<EquipSlot, string>> {
  const out: Partial<Record<EquipSlot, string>> = {};
  for (let i = 0; i < ACC_SLOTS.length && i < code.length; i++) {
    const n = code.charCodeAt(i) - 48;
    if (n >= 1 && n <= sets.length) out[ACC_SLOTS[i]] = sets[n - 1].id;
  }
  return out;
}
