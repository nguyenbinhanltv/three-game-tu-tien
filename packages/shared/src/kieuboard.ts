// Bảng Thiên Lộ (TN-7, kết game): danh sách những người đã qua đủ chín cầu (Đạp Thiên), xếp theo thời điểm ghi cầu 9. Dữ liệu do server dựng từ sổ cái
// (dòng `kieu:clear:<nhân vật>:9`), client chỉ xin và hiển thị. Kiểu tin và hằng dùng chung ở đây.

/** Số dòng tối đa mỗi lần gửi. */
export const KIEU_BOARD_MAX = 20;
/** Giãn cách tối thiểu (ms) giữa hai lần xin bảng của một người. */
export const KIEU_BOARD_COOLDOWN_MS = 2000;

export interface KieuBoardRow {
  /** Tên nhân vật. */
  name: string;
  /** Thời điểm qua cầu 9 (ms epoch). */
  ts: number;
}

export interface KieuBoardMsg {
  rows: KieuBoardRow[];
  /** Tổng số người đã Đạp Thiên (có thể lớn hơn `rows.length`). */
  total: number;
}
