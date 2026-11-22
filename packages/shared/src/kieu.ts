// Đạp Thiên Cửu Kiều (TN-7, chương 7 cuối): chín cầu liên tiếp. Hàm thuần dùng chung server (phán định ở apps/server/src/game/kieu/)
// và client (HUD, Bia Lộ). Tiến độ là `meta.kieu` (0..9, số cầu đã qua), chỉ server ghi. Thiết kế: artifact tn7/thiet-ke.md.
//
// Cầu không phải cảnh giới: người chơi vẫn là Dương Thực. Trần cấp mở dần theo cầu (`kieuLevelCap`), nên không bỏ qua cầu được.

import { DUONG_THUC_LEVEL, MAX_LEVEL } from './formulas';

export const KIEU_COUNT = 9;
/** Mã (khóa i18n/level) của chín cầu theo thứ tự; khớp `glossary.cuuKieuTen`. */
export const KIEU_IDS = ['thach', 'kiem_anh', 'suy', 'gioi', 'than', 'dao', 'ngoai', 'noi', 'dap_thien'] as const;
export type KieuId = (typeof KIEU_IDS)[number];

/** Level (room) của cầu thứ `n` (1..9): `kieu_<n>`. */
export function kieuLevelId(n: number): string {
  return `kieu_${n}`;
}

/** Số thứ tự cầu (1..9) của level phòng cầu `kieu_<n>`; null nếu không phải phòng cầu. */
export function kieuOfLevel(levelId: string): number | null {
  const m = /^kieu_([1-9])$/.exec(levelId);
  return m ? Number(m[1]) : null;
}

/** Số cầu đã qua (làm sạch: số nguyên trong [0, 9]). `raw` lấy từ `meta.kieu`, có thể hỏng. */
export function kieuCleared(raw: unknown): number {
  const n = typeof raw === 'number' && Number.isFinite(raw) ? Math.floor(raw) : 0;
  return Math.max(0, Math.min(KIEU_COUNT, n));
}

export function kieuDone(raw: unknown): boolean {
  return kieuCleared(raw) >= KIEU_COUNT;
}

/** Trần cấp theo số cầu đã qua: 45 (chưa qua Cầu 3), 46 (từ Cầu 3), 47 (từ Cầu 6). Ngoài Cửu Kiều (chưa tới 44) không áp dụng. */
export function kieuLevelCap(raw: unknown): number {
  return Math.min(MAX_LEVEL, DUONG_THUC_LEVEL + 1 + Math.floor(kieuCleared(raw) / 3));
}

/** Cấp tối thiểu để vào cầu `n`: cầu 1–3 cần 44, 4–6 cần 45, 7–9 cần 46. */
export function kieuMinLevel(n: number): number {
  return DUONG_THUC_LEVEL + Math.floor((Math.max(1, Math.min(KIEU_COUNT, n)) - 1) / 3);
}

/** Lý do không được vào cầu `n` (null = được). Thứ tự: cầu hợp lệ, đúng cầu kế tiếp (hoặc luyện lại cầu đã qua), đủ cấp. */
export type KieuDeny = 'bad' | 'level' | 'order';
export function kieuEntryDeny(level: number, raw: unknown, n: unknown): KieuDeny | null {
  if (typeof n !== 'number' || !Number.isInteger(n) || n < 1 || n > KIEU_COUNT) return 'bad';
  if (n > kieuCleared(raw) + 1) return 'order';
  return level < kieuMinLevel(n) ? 'level' : null;
}

/** Vào cầu `n` là lượt thật (ghi tiến độ, có thưởng) hay luyện lại (đã qua rồi, không thưởng)? */
export function kieuIsFirstClear(raw: unknown, n: number): boolean {
  return n === kieuCleared(raw) + 1;
}

/**
 * Thời gian tối thiểu hợp lệ (giây) để qua cầu `n`; nhanh hơn là bất thường, không ghi tiến độ. Cầu 9 là 100 s (Hồn kiếp 105 s, đo từ lúc vào room ~108 s):
 * thiết kế gốc 120 s tính cả boss Lộ Linh, PR boss nâng lại khi pha boss có thật.
 */
export const KIEU_MIN_CLEAR_SEC: readonly number[] = [30, 20, 150, 30, 60, 60, 80, 80, 100];

export function kieuMinClearSec(n: number): number {
  return KIEU_MIN_CLEAR_SEC[Math.max(1, Math.min(KIEU_COUNT, n)) - 1] ?? 30;
}

/** Số giây chờ cấp lại vé sau khi thua hoặc rời room. */
export const KIEU_RETICKET_SEC = 30;
/** Tu vi thưởng lần đầu qua mỗi cầu: phần này của `xpNeed` cấp hiện tại (chặng ~1,7 giờ/cấp nên 3 cầu ≈ nửa cấp). */
export const KIEU_XP_FRAC = 0.15;
/** Linh thạch thưởng lần đầu qua cầu `n`. */
export function kieuGold(n: number): number {
  return 6000 + 1500 * Math.max(1, Math.min(KIEU_COUNT, n));
}
/** Kiều Lực: mỗi cầu đã qua cộng thêm 1% bốn chỉ số gốc (hp, mp, atk, def), tối đa 9%. */
export const KIEU_POWER_PER = 0.01;

export function kieuPower(raw: unknown): number {
  return kieuCleared(raw) * KIEU_POWER_PER;
}

/** Khóa chống trùng của lần ghi cầu `n` cho nhân vật `charId` (mỗi cầu thưởng đúng một lần trong đời nhân vật). */
export function kieuIdem(charId: string | number, n: number): string {
  return `kieu:clear:${charId}:${n}`;
}

/**
 * Điều kiện một lượt qua cầu hợp lệ để ghi tiến độ (server tự tính các đầu vào, không tin client): có mặt đến lúc xong,
 * đã đóng góp (một lần gây sát thương/hồi/chạm cơ chế), và không nhanh hơn `KIEU_MIN_CLEAR_SEC`.
 */
export function kieuClearOk(n: number, o: { present: boolean; contributed: boolean; elapsedSec: number }): boolean {
  return o.present && o.contributed && o.elapsedSec >= kieuMinClearSec(n);
}
