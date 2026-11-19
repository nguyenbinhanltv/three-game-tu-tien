import palette from '../../../../assets/palette.json';
import { FLAGS } from '../base/flags';

/**
 * Thông số ánh sáng, sương và chỉnh màu: đọc thẳng từ khối `grading` của assets/palette.json
 * (art bible v3, docs/art-bible.md mục 5). Chỉnh số ở JSON, không chép sang đây.
 */
export interface GradingPreset {
  sunColor: number;
  sunIntensity: number;
  sunElevationDeg: number;
  skyColor: number;
  skyIntensity: number;
  fogColor: number;
  fogDensity: number;
  /** Bề dày lớp sương dày (m, tính từ đáy thung lũng/mặt hồ) và hệ số nhân mật độ ở đáy lớp. */
  heightFogTop: number;
  heightFogBoost: number;
  shadowTint: number;
  highlightTint: number;
  splitBalance: number;
  blackLift: number;
  contrast: number;
  saturation: number;
  exposure: number;
  /** Mức nhuộm sắc ở vùng tối / vùng sáng (0..1) và độ ấm của sương hướng mặt trời. */
  shadowAmount?: number;
  highlightAmount?: number;
  fogScatter?: number;
  /**
   * Lớp sương xa kiểu thủy mặc (phối cảnh không khí): mật độ hàm mũ bậc một tính từ `fogHazeStart` mét trở ra.
   * Tầm gần (chiến đấu, chọn mục tiêu 40–60 m) không đổi; núi và rừng ở 200–600 m nhạt dần thành từng lớp.
   */
  fogHaze?: number;
  fogHazeStart?: number;
  /** Cường độ viền sáng (rim) của nhân vật: sắc nắng, yếu (art bible 5.3). 0 = tắt. */
  rim?: number;
}

export type GradingName =
  | 'dawn'
  | 'day'
  | 'night'
  | 'ochre_dawn'
  | 'ochre'
  | 'ochre_night'
  | 'cloud_dawn'
  | 'cloud'
  | 'cloud_night'
  | 'tk_dawn'
  | 'tk'
  | 'tk_night'
  | 'lk_dawn'
  | 'lk_day'
  | 'lk_dusk'
  | 'lk_night'
  | 'dm_dawn'
  | 'dm_day'
  | 'dm_dusk'
  | 'dm_night'
  | 'vh_dawn'
  | 'vh_day'
  | 'vh_dusk'
  | 'vh_night'
  | 'ash_dawn'
  | 'rift'
  | 'rift_pit';
/** Thời điểm trong ngày (`?mood=`); level có bộ mood riêng (Đoạn Mạch: `ochre*`) đổi theo. */
export type TimeOfDay = 'dawn' | 'day' | 'dusk' | 'night';

type RawPreset = Record<keyof GradingPreset, string | number>;
const raw = palette.grading as unknown as {
  default: GradingName;
  presets: Record<GradingName, RawPreset>;
  bloom: { strength: number; radius: number; maxHdr: number };
  vignette: { amount: number; inner: number; outer: number };
  grain: { amount: number; dither: boolean };
  depthDesaturate: { start: number; end: number; amount: number };
};

function parse(p: RawPreset): GradingPreset {
  const out = {} as Record<string, number>;
  for (const [k, v] of Object.entries(p)) {
    if (k === 'label') continue;
    out[k] = typeof v === 'string' && v.startsWith('#') ? parseInt(v.slice(1), 16) : Number(v);
  }
  return out as unknown as GradingPreset;
}

export const GRADING: Record<GradingName, GradingPreset> = {
  dawn: parse(raw.presets.dawn),
  day: parse(raw.presets.day),
  night: parse(raw.presets.night),
  ochre_dawn: parse(raw.presets.ochre_dawn),
  ochre: parse(raw.presets.ochre),
  ochre_night: parse(raw.presets.ochre_night),
  cloud_dawn: parse(raw.presets.cloud_dawn),
  cloud: parse(raw.presets.cloud),
  cloud_night: parse(raw.presets.cloud_night),
  tk_dawn: parse(raw.presets.tk_dawn),
  tk: parse(raw.presets.tk),
  tk_night: parse(raw.presets.tk_night),
  lk_dawn: parse(raw.presets.lk_dawn),
  lk_day: parse(raw.presets.lk_day),
  lk_dusk: parse(raw.presets.lk_dusk),
  lk_night: parse(raw.presets.lk_night),
  dm_dawn: parse(raw.presets.dm_dawn),
  dm_day: parse(raw.presets.dm_day),
  dm_dusk: parse(raw.presets.dm_dusk),
  dm_night: parse(raw.presets.dm_night),
  vh_dawn: parse(raw.presets.vh_dawn),
  vh_day: parse(raw.presets.vh_day),
  vh_dusk: parse(raw.presets.vh_dusk),
  vh_night: parse(raw.presets.vh_night),
  ash_dawn: parse(raw.presets.ash_dawn),
  rift: parse(raw.presets.rift),
  rift_pit: parse(raw.presets.rift_pit),
};

/** Tên mood của level theo thời điểm trong ngày: `ochre` + night → `ochre_night`. */
export function moodVariant(base: GradingName, tod: TimeOfDay): GradingName {
  // Lạc Kiếm (MAP-1): bộ bốn thời điểm riêng, có hoàng hôn.
  if (base.startsWith('lk')) return `lk_${tod}` as GradingName;
  // Đoạn Mạch (MAP-2): bộ bốn thời điểm riêng (đỏ son + vàng thu).
  if (base.startsWith('dm_')) return `dm_${tod}` as GradingName;
  // Vân Hải (MAP-3): bộ bốn thời điểm riêng xanh lam + bạc, có hoàng hôn.
  if (base.startsWith('vh')) return `vh_${tod}` as GradingName;
  // Level khác chưa có hoàng hôn riêng: lấy sắc bình minh (ấm, nắng thấp).
  const t: 'dawn' | 'day' | 'night' = tod === 'dusk' ? 'dawn' : tod;
  if (base.startsWith('ochre')) return t === 'dawn' ? 'ochre_dawn' : t === 'night' ? 'ochre_night' : 'ochre';
  if (base.startsWith('cloud')) return t === 'dawn' ? 'cloud_dawn' : t === 'night' ? 'cloud_night' : 'cloud';
  if (base === 'ash_dawn' || base === 'rift' || base === 'rift_pit') return base; // Bắc Hoang (DV-1): mood cố định theo nửa bản đồ, không đổi theo giờ
  if (base.startsWith('tk')) return t === 'dawn' ? 'tk_dawn' : t === 'night' ? 'tk_night' : 'tk';
  return t;
}

/** `?mood=dawn|day|night` đổi thời điểm trong ngày khi xem/chụp ảnh (không lưu); mặc định theo palette.json. */
function moodFromUrl(): TimeOfDay | null {
  return FLAGS.mood;
}
export const URL_MOOD: TimeOfDay | null = moodFromUrl();
export const GRADING_DEFAULT: GradingName = URL_MOOD ? moodVariant('day', URL_MOOD) : raw.default;
export const BLOOM = raw.bloom;
export const VIGNETTE = raw.vignette;
export const GRAIN = raw.grain;
export const DEPTH_DESATURATE = raw.depthDesaturate;

export const mixHex = (a: number, b: number, t: number): number => {
  const ch = (sh: number) => Math.round(((a >> sh) & 255) * (1 - t) + ((b >> sh) & 255) * t);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
};

/** Trộn hai preset theo `t` 0..1 (số: nội suy tuyến tính; màu: nội suy từng kênh). Mood Bắc Hoang đổi dần quanh Khích Giai (DV-3I). */
export function mixPreset(a: GradingPreset, b: GradingPreset, t: number): GradingPreset {
  const out: Record<string, number> = {};
  const A = a as unknown as Record<string, number>;
  const B = b as unknown as Record<string, number>;
  for (const k of Object.keys(A)) {
    const va = A[k]!;
    const vb = B[k] ?? va;
    // Giá trị >= 0x100 và là màu (khóa kết thúc bằng Color/Tint/Lift hoặc sunColor/skyColor/fogColor) nội suy theo kênh.
    const isColor = /Color$|Tint$|Lift$/.test(k);
    out[k] = isColor ? mixHex(va, vb, t) : va + (vb - va) * t;
  }
  return out as unknown as GradingPreset;
}
