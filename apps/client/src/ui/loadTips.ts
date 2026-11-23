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
