// Khối độ kiếp của bảng nhân vật (TD-C): đọc `tribulations.json` qua shared cho MỌI cảnh giới, không viết cứng Trúc Cơ.
// Hàm thuần; server vẫn kiểm lại mọi điều kiện (`onBreakthrough`).
import { bottleneckBlocked, MAX_LEVEL, TRIB_IDS, TRIB_DEFS, tribForLevel, type InvSlot, type TribDef } from '@dtl/shared';

export interface BreakChar {
  level: number;
  xp: number;
  xpNeed: number;
  bk: number;
}

export interface BreakInfo {
  /** Kiếp kế tiếp của nhân vật (null nếu đã tới cảnh giới cuối). */
  def: TribDef | null;
  /** Đang đứng ở cấp đại viên mãn của kiếp (`def.from`). */
  atPeak: boolean;
  /** Tu vi đã đầy. */
  xpFull: boolean;
  /** Bình cảnh đại viên mãn đã vượt (hoặc không cần). */
  bkOk: boolean;
  /** Kiếp đã mở cho người chơi (cờ `enabled`). */
  enabled: boolean;
  /** Vật phẩm đột phá cần có (null = kiếp chưa có vật phẩm). */
  item: string | null;
  have: number;
  /** Đủ mọi điều kiện để bấm Độ kiếp. */
  ready: boolean;
}

/** Kiếp sắp tới: kiếp mở ở cấp hiện tại, hoặc kiếp có `from` gần nhất phía trên. */
export function nextTrib(level: number): TribDef | null {
  if (level >= MAX_LEVEL) return null;
  const here = tribForLevel(level);
  if (here) return here;
  const ahead = TRIB_IDS.map((i) => TRIB_DEFS[i]).filter((d) => d.from > level);
  return ahead.sort((a, b) => a.from - b.from)[0] ?? null;
}

export function breakInfo(c: BreakChar, inv: readonly InvSlot[]): BreakInfo {
  const def = nextTrib(c.level);
  const item = def?.item ?? null;
  const have = item ? inv.reduce((s, x) => s + (x && x.id === item ? x.n : 0), 0) : 0;
  const atPeak = !!def && c.level === def.from;
  const xpFull = c.xp >= c.xpNeed;
  const bkOk = !bottleneckBlocked(c.level, c.bk);
  const enabled = !!def?.enabled;
  const ready = atPeak && xpFull && bkOk && enabled && (!item || have > 0);
  return { def, atPeak, xpFull, bkOk, enabled, item, have, ready };
}
