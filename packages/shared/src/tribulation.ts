// Độ kiếp theo dữ liệu (E1-F). Hàm thuần dùng chung server (phán định) và client (HUD, cảnh điện ảnh).
// Dữ liệu ở packages/content/data/tribulations.json; hằng số Trúc Cơ cũ (`TRIB_*` trong formulas.ts) suy ra từ đây.

import raw from '../../content/data/tribulations.json';
import { ELEM_BEATS } from './elements';
import { ELEMENTS, type Element } from './items';

export type TribId = 'truc_co' | 'ket_dan' | 'nguyen_anh' | 'hoa_than' | 'anh_bien';
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
  /** Anh Biến: từng này Trấn Giới Bia sáng trở lên thì tia cuối đánh vào khe (không vào người), dưới đó như tia thường. */
  gateSteles?: number;
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

/** Đan Trận (Kết Đan, cơ chế `dan_tran`): vòng dưới chân, đứng yên trong vòng thì thanh ngưng đan đầy, ra khỏi vòng thì tụt; thiên lôi quét vạch qua vòng. */
export interface TribDanTran {
  /** Bán kính vòng (m). */
  r: number;
  /** Số giây đứng yên trong vòng để thanh 0→100. */
  fill: number;
  /** Tụt bao nhiêu % mỗi giây khi ra khỏi vòng. */
  drain: number;
  /** Dưới ngưỡng này (m/s) coi là đứng yên. */
  still: number;
  /** Tia quét: chu kỳ, chiều dài, bề rộng (m), thời gian báo (s), % khí huyết tối đa. */
  sweepEvery: number;
  sweepLen: number;
  sweepW: number;
  sweepWarn: number;
  sweepPct: number;
}

/** Tia xích (Nguyên Anh, cơ chế `tia_xich`): hai tia nối nhau bằng một vạch sét đi qua chỗ người độ kiếp đứng. */
export interface TribTiaXich {
  /** Chu kỳ (giây), chiều dài vạch (m), bề rộng (m), thời gian báo (s), % khí huyết tối đa của vạch; hai đầu là tia tròn bán kính `endR`, `endPct`. */
  every: number;
  len: number;
  w: number;
  warn: number;
  pct: number;
  endR: number;
  endPct: number;
}

/** Xuất khiếu (Nguyên Anh, cơ chế `xuat_khieu`): nguyên anh rời thân `dur` giây, hồi `cd` giây; thân đứng yên, lửa nặng nhất bị đẩy sang ô kề. */
export interface TribXuatKhieu {
  dur: number;
  cd: number;
}

/** Tâm cảnh (Nguyên Anh, cơ chế `tam_canh`): thanh 0..100; bị Tâm Ma Ảnh đánh trúng thì giảm `hurt`, đánh trúng nó thì hồi `hit`; về 0 là thất bại. Bóng ra chiêu của người độ kiếp mỗi `skillEvery` giây (báo `skillWarn`, hệ số `skillPow`). */
export interface TribTamCanh {
  hurt: number;
  hit: number;
  skillEvery: number;
  skillWarn: number;
  skillPow: number;
}

/**
 * Ngũ hành lôi (Hóa Thần, cơ chế `ngu_hanh`): năm trận môn (bán kính `sealR`) trên vòng bán kính `ring` quanh chỗ người độ kiếp đứng lúc vào kiếp
 * (trận môn `i` ứng hành `ELEMENTS[i]`). Mỗi `every` giây một tia kiếp mang hành kế tiếp (Kim → Mộc → Thủy → Hỏa → Thổ) quét cả sân (bán kính `ring + sealR + pad`),
 * báo `warn` giây; đứng trong trận môn khắc chế hành đó thì giảm `cut` (cờ `ke` ở DmgMsg).
 */
export interface TribNguHanh {
  ring: number;
  sealR: number;
  pad: number;
  /** Tia đầu tiên sau bao nhiêu giây kể từ đầu pha. */
  first: number;
  every: number;
  warn: number;
  /** % khí huyết tối đa của tia kiếp. */
  pct: number;
  /** Phần giảm khi đứng đúng trận môn (0..1). */
  cut: number;
}

/**
 * Phân thân thần niệm trong kiếp (Hóa Thần, cơ chế `phan_than`; phím G, miễn phí, chỉ trong kiếp): thế thân đứng yên `life` giây ở chỗ người độ kiếp đứng lúc bấm.
 * Pha Thần niệm: `sweeps` (giây kể từ đầu pha) tia quét dài `sweepLen` × `sweepW`; `pillarAt` cột thiên phạt rơi cùng lúc `pillars` trận môn (không gồm trận môn thứ hai);
 * `linkAt` mạch nối thiên phạt đánh thẳng người độ kiếp (`linkPct`) trừ khi thế thân hoặc chính thân đứng trong trận môn thứ hai (`LINK_SEAL`).
 * Pha cuối: thế thân còn sống chắn thay `absorb` tia khóa mệnh.
 */
export interface TribPhanThan {
  life: number;
  /** Tối đa bao nhiêu thế thân mỗi kiếp. */
  max: number;
  sweeps?: number[];
  sweepLen?: number;
  sweepW?: number;
  sweepWarn?: number;
  sweepPct?: number;
  pillarAt?: number;
  pillars?: number;
  pillarR?: number;
  pillarWarn?: number;
  pillarPct?: number;
  linkAt?: number;
  linkWarn?: number;
  linkPct?: number;
  absorb?: number;
}

/** Trận môn thứ hai (hành Mộc) gánh mạch nối thiên phạt. */
export const TRIB_LINK_SEAL = 1;

/** Vị trí trận môn `i` (0..4) quanh tâm `c` với bán kính vòng `ring`. */
export function tribSealPos(c: { x: number; z: number }, ring: number, i: number): { x: number; z: number } {
  const a = (i * Math.PI * 2) / ELEMENTS.length;
  return { x: c.x + Math.sin(a) * ring, z: c.z + Math.cos(a) * ring };
}

/** Hành khắc chế `e` (hành nào thắng `e`). */
export function elemCounterOf(e: Element): Element {
  return ELEMENTS.find((c) => ELEM_BEATS[c] === e) as Element;
}

/** Chỉ số hành (0..4) của tia kiếp thứ `n` (xoay vòng Kim → Mộc → Thủy → Hỏa → Thổ). */
export function nguHanhIndex(n: number): number {
  return ((n % ELEMENTS.length) + ELEMENTS.length) % ELEMENTS.length;
}

/** Trận môn khắc chế hành `i`: chỉ số trận môn đứng vào để giảm sát thương. */
export function nguHanhSealFor(i: number): number {
  return ELEMENTS.indexOf(elemCounterOf(ELEMENTS[nguHanhIndex(i)]));
}

/**
 * Dẫn lôi (Anh Biến, cơ chế `dan_loi`): năm Trấn Giới Bia (thực thể của kiếp) ở ngũ giác bán kính `ring` quanh tâm sân của level kiếp.
 * Mỗi `every` giây một tia nhắm chỗ người độ kiếp đang đứng, báo `warn` giây rồi rơi ở đúng chỗ đó; rơi trong `steleR` mét quanh một bia chưa sáng thì bia đó sáng.
 */
export interface TribDanLoi {
  ring: number;
  steleR: number;
  first: number;
  every: number;
  warn: number;
  /** % khí huyết tối đa của tia (bán kính `r`). */
  pct: number;
  r: number;
}

/**
 * Nhật thực (Anh Biến, cơ chế `nhat_thuc`): Nhật Thực Dực Chủ (`boss`, máu `hpFrac` so với boss ngoài trời) giáng xuống `dist` mét trước mặt người độ kiếp.
 * Mỗi `smashEvery` giây hắn nhắm một bia đang sáng, niệm `smashWarn` giây rồi dập (bia tắt, mất tiến độ); ngắt chú (choáng/mất thế) thì hủy.
 * Thiên lôi vẫn rơi mỗi `every` giây quanh người độ kiếp (`warn`, `r`, `pct`) và đánh cả hắn: hắn đứng trong `r` thì mất thế `stun` giây.
 * Tịnh Quang đỡ thay một đòn mỗi `shieldEvery` giây.
 */
export interface TribNhatThuc {
  boss: string;
  hpFrac: number;
  dist: number;
  smashEvery: number;
  smashWarn: number;
  smashR: number;
  smashPct: number;
  every: number;
  warn: number;
  r: number;
  pct: number;
  stun: number;
  shieldEvery: number;
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
  /** Cơ chế Đan Trận (chỉ dùng khi `mechanic` = `dan_tran`). */
  danTran?: TribDanTran;
  tiaXich?: TribTiaXich;
  xuatKhieu?: TribXuatKhieu;
  tamCanh?: TribTamCanh;
  nguHanh?: TribNguHanh;
  phanThan?: TribPhanThan;
  danLoi?: TribDanLoi;
  nhatThuc?: TribNhatThuc;
  /** Thiên lôi pha này nhuốm lửa (lôi hỏa): client đổi màu tia (HDR vẫn dưới trần). Chỉ là lớp hình. */
  hot?: boolean;
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
  /** Level (bản đồ kiếp) của room kiếp riêng; thiếu = `do_kiep`. */
  level?: string;
}

/** Móc cơ chế riêng hợp lệ (server cài ở apps/server/src/game/tribmech.ts; `content:check` kiểm dữ liệu chỉ dùng id trong danh sách này). */
export const TRIB_MECHANIC_IDS = ['dan_tran', 'tia_xich', 'xuat_khieu', 'tam_canh', 'ngu_hanh', 'phan_than', 'dan_loi', 'nhat_thuc'] as const;

const defs = (raw as unknown as { defs: Record<string, Omit<TribDef, 'id'>> }).defs;
export const TRIB_DEFS: Readonly<Record<TribId, TribDef>> = Object.fromEntries(Object.entries(defs).map(([id, d]) => [id, { ...d, id }])) as Record<TribId, TribDef>;
export const TRIB_IDS = Object.keys(TRIB_DEFS) as TribId[];

export function tribDef(id: string | undefined | null): TribDef {
  return TRIB_DEFS[(id ?? 'truc_co') as TribId] ?? TRIB_DEFS.truc_co;
}

/** Level kiếp của `def` (mặc định `do_kiep`). */
export function tribLevelOf(def: TribDef): string {
  return def.level ?? 'do_kiep';
}

/** Tên room kiếp của level: `tribulation` cho `do_kiep`, `tribulation-<id>` cho level kiếp riêng. */
export function tribRoomNameOf(level: string): string {
  return level === 'do_kiep' ? 'tribulation' : `tribulation-${level}`;
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
