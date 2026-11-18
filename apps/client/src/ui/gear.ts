// Hiển thị trang bị (3-2): phẩm, dòng chính/phụ, so sánh với món đang mặc. Hàm thuần, không đụng React hay DOM.
// Số liệu so sánh lấy từ chính `computePlayerStats` của shared (cùng công thức server dùng) nên không lệch.

import {
  type AffixRoll,
  bindsOnEquip,
  gemAffixes,
  computePlayerStats,
  enhanceMul,
  EQUIP_SLOTS,
  type EquipSlot,
  type EquippedEntry,
  type Equipment,
  type InvItem,
  isEquipSlot,
  type ItemDef,
  legacyQuality,
  type PlayerStats,
  combatPower,
  type RootDef,
  type SetDef,
  type SetFxId,
  setStatuses,
  type SetTier,
  type Quality,
  type ArtifactMsg,
  ARTIFACT_MAX_LEVEL,
  artifactLevelMods,
  artifactPassive,
  clampPillQuality,
  pillPotency,
  sealStun,
} from '@dtl/shared';
import { ARTIFACT, ITEM, itemTier, PILL_QUALITY, realmName, ROOT, SET, SETS, t } from '@dtl/content';

export interface TipLine {
  text: string;
  /** `set`: dòng của bộ trang bị đang sáng (kích hoạt). */
  tone?: 'good' | 'bad' | 'dim' | 'set';
}

/** Phẩm hiển thị: món đã roll theo `inst.q`, đồ cũ theo `rarity` của mẫu. */
export function gearQuality(item: InvItem, def?: ItemDef): Quality {
  const d = def ?? ITEM.get(item.id);
  // Đan: `plus` là phẩm chất (Trung = xanh dương, Thượng = tím), không phải cường hóa.
  if (d?.kind === 'consumable' && item.plus) return Math.min(4, 1 + clampPillQuality(item.plus)) as Quality;
  return item.inst ? item.inst.q : legacyQuality(d?.rarity ?? 0);
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
  // Lỗ khảm: ngọc đã khảm kèm hiệu quả, lỗ trống mờ.
  for (const g of item.inst?.gems ?? []) {
    if (!g) {
      out.push({ text: t('ui.gem.slot_empty'), tone: 'dim' });
      continue;
    }
    out.push({ text: `◆ ${t(`item.${g}.name`)}: ${gemAffixes(g).map(affixText).join(', ')}` });
  }
  return out;
}

/** Dòng phụ: "Huyền phẩm · Pháp kiếm · Cấp vật phẩm 12". */
export function itemSub(item: InvItem, def: ItemDef): string {
  // Đan có phẩm riêng (Hạ/Trung/Thượng) thay cho phẩm trang bị.
  const q = def.kind === 'consumable' && item.plus ? t('ui.pill.q' + clampPillQuality(item.plus)) : t('ui.quality.' + gearQuality(item, def));
  const parts = [q, t('ui.item.kind.' + def.kind)];
  if (item.inst) parts.push(t('ui.item.ilvl', { n: item.inst.ilvl }));
  if (item.inst && itemTier(def.id) >= 2) parts.push(t('ui.item.tier', { n: itemTier(def.id) }));
  return parts.join(' · ');
}

export function entries(equip: Equipment): EquippedEntry[] {
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

interface StatDiff {
  key: StatKey;
  before: number;
  after: number;
}

/** Chênh lệch tổng chỉ số nếu mặc `item` vào ô của nó (món đang mặc ở ô đó bị thay). */
export function equipDiff(level: number, equip: Equipment, slot: EquipSlot, item: InvItem, root?: RootDef | null): StatDiff[] {
  const before = computePlayerStats(level, entries(equip), root ?? null, SETS);
  const next: Equipment = { ...equip, [slot]: item };
  const after = computePlayerStats(level, entries(next), root ?? null, SETS);
  const out: StatDiff[] = [];
  for (const key of STAT_KEYS) {
    const b = statValue(before, key);
    const a = statValue(after, key);
    if (Math.abs(a - b) > (PCT_KEYS.has(key) ? 0.00005 : 0.5)) out.push({ key, before: b, after: a });
  }
  return out;
}

/** Thay đổi lực chiến nếu mặc `item` vào ô của nó (0 nếu không phải trang bị mặc được). */
export function powerDelta(level: number, equip: Equipment, item: InvItem, def: ItemDef, rootId: string): number {
  if (!isEquipSlot(def.kind)) return 0;
  const root = ROOT.get(rootId) ?? null;
  const at = (eq: Equipment) => combatPower(computePlayerStats(level, entries(eq), root, SETS));
  return at({ ...equip, [def.kind]: item }) - at(equip);
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
export function compareLines(level: number, equip: Equipment, item: InvItem, def: ItemDef, rootId = ''): TipLine[] {
  const slot = def.kind;
  // Chỉ ô có chỉ số mới so sánh (skin là ô ngoại hình, không có chỉ số).
  if (!isEquipSlot(slot)) return [];
  const worn = equip[slot];
  const diffs = diffLines(equipDiff(level, equip, slot, item, ROOT.get(rootId) ?? null));
  const head = worn ? t('ui.cmp.vs', { item: t(`item.${worn.id}.name`) }) : t('ui.cmp.vs_empty');
  const req: TipLine[] = (def.reqLevel ?? 1) > level ? [{ text: t('ui.item.req', { realm: realmName(def.reqLevel!) }), tone: 'bad' }] : [];
  const dp = powerDelta(level, equip, item, def, rootId);
  const power: TipLine[] = dp === 0 ? [] : [{ text: t('ui.cmp.power', { n: (dp > 0 ? '+' : '') + dp }), tone: dp > 0 ? 'good' : 'bad' }];
  return [{ text: head, tone: 'dim' }, ...(diffs.length ? diffs : [{ text: t('ui.cmp.same'), tone: 'dim' as const }]), ...power, ...req];
}

// ---------- bộ trang bị (P3-4) ----------

/** Nội dung một bậc: chỉ số cộng và/hoặc hiệu ứng combat, đã định dạng. */
export function tierText(tier: SetTier): string {
  const parts: string[] = [];
  for (const l of tier.lines ?? []) parts.push(affixText(l));
  if (tier.fx) {
    const pct = (x: number | undefined) => pctText(x ?? 0);
    parts.push(t('set.fx.' + (tier.fx as SetFxId), { v: tier.fx === 'crit_slow' ? (tier.v ?? 0) : tier.fx === 'dich_son' ? String(tier.v ?? 0).replace('.', ',') : pct(tier.v), w: tier.fx === 'hoanh_kiem' ? (tier.w ?? 0) : pct(tier.w) }));
  }
  return parts.join('; ');
}

export function wornIds(equip: Equipment): string[] {
  return EQUIP_SLOTS.flatMap((k) => (equip[k] ? [equip[k]!.id] : []));
}

/** Các dòng bộ cho tooltip/bảng: tiêu đề x/N, danh sách món (có/chưa), từng bậc (sáng khi đã kích hoạt). */
export function setLines(set: SetDef, equip: Equipment): TipLine[] {
  const st = setStatuses([set], wornIds(equip))[0];
  const n = st?.n ?? 0;
  const out: TipLine[] = [{ text: t('ui.set.title', { name: t(`set.${set.id}.name`), n, total: set.pieces.length }), tone: n >= 2 ? 'set' : 'dim' }];
  const worn = new Set(wornIds(equip));
  for (const pid of set.pieces) out.push({ text: `${worn.has(pid) ? '◆' : '◇'} ${t(`item.${pid}.name`)}`, tone: worn.has(pid) ? 'set' : 'dim' });
  for (const tier of set.tiers) out.push({ text: `${t('ui.set.tier', { n: tier.n })} ${tierText(tier)}`, tone: n >= tier.n ? 'set' : 'dim' });
  out.push({ text: set.src === 'forge' ? t('ui.set.src.forge') : t('ui.set.src.drop', { from: t('ui.set.from.' + set.id) }), tone: 'dim' });
  return out;
}

/** Dòng bộ của một món (rỗng nếu không thuộc bộ nào). */
export function setLinesForItem(item: InvItem, equip: Equipment): TipLine[] {
  const sid = ITEM.get(item.id)?.set;
  const set = sid ? SET.get(sid) : undefined;
  return set ? setLines(set, equip) : [];
}

/** Dòng chú giải đan: phẩm chất, hiệu lực theo phẩm, hiệu ứng buff (P3-8). */
export function pillLines(item: InvItem, def: ItemDef): TipLine[] {
  if (def.kind !== 'consumable') return [];
  const q = clampPillQuality(item.plus);
  const out: TipLine[] = [];
  const isQuality = !!def.use && (def.use.hpPct || def.use.mpPct || def.use.xp || def.use.buff);
  if (!isQuality) return out;
  const pot = pillPotency(PILL_QUALITY, q);
  out.push({ text: t('ui.pill.quality_line', { q: t('ui.pill.q' + q), n: Math.round(pot * 100) }), tone: q > 0 ? 'good' : 'dim' });
  const b = def.use?.buff;
  if (b) out.push({ text: t('ui.pill.buff_line', { what: t('ui.pill.buff.' + b.kind), n: Math.round(b.pct * pot * 100), m: Math.round((b.sec * pot) / 60) }) });
  return out;
}

/** Số liệu kỹ năng pháp bảo ở cấp `lv`, dùng cho chuỗi mô tả. */
function artifactParams(id: string, lv: number): Record<string, number> {
  const def = ARTIFACT.get(id);
  if (!def) return {};
  return { r: def.radius, n: Math.round(def.power * artifactLevelMods(lv).powerMul * 100), s: Math.round((def.kind === 'seal' ? sealStun(def, lv) : (def.duration ?? 0)) * 10) / 10 };
}

/** Dòng chú giải pháp bảo phụ: kỹ năng, hồi chiêu, nội tại, cấp và linh khí (P3-8). `prog` chỉ có khi đang đeo. */
export function artifactLines(def: ItemDef, prog?: ArtifactMsg): TipLine[] {
  const a = ARTIFACT.get(def.id);
  if (!a) return [];
  const lv = prog?.id === def.id ? prog.lv : 1;
  const mods = artifactLevelMods(lv);
  const out: TipLine[] = [
    { text: `${t('ui.art.skill')}: ${t(`art.${a.id}.skill`)}`, tone: 'good' },
    { text: t(`art.${a.id}.skill.desc`, artifactParams(a.id, lv)), tone: 'dim' },
    { text: t('ui.art.cd', { n: Math.round(a.cd * mods.cdMul) }) },
  ];
  if (a.mp) out.push({ text: t('ui.art.mp', { n: a.mp }) });
  out.push({ text: `${t('ui.art.passive')}: ${t(`art.passive.${a.passive.kind}`, { n: Math.round(artifactPassive(a, lv) * 100) })}` });
  out.push({ text: t('ui.art.level', { lv, max: ARTIFACT_MAX_LEVEL }) });
  if (prog?.id === def.id) out.push({ text: prog.need > 0 ? t('ui.art.qi', { qi: prog.qi, need: prog.need }) : t('ui.art.qi_max'), tone: 'dim' });
  return out;
}
