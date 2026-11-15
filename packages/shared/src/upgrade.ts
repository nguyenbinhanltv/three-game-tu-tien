// Nâng cấp trang bị Phase 3-3: cường hóa +10 không vỡ đồ (Hộ Phù), khảm linh ngọc, ghép ngọc, tẩy luyện, phân giải, ràng buộc.
// Hàm thuần và hằng số dùng chung server/client. Mọi xác suất chỉ được roll ở server (client chỉ đọc bảng để hiển thị).

import type { AffixRoll, Element, ItemInst, Quality } from './items';
import { BIND_QUALITY, ELEMENTS, QUALITY_COUNT } from './items';
import type { AffixStat } from './items';
import { enhanceChance } from './formulas';
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

export const GEM_TIERS = 3;
/** Số ngọc cùng cấp ghép thành một ngọc cấp trên. */
export const GEM_MERGE_COUNT = 3;

/** Mỗi hệ: dòng chính của ngọc theo cấp 1..3. Mọi ngọc còn cộng thêm sát thương theo hệ của nó (`GEM_ELEM_DMG`). */
export const GEM_STATS: Record<Element, { stat: AffixStat; v: readonly [number, number, number] }> = {
  kim: { stat: 'atk_pct', v: [0.02, 0.035, 0.05] },
  moc: { stat: 'hp_pct', v: [0.03, 0.05, 0.08] },
  thuy: { stat: 'mp_pct', v: [0.03, 0.05, 0.08] },
  hoa: { stat: 'crit_dmg', v: [0.04, 0.07, 0.1] },
  tho: { stat: 'def_pct', v: [0.02, 0.035, 0.05] },
};
export const GEM_ELEM_DMG: readonly [number, number, number] = [0.01, 0.02, 0.03];

export function gemId(elem: Element, tier: number): string {
  return `gem_${elem}_${tier}`;
}

export function allGemIds(): string[] {
  const out: string[] = [];
  for (const e of ELEMENTS) for (let t = 1; t <= GEM_TIERS; t++) out.push(gemId(e, t));
  return out;
}

/** Tách id ngọc; null nếu không phải ngọc hợp lệ. */
export function parseGem(id: unknown): { elem: Element; tier: number } | null {
  if (typeof id !== 'string') return null;
  const m = /^gem_([a-z]+)_([1-9])$/.exec(id);
  if (!m) return null;
  const elem = (ELEMENTS as readonly string[]).includes(m[1]) ? (m[1] as Element) : null;
  const tier = Number(m[2]);
  return elem && tier >= 1 && tier <= GEM_TIERS ? { elem, tier } : null;
}

/** Các dòng chỉ số một viên ngọc cộng vào món được khảm (cùng dạng dòng phụ nên tính chung với `computePlayerStats`). */
export function gemAffixes(id: string): AffixRoll[] {
  const g = parseGem(id);
  if (!g) return [];
  const main = GEM_STATS[g.elem];
  return [
    { id: main.stat, v: main.v[g.tier - 1] },
    { id: 'elem_dmg', p: g.elem, v: GEM_ELEM_DMG[g.tier - 1] },
  ];
}

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
