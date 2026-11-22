/**
 * Thông số "độ bóng lụa" của voan trên nhân vật v3 (nợ cũ "voan Đan sư"). Chỉ áp lên điểm ảnh thuộc mặt nạ voan (COLOR_0.R, xem `applyVeilAlpha`),
 * thân áo đặc và da giữ nguyên. Không import three: test và công cụ dùng chung.
 *
 * Ba thành phần cộng vào phát sáng (không thêm lượt vẽ hay texture):
 * - `sheen`: ánh viền (fresnel) màu nhạt pha màu vải (đã nhuộm), mạnh ở góc xiên như lụa mỏng.
 * - `aniso`: vệt bóng dị hướng Kajiya-Kay, sợi chạy dọc theo chiều rủ (trục +Y) nên vệt nằm ngang qua nếp vải, theo hướng nắng.
 * - `back`: ánh xuyên khi ngược sáng (nắng sau voan).
 * `clear` làm voan hơi trong khi nhìn thẳng (độ phủ giảm), dày dần về mép.
 */
export interface V3Silk {
  /** Cường độ ánh viền. */
  sheen: number;
  /** Số mũ fresnel của ánh viền (lớn = viền mảnh). */
  sheenPow: number;
  /** Màu ánh viền (hex sRGB), trộn với màu vải theo `tint`. */
  sheenColor: string;
  /** Mức pha màu vải vào ánh viền, 0..1. */
  tint: number;
  /** Cường độ vệt bóng dị hướng (chỉ preset Cao trở lên). */
  aniso: number;
  /** Số mũ vệt dị hướng (lớn = vệt mảnh). */
  anisoPow: number;
  /** Cường độ ánh xuyên khi ngược sáng (chỉ preset Cao trở lên). */
  back: number;
  /** Giảm độ phủ khi nhìn thẳng, 0..1. */
  clear: number;
  /** Độ nhám đè lên voan (lụa bóng hơn vải thô nhưng không như nhựa). */
  roughness: number;
}

/** Lụa mỏng: viền nhạt hơi lạnh (sương sớm), bóng vừa. */
export const SILK_DEFAULT: V3Silk = {
  sheen: 0.4,
  sheenPow: 2.6,
  sheenColor: '#f3f0e6',
  tint: 0.45,
  aniso: 0.4,
  anisoPow: 38,
  back: 0.35,
  clear: 0.14,
  roughness: 0.42,
};

/**
 * Bộ có voan lụa (khóa = id asset v3). Đan sư (Lưu Ly, Phục Mạch, Thần Tàng) nam + nữ; thêm bộ khác = thêm dòng.
 * Phục Mạch/Thần Tàng vải tông đất nên ánh viền ấm hơn một chút.
 */
export const V3_SILK: Readonly<Record<string, V3Silk>> = {
  chr_v3_luu_ly_nam: SILK_DEFAULT,
  chr_v3_luu_ly_nu: SILK_DEFAULT,
  chr_v3_phuc_mach_nam: { ...SILK_DEFAULT, sheenColor: '#f6ecd6' },
  chr_v3_phuc_mach_nu: { ...SILK_DEFAULT, sheenColor: '#f6ecd6' },
  chr_v3_than_tang_nam: { ...SILK_DEFAULT, sheenColor: '#f6ecd6' },
  chr_v3_than_tang_nu: { ...SILK_DEFAULT, sheenColor: '#f6ecd6' },
};

export const v3SilkOf = (assetId: string): V3Silk | undefined => V3_SILK[assetId];

/** Mức chi phí theo preset: 0 = tắt (Thấp), 1 = chỉ ánh viền + độ trong (Vừa), 2 = đủ (Cao trở lên). */
export function silkTier(quality: string): 0 | 1 | 2 {
  return quality === 'low' ? 0 : quality === 'medium' ? 1 : 2;
}
