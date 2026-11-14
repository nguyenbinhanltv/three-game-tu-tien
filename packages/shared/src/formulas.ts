// Công thức chỉ số và cân bằng. Hàm thuần, dùng chung client (hiển thị) và server (tính thật).

export const NGUNG_KHI_MAX = 15;
export const TRUC_CO_LEVEL = 16;
export const MAX_LEVEL = 18;
export const FLY_UNLOCK_LEVEL = 3;

export const GCD = 1.0;
export const CRIT_CHANCE = 0.1;
export const CRIT_MULT = 1.6;

/** Tu vi cần để đầy cảnh giới hiện tại. */
export function xpNeed(level: number): number {
  if (level >= MAX_LEVEL) return 99_999_999;
  if (level >= TRUC_CO_LEVEL) return 30000 + (level - TRUC_CO_LEVEL) * 20000;
  // 70·L²: tổng Ngưng Khí 1→15 khoảng 87 nghìn tu vi. `pnpm sim:progress` ước tính ~2 giờ đánh quái thuần,
  // cộng đi lại, boss, luyện đan, bí cảnh thì khoảng 3–4 giờ.
  return 70 * level * level;
}

export interface BaseStats {
  hp: number;
  mp: number;
  atk: number;
  def: number;
}

export function playerBaseStats(level: number): BaseStats {
  const l = level - 1;
  const realmMul = level >= TRUC_CO_LEVEL ? 1.6 : 1;
  return {
    hp: Math.round((120 + 34 * l) * realmMul),
    mp: Math.round((80 + 14 * l) * realmMul),
    atk: Math.round((12 + 4.2 * l) * realmMul),
    def: Math.round((3 + 1.6 * l) * realmMul),
  };
}

export function monsterStats(level: number, hpMul: number, atkMul: number): BaseStats {
  return {
    hp: Math.round((60 + 42 * level) * hpMul),
    mp: 0,
    atk: Math.round((7 + 3.4 * level) * atkMul),
    def: Math.round(1 + 1.3 * level),
  };
}

export function monsterXp(level: number, xpMul: number): number {
  return Math.round((12 + 7 * level) * xpMul);
}

/**
 * Sát thương sau phòng thủ. `roll` trong [0,1) quyết định dao động ±10%,
 * `critRoll` trong [0,1) quyết định bạo kích. Server truyền số ngẫu nhiên thật.
 */
export function computeDamage(
  atk: number,
  power: number,
  def: number,
  roll: number,
  critRoll: number,
): { dmg: number; crit: boolean } {
  const crit = critRoll < CRIT_CHANCE;
  let raw = atk * power * (0.9 + roll * 0.2);
  if (crit) raw *= CRIT_MULT;
  const dmg = Math.max(1, Math.round(raw - def * 0.6));
  return { dmg, crit };
}

/** Hệ số tu vi nhận được khi chênh lệch cảnh giới với quái. */
export function xpLevelFactor(playerLevel: number, monsterLevel: number): number {
  const d = playerLevel - monsterLevel;
  if (d <= 2) return 1;
  if (d >= 8) return 0.1;
  return 1 - (d - 2) * 0.15;
}

/** Tu vi mỗi giây khi đả tọa. */
export function meditateXpPerSec(level: number): number {
  return 0.4 + 0.12 * level;
}

/** Hệ số cộng chỉ số trang bị theo cấp cường hóa. */
export function enhanceMul(plus: number): number {
  return 1 + 0.08 * plus;
}

export const MAX_ENHANCE = 10;

export function enhanceChance(plus: number): number {
  if (plus < 5) return 1;
  return [0.8, 0.65, 0.5, 0.4, 0.3][plus - 5] ?? 0.3;
}

export function enhanceCost(plus: number, itemPrice: number): { gold: number; ore: number } {
  return {
    gold: Math.round(30 + itemPrice * 0.15 * (plus + 1)),
    ore: 1 + Math.floor(plus / 3),
  };
}

/** Tu vi mất khi tử vong (phần trăm của cảnh giới hiện tại). */
export const DEATH_XP_LOSS = 0.05;
export const TRIBULATION_FAIL_XP_LOSS = 0.15;
export const TRIBULATION_DURATION = 40;
