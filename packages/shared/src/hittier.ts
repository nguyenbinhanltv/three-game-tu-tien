// Cấp đòn (Chân Cảnh S1: "đòn có trọng lượng"). Một bảng hằng số duy nhất cho cả server (đẩy lùi, khựng, ngã: quyết định thật)
// và client (hit-stop, rung camera: chỉ trình diễn). Không đổi góc camera: rung chỉ dịch nhẹ.
import { HEAVY_POWER } from './combat';
import type { HitTier, MonsterDef, SkillDef } from './types';

export const HIT_TIER_ORDER: readonly HitTier[] = ['light', 'medium', 'heavy', 'finisher'];

export function isHitTier(v: unknown): v is HitTier {
  return typeof v === 'string' && (HIT_TIER_ORDER as readonly string[]).includes(v);
}
export function tierRank(t: HitTier): number {
  return HIT_TIER_ORDER.indexOf(t);
}

export interface HitTierSpec {
  /** Hit-stop (ms) của mục tiêu và người đánh (client, cục bộ; không dừng mô phỏng mạng). */
  stopMs: number;
  /** Rung camera: biên độ (m, dịch nhẹ, KHÔNG xoay) và thời gian (ms). */
  shakeAmp: number;
  shakeMs: number;
  /** Đẩy lùi (m) lên mục tiêu thân thường (server quyết, kiểm va chạm). */
  knockM: number;
  /** Khựng (ms): mục tiêu đứng khựng, không đi/đánh. */
  staggerMs: number;
}

export const HIT_TIER: Record<HitTier, HitTierSpec> = {
  light: { stopMs: 0, shakeAmp: 0, shakeMs: 0, knockM: 0, staggerMs: 0 },
  medium: { stopMs: 40, shakeAmp: 0.02, shakeMs: 90, knockM: 0.5, staggerMs: 150 },
  heavy: { stopMs: 70, shakeAmp: 0.05, shakeMs: 140, knockM: 1.2, staggerMs: 350 },
  finisher: { stopMs: 110, shakeAmp: 0.09, shakeMs: 220, knockM: 2.2, staggerMs: 600 },
};

/** Người chơi mất điều khiển tối đa chừng này (ms) vì đòn thường; ngã chỉ có khi hazard có báo trước. */
export const PLAYER_STAGGER_MAX_MS = 600;
/** Sau một lần khựng/đẩy lùi, người chơi miễn khựng thêm chừng này (ms): đòn dồn dập không khóa điều khiển. */
export const PLAYER_STAGGER_GAP_MS = 800;
/** Quái bị ngã (knockdown) bởi chiêu cuối: nằm chừng này (ms). Tinh anh nửa thời gian, thủ lĩnh miễn. */
export const MONSTER_KNOCKDOWN_MS = 1200;
/** Người chơi bị đẩy lùi tối đa (m) một đòn. */
export const PLAYER_KNOCK_MAX_M = 2.5;
/** Thủ lĩnh bị khựng bởi đòn (không phải thanh phá thế): giãn tối thiểu giữa hai lần (ms), để nhiều người đánh không khóa boss. */
export const BOSS_STAGGER_GAP_MS = 8000;

/** Cấp đòn theo hệ số chiêu khi dữ liệu không ghi `tier`. */
export function hitTierOfPower(power: number): HitTier {
  if (power >= 4) return 'finisher';
  if (power >= HEAVY_POWER) return 'heavy';
  if (power >= 1.2) return 'medium';
  return 'light';
}

/**
 * Cấp của một đòn chiêu: đòn chuỗi `combo` thì theo `hits[combo].tier`, đòn `kb` tối thiểu `medium`; không thì theo `tier` của chiêu.
 * Trả `undefined` nếu dữ liệu không ghi cấp nào (nơi gọi suy từ hệ số bằng `resolveTier`).
 */
export function strikeTier(skill: Pick<SkillDef, 'tier' | 'combo'>, combo?: number): HitTier | undefined {
  const h = combo !== undefined ? skill.combo?.hits[combo] : undefined;
  if (h?.tier) return h.tier;
  if (h?.kb) return tierRank(skill.tier ?? 'light') >= tierRank('medium') ? skill.tier : 'medium';
  return skill.tier;
}

/** Cấp hiệu lực: dữ liệu ghi rõ thì theo dữ liệu, không thì suy từ hệ số. */
export function resolveTier(explicit: HitTier | undefined, power: number): HitTier {
  return explicit ?? hitTierOfPower(power);
}

/** Cấp chống khựng của quái: đòn dưới cấp này không khựng. Mặc định: thường `light` (mọi đòn có khựng theo bảng), tinh anh `medium`, thủ lĩnh `heavy`. */
export function poiseOf(def: Pick<MonsterDef, 'boss' | 'elite' | 'poise'>): HitTier {
  return def.poise ?? (def.boss ? 'heavy' : def.elite ? 'medium' : 'light');
}

export interface MonsterReaction {
  /** Mét đẩy lùi (0 = đứng vững). */
  knockM: number;
  /** ms khựng (0 = không). */
  staggerMs: number;
  /** ms ngã (0 = không); thay cho khựng. */
  knockdownMs: number;
}

/**
 * Phản ứng của quái trước một đòn. Thủ lĩnh không bị đẩy; đòn dưới `poise` không khựng; tinh anh chỉ nửa quãng/nửa thời gian
 * (như `pushMonster` cũ); chiêu cuối làm quái thường và tinh anh ngã, thủ lĩnh chỉ khựng thường.
 */
export function monsterReaction(def: Pick<MonsterDef, 'boss' | 'elite' | 'poise'>, tier: HitTier): MonsterReaction {
  const spec = HIT_TIER[tier];
  const none: MonsterReaction = { knockM: 0, staggerMs: 0, knockdownMs: 0 };
  if (tierRank(tier) < tierRank(poiseOf(def))) return none;
  const k = def.elite ? 0.5 : 1;
  if (def.boss) return { knockM: 0, staggerMs: spec.staggerMs, knockdownMs: 0 };
  if (tier === 'finisher') return { knockM: spec.knockM * k, staggerMs: 0, knockdownMs: MONSTER_KNOCKDOWN_MS * k };
  // Đòn vừa chỉ đẩy nhẹ: khựng làm quái mất nhịp đánh nên giữ cho đòn nặng trở lên (cân bằng DPS quái, đo bằng fight:check).
  return { knockM: spec.knockM * k, staggerMs: tier === 'medium' ? 0 : spec.staggerMs * k, knockdownMs: 0 };
}

/**
 * Cấp đòn của quái đánh người chơi: dữ liệu `tier` của quái nếu có; không thì đòn thường là `light`, đòn có cờ `hv`
 * (combo, vùng nổ, đạn) là `medium` với quái thường và `heavy` với thủ lĩnh.
 */
export function monsterHitTier(def: Pick<MonsterDef, 'boss' | 'tier'>, hv: boolean): HitTier {
  if (!hv) return 'light';
  return def.tier ?? (def.boss ? 'heavy' : 'medium');
}

export interface PlayerReaction {
  knockM: number;
  staggerMs: number;
}

/** Phản ứng của người chơi: khựng ngắn (≤ `PLAYER_STAGGER_MAX_MS`), đẩy lùi ≤ `PLAYER_KNOCK_MAX_M`; đòn nhẹ không gì. Không bao giờ ngã ở đây. */
export function playerReaction(tier: HitTier): PlayerReaction {
  const s = HIT_TIER[tier];
  return { knockM: Math.min(PLAYER_KNOCK_MAX_M, s.knockM), staggerMs: Math.min(PLAYER_STAGGER_MAX_MS, s.staggerMs) };
}

/** PvP (tỉ thí): giới hạn chặt, tối đa đòn vừa và không đẩy lùi. */
export function pvpReaction(tier: HitTier): PlayerReaction {
  const r = playerReaction(tierRank(tier) > tierRank('medium') ? 'medium' : tier);
  return { knockM: 0, staggerMs: Math.min(r.staggerMs, 150) };
}
