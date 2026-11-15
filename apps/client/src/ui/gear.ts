// Hiển thị trang bị (3-2): phẩm, dòng chính/phụ, so sánh với món đang mặc. Hàm thuần, không đụng React hay DOM.
// Số liệu so sánh lấy từ chính `computePlayerStats` của shared (cùng công thức server dùng) nên không lệch.

import {
  type AffixRoll,
  computePlayerStats,
  enhanceMul,
  EQUIP_SLOTS,
  type EquipSlot,
  type EquippedEntry,
  type Equipment,
  type InvItem,
  type ItemDef,
  legacyQuality,
  type PlayerStats,
  type Quality,
} from '@dtl/shared';
import { ITEM, realmName, t } from '@dtl/content';

export interface TipLine {
  text: string;
  tone?: 'good' | 'bad' | 'dim';
}

/** Phẩm hiển thị: món đã roll theo `inst.q`, đồ cũ theo `rarity` của mẫu. */
export function gearQuality(item: InvItem, def?: ItemDef): Quality {
  return item.inst ? item.inst.q : legacyQuality((def ?? ITEM.get(item.id))?.rarity ?? 0);
}

/** 0,035 → "3,5"; bỏ số lẻ thừa. */
export function pctText(v: number): string {
  const x = Math.round(v * 1000) / 10;
  return String(x).replace('.', ',');
}

export function affixText(a: AffixRoll): string {
  const p = a.p === undefined ? '' : a.id === 'skill_dmg' ? t(`skill.${a.p}.name`) : t('ui.element.' + a.p);
  return t('ui.affix.' + a.id, { v: pctText(a.v), p });
}

/** Dòng chính (đã nhân cường hóa) rồi các dòng phụ theo thứ tự đã roll. */
export function itemLines(item: InvItem, def: ItemDef): TipLine[] {
  const mul = enhanceMul(item.plus ?? 0);
  const out: TipLine[] = [];
  const flat = item.inst ? item.inst.main : (def.stats ?? {});
  if (flat.atk) out.push({ text: t('ui.stat.atk', { n: Math.round(flat.atk * mul) }) });
  if (flat.def) out.push({ text: t('ui.stat.def', { n: Math.round(flat.def * mul) }) });
  if (flat.hp) out.push({ text: t('ui.stat.hp', { n: Math.round(flat.hp * mul) }) });
  if (flat.mp) out.push({ text: t('ui.stat.mp', { n: Math.round(flat.mp * mul) }) });
  for (const a of item.inst?.affixes ?? []) out.push({ text: affixText(a) });
  return out;
}

/** Dòng phụ: "Huyền phẩm · Pháp kiếm · Cấp vật phẩm 12". */
export function itemSub(item: InvItem, def: ItemDef): string {
  const parts = [t('ui.quality.' + gearQuality(item, def)), t('ui.item.kind.' + def.kind)];
  if (item.inst) parts.push(t('ui.item.ilvl', { n: item.inst.ilvl }));
  return parts.join(' · ');
}

function entries(equip: Equipment): EquippedEntry[] {
  const out: EquippedEntry[] = [];
  for (const k of EQUIP_SLOTS) {
    const e = equip[k];
    if (e) out.push({ item: e, tpl: ITEM.get(e.id)?.stats });
  }
  return out;
}

type StatKey = 'hp' | 'mp' | 'atk' | 'def' | 'critRate' | 'critMul' | 'cdr' | 'lifesteal' | 'healRecv' | 'eliteDmg' | 'moveSpeed';
const STAT_KEYS: StatKey[] = ['atk', 'def', 'hp', 'mp', 'critRate', 'critMul', 'cdr', 'lifesteal', 'healRecv', 'eliteDmg', 'moveSpeed'];
/** Chỉ số tỉ lệ hiển thị theo phần trăm; critMul và moveSpeed là hệ số nên trừ mốc 1 (critMul: trừ gốc 1). */
const PCT_KEYS = new Set<StatKey>(['critRate', 'critMul', 'cdr', 'lifesteal', 'healRecv', 'eliteDmg', 'moveSpeed']);

function statValue(s: PlayerStats, k: StatKey): number {
  if (k === 'moveSpeed') return s.moveSpeed - 1;
  if (k === 'critMul') return s.critMul - 1;
  return s[k];
}

export interface StatDiff {
  key: StatKey;
  before: number;
  after: number;
}

/** Chênh lệch tổng chỉ số nếu mặc `item` vào ô của nó (món đang mặc ở ô đó bị thay). */
export function equipDiff(level: number, equip: Equipment, slot: EquipSlot, item: InvItem): StatDiff[] {
  const before = computePlayerStats(level, entries(equip));
  const next: Equipment = { ...equip, [slot]: item };
  const after = computePlayerStats(level, entries(next));
  const out: StatDiff[] = [];
  for (const key of STAT_KEYS) {
    const b = statValue(before, key);
    const a = statValue(after, key);
    if (Math.abs(a - b) > (PCT_KEYS.has(key) ? 0.00005 : 0.5)) out.push({ key, before: b, after: a });
  }
  return out;
}

/** "Công kích 120 → 134 (+14)", xanh khi tăng, đỏ khi giảm. */
export function diffLines(diffs: StatDiff[]): TipLine[] {
  return diffs.map((d) => {
    const pct = PCT_KEYS.has(d.key);
    const f = (v: number) => (pct ? pctText(v) + '%' : String(Math.round(v)));
    const delta = d.after - d.before;
    const sign = delta > 0 ? '+' : '';
    return { text: `${t('ui.cmp.' + d.key)} ${f(d.before)} → ${f(d.after)} (${sign}${f(delta)})`, tone: delta > 0 ? 'good' : 'bad' };
  });
}

/** Phần so sánh cho tooltip món trong túi: tiêu đề + các dòng chênh lệch. Rỗng nếu không phải trang bị. */
export function compareLines(level: number, equip: Equipment, item: InvItem, def: ItemDef): TipLine[] {
  const slot = def.kind;
  if (slot === 'material' || slot === 'consumable') return [];
  const worn = equip[slot];
  const diffs = diffLines(equipDiff(level, equip, slot, item));
  const head = worn ? t('ui.cmp.vs', { item: t(`item.${worn.id}.name`) }) : t('ui.cmp.vs_empty');
  const req: TipLine[] = (def.reqLevel ?? 1) > level ? [{ text: t('ui.item.req', { realm: realmName(def.reqLevel!) }), tone: 'bad' }] : [];
  return [{ text: head, tone: 'dim' }, ...(diffs.length ? diffs : [{ text: t('ui.cmp.same'), tone: 'dim' as const }]), ...req];
}
