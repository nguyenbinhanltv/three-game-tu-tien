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
  // 90·L²: tổng Ngưng Khí 1→15 khoảng 112 nghìn tu vi. `pnpm sim:progress` (3-10) mô phỏng cả đi tìm quái theo cụm của M-2,
  // áp lực quái thường và đả tọa, ra 3,2–3,5 giờ tới viên mãn Ngưng Khí 15 cho cả ba công pháp (chưa tính boss, bí cảnh).
  // Mục tiêu đã chốt (2026-11-15): 3–4 giờ; cũ 70·L² cho 2,2 giờ. Sẽ dài thêm khi có thêm nội dung; đổi đường cong
  // phải chạy lại `pnpm sim:progress` (cờ LỖI nếu ra ngoài 3–4 giờ).
  return 90 * level * level;
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
  critChance: number = CRIT_CHANCE,
  critMul: number = CRIT_MULT,
): { dmg: number; crit: boolean } {
  const crit = critRoll < critChance;
  let raw = atk * power * (0.9 + roll * 0.2);
  if (crit) raw *= critMul;
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

/** Giá cường hóa (3-10): 0,06 × giá cơ sở × (cấp+1), chỉnh để lên +9 (có Hộ Phù) tốn 3–6 giờ thu nhập ở cấp của món (`pnpm sim:progress`). */
export function enhanceCost(plus: number, itemPrice: number): { gold: number; ore: number } {
  return {
    gold: Math.round(30 + itemPrice * 0.06 * (plus + 1)),
    ore: 1 + Math.floor(plus / 3),
  };
}

/** Tu vi mất khi tử vong (phần trăm của cảnh giới hiện tại). */
export const DEATH_XP_LOSS = 0.05;
export const TRIBULATION_FAIL_XP_LOSS = 0.15;
export const TRIBULATION_DURATION = 40;
/**
 * Thiên lôi độ kiếp (3-10): số liệu một đợt. Tia nhắm thẳng người độ kiếp (báo trước `AIM_DELAY` giây, né bằng cách bước ra khỏi vòng),
 * `1..4` tia rơi quanh. Nhịp giữa hai đợt giảm tuyến tính theo tiến độ.
 */
export const TRIB_FIRST_DELAY = 3;
export const TRIB_GAP_START = 2.6;
export const TRIB_GAP_END = 1.4;
export const TRIB_AIM = { r: 4.2, delay: 1.25, pct: 0.24 };
export const TRIB_EXTRA = { r: 3.6, delayMin: 1.25, delayMax: 1.85, pct: 0.2, distMin: 5, distMax: 14, maxCount: 4 };
/** Chết sau chừng này giây thì hoàn lại Trúc Cơ Đan (viên đan cần nội đan Hàn Giao, mất trắng là phạt quá nặng). Vẫn mất tu vi. */
export const TRIBULATION_REFUND_AFTER = 20;

// ---------- hồi phục và miễn sát thương ----------

/** Giây kể từ lần cuối đánh/bị đánh mới tính là ra khỏi chiến đấu. */
export const COMBAT_REGEN_DELAY = 6;
/** Tỉ lệ máu tối đa hồi mỗi giây: ngoài chiến đấu, đang đả tọa (trong chiến đấu không hồi). */
export const HP_REGEN_IDLE = 0.02;
export const HP_REGEN_MEDITATE = 0.05;
/** Tỉ lệ linh lực tối đa hồi mỗi giây: trong chiến đấu, ngoài chiến đấu, đang đả tọa (đang bay không hồi). */
export const MP_REGEN_COMBAT = 0.012;
export const MP_REGEN_IDLE = 0.03;
export const MP_REGEN_MEDITATE = 0.08;

/**
 * Cửa sổ miễn vùng nổ: sau khi trúng một vùng nổ của quái, trong chừng này giây tổng sát thương từ vùng nổ
 * của quái chỉ bằng vùng mạnh nhất (vùng sau chỉ gây phần chênh lệch nếu mạnh hơn).
 * Chặn đòn dồn khi nhiều quái thả vùng trùng chỗ (vd. đợt 1 Kiếm Trủng: 6 Kiếm Linh) mà không cho dùng
 * vùng yếu để "nuốt" vùng mạnh. Cố ý áp cả cho nhiều vùng đập của cùng một boss khi cả nhóm đứng dồn.
 * Áp cả cho đạn đánh xa của quái (D1). Không áp cho đòn cận chiến và thiên lôi độ kiếp.
 */
export const HAZARD_IFRAME = 0.6;

/**
 * Sát thương thật của một vùng nổ của quái `n` lên người chơi.
 * `until`: hết cửa sổ miễn (ms); `taken`: sát thương vùng đã nhận trong cửa sổ hiện tại.
 * Trả về sát thương gây ra và trạng thái cửa sổ mới.
 */
export function hazardHit(n: number, until: number, taken: number, now: number): { dmg: number; until: number; taken: number } {
  if (now >= until) return { dmg: n, until: now + HAZARD_IFRAME * 1000, taken: n };
  if (n <= taken) return { dmg: 0, until, taken };
  return { dmg: n - taken, until, taken: n };
}

// ---------- ngắt chiêu (boss niệm chú) ----------

/** Boss bị ngắt chú thì choáng và nhận thêm chừng này lần sát thương cho tới khi hết choáng. */
export const INTERRUPT_VULN_MUL = 1.5;
/**
 * Tối đa lệnh dùng skill mỗi giây một người chơi; vượt thì server bỏ lệnh (chống spam).
 * Đủ rộng cho hàng đợi chiêu của client (tới 3 lần gửi lại mỗi lần bấm, xem skillQueue.ts) cộng tự đánh.
 */
export const SKILL_MSG_PER_SEC = 12;

/**
 * Kết quả một chiêu ngắt trúng boss đang niệm chú, từ lúc bắt đầu `startAt` tới `endAt` (ms server).
 * - 'none': không có chú đang niệm (hoặc đã niệm xong), chiêu chỉ gây sát thương thường.
 * - 'guarded': còn trong đoạn hộ chú đầu chú (`open` = tỉ lệ thời gian niệm, 0–1), chưa ngắt được.
 * - 'ok': đúng cửa sổ, chú bị phá.
 */
export function chantInterrupt(startAt: number, endAt: number, open: number, now: number): 'none' | 'guarded' | 'ok' {
  if (!(endAt > startAt) || now < startAt || now >= endAt) return 'none';
  return (now - startAt) / (endAt - startAt) < open ? 'guarded' : 'ok';
}

/** Sát thương lên quái, nhân thêm khi quái đang choáng vì bị ngắt chú. */
export function vulnerableDamage(dmg: number, vulnerable: boolean): number {
  return vulnerable ? Math.round(dmg * INTERRUPT_VULN_MUL) : dmg;
}
