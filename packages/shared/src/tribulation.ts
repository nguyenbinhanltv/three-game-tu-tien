// Độ kiếp theo dữ liệu (E1-F). Hàm thuần dùng chung server (phán định) và client (HUD, cảnh điện ảnh).
// Dữ liệu ở packages/content/data/tribulations.json; hằng số Trúc Cơ cũ (`TRIB_*` trong formulas.ts) suy ra từ đây.

import raw from '../../content/data/tribulations.json';

export type TribId = 'truc_co' | 'ket_dan' | 'nguyen_anh' | 'hoa_than';
export type TribPhaseKind = 'lei' | 'hoa' | 'tam_ma';
/** Độ kiếp chạy ngay trong room thế giới hay room riêng (tổ đội vào cùng). */
export type TribRoomKind = 'world' | 'tribulation';

export interface TribNet {
  lines: number;
  count: number;
  r: number;
  step: number;
  gap: number;
  delay: number;
  pct: number;
  every: number;
}

export interface TribFinal {
  r: number;
  delay: number;
  pct: number;
  defMul: number;
  defMaxCut: number;
  /** Phần sát thương hộ pháp chắn thay (0 = không), tối đa `guardMax` người trong `guardR` mét. */
  guardShare?: number;
  guardMax?: number;
  guardR?: number;
}

export interface TribGrid {
  cols: number;
  rows: number;
  /** Cạnh một ô (m). */
  cell: number;
  /** Số ô bị chọn mỗi đợt. */
  pick: number;
  warn: number;
  burn: number;
  pct: number;
}

export interface TribShadows {
  /** Chu kỳ (giây) giữa các đợt; thiếu + `once` = chỉ một đợt đầu pha. */
  every?: number;
  once?: boolean;
  count: number;
  levelDelta: number;
  /** Máu tối đa của bóng so với khí huyết người độ kiếp. */
  hpFrac: number;
  maxAlive: number;
}

export interface TribPhaseDef {
  id: string;
  kind: TribPhaseKind;
  /** Giây kể từ lúc bắt đầu mà pha kết thúc (pha cuối = `duration`). */
  end: number;
  /** Nhịp (giây) giữa hai đợt; `gapEnd` thì nội suy tuyến tính tới cuối pha. */
  gap: number;
  gapEnd?: number;
  /** Phần trăm khí huyết tối đa của tia nhắm thẳng (0 = không có tia nhắm). */
  aimPct?: number;
  extra?: number;
  extraR?: number;
  extraPct?: number;
  net?: TribNet;
  final?: TribFinal;
  grid?: TribGrid;
  shadows?: TribShadows;
  /** Móc cơ chế riêng (tribmech.ts). */
  mechanic?: string;
}

export interface TribDef {
  id: TribId;
  /** Cấp đại viên mãn đứng trước kiếp, và cấp đạt được khi thành công. */
  from: number;
  to: number;
  /** Chưa bật cho người chơi (thiếu vật phẩm, cân bằng) — chỉ GM và test mở được. */
  enabled: boolean;
  /** Vật phẩm đột phá bị tiêu khi bắt đầu; null = chưa có. */
  item: string | null;
  room: TribRoomKind;
  element: string;
  duration: number;
  firstDelay: number;
  failXpLoss: number;
  refundAfter: number;
  pillMax: number;
  aim: { r: number; delay: number };
  extraDelay: { min: number; max: number };
  extraDist: { min: number; max: number };
  /** Người xem (hộ pháp) được vào trong bán kính này (m). */
  guard?: { r: number };
  phases: TribPhaseDef[];
}

/** Móc cơ chế riêng hợp lệ (server cài ở apps/server/src/game/tribmech.ts; `content:check` kiểm dữ liệu chỉ dùng id trong danh sách này). */
export const TRIB_MECHANIC_IDS = ['dan_tran', 'tia_xich', 'xuat_khieu', 'tam_canh', 'ngu_hanh', 'phan_than'] as const;

const defs = (raw as unknown as { defs: Record<string, Omit<TribDef, 'id'>> }).defs;
export const TRIB_DEFS: Readonly<Record<TribId, TribDef>> = Object.fromEntries(Object.entries(defs).map(([id, d]) => [id, { ...d, id }])) as Record<TribId, TribDef>;
export const TRIB_IDS = Object.keys(TRIB_DEFS) as TribId[];

export function tribDef(id: string | undefined | null): TribDef {
  return TRIB_DEFS[(id ?? 'truc_co') as TribId] ?? TRIB_DEFS.truc_co;
}

/** Kiếp mở ra từ cấp đại viên mãn `level` (15, 19, 23, 27), hoặc null. */
export function tribForLevel(level: number): TribDef | null {
  return TRIB_IDS.map((i) => TRIB_DEFS[i]).find((d) => d.from === level) ?? null;
}

/** Chỉ số pha (0-based) tại giây `elapsed`. */
export function tribPhaseIndex(def: TribDef, elapsed: number): number {
  const i = def.phases.findIndex((p) => elapsed < p.end);
  return i < 0 ? def.phases.length - 1 : i;
}

/** Đầu pha `i` (giây). */
export function tribPhaseStart(def: TribDef, i: number): number {
  return i <= 0 ? 0 : def.phases[i - 1].end;
}

/** Nhịp thực của pha tại `elapsed` (có `gapEnd` thì nội suy). */
export function tribGapAt(def: TribDef, i: number, elapsed: number): number {
  const p = def.phases[i];
  if (p.gapEnd === undefined) return p.gap;
  const a = tribPhaseStart(def, i);
  const t = Math.min(1, Math.max(0, (elapsed - a) / Math.max(1e-6, p.end - a)));
  return p.gap + (p.gapEnd - p.gap) * t;
}
