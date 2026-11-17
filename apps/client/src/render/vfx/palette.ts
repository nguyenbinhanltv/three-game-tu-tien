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
  // Đan sư (Mộc/Hỏa): ngọc lục đậm và đỏ son; viền ngả lục nhạt (không trắng) để không nhạt trên nền sáng.
  thanh_moc_dan_kinh: { core: 0x06301f, body: 0x23b374, rim: 0x9fe9bd, accent: 0xe4452f, shadow: 0x071c13 },
  // Lôi: tím và trắng.
  loi: { core: 0x3a1670, body: 0x9a63ff, rim: 0xf5eeff, accent: 0xffe27a, shadow: 0x1a0c33 },
  // ---- Quái (V5): bảng "nguy hiểm", tách khỏi bảng "của ta". Lõi rất sẫm, thân bão hòa theo ngũ hành, viền sáng ấm, điểm nhấn đỏ son/đỏ thẫm
  // để vạch báo và đòn của quái luôn đọc ra là mối nguy (không lẫn với lam ngọc/lục/hổ phách của người chơi).
  mon_kim: { core: 0x141b2b, body: 0x7f98bd, rim: 0xf4f9ff, accent: 0xff4a3a, shadow: 0x080b12 },
  mon_moc: { core: 0x10260f, body: 0x6fbf3a, rim: 0xdff7a8, accent: 0xff4a3a, shadow: 0x08130a },
  mon_thuy: { core: 0x0a2a55, body: 0x3a8cf0, rim: 0xd6f1ff, accent: 0xff4a3a, shadow: 0x06142b },
  mon_hoa: { core: 0x4a0d0a, body: 0xff6a1f, rim: 0xffe3a8, accent: 0xff2b2b, shadow: 0x1f0605 },
  mon_tho: { core: 0x3a2308, body: 0xc98a2e, rim: 0xffe7b0, accent: 0xff4a3a, shadow: 0x1a1004 },
  mon_neutral: { core: 0x2a1030, body: 0xa04ad8, rim: 0xf3e2ff, accent: 0xff4a3a, shadow: 0x12061a },
  // Boss: đỏ thẫm ma khí, viền vàng kim cho tương phản cao.
  mon_boss: { core: 0x2a0410, body: 0xd01f3c, rim: 0xffd7a0, accent: 0xffc23a, shadow: 0x0d0206 },
};

// Cảnh lớn (VFX-V4 phần 2): đột phá theo cảnh giới và độ kiếp.
FX_PALETTE.dotpha_tc = { core: 0x5a3a08, body: 0xe8b13c, rim: 0xfff2c4, accent: 0x3fb8d8, shadow: 0x2a1c05 };
FX_PALETTE.dotpha_kd = { core: 0x5a1e08, body: 0xf08a3a, rim: 0xffe2b8, accent: 0xffc95a, shadow: 0x2a0f05 };
FX_PALETTE.dotpha_na = { core: 0x2a1458, body: 0x8f78e8, rim: 0xf0eaff, accent: 0x9fe0ff, shadow: 0x140a30 };
FX_PALETTE.than_hanh = { core: 0x0a3f5e, body: 0x2cc7dc, rim: 0xdff8ff, accent: 0xf3c860, shadow: 0x08202e };

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

/** Bảng màu FX quái theo ngũ hành (`MonsterDef.elem`); boss dùng bảng ma khí riêng ở tầng accent, thân vẫn theo hệ ở `monPaletteKey`. */
export function monPaletteKey(elem: string | undefined): string {
  return elem && FX_PALETTE['mon_' + elem] ? 'mon_' + elem : 'mon_neutral';
}

export function toneOf(p: FxPalette, tone: FxTone | undefined): number {
  return p[tone ?? 'body'];
}
