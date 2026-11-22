import type { FxTone, PathDef } from '@dtl/shared';
import { pathOf, PATHS } from '@dtl/content';

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

const hex = (s: string) => parseInt(s, 16);
/** Bảng màu của một hướng tu (VS-3, `paths.json` → `palette`). */
const pathPalette = (p: PathDef): FxPalette => ({
  core: hex(p.palette.core),
  body: hex(p.palette.body),
  rim: hex(p.palette.rim),
  accent: hex(p.palette.accent),
  shadow: hex(p.palette.shadow),
});

export const FX_PALETTE: Record<string, FxPalette> = {
  // Hướng tu (VS-3): mỗi công pháp một bảng lấy từ `paths.json` (Kiếm tu lam ngọc, Hộ pháp hổ phách, Đan sư ngọc lục + đỏ son).
  ...Object.fromEntries(PATHS.flatMap((p) => p.methods.map((m) => [m, pathPalette(p)] as const))),
  // Lôi: tím và trắng.
  loi: { core: 0x3a1670, body: 0x9a63ff, rim: 0xf5eeff, accent: 0xffe27a, shadow: 0x1a0c33 },
  // ---- Trận Cấm chế sư (TN-8): mỗi kiểu trận một sắc, lõi rất đậm + viền sáng để nổi trên nền đá trắng (sát đỏ tía, khốn lam, hộ ngọc lục, sinh tử tím + vàng).
  tran_sat: { core: 0x3a0820, body: 0xd02a6a, rim: 0xffd6e4, accent: 0xffd25a, shadow: 0x1a0410 },
  tran_khon: { core: 0x0a1650, body: 0x3a62f0, rim: 0xd4e4ff, accent: 0x9adcff, shadow: 0x050a28 },
  tran_ho: { core: 0x063a30, body: 0x26c79a, rim: 0xdcfff1, accent: 0xfff0a0, shadow: 0x031c18 },
  tran_sinhtu: { core: 0x24105e, body: 0x9a5af0, rim: 0xf2e8ff, accent: 0xffd25a, shadow: 0x100628 },
  // ---- Thiên Nhân Ngũ Suy (TN-4): mỗi ải một sắc, trầm hơn chiêu người chơi (suy kiệt). Thân/viền là thứ PHẢI BƯỚC VÀO (Linh Nhãn, Tôi Thể Lôi,
  // Thọ Đăng); `accent` là mối nguy của ải (lôi ẩn đỏ son, suy phong xám lam) hoặc nhịp phá vọng (vàng).
  suy_linh: { core: 0x0b2a3a, body: 0x3fb6c9, rim: 0xe6fbff, accent: 0xa7f0d8, shadow: 0x061820 },
  suy_the: { core: 0x4a2408, body: 0xe0a03a, rim: 0xfff1c9, accent: 0xff6a2a, shadow: 0x1f0f05 },
  suy_thuc: { core: 0x1c1440, body: 0x7d6be0, rim: 0xeee9ff, accent: 0xff4a3a, shadow: 0x0c0920 },
  suy_tho: { core: 0x3a2a08, body: 0xffc45a, rim: 0xfff3d0, accent: 0x8fa3b8, shadow: 0x181004 },
  suy_tam: { core: 0x2a0c2e, body: 0xb04bff, rim: 0xf3e2ff, accent: 0xf3c860, shadow: 0x12061a },
  // ---- Huyền Kiếp (TN-6): mỗi kiếp nhỏ một sắc; thân/viền sáng để nổi trên sân tối, `accent` là mối nguy hoặc tín hiệu "làm ngay".
  hk_tuyet: { core: 0x10304a, body: 0x8fd4ff, rim: 0xf2fbff, accent: 0x5aa8ff, shadow: 0x06121e },
  hk_phong: { core: 0x1a3a30, body: 0xd9c08a, rim: 0xf3fff4, accent: 0x7fe3c0, shadow: 0x0a1612 },
  hk_loi: { core: 0x2a1460, body: 0xa77bff, rim: 0xf7f0ff, accent: 0xff5a3a, shadow: 0x100826 },
  hk_tram_ly: { core: 0x1c2436, body: 0xbfd0e8, rim: 0xffffff, accent: 0xff4a3a, shadow: 0x0a0e16 },
  hk_huyet_anh: { core: 0x3a060c, body: 0xe0283c, rim: 0xffd9c8, accent: 0xff7a5a, shadow: 0x160306 },
  hk_van_tam: { core: 0x241848, body: 0x8f7be8, rim: 0xeee9ff, accent: 0xffd25a, shadow: 0x0e0920 },
  hk_kho_than: { core: 0x12303a, body: 0x6fd0e0, rim: 0xeafcff, accent: 0xffd25a, shadow: 0x06141a },
  hk_hon_tho: { core: 0x0c3324, body: 0x4fe0a0, rim: 0xe6fff2, accent: 0xa7f0d8, shadow: 0x06160f },
  hk_luan_hoi: { core: 0x2a2208, body: 0xe8c45a, rim: 0xfff6d8, accent: 0xff5a3a, shadow: 0x120e04 },
  // ---- Kiếp chương 6 (TN-3): hỏi đạo (lam đạo, dấu vàng), âm vực (tím âm, mối nguy hồng đỏ), đòn nhịp Dương Thực (đồng cam). ----
  kc_hoi_dao: { core: 0x1a1840, body: 0x6f8cf0, rim: 0xe9efff, accent: 0xffd25a, shadow: 0x090a1c },
  kc_am_lan: { core: 0x1a1230, body: 0xa070ff, rim: 0xe2d4ff, accent: 0xff4f86, shadow: 0x0a0716 },
  kc_duong_dap: { core: 0x3a1a06, body: 0xe8a43a, rim: 0xfff1c9, accent: 0xff5a2a, shadow: 0x160a02 },
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

// Hai mặt của Phủ Chủ (TN-3): Âm tím mực viền bạc sương, Dương vàng đồng viền trắng nắng (cùng palette `vd_am_*`/`vd_duong_*` của bản đồ).
FX_PALETTE.face_am = { core: 0x1a1230, body: 0x6a5aa8, rim: 0xd8d4f0, accent: 0x9fd6d0, shadow: 0x0a0818 };
FX_PALETTE.face_duong = { core: 0x4a3010, body: 0xd8a040, rim: 0xfff0c8, accent: 0xe86a3a, shadow: 0x201004 };

// Boss: cùng thân theo hệ, viền vàng kim ấm + accent đỏ thẫm + bóng gần đen cho tương phản cao (`mon_boss_<hệ>`).
for (const e of ['kim', 'moc', 'thuy', 'hoa', 'tho', 'neutral']) {
  const b = FX_PALETTE['mon_' + e]!;
  FX_PALETTE['mon_boss_' + e] = { core: b.core, body: b.body, rim: 0xffe9b0, accent: 0xff1f3d, shadow: 0x0a0204 };
}
// Cảnh lớn (VFX-V4 phần 2): đột phá theo cảnh giới và độ kiếp.
FX_PALETTE.dotpha_tc = { core: 0x5a3a08, body: 0xe8b13c, rim: 0xfff2c4, accent: 0x3fb8d8, shadow: 0x2a1c05 };
FX_PALETTE.dotpha_kd = { core: 0x5a1e08, body: 0xf08a3a, rim: 0xffe2b8, accent: 0xffc95a, shadow: 0x2a0f05 };
FX_PALETTE.dotpha_na = { core: 0x2a1458, body: 0x8f78e8, rim: 0xf0eaff, accent: 0x9fe0ff, shadow: 0x140a30 };
// Hóa Thần (E4-D): vàng sao nhạt, lõi nâu trầm, điểm nhấn lam băng; dùng cho đột phá và thế thân thần niệm.
FX_PALETTE.dotpha_hn = { core: 0x4a3a12, body: 0xe6cf86, rim: 0xfff8de, accent: 0xaee0ff, shadow: 0x221a08 };
FX_PALETTE.than_hanh = { core: 0x0a3f5e, body: 0x2cc7dc, rim: 0xdff8ff, accent: 0xf3c860, shadow: 0x08202e };

/** Mặc định: bảng của hướng tu đầu tiên (Kiếm tu). */
const FX_PALETTE_DEFAULT = FX_PALETTE[PATHS[0]!.methods[0]!]!;

/** Bảng màu theo id công pháp (không biết thì kiếm tu). Khớp chuỗi con để chịu được id công pháp khác tên nhánh. */
export function paletteOf(method: string | undefined): FxPalette {
  if (!method) return FX_PALETTE_DEFAULT;
  const hit = FX_PALETTE[method];
  if (hit) return hit;
  // VS-3: khóa không phải id công pháp (bí danh cũ như `ho_phap`, `dansu`) tra qua `match` của hướng tu.
  const path = pathOf(method);
  if (path) return FX_PALETTE[path.methods[0]!]!;
  if (/loi/.test(method)) return FX_PALETTE.loi!;
  return FX_PALETTE_DEFAULT;
}

/** Bảng màu FX quái theo ngũ hành (`MonsterDef.elem`); boss dùng bảng ma khí riêng ở tầng accent, thân vẫn theo hệ ở `monPaletteKey`. */
export function monPaletteKey(elem: string | undefined, boss = false): string {
  const k = elem && FX_PALETTE['mon_' + elem] ? elem : 'neutral';
  return (boss ? 'mon_boss_' : 'mon_') + k;
}

export function toneOf(p: FxPalette, tone: FxTone | undefined): number {
  return p[tone ?? 'body'];
}
