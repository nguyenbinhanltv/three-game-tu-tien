// Cảnh giới Phase 3-7: bình cảnh (Ngưng Khí tầng 5/10/15), thử thách tâm ma, linh căn ngũ hành.
// Hàm thuần dùng chung client (hiển thị) và server (phán định). Bảng linh căn nằm ở packages/content/data/roots.json.

import { MAX_LEVEL, NGUNG_KHI_MAX, TRUC_CO_LEVEL, playerBaseStats } from './formulas';

// ---------- bình cảnh ----------

/** Các tầng có bình cảnh: đầy tu vi thì kẹt, phải qua thử thách tâm ma hoặc dùng Phá Cảnh Đan. */
export const BOTTLENECK_LEVELS: readonly number[] = [5, 10, 15];

export function isBottleneckLevel(level: number): boolean {
  return BOTTLENECK_LEVELS.includes(level);
}

/**
 * Bình cảnh đã vượt cao nhất khi chưa từng lưu (`bk` = 0): các mốc nhỏ hơn cấp hiện tại.
 * Dùng cho nhân vật cũ để người đã qua tầng 5/10 không bị chặn lại.
 */
export function initialBottleneck(level: number): number {
  let best = 0;
  for (const b of BOTTLENECK_LEVELS) if (b < level) best = b;
  return best;
}

/** Đang kẹt ở bình cảnh: cấp là mốc bình cảnh và chưa vượt (`bk` < cấp). */
export function bottleneckBlocked(level: number, bk: number): boolean {
  return isBottleneckLevel(level) && bk < level;
}

/** Kẹt thật sự: đang ở bình cảnh chưa vượt và tu vi đã đầy. */
export function bottleneckReady(level: number, bk: number, xp: number, need: number): boolean {
  return bottleneckBlocked(level, bk) && xp >= need;
}

/** Thất bại hay bỏ dở thử thách thì đợi chừng này giây mới thử lại (không mất tu vi). */
export const BOTTLENECK_RETRY_SEC = 60;
/** Thời gian tối đa của thử thách tâm ma (giây): 2–3 phút theo thiết kế. */
export const TRIAL_DURATION = 150;
/** Rời khỏi chỗ bắt đầu quá xa (mét) thì thử thách hỏng. */
export const TRIAL_RADIUS = 45;
/** Mã tin nhắn chọn đường vượt bình cảnh. */
export type BottleneckMode = 'trial' | 'pill';
export const PHA_CANH_PILL = 'itm_pha_canh_dan';

/**
 * Chỉ số "bóng tâm ma" của người chơi `level` với chỉ số hiện tại (`atk`, `def`, `hp`).
 * Bóng là chính mình ở sức yếu hơn một chút: máu ~ 80 đòn trung bình, đánh bằng ~ 40% công của mình,
 * để một người cùng cấp thắng trong chừng 1 phút nếu biết dùng khiên và hồi nguyên, còn đứng yên chịu đòn thì thua.
 */
export function shadowStats(level: number, atk: number, def: number): { hp: number; atk: number; def: number } {
  const b = playerBaseStats(level);
  const hit = Math.max(1, atk * 1.2 - def * 0.3);
  return {
    hp: Math.round(hit * 80 + b.hp * 0.3),
    atk: Math.max(1, Math.round(atk * 0.4)),
    def: Math.round(def * 0.4),
  };
}

/** Tầng sau khi vượt bình cảnh: ở 5, 10 lên 1 tầng; ở 15 chỉ mở độ kiếp (không đổi tầng). */
export function levelAfterBottleneck(level: number): number {
  return level >= NGUNG_KHI_MAX || level >= MAX_LEVEL || level >= TRUC_CO_LEVEL ? level : level + 1;
}

// ---------- linh căn ngũ hành ----------

export type RootId = 'kim' | 'moc' | 'thuy' | 'hoa' | 'tho';
export const ROOT_IDS: readonly RootId[] = ['kim', 'moc', 'thuy', 'hoa', 'tho'];

export function isRootId(v: unknown): v is RootId {
  return typeof v === 'string' && (ROOT_IDS as readonly string[]).includes(v);
}

/** Phần cộng chỉ số phụ của một linh căn (phân số: 0,05 = 5%). */
export interface RootStat {
  atkPct?: number;
  defPct?: number;
  mpPct?: number;
  critRate?: number;
  healRecv?: number;
}

export interface RootDef {
  id: RootId;
  /** Hệ ngũ hành được cộng sát thương (trùng id). */
  elem: RootId;
  /** +% sát thương chiêu cùng hệ. */
  elemDmg: number;
  stat: RootStat;
}

/** Hệ ngũ hành của từng chiêu (`SkillDef.elem` thiếu thì chiêu không thuộc hệ nào). */
export function elemDamageMul(elemDmg: Record<string, number>, elem: string | undefined): number {
  return elem ? 1 + (elemDmg[elem] ?? 0) : 1;
}

/** Giá phí đổi linh căn ở NPC (linh thạch), tăng theo cảnh giới để không thành chuyện tiện tay. */
export function rootChangeCost(level: number): number {
  return 200 + 60 * level;
}

// ---------- mã cảnh giới cho công cụ kiểm thử (`?realm=`, `/gm realm`) ----------

/**
 * Mã cảnh giới → cấp: `nk1`…`nk15` (Ngưng Khí tầng N), `tc` hoặc `tc1`…`tc3` (Trúc Cơ sơ/trung/hậu kỳ), hoặc số cấp 1…MAX_LEVEL.
 * Sai định dạng hoặc ngoài khoảng thì trả null. Chỉ dùng cho tài khoản thử; server vẫn tự kiểm quyền.
 */
export function parseRealmCode(code: unknown): number | null {
  if (typeof code === 'number') return Number.isInteger(code) && code >= 1 && code <= MAX_LEVEL ? code : null;
  if (typeof code !== 'string' || code.length > 8) return null;
  const m = /^(nk|tc)?(\d{1,2})?$/.exec(code.trim().toLowerCase());
  if (!m || (!m[1] && !m[2])) return null;
  const n = m[2] === undefined ? 1 : Number(m[2]);
  const level = m[1] === 'tc' ? TRUC_CO_LEVEL + n - 1 : n;
  if (m[1] === 'nk' && (n < 1 || n > NGUNG_KHI_MAX)) return null;
  if (m[1] === 'tc' && n < 1) return null;
  return level >= 1 && level <= MAX_LEVEL ? level : null;
}
