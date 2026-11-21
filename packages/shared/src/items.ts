// Trang bị Phase 3-1: phẩm cấp, ngân sách chỉ số, dòng chính/dòng phụ đã roll, tổng chỉ số nhân vật từ 8 ô.
// Hàm thuần. Bảng dữ liệu (ô, phẩm, dòng phụ) nằm ở packages/content/data/equipment/*.json và được truyền vào
// qua `ItemSysData`; việc roll chỉ chạy ở server (client không bao giờ roll, chỉ hiển thị kết quả server gửi).

import { at } from './arr';
import { clamp, lerp, mulberry32 } from './noise';
import { enhanceMul, type BaseStats, playerBaseStats, CRIT_CHANCE, CRIT_MULT } from './formulas';
import type { EquipSlot, InvItem, StatBlock } from './types';
import type { RootDef } from './realm';
import { COSMETIC_SLOTS, EQUIP_SLOTS, WEAR_SLOTS, type CosmeticSlot, type WearSlot } from './types';
import { gemAffixes } from './gems';
import { ELEMENTS, type Element } from './elements';
import { STAT_PER_POINT, type AffixRoll, type AffixStat, type ItemInst, type MainStat, type Quality } from './itemtypes';

export { STAT_PER_POINT, type AffixRoll, type AffixStat, type ItemInst, type MainStat, type Quality };
export { ELEMENTS, type Element };
import { NO_SET_FX, setFxOf, setStatuses, type SetDef, type SetFx, type SetStatus } from './sets';

export const QUALITY_COUNT = 6;
/** Phẩm Thần (bậc 6): chỉ rơi cực hiếm từ boss, không chế tạo được (xem `docs/handbook/gameplay-systems.md`). */
export const QUALITY_THAN: Quality = 5;
/** Hệ số ngân sách theo phẩm (thiết kế 3.3; Thần = Thiên × 1,2). */
export const QUALITY_MUL: readonly number[] = [1, 1.15, 1.3, 1.5, 1.75, 2.1];
/** Từ phẩm này trở lên đồ bị ràng buộc khi mặc (Địa, Thiên, Thần). */
export const BIND_QUALITY: Quality = 3;
/** Số lỗ khảm ngọc theo phẩm (khảm ở `upgrade.ts`). */
export const SOCKETS_BY_QUALITY: readonly number[] = [0, 0, 1, 2, 2, 3];

// ---------- bậc trang bị (E2-F) ----------

/** Bậc trang bị gắn với chương: 1 Vân Lam, 2 Đoạn Mạch, 3 Vân Hải, 4 Thiên Khuyết (`docs/EXPANSION_DESIGN.md` 7.1), 5 Hóa Thần sơ kỳ (cấp 28, E4-F; `docs/DIVUC_DESIGN.md` 7). */
export const MAX_TIER = 5;
/** Hệ số nhân dòng chính theo bậc (khớp `REALM_MUL` để phần trang bị trong sức mạnh tổng giữ ~30%). Chỉ số 0 không dùng. */
export const TIER_MUL: readonly number[] = [1, 1, 1.6, 2.5, 3.8, 5.5];
/** Bậc cao nhất đang chơi được (E4-F: bậc 5 mở); bậc trên có dữ liệu nhưng bị khóa (Thăng Bậc từ chối). */
export const TIER_OPEN = 5;
/** Số lỗ khảm tối đa của bậc ≥ 3. */
export const MAX_SOCKETS = 3;

export function clampTier(t: unknown): number {
  const n = typeof t === 'number' && Number.isFinite(t) ? Math.floor(t) : 1;
  return Math.max(1, Math.min(MAX_TIER, n));
}

/** Số lỗ khảm: theo phẩm, mỗi bậc trên 1 thêm một lỗ cho đồ từ Huyền phẩm (tối đa `MAX_SOCKETS`). */
export function socketsFor(q: Quality, tier = 1): number {
  const base = SOCKETS_BY_QUALITY[q] ?? 0;
  if (base <= 0) return 0;
  return Math.min(MAX_SOCKETS, base + clampTier(tier) - 1);
}
/** Độ lệch ngẫu nhiên của dòng chính quanh ngân sách: ±5%. */
export const MAIN_ROLL_SPREAD = 0.05;
/** Giá trị dòng phụ tăng theo ilvl tới mức này, trên đó giữ nguyên. */
export const AFFIX_ILVL_CAP = 15;
export const MAX_ILVL = 99;
/** Trần tuyệt đối của một dòng phụ khi nạp từ DB (phân số; không phải trần cân bằng). */
export const AFFIX_ABS_MAX = 1;

export const MAIN_STATS: MainStat[] = ['atk', 'def', 'hp', 'mp'];

export type AffixParam = 'skill' | 'element';

export interface AffixDef {
  id: AffixStat;
  /** Khoảng giá trị ở ilvl đầy (trước hệ số phẩm/ilvl). */
  min: number;
  max: number;
  weight: number;
  /** Chỉ xuất hiện trên các ô này; thiếu = mọi ô có dòng phụ. */
  slots?: EquipSlot[];
  /** Dòng cần thêm một tham số (tên chiêu / ngũ hành). */
  param?: AffixParam;
}

export interface SlotDef {
  /** false: ô chỉ có đồ bộ chế ở lò rèn, không rơi ngẫu nhiên (trang sức đầu, ô 9). Mặc định rơi. */
  drop?: boolean;
  id: EquipSlot;
  /** Trọng số ô trong công thức ngân sách. 0 = ô không có chỉ số (pháp bảo phụ). */
  weight: number;
  /** Chia ngân sách dòng chính theo chỉ số (tổng = 1; rỗng nếu weight = 0). */
  main: Partial<Record<MainStat, number>>;
}

export interface QualityDef {
  id: Quality;
  /** Màu cột sáng/viền (hex). */
  color: string;
  /** Số dòng phụ. */
  affixes: number;
  /** Phần ngân sách dành cho dòng phụ (còn lại là dòng chính). */
  affixFrac: number;
}

export interface ItemSysData {
  slots: SlotDef[];
  qualities: QualityDef[];
  affixes: AffixDef[];
  params: { skill: string[]; element: string[] };
}

/** Trần chỉ số cộng dồn từ dòng phụ (thiết kế 3.3). */
export const STAT_CAPS = {
  /** Tổng tỉ lệ bạo kích (gồm gốc 10%). */
  critRate: 0.4,
  /** Sát thương bạo kích cộng thêm trên hệ số gốc. */
  critDmg: 1.0,
  cdr: 0.25,
  lifesteal: 0.03,
  moveSpeed: 0.1,
} as const;

// ---------- kiểu dữ liệu đã roll ----------

/** Trang bị đã roll: `InvItem` có `inst`. */
export type ItemInstance = InvItem & { inst: ItemInst };

export function isInstance(it: InvItem | null | undefined): it is ItemInstance {
  return !!it?.inst;
}

// ---------- giá bán ----------

/** Giá bán một đơn vị cho NPC. Trang bị đã roll: (3 + ilvl) × hệ số phẩm, không vượt giá mẫu; còn lại: giá mẫu. Server (`onSell`) và client dùng chung. */
export function sellPrice(item: InvItem, def: { sell: number }): number {
  if (!item.inst) return def.sell;
  if (def.sell <= 0) return 0;
  return Math.min(def.sell, Math.max(1, Math.round((3 + item.inst.ilvl) * (QUALITY_MUL[item.inst.q] ?? 1))));
}

// ---------- ngân sách ----------

/** Ngân sách chỉ số một món: (6 + 2,2·ilvl) × hệ số phẩm × trọng số ô. */
export function budget(ilvl: number, q: Quality, slotWeight: number): number {
  return (6 + 2.2 * ilvl) * (QUALITY_MUL[q] ?? 1) * slotWeight;
}

export function affixIlvlScale(ilvl: number): number {
  return 0.6 + (0.4 * Math.min(Math.max(ilvl, 0), AFFIX_ILVL_CAP)) / AFFIX_ILVL_CAP;
}

/** Phẩm hiển thị của đồ cũ chưa có `inst`: theo `rarity` của mẫu. */
export function legacyQuality(rarity: number): Quality {
  return clamp(Math.floor(rarity), 0, QUALITY_COUNT - 1) as Quality;
}

export function slotDef(data: ItemSysData, slot: EquipSlot): SlotDef {
  const d = data.slots.find((s) => s.id === slot);
  if (!d) throw new Error('slot không có trong dữ liệu: ' + slot);
  return d;
}

/** Bộ sinh số có seed (server tự chọn seed và ghi lại để truy vết). */
export function seededRng(seed: number): () => number {
  return mulberry32(seed >>> 0);
}

// ---------- roll ----------

function affixCandidates(data: ItemSysData, slot: EquipSlot): AffixDef[] {
  return data.affixes.filter((a) => (!a.slots || a.slots.includes(slot)) && a.weight > 0);
}

function affixValue(def: AffixDef, ilvl: number, q: Quality, r: number): number {
  // Phẩm cao lệch về đầu trên của khoảng: mix ∈ [q/8, 0,5 + q/8].
  const mix = clamp((r + q / 4) / 2, 0, 1);
  const v = lerp(def.min, def.max, mix) * affixIlvlScale(ilvl);
  return Math.round(v * 10000) / 10000;
}

/** Chọn `count` dòng phụ khác nhau (theo id + tham số) có trọng số. Trả ít hơn nếu hết dòng hợp lệ. */
export function rollAffixes(
  data: ItemSysData,
  slot: EquipSlot,
  count: number,
  ilvl: number,
  q: Quality,
  rng: () => number,
  exclude: AffixRoll[] = [],
): AffixRoll[] {
  const out: AffixRoll[] = [];
  const taken = new Set(exclude.map((a) => affixKey(a)));
  const pool = affixCandidates(data, slot);
  for (let i = 0; i < count; i++) {
    // Mỗi vòng dựng lại danh sách (id, tham số) còn trống; bảng nhỏ nên rẻ.
    const opts: { def: AffixDef; p?: string }[] = [];
    for (const def of pool) {
      if (def.param) {
        for (const p of data.params[def.param]) if (!taken.has(`${def.id}|${p}`)) opts.push({ def, p });
      } else if (!taken.has(def.id)) opts.push({ def });
    }
    if (!opts.length) break;
    // Trọng số của dòng có tham số chia đều cho các tham số để loại dòng không thành áp đảo vì có nhiều tham số.
    const weightOf = (o: { def: AffixDef }) => (o.def.param ? o.def.weight / Math.max(1, data.params[o.def.param].length) : o.def.weight);
    const total = opts.reduce((s, o) => s + weightOf(o), 0);
    let pick = rng() * total;
    let chosen = at(opts, opts.length - 1, 'affix opts');
    for (const o of opts) {
      pick -= weightOf(o);
      if (pick < 0) {
        chosen = o;
        break;
      }
    }
    const roll: AffixRoll = { id: chosen.def.id, v: affixValue(chosen.def, ilvl, q, rng()) };
    if (chosen.p !== undefined) roll.p = chosen.p;
    out.push(roll);
    taken.add(affixKey(roll));
  }
  return out;
}

export function affixKey(a: AffixRoll): string {
  return a.p !== undefined ? `${a.id}|${a.p}` : a.id;
}

/** Dòng chính của một món theo ngân sách; `rollR` ∈ [0,1) quyết định độ lệch ±5%. */
export function mainLine(
  data: ItemSysData,
  slot: EquipSlot,
  ilvl: number,
  q: Quality,
  rollR: number,
  tier = 1,
): Partial<Record<MainStat, number>> {
  const sd = slotDef(data, slot);
  const qd = at(data.qualities, q, 'qualities');
  const out: Partial<Record<MainStat, number>> = {};
  if (sd.weight <= 0) return out;
  const pts = budget(ilvl, q, sd.weight) * (TIER_MUL[clampTier(tier)] ?? 1) * (1 - qd.affixFrac) * (1 + (rollR * 2 - 1) * MAIN_ROLL_SPREAD);
  for (const st of MAIN_STATS) {
    const share = sd.main[st];
    if (share) out[st] = Math.max(1, Math.round(pts * share * STAT_PER_POINT[st]));
  }
  return out;
}

/**
 * Roll một món trang bị mới. Server gọi với `rng` có seed (ghi seed vào ledger để truy vết).
 * Ô không có chỉ số (pháp bảo phụ) không có dòng phụ.
 */
export function rollItemInstance(data: ItemSysData, slot: EquipSlot, ilvl: number, q: Quality, rng: () => number, tier = 1): ItemInst {
  const sd = slotDef(data, slot);
  const qd = at(data.qualities, q, 'qualities');
  const li = clamp(Math.round(ilvl), 1, MAX_ILVL);
  const main = mainLine(data, slot, li, q, rng(), tier);
  const affixes = sd.weight > 0 ? rollAffixes(data, slot, qd.affixes, li, q, rng) : [];
  return { q, ilvl: li, main, affixes, gems: new Array<string>(sd.weight > 0 ? socketsFor(q, tier) : 0).fill(''), bound: false };
}

/**
 * Kiểm một `inst` đọc từ DB hoặc nơi khác: trả bản đã chuẩn hóa, hoặc null nếu hỏng/vượt trần
 * (dùng khi nạp nhân vật để dữ liệu bị sửa tay không đưa chỉ số vô lý vào game).
 */
export function parseInst(data: ItemSysData, slot: EquipSlot, raw: unknown): ItemInst | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<ItemInst>;
  if (!Number.isInteger(r.q) || (r.q as number) < 0 || (r.q as number) >= QUALITY_COUNT) return null;
  if (!Number.isInteger(r.ilvl) || (r.ilvl as number) < 1 || (r.ilvl as number) > MAX_ILVL) return null;
  const q = r.q as Quality;
  const ilvl = r.ilvl as number;
  const sd = data.slots.find((s) => s.id === slot);
  const qd = data.qualities[q];
  if (!sd || !qd) return null;
  // Chỉ chặn giá trị vô lý tuyệt đối (không so với công thức hiện hành) để đổi cân bằng sau này không làm bác đồ đã rơi.
  const cap =
    budget(MAX_ILVL, (QUALITY_COUNT - 1) as Quality, Math.max(...data.slots.map((x) => x.weight))) *
    at(TIER_MUL, MAX_TIER, 'TIER_MUL') *
    (1 + MAIN_ROLL_SPREAD);
  // Hỏng từng phần thì bỏ đúng phần đó, giữ phẩm, ilvl, ràng buộc và phần còn lại (không đặt lại cả món).
  const main: Partial<Record<MainStat, number>> = {};
  if (sd.weight > 0) {
    for (const st of MAIN_STATS) {
      const v = r.main?.[st];
      if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > cap * STAT_PER_POINT[st]) continue;
      main[st] = v;
    }
  }
  const seen = new Set<string>();
  const affixes: AffixRoll[] = [];
  const maxAffixes = Math.max(...data.qualities.map((x) => x.affixes));
  for (const a of Array.isArray(r.affixes) ? (r.affixes as AffixRoll[]) : []) {
    if (affixes.length >= maxAffixes) break;
    const def = a && typeof a === 'object' ? data.affixes.find((d) => d.id === a.id) : undefined;
    if (!def || (def.slots && !def.slots.includes(slot))) continue;
    if (def.param ? typeof a.p !== 'string' || !data.params[def.param].includes(a.p) : a.p !== undefined) continue;
    // Trần tuyệt đối, không phụ thuộc cân bằng hiện hành: hạ `max` trong affixes.json không làm mất đồ đã roll.
    if (typeof a.v !== 'number' || !Number.isFinite(a.v) || a.v < 0 || a.v > AFFIX_ABS_MAX) continue;
    const k = affixKey(a);
    if (seen.has(k)) continue;
    seen.add(k);
    affixes.push(a.p !== undefined ? { id: a.id, p: a.p, v: a.v } : { id: a.id, v: a.v });
  }
  const gems = Array.isArray(r.gems) ? r.gems.filter((g): g is string => typeof g === 'string').slice(0, MAX_SOCKETS) : [];
  return { q, ilvl, main, affixes, gems, bound: !!r.bound };
}

// ---------- tổng chỉ số nhân vật ----------

export interface PlayerStats extends BaseStats {
  /** Tỉ lệ bạo kích tổng (gồm gốc), đã chặn trần. */
  critRate: number;
  /** Hệ số sát thương khi bạo kích (gốc 1,6 + dòng phụ, đã chặn trần). */
  critMul: number;
  cdr: number;
  lifesteal: number;
  healRecv: number;
  eliteDmg: number;
  /** Hệ số tốc độ di chuyển (1 = không đổi). */
  moveSpeed: number;
  /** Tên chiêu → sát thương cộng thêm (phân số). */
  skillDmg: Record<string, number>;
  elemDmg: Record<string, number>;
  elemRes: Record<string, number>;
  /** +% sát thương mọi chiêu (TN-1: Bản Nguyên ngoài ngũ hành). */
  allDmg: number;
  /** Bộ trang bị (P3-4): món đang mặc theo bộ và hiệu ứng combat đã kích hoạt. */
  sets: SetStatus[];
  setFx: SetFx;
}

/** Một ô đang mặc. `tpl` là chỉ số cố định của mẫu, chỉ dùng cho đồ cũ không có `inst`. */
export interface EquippedEntry {
  item: InvItem;
  tpl?: StatBlock;
}

/**
 * Tổng chỉ số từ cảnh giới + các ô đang mặc. Công thức: cộng phẳng (dòng chính × cường hóa), rồi nhân phần trăm.
 * Đồ cũ (không `inst`) cộng đúng như trước nên nhịp lên cấp không đổi. Linh căn/Bản Nguyên cộng ở đây (P3-7, TN-1; bậc Bản Nguyên: truyền `originAtTier(def, bậc)`); bộ trang bị, công pháp cộng ở đợt sau.
 */
export function computePlayerStats(
  level: number,
  equipped: EquippedEntry[],
  root?: RootDef | null,
  sets: readonly SetDef[] = [],
): PlayerStats {
  const b = playerBaseStats(level);
  let hp = b.hp;
  let mp = b.mp;
  let atk = b.atk;
  let def = b.def;
  let atkPct = 0;
  let defPct = 0;
  let hpPct = 0;
  let mpPct = 0;
  let critRate = 0;
  let critDmg = 0;
  let cdr = 0;
  let lifesteal = 0;
  let healRecv = 0;
  let eliteDmg = 0;
  let moveSpeed = 0;
  const skillDmg: Record<string, number> = {};
  const elemDmg: Record<string, number> = {};
  const elemRes: Record<string, number> = {};
  const addLine = (a: { id: AffixStat; p?: string; v: number }): void => {
    switch (a.id) {
      case 'atk_pct':
        atkPct += a.v;
        break;
      case 'def_pct':
        defPct += a.v;
        break;
      case 'hp_pct':
        hpPct += a.v;
        break;
      case 'mp_pct':
        mpPct += a.v;
        break;
      case 'crit_rate':
        critRate += a.v;
        break;
      case 'crit_dmg':
        critDmg += a.v;
        break;
      case 'cdr':
        cdr += a.v;
        break;
      case 'lifesteal':
        lifesteal += a.v;
        break;
      case 'heal_recv':
        healRecv += a.v;
        break;
      case 'elite_dmg':
        eliteDmg += a.v;
        break;
      case 'move_speed':
        moveSpeed += a.v;
        break;
      case 'skill_dmg':
        if (a.p) skillDmg[a.p] = (skillDmg[a.p] ?? 0) + a.v;
        break;
      case 'elem_dmg':
        if (a.p) elemDmg[a.p] = (elemDmg[a.p] ?? 0) + a.v;
        break;
      case 'elem_res':
        if (a.p) elemRes[a.p] = (elemRes[a.p] ?? 0) + a.v;
        break;
    }
  };
  for (const { item, tpl } of equipped) {
    const mul = enhanceMul(item.plus ?? 0);
    const flat: StatBlock = item.inst ? item.inst.main : (tpl ?? {});
    hp += Math.round((flat.hp ?? 0) * mul);
    mp += Math.round((flat.mp ?? 0) * mul);
    atk += Math.round((flat.atk ?? 0) * mul);
    def += Math.round((flat.def ?? 0) * mul);
    // Ngọc khảm cộng như dòng phụ (cùng trần chỉ số).
    const lines = item.inst ? [...item.inst.affixes, ...item.inst.gems.flatMap((g) => (g ? gemAffixes(g) : []))] : [];
    for (const a of lines) addLine(a);
  }
  // Bộ trang bị: thưởng chỉ số của các bậc đã kích hoạt (hiệu ứng combat ở `setFx`).
  const setSt = sets.length
    ? setStatuses(
        sets,
        equipped.map((e) => e.item.id),
      )
    : [];
  for (const s of setSt) for (const tier of s.active) for (const a of tier.lines ?? []) addLine(a);
  // Linh căn: +% sát thương hệ của mình và một chỉ số phụ nhẹ (thiết kế mục 2).
  let allDmg = 0;
  if (root) {
    if (root.elem) elemDmg[root.elem] = (elemDmg[root.elem] ?? 0) + (root.elemDmg ?? 0);
    allDmg += root.allDmg ?? 0;
    atkPct += root.stat.atkPct ?? 0;
    defPct += root.stat.defPct ?? 0;
    mpPct += root.stat.mpPct ?? 0;
    critRate += root.stat.critRate ?? 0;
    healRecv += root.stat.healRecv ?? 0;
  }
  return {
    hp: Math.round(hp * (1 + hpPct)),
    mp: Math.round(mp * (1 + mpPct)),
    atk: Math.round(atk * (1 + atkPct)),
    def: Math.round(def * (1 + defPct)),
    critRate: Math.min(CRIT_CHANCE + critRate, STAT_CAPS.critRate),
    critMul: CRIT_MULT + Math.min(critDmg, STAT_CAPS.critDmg),
    cdr: Math.min(cdr, STAT_CAPS.cdr),
    lifesteal: Math.min(lifesteal, STAT_CAPS.lifesteal),
    healRecv,
    eliteDmg,
    moveSpeed: 1 + Math.min(moveSpeed, STAT_CAPS.moveSpeed),
    skillDmg,
    elemDmg,
    elemRes,
    allDmg,
    sets: setSt,
    setFx: setSt.length ? setFxOf(setSt) : NO_SET_FX,
  };
}

export function isEquipSlot(v: unknown): v is EquipSlot {
  return typeof v === 'string' && (EQUIP_SLOTS as string[]).includes(v);
}

/** Ô ngoại hình (skin): mặc được nhưng không có chỉ số, không nâng cấp. */
export function isCosmeticSlot(v: unknown): v is CosmeticSlot {
  return typeof v === 'string' && (COSMETIC_SLOTS as string[]).includes(v);
}

/** Món có giới hạn giới tính (`ItemDef.gender`) chỉ nhân vật đúng giới mặc được; món không giới hạn thì ai cũng mặc được. */
export function wearableBy(def: { gender?: string } | undefined | null, gender: string): boolean {
  return !def?.gender || def.gender === gender;
}

/** Ô mặc được lên người: ô trang bị có chỉ số hoặc ô ngoại hình. */
export function isWearSlot(v: unknown): v is WearSlot {
  return typeof v === 'string' && (WEAR_SLOTS as string[]).includes(v);
}
