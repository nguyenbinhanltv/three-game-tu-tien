// Truyền Tống Trận và điểm đánh dấu (M-4). Hằng số, bảng trận, kiểu tin nhắn dùng chung server và client.

import { PLAY_BOUNDS } from './level';
import { DOAN_MACH_PADS } from './teleport.doanmach';
import { VAN_HAI_PADS } from './teleport.vanhai';
import { THIEN_KHUYET_PADS } from './teleport.thienkhuyet';
import { BAC_HOANG_PADS } from './teleport.bachoang';

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

/**
 * Mỗi vùng một trận, cộng trận ở sân tông môn (mở sẵn) và ở bệ cổng Kiếm Trủng. Vị trí là chỗ bằng phẳng, không đè
 * collider/nước, nằm ngoài bán kính bãi quái gần nhất (ít nhất 5 m, vì các vùng phủ kín bãi), gần phía tông môn của vùng (chỗ đi vào) —
 * `content:check` kiểm lại các điều kiện này. Id dùng làm khóa lưu DB: đừng đổi tên.
 */
export const TELE_PADS: readonly TelePad[] = [
  { id: 'tp_tong_mon', level: 'van_lam', zone: '', x: 2048, z: 2112 },
  { id: 'tp_cong', level: 'van_lam', zone: '', x: 2048, z: 1750 },
  { id: 'tp_thung_lung', level: 'van_lam', zone: 'thung_lung', x: 2010, z: 2375 },
  { id: 'tp_suoi', level: 'van_lam', zone: 'suoi_thanh_khe', x: 2405, z: 2500 },
  { id: 'tp_rung', level: 'van_lam', zone: 'rung_linh_thao', x: 2335, z: 2110 },
  { id: 'tp_vach', level: 'van_lam', zone: 'vach_da_ngoc', x: 2420, z: 1815 },
  { id: 'tp_ho', level: 'van_lam', zone: 'ho_suong_mu', x: 1580, z: 2070 },
  // Thiên Mạch Đài (E2-A): bệ ở sân Lạc Kiếm Tông, phía bắc Chính điện; truyền tống tới Hạ Khuyết Trạm (Đoạn Mạch Cổ Cốc).
  { id: 'tp_thien_mach', level: 'van_lam', zone: '', x: 2048, z: 1968 },
  // Đoạn Mạch Cổ Cốc (tiền tố dm_).
  ...DOAN_MACH_PADS,
  // Vân Hải Phù Đảo (E3-A, tiền tố vh_).
  ...VAN_HAI_PADS,
  // Thiên Khuyết Cổ Thành (E4-A, tiền tố tk_).
  ...THIEN_KHUYET_PADS,
  // Bắc Hoang Tẫn Nguyên (DV-1, tiền tố bh_).
  ...BAC_HOANG_PADS,
];

export const TELE_PAD = new Map(TELE_PADS.map((p) => [p.id, p]));
/** Trận mở sẵn cho mọi nhân vật. Đoạn Mạch Cổ Cốc không mở sẵn: vào lần đầu cần mở khóa dm_tp_tram (nhiệm vụ chương 2 của E2-H; thử bằng `/gm tele dm_tp_tram`), tới nơi thì trận tự mở (điểm đến cách trận 3 m < TELE_TOUCH_R). */
export const TELE_FREE: readonly string[] = ['tp_tong_mon'];
/** Đứng trong bán kính này (m) của trận thì mở khóa. */
export const TELE_TOUCH_R = 4;
/** Thời gian niệm (ms): di chuyển, bị đánh, vào giao chiến hoặc chết thì hủy. */
export const TELE_CAST_MS = 3000;
/** Niệm khi trận đích ở level khác (ms). */
export const TELE_CAST_LEVEL_MS = 5000;
/** Người dẫn tổ đội truyền tống liên level kéo theo đồng đội cùng room trong bán kính này (m). */
export const TELE_PARTY_R = 30;
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
export function validMark(x: unknown, z: unknown, b: { x0: number; z0: number; x1: number; z1: number } = PLAY_BOUNDS): x is number {
  return typeof x === 'number' && typeof z === 'number' && Number.isFinite(x) && Number.isFinite(z) && x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1;
}

/** Trận đứng trên bản đồ của `level` (vẽ mô hình, vẽ lên bản đồ lớn). Trận ở level khác có tọa độ của level đó nên không được vẽ ở đây. */
export function padsOfLevel(level: string): TelePad[] {
  return TELE_PADS.filter((p) => p.level === level);
}
