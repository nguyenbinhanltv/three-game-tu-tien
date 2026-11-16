import palette from '../../../../assets/palette.json';

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

export type GradingName = 'dawn' | 'day' | 'night' | 'ochre_dawn' | 'ochre' | 'ochre_night' | 'cloud_dawn' | 'cloud' | 'cloud_night';
/** Thời điểm trong ngày (`?mood=`); level có bộ mood riêng (Đoạn Mạch: `ochre*`) đổi theo. */
export type TimeOfDay = 'dawn' | 'day' | 'night';

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
};

/** Tên mood của level theo thời điểm trong ngày: `ochre` + night → `ochre_night`. */
export function moodVariant(base: GradingName, tod: TimeOfDay): GradingName {
  if (base.startsWith('ochre')) return tod === 'dawn' ? 'ochre_dawn' : tod === 'night' ? 'ochre_night' : 'ochre';
  if (base.startsWith('cloud')) return tod === 'dawn' ? 'cloud_dawn' : tod === 'night' ? 'cloud_night' : 'cloud';
  return tod;
}

/** `?mood=dawn|day|night` đổi thời điểm trong ngày khi xem/chụp ảnh (không lưu); mặc định theo palette.json. */
function moodFromUrl(): TimeOfDay | null {
  if (typeof location === 'undefined') return null;
  const m = new URLSearchParams(location.search).get('mood');
  return m === 'dawn' || m === 'day' || m === 'night' ? m : null;
}
export const URL_MOOD: TimeOfDay | null = moodFromUrl();
export const GRADING_DEFAULT: GradingName = URL_MOOD ?? raw.default;
export const BLOOM = raw.bloom;
export const VIGNETTE = raw.vignette;
export const GRAIN = raw.grain;
export const DEPTH_DESATURATE = raw.depthDesaturate;
