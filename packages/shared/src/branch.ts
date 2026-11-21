// Nhánh công pháp (VS-2d): ở các mốc cảnh giới 16/20/24/28, mỗi công pháp chọn 1 trong 2–3 nhánh. Nhánh cho chiêu của nó
// (chiêu của nhánh kia không dùng được) và có thể kèm luật riêng lên tài nguyên/ấn. Hàm thuần dùng chung server (phán định),
// client (bảng chọn nhánh, hàng chiêu) và content:check. Dữ liệu ở `methods[].branches` trong methods.json.

import type { ResourceMods } from './resource';
import type { SkillDef } from './types';

/** Mốc cảnh giới mở nhánh: Trúc Cơ, Kết Đan, Nguyên Anh, Hóa Thần. */
export const BRANCH_TIERS = [16, 20, 24, 28] as const;
export type BranchTier = (typeof BRANCH_TIERS)[number];

/** Luật riêng của nhánh: bộ từ vựng nhỏ, đọc ở vài điểm móc (tài nguyên riêng, thời gian ấn). */
export interface BranchMods {
  res?: ResourceMods;
  /** Nhân thời gian tồn tại của ấn do mình đặt. */
  markDurMul?: number;
}

export interface BranchDef {
  /** id trong phạm vi công pháp (snake_case). */
  id: string;
  tier: BranchTier;
  /** Chiêu nhánh này cho dùng. Chiêu nằm ở cả hai nhánh của một mốc thì chọn nhánh nào cũng có. */
  grants: string[];
  mods?: BranchMods;
}

/** Lựa chọn của một nhân vật cho MỘT công pháp: mốc → id nhánh. */
export type BranchPicks = Partial<Record<number, string>>;

/** Phần của công pháp mà luật nhánh cần. */
export interface BranchHost {
  id: string;
  branches?: BranchDef[];
}

export function isBranchTier(n: unknown): n is BranchTier {
  return typeof n === 'number' && (BRANCH_TIERS as readonly number[]).includes(n);
}

export function branchesAt(m: BranchHost, tier: number): BranchDef[] {
  return (m.branches ?? []).filter((b) => b.tier === tier);
}

/** Nhánh đã chọn ở mốc `tier` (lựa chọn lạ/đã gỡ khỏi dữ liệu coi như chưa chọn). */
export function pickedBranch(m: BranchHost, picks: BranchPicks | undefined, tier: number): BranchDef | undefined {
  const id = picks?.[tier];
  return id ? branchesAt(m, tier).find((b) => b.id === id) : undefined;
}

/** Mốc mà chiêu `skillId` thuộc về (0 = chiêu không gắn nhánh nào, dùng tự do). */
export function skillTier(m: BranchHost, skillId: string): number {
  return (m.branches ?? []).find((b) => b.grants.includes(skillId))?.tier ?? 0;
}

export type SkillGate = 'ok' | 'need' | 'other';

/**
 * Chiêu công pháp có dùng được theo nhánh không: `ok`; `need` = mốc của chiêu chưa chọn nhánh; `other` = đã chọn nhánh khác.
 * Chiêu không gắn nhánh luôn `ok`. Điều kiện cảnh giới (`unlock`) kiểm riêng ở nơi gọi.
 */
export function skillGate(m: BranchHost | undefined, picks: BranchPicks | undefined, skillId: string): SkillGate {
  if (!m) return 'ok';
  const tier = skillTier(m, skillId);
  if (!tier) return 'ok';
  const b = pickedBranch(m, picks, tier);
  if (!b) return 'need';
  return b.grants.includes(skillId) ? 'ok' : 'other';
}

/** Mốc thấp nhất đã đủ cảnh giới mà chưa chọn nhánh (0 = không còn mốc nào chờ). HUD dùng để nhắc. */
export function pendingTier(m: BranchHost | undefined, picks: BranchPicks | undefined, level: number): number {
  if (!m) return 0;
  for (const t of BRANCH_TIERS) if (level >= t && branchesAt(m, t).length > 0 && !pickedBranch(m, picks, t)) return t;
  return 0;
}

/** Gộp luật riêng của mọi nhánh đã chọn (mốc chưa đủ cảnh giới thì không tính: đề phòng dữ liệu cũ). */
export function branchMods(m: BranchHost | undefined, picks: BranchPicks | undefined, level: number): BranchMods {
  const res: ResourceMods = {};
  let markDurMul = 1;
  if (m) {
    for (const t of BRANCH_TIERS) {
      if (level < t) continue;
      const mods = pickedBranch(m, picks, t)?.mods;
      if (!mods) continue;
      if (mods.res?.max) res.max = (res.max ?? 0) + mods.res.max;
      if (mods.res?.keep) res.keep = Math.max(res.keep ?? 0, mods.res.keep);
      if (mods.res?.gainMul) res.gainMul = (res.gainMul ?? 1) * mods.res.gainMul;
      if (mods.res?.noDecay) res.noDecay = true;
      if (mods.markDurMul) markDurMul *= mods.markDurMul;
    }
  }
  const out: BranchMods = {};
  if (Object.keys(res).length) out.res = res;
  if (markDurMul !== 1) out.markDurMul = markDurMul;
  return out;
}

export type PickBlock = 'method' | 'tier' | 'level' | 'branch' | 'taken';

/** Có chọn được nhánh `id` ở mốc `tier` không; trả lý do bị chặn hoặc null. Đã chọn rồi thì phải reset mới đổi được. */
export function pickBlock(
  m: BranchHost | undefined,
  picks: BranchPicks | undefined,
  tier: unknown,
  id: unknown,
  level: number,
): PickBlock | null {
  if (!m) return 'method';
  if (!isBranchTier(tier)) return 'tier';
  if (level < tier) return 'level';
  if (typeof id !== 'string' || !branchesAt(m, tier).some((b) => b.id === id)) return 'branch';
  if (pickedBranch(m, picks, tier)) return 'taken';
  return null;
}

/** Phí linh thạch reset toàn bộ nhánh của công pháp đang tu (chọn lần đầu luôn miễn phí). */
export function branchResetCost(level: number): number {
  return 200 + Math.max(0, Math.floor(level)) * 30;
}
/** Giãn cách tối thiểu giữa hai lần reset (giây). */
export const BRANCH_RESET_COOLDOWN_SEC = 60;

/** Làm sạch lựa chọn đọc từ DB: bỏ mốc lạ, nhánh không còn trong dữ liệu. */
export function sanitizePicks(m: BranchHost | undefined, raw: unknown): BranchPicks {
  const out: BranchPicks = {};
  if (!m || !raw || typeof raw !== 'object') return out;
  for (const t of BRANCH_TIERS) {
    const id = (raw as Record<string, unknown>)[String(t)];
    if (typeof id === 'string' && branchesAt(m, t).some((b) => b.id === id)) out[t] = id;
  }
  return out;
}

/**
 * Kiểm cây nhánh của một công pháp; trả danh sách lỗi (rỗng = hợp lệ).
 * - Mỗi mốc 2–3 nhánh, id không trùng trong công pháp, `grants` là chiêu của chính công pháp, mở đúng ở cảnh giới của mốc.
 * - Mọi chiêu bậc cao (mở từ 16) của công pháp phải thuộc một nhánh; chiêu đặc trưng/tối thượng/lướt không được gắn nhánh.
 */
export function branchErrors(
  m: BranchHost & { sig?: string; ult?: string; dash?: string },
  skills: readonly Pick<SkillDef, 'id' | 'method' | 'unlock' | 'locked'>[],
): string[] {
  const errs: string[] = [];
  const at = `method ${m.id}`;
  const list = m.branches ?? [];
  const ids = new Set<string>();
  const own = new Map(skills.filter((s) => s.method === m.id).map((s) => [s.id, s]));
  for (const b of list) {
    const w = `${at} nhánh ${b.id}`;
    if (!/^[a-z0-9_]+$/.test(b.id)) errs.push(`${w}: id phải là snake_case`);
    if (ids.has(b.id)) errs.push(`${w}: trùng id`);
    ids.add(b.id);
    if (!isBranchTier(b.tier)) errs.push(`${w}: tier phải là một trong ${BRANCH_TIERS.join('/')}`);
    if (!Array.isArray(b.grants) || !b.grants.length) errs.push(`${w}: grants rỗng`);
    for (const g of b.grants ?? []) {
      const s = own.get(g);
      if (!s) errs.push(`${w}: grants "${g}" không phải chiêu của công pháp`);
      else if (s.unlock !== b.tier) errs.push(`${w}: chiêu ${g} mở ở ${s.unlock}, phải bằng mốc ${b.tier}`);
      if (g === m.sig || g === m.ult || g === m.dash) errs.push(`${w}: chiêu đặc trưng/tối thượng/lướt không gắn nhánh`);
    }
    const r = b.mods?.res;
    if (r?.max !== undefined && !(Number.isInteger(r.max) && r.max > 0)) errs.push(`${w}: mods.res.max phải là số nguyên dương`);
    if (r?.keep !== undefined && !(r.keep > 0)) errs.push(`${w}: mods.res.keep phải dương`);
    if (r?.gainMul !== undefined && !(r.gainMul > 1 && r.gainMul <= 2)) errs.push(`${w}: mods.res.gainMul trong (1, 2]`);
    if (b.mods?.markDurMul !== undefined && !(b.mods.markDurMul > 1 && b.mods.markDurMul <= 2))
      errs.push(`${w}: mods.markDurMul trong (1, 2]`);
  }
  for (const t of BRANCH_TIERS) {
    const n = list.filter((b) => b.tier === t).length;
    // TN-2: công pháp mới có thể chưa làm tới các mốc cao (mốc trống = 0 nhánh), nhưng không được bỏ trống mốc ở giữa.
    if (n !== 0 && (n < 2 || n > 3)) errs.push(`${at}: mốc ${t} cần 2–3 nhánh (đang có ${n})`);
    if (n === 0 && list.some((b) => b.tier > t)) errs.push(`${at}: mốc ${t} trống mà mốc cao hơn đã có nhánh`);
  }
  if (!list.some((b) => b.tier === BRANCH_TIERS[0])) errs.push(`${at}: mốc ${BRANCH_TIERS[0]} phải có nhánh`);
  // Hai nhánh cùng mốc phải khác nhau về lối chơi: khác chiêu hoặc khác luật riêng.
  for (const t of BRANCH_TIERS) {
    const at2 = list.filter((b) => b.tier === t);
    for (let i = 0; i < at2.length; i++)
      for (let j = i + 1; j < at2.length; j++) {
        const a = at2[i]!;
        const b = at2[j]!;
        const sameGrants = a.grants.length === b.grants.length && a.grants.every((g) => b.grants.includes(g));
        if (sameGrants && JSON.stringify(a.mods ?? {}) === JSON.stringify(b.mods ?? {}))
          errs.push(`${at}: nhánh ${a.id} và ${b.id} giống hệt nhau`);
      }
  }
  for (const s of own.values()) {
    if (s.locked || s.unlock < BRANCH_TIERS[0]) continue;
    if (s.id === m.sig || s.id === m.ult || s.id === m.dash) continue;
    if (!list.some((b) => b.grants.includes(s.id))) errs.push(`${at}: chiêu bậc cao ${s.id} không thuộc nhánh nào`);
  }
  return errs;
}
