// Gợi ý vật phẩm (TD-C, mục D): nguồn, công dụng, nhãn "tốt hơn", gợi ý hành động. Mọi thứ suy từ dữ liệu
// (itemsources.json sinh từ bảng rơi của server, recipes, forge, npcs, sets), không viết tay từng món. Hàm thuần.
import { type Equipment, type InvItem, type InvSlot, isEquipSlot, type ItemDef, PROMOTE_MAT, TIER_OPEN } from '@dtl/shared';
import { ENHANCE_ORE, FORGE, ITEM, ITEM_SOURCES, itemName, itemTier, monsterName, NPC, NPCS, promoteTarget, RECIPES, SET, t } from '@dtl/content';
import { powerDelta, wornIds } from './gear';

interface InfoLine {
  text: string;
  tone?: 'good' | 'bad' | 'dim' | 'set';
}

const MAX_MONS = 3;
const MAX_USES = 3;

const npcName = (id: string): string => t(`npc.${id}.name`);

function join(names: string[], max: number): string {
  const shown = names.slice(0, max);
  const rest = names.length - shown.length;
  return rest > 0 ? t('ui.tip.more', { list: shown.join(', '), n: rest }) : shown.join(', ');
}

/** Dòng "Nguồn": quái có thể rơi, nơi chế/rèn, cửa hàng. */
export function itemSources(id: string): InfoLine[] {
  const out: InfoLine[] = [];
  const mons = ITEM_SOURCES[id];
  if (mons?.length) out.push({ text: t('ui.tip.src.drop', { list: join(mons.map(monsterName), MAX_MONS) }) });
  const craft = RECIPES.filter((r) => r.output.id === id).map((r) => npcName(r.npc));
  if (craft.length) out.push({ text: t('ui.tip.src.craft', { list: join([...new Set(craft)], MAX_MONS) }) });
  const forge = FORGE.filter((f) => f.output === id).map((f) => npcName(f.npc));
  if (forge.length) out.push({ text: t('ui.tip.src.forge', { list: join([...new Set(forge)], MAX_MONS) }) });
  const shop = NPCS.filter((n) => n.sells?.includes(id)).map((n) => npcName(n.id));
  if (shop.length) out.push({ text: t('ui.tip.src.shop', { list: join(shop, MAX_MONS) }) });
  return out;
}

/** Dòng "Dùng để": nguyên liệu của công thức nào, cường hóa, Thăng Bậc. */
export function itemUses(id: string): InfoLine[] {
  const out: InfoLine[] = [];
  const outs = [
    ...RECIPES.filter((r) => r.inputs.some((i) => i.id === id)).map((r) => r.output.id),
    ...FORGE.filter((f) => f.inputs.some((i) => i.id === id)).map((f) => f.output),
  ];
  const names = [...new Set(outs)].map((o) => itemName(o));
  if (names.length) out.push({ text: t('ui.tip.use.craft', { list: join(names, MAX_USES) }) });
  if (id === ENHANCE_ORE) out.push({ text: t('ui.tip.use.enhance') });
  if (PROMOTE_MAT.includes(id)) out.push({ text: t('ui.tip.use.promote') });
  if (id.startsWith('gem_')) out.push({ text: t('ui.tip.use.gem') });
  return out;
}

/** Món trong túi tốt hơn món đang mặc: đủ cấp, ô trống hoặc lực chiến tăng. Dùng cho mũi tên xanh trên ô túi (TD-B gọi). */
export function isUpgrade(level: number, equip: Equipment, item: InvSlot, rootId: string): boolean {
  const def = item ? ITEM.get(item.id) : undefined;
  if (!item || !def || !isEquipSlot(def.kind)) return false;
  if ((def.reqLevel ?? 1) > level) return false;
  return powerDelta(level, equip, item, def, rootId) > 0;
}

/** Chưa đủ cấp để mặc (chữ đỏ). */
export function belowLevel(level: number, def: ItemDef | undefined): boolean {
  return !!def && (def.reqLevel ?? 1) > level;
}

function isLocked(item: InvItem): boolean {
  return !!(item as InvItem & { lk?: true }).lk;
}

const PROMOTE_NPCS = (): string[] => NPCS.filter((n) => n.enhance).map((n) => npcName(n.id));

/** Gợi ý hành động theo trạng thái nhân vật. */
export function itemHints(item: InvItem, def: ItemDef, equip: Equipment, level: number, inBag: boolean): InfoLine[] {
  const out: InfoLine[] = [];
  if (inBag && isLocked(item)) out.push({ text: t('ui.tip.hint.locked'), tone: 'dim' });
  if (isEquipSlot(def.kind)) {
    const to = promoteTarget(def.id);
    if (to && itemTier(def.id) + 1 <= TIER_OPEN && PROMOTE_NPCS().length) out.push({ text: t('ui.tip.hint.promote', { npc: PROMOTE_NPCS().join(' / ') }), tone: 'good' });
  }
  const set = def.set ? SET.get(def.set) : undefined;
  if (set) {
    const worn = wornIds(equip);
    const n = worn.filter((w) => set.pieces.includes(w)).length + (worn.includes(def.id) ? 0 : 1);
    const next = set.tiers.find((tr) => tr.n > n);
    if (next && inBag) out.push({ text: t('ui.tip.hint.set', { n: next.n - n, tier: next.n }), tone: 'set' });
  }
  void level;
  return out;
}

/** Số ô túi còn trống. */
function freeSlots(inv: readonly InvSlot[]): number {
  return inv.reduce((s, x) => s + (x ? 0 : 1), 0);
}

/** Ngưỡng cảnh báo túi sắp đầy trên HUD. */
export const BAG_WARN_AT = 10;

export function bagLow(inv: readonly InvSlot[]): number | null {
  const n = freeSlots(inv);
  return n <= BAG_WARN_AT ? n : null;
}

/** Tên NPC (dùng ở UI khác nếu cần). */
function npcLabel(id: string): string {
  return NPC.get(id) ? npcName(id) : id;
}
