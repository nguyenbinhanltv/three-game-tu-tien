// Bảng tổng kết trận (Chân Cảnh U5, X6): số liệu do server cộng dồn tại các điểm sát thương/hồi máu thật rồi gửi một lần khi
// bí cảnh kết thúc. Client chỉ hiển thị; không bao giờ gửi số liệu lên.

/** Bộ đếm của một người trong một trận (server giữ, chỉ cộng dồn). */
export interface MatchStat {
  /** Sát thương thật gây lên quái (đã trừ phần vượt máu còn lại của quái). */
  dealt: number;
  /** Máu thật đã hồi (không tính phần tràn) cho bản thân và đồng đội do mình tạo ra. */
  heal: number;
  /** Sát thương thật nhận vào (sau giảm, sau khiên). */
  taken: number;
  /** Sát thương phản đòn đã gây lại quái (Kim Chung Trấn, bộ Huyền Giáp). 0 = chưa có. */
  reflect: number;
}

export const newMatchStat = (): MatchStat => ({ dealt: 0, heal: 0, taken: 0, reflect: 0 });

/** Một dòng của bảng tổng kết. */
export interface RecapRow extends MatchStat {
  sid: string;
  name: string;
  level: number;
  dead: boolean;
}

export interface RecapMsg {
  /** id level của bí cảnh (khóa i18n tên: `dungeon.<id>.name`). */
  level: string;
  /** Thời gian trận (giây). */
  secs: number;
  /** Đã xếp theo sát thương gây ra giảm dần. */
  rows: RecapRow[];
}

/** Số làm tròn về số nguyên không âm (chống NaN/âm khi cộng dồn). */
const whole = (n: number): number => (Number.isFinite(n) && n > 0 ? Math.round(n) : 0);

export function buildRecap(level: string, secs: number, rows: readonly RecapRow[]): RecapMsg {
  const clean = rows.map((r) => ({ ...r, dealt: whole(r.dealt), heal: whole(r.heal), taken: whole(r.taken), reflect: whole(r.reflect) }));
  clean.sort((a, b) => b.dealt - a.dealt || a.name.localeCompare(b.name));
  return { level, secs: whole(secs), rows: clean };
}

/** Phần trăm đóng góp (0–100) của `v` trong tổng `total` của một cột; 0 khi tổng bằng 0. */
export function recapShare(v: number, total: number): number {
  return total > 0 ? Math.round((v / total) * 100) : 0;
}
