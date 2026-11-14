/**
 * Thông số ánh sáng, sương và chỉnh màu theo art bible v3 (docs/art-bible.md mục 5, khối `grading`
 * trong assets/palette.json). Chép nguyên số từ đó; khi chỉnh trong game thì cập nhật cả hai nơi
 * trong cùng commit. Màu viết bằng sRGB hex.
 */
export interface GradingPreset {
  sunColor: number;
  sunIntensity: number;
  sunElevationDeg: number;
  skyColor: number;
  skyIntensity: number;
  fogColor: number;
  fogDensity: number;
  /** Đỉnh lớp sương dày (m, tính từ mặt nước) và hệ số nhân mật độ ở đáy lớp. */
  heightFogTop: number;
  heightFogBoost: number;
  shadowTint: number;
  highlightTint: number;
  splitBalance: number;
  blackLift: number;
  contrast: number;
  saturation: number;
  exposure: number;
}

export const GRADING: Record<'dawn' | 'day' | 'night', GradingPreset> = {
  dawn: {
    sunColor: 0xf6c27e,
    sunIntensity: 2.0,
    sunElevationDeg: 14,
    skyColor: 0xb9cfc8,
    skyIntensity: 0.9,
    fogColor: 0xe4e3d6,
    fogDensity: 0.0016,
    heightFogTop: 60,
    heightFogBoost: 2.5,
    shadowTint: 0x2f5b5c,
    highlightTint: 0xffd49a,
    splitBalance: 0.15,
    blackLift: 0x14292b,
    contrast: 1.05,
    saturation: 1.0,
    exposure: 1.0,
  },
  day: {
    sunColor: 0xffe6b8,
    sunIntensity: 2.6,
    sunElevationDeg: 48,
    skyColor: 0xa9cfcb,
    skyIntensity: 1.0,
    fogColor: 0xd6e4de,
    fogDensity: 0.0011,
    heightFogTop: 40,
    heightFogBoost: 1.8,
    shadowTint: 0x2f5b5c,
    highlightTint: 0xffe0a8,
    splitBalance: 0.0,
    blackLift: 0x13282b,
    contrast: 1.08,
    saturation: 1.05,
    exposure: 1.0,
  },
  night: {
    sunColor: 0x9db4cf,
    sunIntensity: 0.45,
    sunElevationDeg: 35,
    skyColor: 0x1a2938,
    skyIntensity: 0.5,
    fogColor: 0x22323f,
    fogDensity: 0.0013,
    heightFogTop: 40,
    heightFogBoost: 2.0,
    shadowTint: 0x0f1f2a,
    highlightTint: 0xffb869,
    splitBalance: -0.2,
    blackLift: 0x0b1720,
    contrast: 1.1,
    saturation: 0.82,
    exposure: 0.9,
  },
};

export const GRADING_DEFAULT: keyof typeof GRADING = 'day';

export const BLOOM = { strength: 0.35, radius: 0.5, maxHdr: 2.5 };
export const VIGNETTE = { amount: 0.18, inner: 0.4, outer: 0.9 };
export const GRAIN = { amount: 0.025, dither: true };
export const DEPTH_DESATURATE = { start: 80, end: 700, amount: 0.4 };
