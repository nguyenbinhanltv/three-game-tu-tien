// Mẹo chơi ở màn tải (Chân Cảnh U12): danh sách khóa i18n `ui.tip.<n>`, chọn theo hạt giống và xoay vòng. Hàm thuần.

/** Số mẹo (khóa `ui.tip.1` … `ui.tip.<TIP_COUNT>`); `loadTips.test.ts` kiểm đủ chuỗi trong i18n. */
export const TIP_COUNT = 12;

/** Khóa mẹo thứ `i` (xoay vòng, chấp nhận số âm hoặc lớn). */
export function tipKey(i: number): string {
  const n = ((Math.floor(i) % TIP_COUNT) + TIP_COUNT) % TIP_COUNT;
  return `ui.tip.${n + 1}`;
}

/** Mẹo đầu tiên theo hạt giống (đổi mỗi lần vào để không lặp một mẹo). */
export function firstTipIndex(seed: number): number {
  return Math.abs(Math.floor(seed)) % TIP_COUNT;
}

/**
 * Khóa i18n tên nơi đến theo **level đích** (nhiều level dùng chung một tranh nên không suy từ tranh): bí cảnh `dungeon.<id>.name`,
 * bản đồ `map.<id>`; chỉ khi không có (Vân Lam, đi theo vùng) mới dùng tranh: tông môn `ui.load.place.load_song`, vùng `zone.<tranh>`.
 * `has` = hàm kiểm khóa tồn tại (truyền `hasString`).
 */
export function placeKey(level: string, art: string, has: (k: string) => boolean): string {
  if (level) {
    for (const k of [`dungeon.${level}.name`, `map.${level}`]) if (has(k)) return k;
  }
  return art === 'load_song' ? 'ui.load.place.load_song' : `zone.${art}`;
}
