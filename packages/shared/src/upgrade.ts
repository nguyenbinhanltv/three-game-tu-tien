// Nâng cấp trang bị Phase 3-3: cường hóa +10 không vỡ đồ (Hộ Phù), khảm linh ngọc, ghép ngọc, tẩy luyện, phân giải, ràng buộc.
// Hàm thuần và hằng số dùng chung server/client. Mọi xác suất chỉ được roll ở server (client chỉ đọc bảng để hiển thị).

import type { ItemInst, Quality } from './items';
import { BIND_QUALITY, QUALITY_COUNT, clampTier, mainLine, MAX_TIER, socketsFor, TIER_OPEN, type ItemSysData } from './items';
import type { EquipSlot } from './types';
import { enhanceChance } from './formulas';

export * from './gems';
import type { InvItem } from './types';

// ---------- cường hóa ----------

/** Vật phẩm "Hộ Phù" (rơi từ boss): thất bại từ +7 trở lên không bị rớt cấp. */
export const WARD_ITEM = 'itm_ho_phu';
/** Từ cấp này trở lên, cường hóa thất bại sẽ rớt một cấp nếu không dùng Hộ Phù. Đồ không bao giờ vỡ. */
export const ENHANCE_RISK_FROM = 7;
/** Cấp phát sáng: kiếm lóe nhẹ từ +7, rực và có vệt kiếm khí ở +10. */
export const GLOW_STAGE_1 = 7;
export const GLOW_STAGE_2 = 10;

/** Cường hóa thất bại ở cấp `plus`: cấp mới, và có tiêu hao Hộ Phù hay không. */
export function enhanceFail(plus: number, ward: boolean): { plus: number; wardUsed: boolean } {
  if (plus < ENHANCE_RISK_FROM) return { plus, wardUsed: false };
  if (ward) return { plus, wardUsed: true };
  return { plus: plus - 1, wardUsed: false };
}

/** Bậc phát sáng của vũ khí: 0 không, 1 từ +7, 2 từ +10. */
export function glowStage(plus: number): 0 | 1 | 2 {
  return plus >= GLOW_STAGE_2 ? 2 : plus >= GLOW_STAGE_1 ? 1 : 0;
}

/** Bảng cường hóa +1 → +10 (để kiểm cân bằng và hiển thị): tỉ lệ và rủi ro rớt cấp mỗi bậc. */
export function enhanceTable(): { plus: number; chance: number; risk: boolean }[] {
  const out: { plus: number; chance: number; risk: boolean }[] = [];
  for (let p = 0; p < 10; p++) out.push({ plus: p, chance: enhanceChance(p), risk: p >= ENHANCE_RISK_FROM });
  return out;
}

// ---------- linh ngọc ----------

/** Phí khảm một viên (linh thạch). */
export function gemSocketCost(tier: number): number {
  return 20 * tier * tier;
}
/** Phí tháo ngọc: ngọc không mất, trả về túi. */
export function gemRemoveCost(tier: number): number {
  return 30 * tier;
}
/** Ghép `GEM_MERGE_COUNT` ngọc cấp `tier` thành một viên cấp `tier + 1`: linh thạch + Linh Trần. */
export function gemMergeCost(tier: number): { gold: number; dust: number } {
  return { gold: 60 * tier, dust: 2 * tier };
}

// ---------- tẩy luyện ----------

/** "Tẩy Luyện Thạch": roll lại đúng một dòng phụ, các dòng khác được khóa. */
export const REFINE_ITEM = 'itm_tay_luyen_thach';
/** "Linh Trần": nguyên liệu từ phân giải, dùng tẩy luyện và ghép ngọc. */
export const DUST_ITEM = 'itm_linh_tran';

export function refineCost(ilvl: number, q: Quality): { gold: number; stones: number; dust: number } {
  return { gold: Math.round((20 + 3 * ilvl) * (1 + 0.25 * q)), stones: 1, dust: q >= 3 ? 2 : 1 };
}

// ---------- phân giải ----------

export const SALVAGE_MAX_BATCH = 30;

/** Nguyên liệu nhận khi phân giải: Thiết Tinh theo phẩm và cường hóa, Linh Trần từ phẩm Linh trở lên. Xác định, không roll. `shopPrice`: giá mua của mẫu ở NPC (0 nếu không bán), `orePrice`: giá mua Thiết Tinh. */
export function salvageYield(q: Quality, plus: number, shopPrice = 0, orePrice = 0): { ore: number; dust: number } {
  let ore = 1 + q + Math.floor(plus / 2);
  let dust = q >= 1 ? q : 0;
  // Đồ mua được ở cửa hàng (price > 0): giá trị nguyên liệu nhận về phải thấp hơn giá mua, nếu không mua đồ rồi phân giải
  // thành cách mua Thiết Tinh rẻ hơn cửa hàng. Cửa hàng chỉ bán đồ chưa roll, nên người gọi chỉ truyền `shopPrice` cho đồ không có `inst`.
  if (shopPrice > 0) {
    if (orePrice > 0) ore = Math.min(ore, Math.floor((shopPrice - 1) / orePrice));
    // Linh Trần không bán ở cửa hàng nên không thể là lối vòng: đồ mua được thì không ra Linh Trần.
    dust = 0;
  }
  return { ore, dust };
}

// ---------- ràng buộc ----------

/** Phẩm này ràng buộc khi mặc (Địa, Thiên). */
export function bindsOnEquip(q: Quality): boolean {
  return q >= BIND_QUALITY;
}

/** Giao dịch được giữa người chơi: đồ đã ràng buộc thì không. */
export function tradable(item: InvItem): boolean {
  return !item.inst?.bound;
}

/** Áp ràng buộc khi mặc: trả bản `inst` mới (không sửa bản cũ). */
export function bindOnEquip(inst: ItemInst): ItemInst {
  return bindsOnEquip(inst.q) && !inst.bound ? { ...inst, bound: true } : inst;
}

export function isQuality(v: unknown): v is Quality {
  return Number.isInteger(v) && (v as number) >= 0 && (v as number) < QUALITY_COUNT;
}

// ---------- Thăng Bậc (E2-F) ----------

/** Nguyên liệu Thăng Bậc theo bậc ĐÍCH (chỉ số 2..6). */
export const PROMOTE_MAT: readonly (string | null)[] = [
  null,
  null,
  'itm_mach_tinh_phien',
  'itm_kinh_hoa_sa',
  'itm_tinh_quang_mac',
  'itm_tan_giac',
  'itm_hu_anh_phien',
];
export const PROMOTE_MAT_COUNT = 20;
/** Thu nhập ước một giờ ở chương đích (linh thạch, `docs/EXPANSION_DESIGN.md` 7.5); phí Thăng Bậc = 0,4 × số này. */
export const TIER_INCOME_HOUR: readonly number[] = [0, 0, 6000, 7400, 8800, 10200, 11600];
export const PROMOTE_GOLD_FRAC = 0.4;
/** Thăng Bậc trừ chừng này cấp cường hóa (tối thiểu +0). */
export const PROMOTE_ENHANCE_LOSS = 3;
/** Cấp vật phẩm tối thiểu của món sau Thăng Bậc (đầu chương đích). */
export const TIER_MIN_ILVL: readonly number[] = [1, 1, 17, 21, 25, 29, 33];

/** Món có Thăng Bậc được không: bậc đích đã mở (`TIER_OPEN`). */
export function promoteOpen(fromTier: number): boolean {
  const to = clampTier(fromTier) + 1;
  return to <= MAX_TIER && to <= TIER_OPEN;
}

export function promoteGold(toTier: number): number {
  return Math.round(PROMOTE_GOLD_FRAC * (TIER_INCOME_HOUR[clampTier(toTier)] ?? 0));
}

export function promotePlus(plus: number): number {
  return Math.max(0, plus - PROMOTE_ENHANCE_LOSS);
}

/**
 * Dựng `inst` mới sau Thăng Bậc: giữ phẩm, dòng phụ, ngọc đã khảm và ràng buộc; dòng chính roll lại theo bậc đích
 * (cấp vật phẩm nâng lên đầu chương nếu thấp hơn); thêm lỗ khảm trống nếu bậc mới có nhiều lỗ hơn.
 */
export function promoteInst(data: ItemSysData, slot: EquipSlot, inst: ItemInst, toTier: number, rng: () => number): ItemInst {
  const tier = clampTier(toTier);
  const ilvl = Math.max(inst.ilvl, TIER_MIN_ILVL[tier] ?? inst.ilvl);
  const gems = inst.gems.slice();
  while (gems.length < socketsFor(inst.q, tier)) gems.push('');
  return { ...inst, ilvl, main: mainLine(data, slot, ilvl, inst.q, rng(), tier), gems };
}
