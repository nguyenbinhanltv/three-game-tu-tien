// Thần thức (E2-E): mở ở Kết Đan sơ kỳ (cấp 20). Giữ phím V quét một vùng quanh người, lộ tinh anh, boss, quái, điểm hái,
// người chơi và điểm đáng chú ý trong vài giây (cờ trên minimap + cột sáng). Hàm thuần dùng chung client (hiển thị) và server (tính thật).
// Server quyết định kết quả quét; client chỉ gửi ý định (`SpiritCmd`) và vẽ `SpiritScanMsg`.

/** Cấp tối thiểu để dùng thần thức (Kết Đan sơ kỳ). */
export const SPIRIT_UNLOCK_LEVEL = 20;
/** Thời gian giữ phím để quét (ms). */
export const SPIRIT_CHANNEL_MS = 2500;
/** Hồi chiêu tính từ lúc quét xong (ms). */
export const SPIRIT_CD_MS = 20000;
/** Linh lực tốn khi quét xong (hủy giữa chừng thì không tốn, không hồi chiêu). */
export const SPIRIT_MP = 20;
/** Kết quả quét hiện trên minimap/thế giới bao lâu (ms). */
export const SPIRIT_REVEAL_MS = 6000;
/** Dịch chuyển quá chừng này (m) khi đang giữ thì hủy quét. */
export const SPIRIT_MOVE_CANCEL = 1.5;
/** Giãn lệnh `spirit` của một người (ms). */
export const SPIRIT_CMD_GAP_MS = 120;
/** Trần số điểm một lần quét trả về (gần nhất trước). */
export const SPIRIT_MAX_HITS = 90;

/** Phạm vi quét (m) theo cấp: Kết Đan sơ kỳ 60, trung kỳ 80, Hóa Thần sơ kỳ 120; `bonus` là ngọc thần thức (+3 m mỗi ngọc). */
export function spiritRadius(level: number, bonus = 0): number {
  const base = level >= 28 ? 120 : level >= 21 ? 80 : 60;
  return base + Math.max(0, bonus);
}

export function spiritUnlocked(level: number): boolean {
  return level >= SPIRIT_UNLOCK_LEVEL;
}

/** Loại điểm lộ ra: boss, tinh anh, quái thường, điểm hái, người chơi khác, điểm đáng chú ý. */
export type SpiritKind = 'boss' | 'elite' | 'mon' | 'node' | 'player' | 'poi';

export interface SpiritHit {
  k: SpiritKind;
  x: number;
  z: number;
  /** boss/elite/mon: id quái; node: id vật phẩm; player: tên; poi: id điểm. */
  n: string;
  /** Cấp quái (chỉ quái). */
  lv?: number;
}

/** Client → server: bắt đầu giữ (`on: true`) hoặc thả phím (`on: false`, hủy nếu chưa quét xong). */
export interface SpiritCmd {
  on: boolean;
}

/** Server → client: trạng thái thần thức của mình (mở khóa, đang niệm, hồi chiêu, phạm vi). */
export interface SpiritStateMsg {
  open: boolean;
  /** Còn bao nhiêu ms nữa quét xong (0 = không đang quét). */
  ch: number;
  /** Hồi chiêu còn lại (ms). */
  cd: number;
  r: number;
}

/** Server → client: kết quả một lần quét. */
export interface SpiritScanMsg {
  x: number;
  z: number;
  r: number;
  /** Hiện bao lâu (ms) kể từ lúc nhận. */
  ttl: number;
  hits: SpiritHit[];
}
