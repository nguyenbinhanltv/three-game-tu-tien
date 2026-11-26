// Thân Pháp: lớp riêng Kiếm tu (idle xoay kiếm, pose `_tp`, cut-in, lướt thấp) chỉ chạy khi công pháp thuộc hướng này. Tách khỏi `animFx.ts` để
// các file chỉ cần cờ không phải nạp `@dtl/content`.
import { pathOf } from '@dtl/content';

export const KIEM_TU_PATH = 'kiem_tu';

/** Công pháp `method` thuộc hướng Kiếm tu (khóa trống/lạ = không). */
export const isKiemTu = (method: string | undefined): boolean => pathOf(method)?.id === KIEM_TU_PATH;
