// Thân Pháp theo hướng tu (TP-3): MỘT bảng dữ liệu quyết định hướng nào chạy lớp riêng nào. Thay `isKiemTu` (TP-1 chỉ Kiếm tu): thêm hướng mới = thêm một dòng ở
// `PATH_TP` (+ pose `_tp`, idle trong packages/content/data/poses), không sửa chỗ dùng. Tách khỏi `animFx.ts` để các file chỉ cần cờ không phải nạp `@dtl/content`.
import { pathOf } from '@dtl/content';

export interface PathTp {
  /**
   * Idle đặc trưng khi đứng yên lâu: `drawn` lúc còn trong thế đấu (~4 s sau đòn cuối), `free` lúc thư giãn. Tên pose trong packages/content/data/poses.
   * Kiếm tu: xoay kiếm / chắp tay ngắm trời.
   */
  idle: { drawn: string; free: string };
  /** Chiêu của hướng dùng bản pose `_tp` (dồn lực sâu, đường chém 2 khung, giữ đỉnh 3 khung) khi có. */
  poses: boolean;
  /** Nét kéo lưỡi ở đường chém (chỉ hướng có lưỡi: kiếm, đao). */
  smear: boolean;
  /** Dáng lướt thấp khi chạy (chúi thân + hạ hông). */
  glide: boolean;
  /** Cut-in chiêu cuối (khựng + tranh Codex theo bộ trang phục); chỉ Kiếm tu trong TP-1. */
  cutin: boolean;
}

/** Hướng tu đã bật Thân Pháp riêng (khóa = `PathDef.id` trong paths.json). Hướng không có dòng chỉ nhận lớp chung. */
export const PATH_TP: Readonly<Record<string, PathTp>> = {
  kiem_tu: { idle: { drawn: 'kiem_idle_xoay', free: 'kiem_idle_chap_tay' }, poses: true, smear: true, glide: true, cutin: true },
  // Thể tu (tay không, găng): nện quyền vào lòng bàn tay khi còn thế đấu, vặn cổ vai khi thư giãn; không có lưỡi nên không nét kéo; đứng vững nên không lướt thấp.
  the_tu: { idle: { drawn: 'the_idle_nen_quyen', free: 'the_idle_van_vai' }, poses: true, smear: false, glide: false, cutin: false },
};

/** Hướng tu (khóa `PATH_TP`) của công pháp `method`, hoặc undefined nếu hướng đó chưa bật Thân Pháp riêng (khóa trống/lạ cũng undefined). */
export function tpPathOf(method: string | undefined): string | undefined {
  const id = pathOf(method)?.id;
  return id && PATH_TP[id] ? id : undefined;
}

/** Tên pose idle của hướng `path` theo thế đấu; undefined nếu hướng chưa có. */
export function tpIdleFor(path: string | undefined, drawn: boolean): string | undefined {
  const t = path ? PATH_TP[path] : undefined;
  return t ? (drawn ? t.idle.drawn : t.idle.free) : undefined;
}

/** `id` có phải pose idle Thân Pháp của hướng nào không (để hủy idle khi bắt đầu di chuyển). */
export function isTpIdlePose(id: string): boolean {
  return Object.values(PATH_TP).some((t) => t.idle.drawn === id || t.idle.free === id);
}
