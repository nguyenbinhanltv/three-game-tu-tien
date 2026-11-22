/**
 * Nhịp ba pha của chiêu (K-6), hàm thuần để test: tụ lực → bùng nổ → tan.
 * Số đo lấy từ docs/AUDIT_AND_ROADMAP.md mục 7.2. Chỉ là lớp hình, không đổi luật.
 */
import { PATHS } from '@dtl/content';
import { FX_MAX_HDR } from '../materials/vfx';

/** Đỉnh HDR (tuyến tính, kênh lớn nhất) của từng pha. */
export const HDR_GATHER = 1.2;
export const HDR_BURST = FX_MAX_HDR - 0.1; // 2,3: trong khoảng 2,0–2,4
export const HDR_FADE = 0.8;

/** Bùng nổ kéo dài 0,10–0,16 s quanh `hitAt` (±0,05 s). */
export const BURST_DUR = 0.13;
export const BURST_LEAD = 0.05;
/** Tan: 0,35–0,7 s; lớp mực sống lâu hơn lớp sáng 0,3 s. */
export const FADE_MIN = 0.35;
export const FADE_MAX = 0.7;
export const INK_EXTRA = 0.3;

/** Ngân sách mỗi chiêu: hạt và lưới pool sống. */
interface FxCaps {
  particles: number;
  meshes: number;
}
const CAPS_MINE: FxCaps = { particles: 60, meshes: 4 };
const CAPS_OTHER: FxCaps = { particles: 30, meshes: 2 };
const CAPS_ULT_MINE: FxCaps = { particles: 400, meshes: 150 };
const CAPS_ULT_OTHER: FxCaps = { particles: 150, meshes: 150 };

export function capsFor(mine: boolean, ult: boolean): FxCaps {
  return ult ? (mine ? CAPS_ULT_MINE : CAPS_ULT_OTHER) : mine ? CAPS_MINE : CAPS_OTHER;
}

/** Màu theo công pháp (art bible mục 4, nhóm linh quang). Tím chỉ cho thiên lôi/ma khí, không có ở đây. */
// VS-3: lấy từ hướng tu (`paths.json` → `tint`): Kiếm tu spirit_sword, Hộ pháp spirit_gold, Đan sư spirit_jade.
export const METHOD_TINT: Record<string, number> = Object.fromEntries(
  PATHS.flatMap((p) => p.methods.map((m) => [m, parseInt(p.tint, 16)] as const)),
);
export const DEFAULT_TINT = METHOD_TINT[PATHS[0]!.methods[0]!]!;

export function tintOfMethod(method: string | undefined): number {
  return (method && METHOD_TINT[method]) || DEFAULT_TINT;
}

/** Hệ số nhân màu để kênh sáng nhất (tuyến tính) đạt `peak`; trả 1 nếu màu đen. */
export function hdrGain(hex: number, peak: number): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  const m = Math.max(lin((hex >> 16) & 255), lin((hex >> 8) & 255), lin(hex & 255));
  return m > 1e-4 ? peak / m : 1;
}

type Phase = 'gather' | 'burst' | 'fade' | 'done';

/** Pha ở thời điểm `t` (giây từ lúc bấm) với chiêu có mốc trúng `hitAt` và thời lượng tan `fade`. */
export function phaseAt(t: number, hitAt: number, fade = FADE_MAX): Phase {
  if (t < hitAt - BURST_LEAD) return 'gather';
  if (t < hitAt - BURST_LEAD + BURST_DUR) return 'burst';
  return t < hitAt - BURST_LEAD + BURST_DUR + fade ? 'fade' : 'done';
}

/** Ngưỡng ăn mòn theo nhiễu (0 → 1) trong lúc tan; lớp mực trễ `INK_EXTRA`s nên tan sau. */
export function erodeAt(sinceBurst: number, fade: number, ink = false): number {
  const T = ink ? fade + INK_EXTRA : fade;
  return Math.min(1, Math.max(0, sinceBurst / T));
}

/** Thời lượng tan theo cỡ chiêu (power 0..~6): chiêu nặng tan lâu hơn, luôn trong [FADE_MIN, FADE_MAX]. */
export function fadeFor(power: number): number {
  return Math.min(FADE_MAX, Math.max(FADE_MIN, FADE_MIN + (power / 6) * (FADE_MAX - FADE_MIN)));
}

/** Diện tích màn hình (tỉ lệ 0..1) một vòng/cầu bán kính `r` m chiếm ở khoảng cách `d` với FOV dọc `fovDeg`, khung `aspect`. */
export function screenCover(r: number, d: number, fovDeg: number, aspect: number): number {
  if (d <= r) return 1;
  const half = Math.tan((fovDeg * Math.PI) / 360) * d; // nửa chiều cao nhìn thấy tại d
  return Math.min(1, (Math.PI * r * r) / (4 * half * half * aspect));
}

/** Bán kính lớn nhất (m) để một hiệu ứng ở khoảng cách `d` che không quá `maxFrac` màn hình. */
export function maxRadiusFor(d: number, fovDeg: number, aspect: number, maxFrac = 0.25): number {
  const half = Math.tan((fovDeg * Math.PI) / 360) * d;
  return Math.sqrt((maxFrac * 4 * half * half * aspect) / Math.PI);
}

/** Màu vạch báo của quái: son đỏ (`wood_cinnabar`) cho quái thường, ma khí (`spirit_demonic`) cho boss; thiên lôi giữ tím sét. */
const HAZARD_CINNABAR = 0x9d392e;
const HAZARD_DEMONIC = 0x4a2b5e;
const HAZARD_LIGHTNING = 0xb48cff;
/** Nháy sáng ở khoảng này cuối thời gian báo (giây). */
const HAZARD_FLASH = 0.08;

/** Màu và hệ số nhân HDR của vạch báo (màu gốc quá tối nên nâng kênh sáng nhất lên 1,0 như mọi linh quang). */
export function hazardStyle(kind: string, boss: boolean): { color: number; gain: number } {
  const color = kind === 'lightning' ? HAZARD_LIGHTNING : boss ? HAZARD_DEMONIC : HAZARD_CINNABAR;
  return { color, gain: hdrGain(color, 1) };
}

/**
 * Thiên Nhãn P4: mức nguy hiểm của vạch báo (0 nhẹ, 1 vừa, 2 chí mạng) suy từ dữ liệu đã có (server không gửi sát thương).
 * Boss, thiên kiếp lớn (`big`), vòng rộng ≥ 6 m hoặc đòn lao/nhảy là mức 2; quái thường đánh vòng rộng ≥ 3 m hoặc đòn
 * lao/nhảy/chém là mức 1; còn lại mức 0. Vũng, vệt, triệu hồi và vòng kéo (`pull`, sát thương 0) là mức 0.
 */
export function hazardDanger(o: { boss: boolean; mv?: string; big?: boolean; r: number }): 0 | 1 | 2 {
  if (o.mv === 'summon' || o.mv === 'pool' || o.mv === 'trail' || o.mv === 'pull') return 0;
  if (o.boss || o.big || o.r >= 6 || o.mv === 'charge' || o.mv === 'leap') return 2;
  if (o.r >= 3 || o.mv === 'line' || o.mv === 'burrow') return 1;
  return 0;
}

/** Màu vạch theo mức nguy hiểm trên nền đất sáng/tối đều đọc được: hổ phách → cam son → đỏ tươi. Thiên lôi giữ tím sét. */
export const HAZARD_DANGER_COLORS = [0xe0a63a, 0xdc5a2c, 0xff2a4a] as const;
/** Hệ số nhân HDR theo mức (mức cao sáng hơn, vẫn dưới trần `FX_MAX_HDR`). */
export const HAZARD_DANGER_GAIN = [1, 1.1, 1.25] as const;

/** Iso: vạch báo phủ nhiều mét vuông nên giảm độ đục chung (phần lấp nhạt đi), bù HDR để viền + vạch tiến độ vẫn rõ. */
export const ISO_HAZARD_OPACITY = 0.62;

/** Như `hazardStyle` nhưng theo mức nguy hiểm (chỉ dùng ở camera iso). */
export function hazardStyleDanger(kind: string, danger: 0 | 1 | 2): { color: number; gain: number } {
  if (kind === 'lightning') return hazardStyle(kind, false);
  const color = HAZARD_DANGER_COLORS[danger];
  return { color, gain: hdrGain(color, 1) * HAZARD_DANGER_GAIN[danger] * 1.15 };
}

/** 1 trong `HAZARD_FLASH` giây cuối của thời gian báo `delay`, còn lại 0 (tiến độ k 0..1). */
export function hazardFlash(k: number, delay: number): number {
  return k * delay >= delay - HAZARD_FLASH ? 1 : 0;
}

/**
 * Vùng báo trước hình tròn mới `z` chồng lên các vùng đang sống `all` (tâm cách < bán kính lớn hơn của hai vùng): trả hệ số mờ
 * `dim` (1/√(1+số vùng chồng), tối thiểu 0,35) cho sigil + chớp, và `fx` (có phát hiệu ứng nổ không: từ vùng chồng thứ 3 trở đi
 * chỉ còn sigil, bỏ tia sét/vòng nổ để không cộng sáng thành mảng trắng, art bible mục 5, 8). Ai trúng do server phán, không đổi.
 */
export function hazardStack(
  all: readonly { x: number; z: number; r: number }[],
  z: { x: number; z: number; r: number },
): { dim: number; fx: boolean } {
  let n = 0;
  for (const h of all) if (Math.hypot(h.x - z.x, h.z - z.z) < Math.max(h.r, z.r)) n++;
  return { dim: n === 0 ? 1 : Math.max(0.35, 1 / Math.sqrt(1 + n)), fx: n < 2 };
}
