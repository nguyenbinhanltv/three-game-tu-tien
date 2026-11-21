// Tài nguyên riêng của công pháp (VS-2a): Kiếm ý, Huyết khí, Đan hỏa. Hàm thuần dùng chung server (tính thật) và client (vẽ thanh).
// Dữ liệu nằm ở packages/content/data/methods.json (`methods[].resource`, `skills[].res`).

export type ResourceId = 'kiem_y' | 'huyet_khi' | 'dan_hoa' | 'hon_luc' | 'khi_the' | 'co' | 'co_huyet' | 'cam_luc';
export const RESOURCE_IDS: readonly ResourceId[] = ['kiem_y', 'huyet_khi', 'dan_hoa', 'hon_luc', 'khi_the', 'co', 'co_huyet', 'cam_luc'];

/** Nguồn tích tài nguyên. Trường nào vắng thì nguồn đó không cho gì. */
export interface ResourceGain {
  /** Mỗi đòn thường (chiêu có `combo`) trúng đích. */
  basic?: number;
  /** Nhận đòn: mỗi 1% khí huyết tối đa bị mất cho chừng này điểm; mỗi đòn tối thiểu `takenMin`. */
  takenPct?: number;
  takenMin?: number;
  /** Hồi khí huyết thật (không tính phần tràn): mỗi 1% khí huyết tối đa của người nhận cho chừng này điểm. */
  healPct?: number;
  /** Mỗi nhịp sát thương theo thời gian (mộc độc, thiêu đốt) của mình. */
  dot?: number;
  /**
   * Thu hồn (TN-2): quái mình có góp sát thương chết trong `r` mét thì cộng `base` điểm (tinh anh `elite`, thủ lĩnh `boss`).
   * `heal`: mỗi lần thu hồn hồi chừng này phần khí huyết tối đa (0–0,05).
   */
  kill?: { base: number; elite: number; boss: number; r: number; heal?: number };
}

export interface ResourceDef {
  id: ResourceId;
  max: number;
  /** Kiểu vẽ trên HUD: ô rời (`pips`, `max` nhỏ) hay thanh liền (`bar`). */
  ui: 'pips' | 'bar';
  gain: ResourceGain;
  /** Sau `after` giây không tích thêm: rụng `perSec` điểm mỗi giây; không có `perSec` thì rụng hết ngay. */
  decay: { after: number; perSec?: number };
  /** Chiêu gây sát thương có hồi chiêu mà không khai `res` riêng thì xả hết, mỗi điểm cộng `perPoint` sát thương. */
  auto?: { perPoint: number };
}

/** Chiêu tương tác với tài nguyên `id`; người dùng tài nguyên khác thì trường này không có tác dụng. */
export interface SkillRes {
  id: ResourceId;
  /** Cộng khi chiêu áp (chiêu đánh: mỗi nhát trúng đích). */
  gain?: number;
  /** Trừ chừng này điểm nếu đủ; đủ thì hiệu quả nhân `bonusMul`. Thiếu thì chiêu vẫn ra, không thưởng, không trừ. */
  cost?: number;
  bonusMul?: number;
  /** Xả hết điểm đang có; mỗi điểm cộng `perPoint` hiệu quả. */
  spendAll?: boolean;
  perPoint?: number;
}

/** Luật riêng của nhánh công pháp tác động lên tài nguyên (VS-2d); mặc định không đổi gì. */
export interface ResourceMods {
  /** Cộng vào `max`. */
  max?: number;
  /** Xả hết thì giữ lại chừng này điểm. */
  keep?: number;
  /** Nhân mọi lượng tích. */
  gainMul?: number;
  /** Không rụng theo thời gian. */
  noDecay?: boolean;
}

export function resMax(def: ResourceDef, mods?: ResourceMods): number {
  return def.max + Math.max(0, mods?.max ?? 0);
}

/** Lượng còn lại lúc `nowMs`, biết lần tích gần nhất là `gainAtMs` với giá trị `v` ngay sau lần tích đó. */
export function resNow(def: ResourceDef, v: number, gainAtMs: number, nowMs: number, mods?: ResourceMods): number {
  if (!(v > 0)) return 0;
  const cur = Math.min(resMax(def, mods), v);
  if (mods?.noDecay) return cur;
  const over = (nowMs - gainAtMs) / 1000 - def.decay.after;
  if (over < 0) return cur;
  if (def.decay.perSec === undefined) return 0;
  return Math.max(0, cur - over * def.decay.perSec);
}

/**
 * Mốc `gainAtMs` phải ghi lại sau khi XẢ (không phải tích) để còn `left` điểm lúc `nowMs`: phần đã rụng tới giờ không bị
 * trừ lần nữa, và việc xả không làm mới thời gian giữ (đang rụng thì rụng tiếp ngay từ `left`).
 */
export function resSpendAt(def: ResourceDef, gainAtMs: number, nowMs: number): number {
  return Math.max(gainAtMs, nowMs - def.decay.after * 1000);
}

/** Cộng `n` điểm (đã nhân `gainMul`), không quá trần. `cur` là lượng đang có lúc cộng (đã tính rụng). */
export function resAdd(def: ResourceDef, cur: number, n: number, mods?: ResourceMods): number {
  if (!(n > 0) || !Number.isFinite(n)) return Math.max(0, cur);
  return Math.min(resMax(def, mods), Math.max(0, cur) + n * (mods?.gainMul ?? 1));
}

/** Điểm tích khi nhận `dmg` sát thương (đã trừ khiên) với khí huyết tối đa `mhp`. */
export function resFromTaken(def: ResourceDef, dmg: number, mhp: number): number {
  const g = def.gain;
  if (!g.takenPct || !(dmg > 0) || !(mhp > 0)) return 0;
  return Math.max(g.takenMin ?? 0, (dmg / mhp) * 100 * g.takenPct);
}

/** Điểm thu hồn khi một quái chết cách người chơi `dist` mét (0 = ngoài tầm hoặc tài nguyên không thu hồn). */
export function resFromKill(def: ResourceDef, kind: 'mob' | 'elite' | 'boss', dist: number): number {
  const k = def.gain.kill;
  if (!k || !(dist <= k.r)) return 0;
  return kind === 'boss' ? k.boss : kind === 'elite' ? k.elite : k.base;
}

/** Điểm tích khi hồi được `healed` khí huyết thật cho người có khí huyết tối đa `mhp`. */
export function resFromHeal(def: ResourceDef, healed: number, mhp: number): number {
  if (!def.gain.healPct || !(healed > 0) || !(mhp > 0)) return 0;
  return (healed / mhp) * 100 * def.gain.healPct;
}

export interface ResSpend {
  /** Lượng còn lại sau khi xả. */
  left: number;
  /** Điểm đã xả. */
  spent: number;
  /** Hệ số nhân hiệu quả chiêu (1 = không thưởng). */
  mul: number;
}

/**
 * Chiêu xả tài nguyên. `cur`: lượng đang có; `sr`: phần `res` của chiêu (chỉ khi đúng tài nguyên của người dùng);
 * `autoOk`: chiêu thuộc diện xả tự động (gây sát thương, có hồi chiêu) khi tài nguyên có `auto` và chiêu không khai `res`.
 */
export function resSpend(def: ResourceDef, cur: number, sr: SkillRes | undefined, autoOk: boolean, mods?: ResourceMods): ResSpend {
  const have = Math.max(0, cur);
  const none: ResSpend = { left: have, spent: 0, mul: 1 };
  const own = sr && sr.id === def.id ? sr : undefined;
  const keep = Math.max(0, mods?.keep ?? 0);
  if (own?.spendAll || (!own && autoOk && def.auto)) {
    const per = own ? (own.perPoint ?? 0) : def.auto!.perPoint;
    const spent = Math.max(0, have - keep);
    if (spent <= 0) return none;
    // Thưởng tính theo điểm nguyên đã xả (thanh liền làm tròn xuống) để hai bên client/server ra cùng số.
    return { left: have - spent, spent, mul: 1 + per * Math.floor(spent) };
  }
  if (own?.cost && own.cost > 0) {
    if (have < own.cost) return none;
    return { left: have - own.cost, spent: own.cost, mul: own.bonusMul ?? 1 };
  }
  return none;
}

/** Kiểm dữ liệu một `ResourceDef`; trả danh sách lỗi (rỗng = hợp lệ). */
export function resourceErrors(def: ResourceDef, at: string): string[] {
  const errs: string[] = [];
  if (!RESOURCE_IDS.includes(def.id)) errs.push(`${at}: tài nguyên "${def.id}" lạ`);
  if (!(Number.isInteger(def.max) && def.max >= 1 && def.max <= 200)) errs.push(`${at}: max phải là số nguyên 1–200`);
  if (def.ui !== 'pips' && def.ui !== 'bar') errs.push(`${at}: ui phải là pips hoặc bar`);
  if (def.ui === 'pips' && def.max > 9) errs.push(`${at}: kiểu pips tối đa 9 ô`);
  const g = def.gain ?? {};
  const vals = [g.basic, g.takenPct, g.takenMin, g.healPct, g.dot, g.kill?.base].filter((x) => x !== undefined);
  const k = g.kill;
  if (k) {
    if (!(k.base > 0 && k.elite >= k.base && k.boss >= k.elite && k.boss <= def.max))
      errs.push(`${at}: kill cần 0 < base ≤ elite ≤ boss ≤ max`);
    if (!(k.r > 0 && k.r <= 40)) errs.push(`${at}: kill.r trong (0; 40] mét`);
    if (k.heal !== undefined && !(k.heal > 0 && k.heal <= 0.05)) errs.push(`${at}: kill.heal trong (0; 0,05]`);
  }
  if (!vals.length) errs.push(`${at}: gain phải có ít nhất một nguồn tích`);
  if (vals.some((x) => !(typeof x === 'number' && x > 0 && x <= def.max))) errs.push(`${at}: gain phải dương và không quá max`);
  if (!(def.decay?.after > 0 && def.decay.after <= 60)) errs.push(`${at}: decay.after 0–60 giây`);
  if (def.decay?.perSec !== undefined && !(def.decay.perSec > 0)) errs.push(`${at}: decay.perSec phải dương`);
  if (def.auto && !(def.auto.perPoint > 0 && def.auto.perPoint * def.max <= 1)) errs.push(`${at}: auto.perPoint × max không quá +100%`);
  return errs;
}

/** Kiểm phần `res` của một chiêu so với trần `max` của tài nguyên đó. */
export function skillResErrors(sr: SkillRes, max: number | undefined, at: string): string[] {
  const errs: string[] = [];
  if (max === undefined) return [`${at}: res.id "${sr.id}" không thuộc công pháp nào`];
  if (sr.gain !== undefined && !(sr.gain > 0 && sr.gain <= max)) errs.push(`${at}: res.gain phải dương và không quá ${max}`);
  if (sr.cost !== undefined && !(sr.cost > 0 && sr.cost <= max)) errs.push(`${at}: res.cost phải dương và không quá ${max}`);
  if (sr.cost !== undefined && sr.spendAll) errs.push(`${at}: res chỉ chọn một trong cost hoặc spendAll`);
  if (sr.cost !== undefined && !(sr.bonusMul !== undefined && sr.bonusMul > 1 && sr.bonusMul <= 3))
    errs.push(`${at}: res.cost cần bonusMul trong (1, 3]`);
  if (sr.spendAll && !(sr.perPoint !== undefined && sr.perPoint > 0 && sr.perPoint * max <= 1.5))
    errs.push(`${at}: res.spendAll cần perPoint dương, perPoint × max không quá +150%`);
  if (sr.gain === undefined && sr.cost === undefined && !sr.spendAll) errs.push(`${at}: res không có tác dụng (thiếu gain/cost/spendAll)`);
  return errs;
}
