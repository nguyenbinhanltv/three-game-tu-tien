// Truyền Tống Trận và điểm đánh dấu (M-4). Hằng số, bảng trận, kiểu tin nhắn dùng chung server và client.

import { PLAY_BOUNDS } from './level';

export interface TelePad {
  id: string;
  /** Id vùng (`zones` trong levels/van_lam.json) mà trận đứng trong; '' nếu là tông môn hoặc cổng. */
  zone: string;
  x: number;
  z: number;
}

/**
 * Mỗi vùng một trận, cộng trận ở sân tông môn (mở sẵn) và ở bệ cổng Kiếm Trủng. Vị trí là chỗ bằng phẳng, không đè
 * collider/nước, nằm ngoài bán kính bãi quái gần nhất (ít nhất 5 m, vì các vùng phủ kín bãi), gần phía tông môn của vùng (chỗ đi vào) —
 * `content:check` kiểm lại các điều kiện này. Id dùng làm khóa lưu DB: đừng đổi tên.
 */
export const TELE_PADS: readonly TelePad[] = [
  { id: 'tp_tong_mon', zone: '', x: 2048, z: 2112 },
  { id: 'tp_cong', zone: '', x: 2048, z: 1750 },
  { id: 'tp_thung_lung', zone: 'thung_lung', x: 2010, z: 2375 },
  { id: 'tp_suoi', zone: 'suoi_thanh_khe', x: 2405, z: 2500 },
  { id: 'tp_rung', zone: 'rung_linh_thao', x: 2335, z: 2110 },
  { id: 'tp_vach', zone: 'vach_da_ngoc', x: 2420, z: 1815 },
  { id: 'tp_ho', zone: 'ho_suong_mu', x: 1580, z: 2070 },
];

export const TELE_PAD = new Map(TELE_PADS.map((p) => [p.id, p]));
/** Trận mở sẵn cho mọi nhân vật. */
export const TELE_FREE: readonly string[] = ['tp_tong_mon'];
/** Đứng trong bán kính này (m) của trận thì mở khóa. */
export const TELE_TOUCH_R = 4;
/** Thời gian niệm (ms): di chuyển, bị đánh, vào giao chiến hoặc chết thì hủy. */
export const TELE_CAST_MS = 3000;
/** Hồi chiêu sau mỗi lần truyền tống thành công (ms). */
export const TELE_CD_MS = 30_000;
/** Đi quá chừng này (m) khỏi chỗ bắt đầu niệm thì hủy. */
export const TELE_MOVE_CANCEL = 1.8;
/** Giãn tối thiểu giữa hai lệnh `tele` (ms). */
export const TELE_CMD_GAP_MS = 400;
/** Điểm đến cách tâm trận chừng này (m) về phía tông môn để không đứng đè lên mô hình trận. */
export const TELE_ARRIVE_OFFSET = 3;

export interface TeleCmd {
  /** Id trận cần tới (`TelePad.id`); thiếu hoặc rỗng = hủy lượt niệm đang chạy. */
  id?: string;
}

/** Server → client (S.TELE): trạng thái Truyền Tống Trận của mình. */
export interface TeleMsg {
  /** Id các trận đã mở khóa. */
  open: string[];
  /** Đang niệm tới trận `id`, còn `ms` mili giây; null nếu không niệm. */
  cast: { id: string; ms: number } | null;
  /** Còn bao nhiêu ms nữa mới dùng lại được; 0 = dùng được ngay. */
  cd: number;
}

// ---- Điểm đánh dấu ----

/** Giãn tối thiểu giữa hai lệnh đặt/xóa (ms). */
export const MARK_GAP_MS = 1000;
/** Điểm đánh dấu tự hết hạn sau chừng này (ms). */
export const MARK_TTL_MS = 10 * 60_000;

export interface MarkCmd {
  /** Xóa điểm đánh dấu của mình. */
  clear?: boolean;
  x?: number;
  z?: number;
}

export interface MarkInfo {
  /** Id nhân vật người đặt. */
  id: number;
  name: string;
  x: number;
  z: number;
  own: boolean;
}

/** Server → client (S.MARK): toàn bộ điểm đánh dấu mình đang thấy (của mình và đồng đội cùng room). */
export interface MarkMsg {
  marks: MarkInfo[];
}

/** Điểm (x, z) hợp lệ để đánh dấu: số hữu hạn nằm trong vùng chơi. */
export function validMark(x: unknown, z: unknown): x is number {
  return typeof x === 'number' && typeof z === 'number' && Number.isFinite(x) && Number.isFinite(z) && x >= PLAY_BOUNDS.x0 && x <= PLAY_BOUNDS.x1 && z >= PLAY_BOUNDS.z0 && z <= PLAY_BOUNDS.z1;
}
