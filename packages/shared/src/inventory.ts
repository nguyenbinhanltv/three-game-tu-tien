// Túi đồ (TD-A): phân loại, lực chiến, thuật toán sắp xếp. Dùng chung client và server.
import { INV_SIZE, type InvItem, type InvSlot, type ItemDef } from './types';
import { isWearSlot, legacyQuality, type PlayerStats } from './items';

export type ItemCategory = 'gear' | 'pill' | 'material' | 'quest' | 'other';

/** Thứ tự loại khi sắp xếp và hiển thị tab. */
export const CATEGORY_ORDER: readonly ItemCategory[] = ['gear', 'pill', 'material', 'quest', 'other'];

/** Loại của vật phẩm: trang bị theo ô, đan (consumable), nguyên liệu, nhiệm vụ (cờ `quest`), còn lại. */
export function itemCategory(def: ItemDef | undefined | null): ItemCategory {
  if (!def) return 'other';
  if (def.quest) return 'quest';
  // Skin (ô ngoại hình) xếp chung tab trang bị.
  if (isWearSlot(def.kind)) return 'gear';
  if (def.kind === 'consumable') return 'pill';
  if (def.kind === 'material') return 'material';
  return 'other';
}

/** Trọng số lực chiến (xem docs/inventory.md). */
export const POWER_W = { atk: 4, def: 3, hp: 0.2, mp: 0.1 } as const;

/**
 * Lực chiến: (công·4 + thủ·3 + khí huyết·0,2 + linh lực·0,1) nhân hệ số phụ
 * (kỳ vọng bạo kích 1 + tỉ lệ·(hệ số−1); giảm hồi chiêu ×0,5; hút máu ×2; hồi phục nhận ×0,3; sát thương tinh anh ×0,3). Làm tròn.
 */
export function combatPower(
  s: Pick<PlayerStats, 'hp' | 'mp' | 'atk' | 'def'> &
    Partial<Pick<PlayerStats, 'critRate' | 'critMul' | 'cdr' | 'lifesteal' | 'healRecv' | 'eliteDmg'>>,
): number {
  const base = s.atk * POWER_W.atk + s.def * POWER_W.def + s.hp * POWER_W.hp + s.mp * POWER_W.mp;
  const crit = 1 + (s.critRate ?? 0) * Math.max(0, (s.critMul ?? 1) - 1);
  const misc = 1 + (s.cdr ?? 0) * 0.5 + (s.lifesteal ?? 0) * 2 + (s.healRecv ?? 0) * 0.3 + (s.eliteDmg ?? 0) * 0.3;
  return Math.round(base * crit * misc);
}

export interface SortCtx {
  def(id: string): ItemDef | undefined;
  /** Tên hiển thị (để so tên). */
  name(it: InvItem): string;
}

function qualityOf(it: InvItem, def: ItemDef | undefined): number {
  return it.inst ? it.inst.q : def ? legacyQuality(def.rarity) : 0;
}

/**
 * Kế hoạch sắp xếp: trả về túi mới `INV_SIZE` ô. Gộp chồng cùng id và cùng `plus` (món khóa không gộp, không nhận phần gộp),
 * rồi xếp theo loại → phẩm (cao trước) → bậc (cao trước) → cấp yêu cầu (cao trước) → tên → +cấp → số lượng. Ô trống dồn về cuối.
 * Hàm thuần, tất định, giữ nguyên tổng số lượng từng vật phẩm.
 */
export function planSort(inv: readonly InvSlot[], ctx: SortCtx): InvSlot[] {
  const items: InvItem[] = [];
  const open = new Map<string, InvItem[]>(); // chồng chưa đầy cùng khóa
  for (const s of inv) {
    if (!s) continue;
    const it: InvItem = { ...s };
    const def = ctx.def(it.id);
    if (!it.lk && !it.inst && def && def.stack > 1) {
      const key = `${it.id}#${it.plus ?? 0}`;
      const list = open.get(key) ?? [];
      open.set(key, list);
      // Đổ vào các chồng đang mở trước, phần dư thành chồng mới.
      for (const o of list) {
        if (it.n <= 0) break;
        const put = Math.min(it.n, def.stack - o.n);
        o.n += put;
        it.n -= put;
      }
      if (it.n > 0) {
        items.push(it);
        list.push(it);
      }
      continue;
    }
    items.push(it);
  }
  const rank = new Map<InvItem, { cat: number; q: number; tier: number; lv: number; name: string }>();
  for (const it of items) {
    const def = ctx.def(it.id);
    rank.set(it, {
      cat: CATEGORY_ORDER.indexOf(itemCategory(def)),
      q: qualityOf(it, def),
      tier: def?.tier ?? 1,
      lv: def?.reqLevel ?? 0,
      name: ctx.name(it),
    });
  }
  items.sort((a, b) => {
    const x = rank.get(a)!;
    const y = rank.get(b)!;
    return (
      x.cat - y.cat ||
      y.q - x.q ||
      y.tier - x.tier ||
      y.lv - x.lv ||
      x.name.localeCompare(y.name, 'vi') ||
      (b.plus ?? 0) - (a.plus ?? 0) ||
      b.n - a.n ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
    );
  });
  const out: InvSlot[] = new Array(INV_SIZE).fill(null);
  for (let i = 0; i < items.length && i < INV_SIZE; i++) out[i] = items[i];
  return out;
}
