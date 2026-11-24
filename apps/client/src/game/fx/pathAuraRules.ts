// Hào quang riêng của ba hướng tu Đao tu, Cổ tu, Cấm chế sư (nợ bàn giao #473): hàm thuần quyết định hiện gì, bao nhiêu, khi nào ẩn.
// Quy ước theo lỗi Cổ Thần/Lôi tu (hào quang cảnh giới quá rối trên thân đã nhiều chi tiết): mỗi hướng chỉ MỘT lớp nhẹ, đọc ra bản sắc,
// THAY hẳn hào quang cảnh giới mặc định (không vẽ chồng hai hệ), ẩn khi hóa hình/bay/chết/độ kiếp/xuất khiếu.
//   Đao tu    : vài vệt đao thép bạc treo nghiêng, xoay rất chậm quanh thân (khí thế như vết chém để lại)
//   Cổ tu     : vài cổ trùng nhỏ bay lượn quanh người
//   Cấm chế sư: văn trận mờ dưới chân, xoay chậm
// Chỉ là lớp hình theo công pháp `mt` và `lv` server đã đồng bộ; không đọc/ghi luật chơi.
import { pathOf } from '@dtl/content';
import { PF_DEAD, PF_FLYING, PF_SOUL, PF_TRIBULATION } from '@dtl/shared';
import { auraStage, type AuraStage } from './realmAuraRules';

/** Kiểu hào quang hướng: `dao` vệt đao, `co` cổ trùng, `cam` văn trận. */
export type PathAuraKind = 'dao' | 'co' | 'cam';

const KIND_OF_PATH: Readonly<Record<string, PathAuraKind>> = { dao_tu: 'dao', co_tu: 'co', cam_che_su: 'cam' };

/** Kiểu hào quang của công pháp đang tu (`PState.mt`); hướng khác/chưa chọn = không có. */
export function pathAuraOf(mt: string | undefined): PathAuraKind | null {
  const id = pathOf(mt)?.id;
  return id ? (KIND_OF_PATH[id] ?? null) : null;
}

/** Hào quang cảnh giới mặc định có phải nhường chỗ cho lớp hướng không (`on` = cờ `?pathaura`, mặc định bật). */
export function realmSuppressed(mt: string | undefined, on: boolean): boolean {
  return on && pathAuraOf(mt) !== null;
}

/** Màu theo bảng màu hướng tu (`paths.json` → `palette`), số hex. */
export interface PathAuraPalette {
  core: number;
  body: number;
  rim: number;
  accent: number;
  shadow: number;
}
export function pathAuraPalette(mt: string | undefined): PathAuraPalette | null {
  const p = pathOf(mt)?.palette;
  if (!p || !pathAuraOf(mt)) return null;
  const hex = (s: string): number => Number.parseInt(s, 16);
  return { core: hex(p.core), body: hex(p.body), rim: hex(p.rim), accent: hex(p.accent), shadow: hex(p.shadow) };
}

/** Số phần tử của lớp theo cảnh giới (tăng nhẹ theo Kết Đan/Nguyên Anh/Hóa Thần để vẫn thấy mình tiến bộ, không thêm lớp mới). */
export const PATH_AURA_COUNT: Readonly<Record<PathAuraKind, readonly [number, number, number, number, number]>> = {
  dao: [2, 2, 2, 3, 3],
  co: [3, 3, 4, 4, 4],
  cam: [1, 1, 1, 1, 1],
};
export function pathAuraCount(kind: PathAuraKind, stage: AuraStage): number {
  return PATH_AURA_COUNT[kind][stage];
}

/** Bán kính văn trận dưới chân (m) theo cảnh giới. */
export function runeRadius(stage: AuraStage): number {
  return 1.5 + stage * 0.12;
}

/** Cảnh giới `lv` ứng với bậc hào quang (dùng lại bậc của hào quang cảnh giới). */
export const pathAuraStage = (lv: number): AuraStage => auraStage(lv);

/** Người này có phải ẩn hẳn lớp hướng không: hóa hình (`giant` > 0,02), chết, ngự kiếm, độ kiếp, xuất khiếu nguyên anh. */
export function pathAuraHidden(fl: number, giant: number | undefined): boolean {
  return (giant ?? 0) > 0.02 || (fl & (PF_DEAD | PF_FLYING | PF_TRIBULATION | PF_SOUL)) !== 0;
}

/** Độ sáng gốc của lớp (nhân với trọng số `main` của `auraWeights`): nhẹ, không phải lớp chính của cảnh giới. */
export const PATH_AURA_BASE: Readonly<Record<PathAuraKind, number>> = { dao: 0.85, co: 0.95, cam: 0.8 };

/** Vết đao: góc nghiêng (độ, quanh trục hướng tiếp tuyến) của vệt thứ `i`, xen kẽ hai bên để không thành vòng đều như phi kiếm. */
export function slashTilt(i: number): number {
  return i % 2 === 0 ? -38 : 32;
}

/** Cổ trùng thứ `i` trong `n`: bán kính, độ cao, tốc độ góc (rad/s) và pha — mỗi con một nhịp riêng để bay lượn, không xếp vòng. */
export function bugOrbit(i: number, n: number, t: number): { ang: number; r: number; y: number } {
  const f = i / Math.max(1, n);
  const speed = (0.9 + 0.35 * ((i * 7) % 5)) * (i % 2 === 0 ? 1 : -0.8);
  const ang = t * speed + f * Math.PI * 2;
  const r = 0.7 + 0.2 * Math.sin(t * 0.7 + i * 2.1) + 0.08 * (i % 3);
  const y = 0.5 + 0.5 * f + 0.1 * Math.sin(t * 1.9 + i * 1.3);
  return { ang, r, y };
}

/** Chu kỳ (giây) của một vệt đao: mỗi vệt chỉ hiện `SLASH_ACTIVE` giây đầu chu kỳ, các vệt lệch pha nhau. */
export const SLASH_PERIOD = 2.6;
export const SLASH_ACTIVE = 0.45;
/** Tiến độ 0–1 của vệt thứ `i` trong `n` tại thời điểm `t`; âm = đang nghỉ (không vẽ). */
export function slashPhase(t: number, i: number, n: number): number {
  const local = (((t + (i / Math.max(1, n)) * SLASH_PERIOD) % SLASH_PERIOD) + SLASH_PERIOD) % SLASH_PERIOD;
  return local < SLASH_ACTIVE ? local / SLASH_ACTIVE : -1;
}
/** Góc (rad) vệt quét tại tiến độ `ph`: cung hẹp ~1,1 rad, mỗi lần quét xuất phát từ một hướng khác (theo số chu kỳ đã qua). */
export function slashAngle(i: number, n: number, t: number, ph: number): number {
  const cycle = Math.floor((t + (i / Math.max(1, n)) * SLASH_PERIOD) / SLASH_PERIOD);
  const start = ((cycle * 2.399 + i * 1.7) % (Math.PI * 2)) - 0.55;
  return start + ph * 1.1;
}
