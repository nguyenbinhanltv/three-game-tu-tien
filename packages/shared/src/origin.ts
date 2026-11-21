// Bản Nguyên (TN-1): 14 nguồn, thay bảng linh căn ngũ hành. Dữ liệu ở packages/content/data/origins.json; module này chỉ có
// kiểu và luật thuần. Sáu nguồn nhóm `real` (ngũ hành + Lôi) là thứ người chơi mang; tám nguồn còn lại có dữ liệu nhưng khóa
// theo chương (`chapter`), server không cho chọn. Bậc Bản Nguyên 0..3 do Huyền Kiếp nâng (`huyenOriginTier`), không lưu riêng.

export type OriginGroup = 'real' | 'void' | 'special';
export const ORIGIN_GROUPS: readonly OriginGroup[] = ['real', 'void', 'special'];

/** Phần cộng chỉ số phụ của một nguồn (phân số: 0,05 = 5%). */
export interface OriginStat {
  atkPct?: number;
  defPct?: number;
  mpPct?: number;
  critRate?: number;
  healRecv?: number;
}

export interface OriginDef {
  id: string;
  group: OriginGroup;
  /** Hệ ngũ hành được cộng sát thương (chỉ ngũ hành có). */
  elem?: string;
  /** +% sát thương chiêu cùng hệ `elem`. */
  elemDmg?: number;
  /** +% sát thương mọi chiêu (nguồn không thuộc vòng ngũ hành, như Lôi). */
  allDmg?: number;
  stat: OriginStat;
  /** Màu đại diện (hex 6 ký tự) cho giao diện và VFX. */
  color: string;
  /** Chương mở nguồn này. Có trường này = đang KHÓA: chưa chọn được, chưa có nội tại. */
  chapter?: number;
}

/** Bậc Bản Nguyên cao nhất (ba chuỗi Huyền Kiếp). */
export const ORIGIN_TIER_MAX = 3;
/** Mỗi bậc nhân thưởng của nguồn thêm chừng này. */
export const ORIGIN_TIER_STEP = 0.25;

/** Nguồn đã mở cho người chơi chọn chưa. */
export function originOpen(def: OriginDef): boolean {
  return def.chapter === undefined;
}

/** Hệ số nhân thưởng theo bậc (bậc lạ/âm coi như 0, quá trần thì chặn). */
export function originTierMul(tier: number): number {
  const n = Number.isFinite(tier) ? Math.max(0, Math.min(ORIGIN_TIER_MAX, Math.floor(tier))) : 0;
  return 1 + ORIGIN_TIER_STEP * n;
}

/** Nguồn với thưởng đã nhân theo bậc. Bậc 0 trả đúng đối tượng gốc. */
export function originAtTier<T extends OriginDef | null | undefined>(def: T, tier: number): T {
  const mul = originTierMul(tier);
  if (!def || mul === 1) return def;
  const stat: OriginStat = {};
  for (const [k, v] of Object.entries(def.stat) as [keyof OriginStat, number][]) stat[k] = v * mul;
  return {
    ...def,
    ...(def.elemDmg !== undefined ? { elemDmg: def.elemDmg * mul } : {}),
    ...(def.allDmg !== undefined ? { allDmg: def.allDmg * mul } : {}),
    stat,
  };
}

const HEX6 = /^[0-9a-f]{6}$/i;
const STAT_KEYS: readonly string[] = ['atkPct', 'defPct', 'mpPct', 'critRate', 'healRecv'];

/**
 * Kiểm bảng Bản Nguyên; trả danh sách lỗi (rỗng = hợp lệ).
 * `elements`: các hệ ngũ hành; `rootIds`: các nguồn người chơi được mang (phải là nguồn `real` đã mở, đứng đầu bảng theo đúng thứ tự).
 */
export function originErrors(origins: readonly OriginDef[], elements: readonly string[], rootIds: readonly string[]): string[] {
  const errs: string[] = [];
  const ids = new Set<string>();
  for (const o of origins) {
    const at = `origin ${o.id}`;
    if (!/^[a-z0-9_]+$/.test(o.id)) errs.push(`${at}: id phải là snake_case`);
    if (ids.has(o.id)) errs.push(`${at}: trùng id`);
    ids.add(o.id);
    if (!ORIGIN_GROUPS.includes(o.group)) errs.push(`${at}: nhóm "${o.group}" lạ`);
    if (!HEX6.test(o.color ?? '')) errs.push(`${at}: color phải là hex 6 ký tự`);
    const stats = Object.entries(o.stat ?? {});
    for (const [k] of stats) if (!STAT_KEYS.includes(k)) errs.push(`${at}: chỉ số phụ "${k}" lạ`);
    if (!originOpen(o)) {
      if (!(Number.isInteger(o.chapter) && o.chapter! >= 1)) errs.push(`${at}: chapter phải là số nguyên ≥ 1`);
      if (o.group === 'real') errs.push(`${at}: nguồn nhóm real không khóa theo chương`);
      if (o.elem !== undefined || o.elemDmg !== undefined || o.allDmg !== undefined || stats.length)
        errs.push(`${at}: nguồn đang khóa chưa được có thưởng`);
      continue;
    }
    if (o.group !== 'real') errs.push(`${at}: nguồn nhóm ${o.group} phải khai chapter (đang khóa)`);
    if (o.elem !== undefined) {
      if (!elements.includes(o.elem)) errs.push(`${at}: hệ ${o.elem} không hợp lệ`);
      if (o.elem !== o.id) errs.push(`${at}: nguồn ngũ hành phải cộng đúng hệ của mình`);
      if (!(o.elemDmg! > 0 && o.elemDmg! <= 0.1)) errs.push(`${at}: elemDmg phải trong (0; 0,1] (thiết kế: +8%)`);
      if (o.allDmg !== undefined) errs.push(`${at}: nguồn ngũ hành không cộng allDmg`);
    } else {
      if (o.elemDmg !== undefined) errs.push(`${at}: có elemDmg mà thiếu elem`);
      if (!(o.allDmg! > 0 && o.allDmg! <= 0.05)) errs.push(`${at}: nguồn ngoài ngũ hành cần allDmg trong (0; 0,05]`);
    }
    if (stats.length !== 1 || !(stats[0]![1] > 0 && stats[0]![1] <= 0.05)) errs.push(`${at}: đúng một chỉ số phụ, tối đa +5%`);
  }
  for (const [i, id] of rootIds.entries()) {
    const o = origins[i];
    if (!o || o.id !== id) errs.push(`origins.json: vị trí ${i + 1} phải là "${id}" (các nguồn người chơi mang đứng đầu, đúng thứ tự)`);
    else if (!originOpen(o) || o.group !== 'real') errs.push(`origin ${id}: nguồn người chơi mang phải thuộc nhóm real và đã mở`);
  }
  for (const g of ORIGIN_GROUPS) if (!origins.some((o) => o.group === g)) errs.push(`origins.json: thiếu nhóm ${g}`);
  return errs;
}
