// Kiểu trận Truyền Tống (tách khỏi teleport.ts để teleport.<level>.ts không import ngược teleport.ts: không vòng phụ thuộc).
export interface TelePad {
  id: string;
  /** Level đặt trận (E1-B). Id trận ở level khác Vân Lam có tiền tố level (`dm_`, `vh_`, `tk_`, `bh_`) để `characters.tele` không đổi cấu trúc. */
  level: string;
  /** Hướng nhìn khi tới (điểm trận quay về phía này); thiếu thì về phía tông môn Vân Lam. */
  face?: { x: number; z: number };
  /** Id vùng (`zones` trong levels/van_lam.json) mà trận đứng trong; '' nếu là tông môn hoặc cổng. */
  zone: string;
  x: number;
  z: number;
}
