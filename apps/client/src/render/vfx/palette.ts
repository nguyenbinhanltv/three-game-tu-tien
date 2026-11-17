import type { FxTone } from '@dtl/shared';

/**
 * Bảng màu hiệu ứng theo nhánh công pháp (VFX-V0): ba tầng màu (lõi đậm, thân chủ đạo, viền sáng) + điểm nhấn + bóng sẫm.
 * Mỗi nhánh một màu chủ đạo cố định để nhìn là biết công pháp. Lõi/bóng đủ sẫm để đọc được trên nền bình minh sáng;
 * viền chỉ sáng tới mức bloom bắt (không cháy trắng cả cảnh). Màu sRGB hex.
 */
export interface FxPalette {
  core: number;
  body: number;
  rim: number;
  accent: number;
  shadow: number;
}

export const FX_PALETTE: Record<string, FxPalette> = {
  // Kiếm tu (Kim/Thủy): lam ngọc và trắng, điểm vàng.
  lac_kiem_quyet: { core: 0x0a3f5e, body: 0x2cc7dc, rim: 0xf2fdff, accent: 0xf3c860, shadow: 0x08202e },
  // Hộ pháp (Thổ): hổ phách và vàng kim, bóng nâu.
  bat_dong_kim_than: { core: 0x5a2d0b, body: 0xe39a2c, rim: 0xfff0c2, accent: 0xffd25a, shadow: 0x2a1708 },
  // Đan sư (Mộc/Hỏa): ngọc lục và đỏ son.
  thanh_moc_dan_kinh: { core: 0x0d4a30, body: 0x37c98a, rim: 0xeaffef, accent: 0xe4452f, shadow: 0x0a261a },
  // Lôi: tím và trắng.
  loi: { core: 0x3a1670, body: 0x9a63ff, rim: 0xf5eeff, accent: 0xffe27a, shadow: 0x1a0c33 },
};

export const FX_PALETTE_DEFAULT = FX_PALETTE.lac_kiem_quyet;

/** Bảng màu theo id công pháp (không biết thì kiếm tu). Khớp chuỗi con để chịu được id công pháp khác tên nhánh. */
export function paletteOf(method: string | undefined): FxPalette {
  if (!method) return FX_PALETTE_DEFAULT;
  if (FX_PALETTE[method]) return FX_PALETTE[method];
  if (/ho_phap|hophap|kim_than/.test(method)) return FX_PALETTE.bat_dong_kim_than;
  if (/dan_su|dansu|moc_dan/.test(method)) return FX_PALETTE.thanh_moc_dan_kinh;
  if (/loi/.test(method)) return FX_PALETTE.loi;
  return FX_PALETTE_DEFAULT;
}

export function toneOf(p: FxPalette, tone: FxTone | undefined): number {
  return p[tone ?? 'body'];
}
