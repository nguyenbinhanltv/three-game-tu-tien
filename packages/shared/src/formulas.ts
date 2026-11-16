// Công thức chỉ số và cân bằng. Hàm thuần, dùng chung client (hiển thị) và server (tính thật).

export const NGUNG_KHI_MAX = 15;
export const TRUC_CO_LEVEL = 16;
/** Cấp đầu của từng đại cảnh giới. Trúc Cơ 16–19 (19 = đại viên mãn), Kết Đan 20–23, Nguyên Anh 24–27, Hóa Thần 28 (sơ kỳ, trần tạm). */
export const KET_DAN_LEVEL = 20;
export const NGUYEN_ANH_LEVEL = 24;
export const HOA_THAN_LEVEL = 28;
export const MAX_LEVEL = 28;
export const FLY_UNLOCK_LEVEL = 3;

export const GCD = 1.0;
export const CRIT_CHANCE = 0.1;
export const CRIT_MULT = 1.6;

/**
 * Tu vi cần để đầy từng cấp Trúc Cơ → Nguyên Anh (cấp 16…27), `docs/EXPANSION_DESIGN.md` 2.2.
 * = giờ/cấp (Trúc Cơ 1,0 · Kết Đan 1,5 · Nguyên Anh 2,0) × thu nhập tu vi/giờ tại cấp (`400 × (12+7L) × 1,25 × 0,9`).
 * Tích lũy từ đầu mỗi đại cảnh giới: Trúc Cơ 242.000 (4,0 giờ), Kết Đan 439.000 (6,0 giờ), Nguyên Anh 686.000 (8,0 giờ).
 * Trúc Cơ cũ là 30k/50k/70k (cấp 16–18, 2,5 giờ): đường cong mới kéo dài chặng này, db.ts có migration giữ tỉ lệ tiến độ.
 */
const XP_NEED_ADV: readonly number[] = [
  56_000, 59_000, 62_000, 65_000, // Trúc Cơ 16–19
  102_500, 107_500, 112_000, 117_000, // Kết Đan 20–23
  162_000, 168_500, 174_500, 181_000, // Nguyên Anh 24–27
];

/** Tu vi cần để đầy cảnh giới hiện tại. */
export function xpNeed(level: number): number {
  if (level >= MAX_LEVEL) return 99_999_999;
  if (level >= TRUC_CO_LEVEL) return XP_NEED_ADV[level - TRUC_CO_LEVEL];
  // 90·L²: tổng Ngưng Khí 1→15 khoảng 112 nghìn tu vi. `pnpm sim:progress` (3-10) mô phỏng cả đi tìm quái theo cụm của M-2,
  // áp lực quái thường và đả tọa, ra 3,2–3,5 giờ tới viên mãn Ngưng Khí 15 cho cả ba công pháp (chưa tính boss, bí cảnh).
  // Mục tiêu đã chốt (2026-11-15): 3–4 giờ; cũ 70·L² cho 2,2 giờ. Sẽ dài thêm khi có thêm nội dung; đổi đường cong
  // phải chạy lại `pnpm sim:progress` (cờ LỖI nếu ra ngoài 3–4 giờ).
  return 90 * level * level;
}

/**
 * Hệ số cảnh giới nhân hp/mp/atk/def của người chơi và hp/atk của quái (một nguồn cho server, client tooltip và sim):
 * Ngưng Khí 1,0 · Trúc Cơ 1,6 · Kết Đan 2,5 · Nguyên Anh 3,8 · Hóa Thần 5,5. Quái cũng nhân để thời gian hạ quái không sụp
 * khi người chơi nhảy cảnh giới (`docs/EXPANSION_DESIGN.md` 2.3).
 */
export const REALM_MUL: readonly { from: number; mul: number }[] = [
  { from: 1, mul: 1 },
  { from: TRUC_CO_LEVEL, mul: 1.6 },
  { from: KET_DAN_LEVEL, mul: 2.5 },
  { from: NGUYEN_ANH_LEVEL, mul: 3.8 },
  { from: HOA_THAN_LEVEL, mul: 5.5 },
];
export const MONSTER_REALM_MUL = REALM_MUL;

export function realmMul(level: number): number {
  let m = 1;
  for (const r of REALM_MUL) if (level >= r.from) m = r.mul;
  return m;
}

/** Đại cảnh giới của cấp: 0 Ngưng Khí, 1 Trúc Cơ, 2 Kết Đan, 3 Nguyên Anh, 4 Hóa Thần (chỉ số của `glossary.realms`). */
export function majorRealmOf(level: number): number {
  return level >= HOA_THAN_LEVEL ? 4 : level >= NGUYEN_ANH_LEVEL ? 3 : level >= KET_DAN_LEVEL ? 2 : level >= TRUC_CO_LEVEL ? 1 : 0;
}

export interface BaseStats {
  hp: number;
  mp: number;
  atk: number;
  def: number;
}

export function playerBaseStats(level: number): BaseStats {
  const l = level - 1;
  const m = realmMul(level);
  return {
    hp: Math.round((120 + 34 * l) * m),
    mp: Math.round((80 + 14 * l) * m),
    atk: Math.round((12 + 4.2 * l) * m),
    def: Math.round((3 + 1.6 * l) * m),
  };
}

export function monsterStats(level: number, hpMul: number, atkMul: number): BaseStats {
  const m = realmMul(level);
  return {
    hp: Math.round((60 + 42 * level) * hpMul * m),
    mp: 0,
    atk: Math.round((7 + 3.4 * level) * atkMul * m),
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
 * tia rơi quanh. Nhịp và số tia theo pha (xem `TRIB_PHASE_*` bên dưới).
 */
export const TRIB_FIRST_DELAY = 3;
export const TRIB_AIM = { r: 4.2, delay: 1.25, pct: 0.24 };
export const TRIB_EXTRA = { r: 3.6, delayMin: 1.25, delayMax: 1.85, pct: 0.2, distMin: 5, distMax: 14, maxCount: 4 };
/**
 * Độ kiếp ba pha (S2-C, `GAME_DESIGN_CORE.md` 5.3). Mốc giây tính từ lúc bắt đầu; client suy pha từ đồng hồ (không cần tin riêng).
 * 1 Lôi vân tụ: thưa, chạy né. 2 Lôi võng: thêm ba vạch sét song song, đọc vạch và bước vào khoảng trống (lướt cũng được).
 * 3 Diệt thế nhất kích: tia khóa mệnh không né được bằng chạy (chống đỡ bằng hộ thể, khiên, đan, pháp bảo), rồi mưa sét dồn dập.
 */
export const TRIB_PHASE_END = [12, 28, TRIBULATION_DURATION] as const;
export function tribPhaseAt(elapsedSec: number): 1 | 2 | 3 {
  return elapsedSec < TRIB_PHASE_END[0] ? 1 : elapsedSec < TRIB_PHASE_END[1] ? 2 : 3;
}
/** Nhịp hai đợt (giây) theo pha 1 và 2; pha 3 dùng `TRIB_RAIN.gap`. */
export const TRIB_PHASE_GAP = { 1: 3.0, 2: 2.3 } as const;
/** Số tia rơi quanh mỗi đợt theo pha (pha 3 dùng `TRIB_RAIN.count`). */
export const TRIB_PHASE_EXTRA = { 1: 1, 2: 2 } as const;
/**
 * Lôi võng (pha 2): `lines` vạch song song, mỗi vạch là chuỗi `count` vòng sét bán kính `r` cách nhau `step` (m) dựng quanh chỗ người độ kiếp đứng
 * (vạch giữa đè lên họ), các vạch cách nhau `gap`; báo trước `delay` giây, mỗi vòng `pct` khí huyết tối đa (một người chỉ ăn một lần mỗi vạch); cứ `every` đợt thả một lần.
 * Dùng vòng tròn chứ không dùng hình chữ nhật để đi chung đường vẽ vòng sét đã kiểm.
 */
export const TRIB_NET = { lines: 3, count: 7, r: 2.1, step: 4, gap: 7, delay: 1, pct: 0.2, every: 2 };
/** Tia cuối (đầu pha 3): báo trước `delay` giây quanh người độ kiếp, `pct` khí huyết tối đa, khóa mệnh (đứng đâu cũng trúng). Đan Kim Cương giảm thêm `defMul` lần mức buff phòng ngự. */
export const TRIB_FINAL = { r: 9, delay: 3, pct: 0.7, defMul: 2, defMaxCut: 0.5 };
/** Mưa sét sau tia cuối: nhịp dồn, nhẹ hơn mỗi tia. */
export const TRIB_RAIN = { gap: 0.9, count: 2, pct: 0.1, aimPct: 0.16, r: 3.4 };
/** Số đan hồi phục dùng được trong một lần độ kiếp (đan độc tích tụ). */
export const TRIB_PILL_MAX = 3;
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
