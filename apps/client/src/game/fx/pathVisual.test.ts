import { describe, expect, it } from 'vitest';
import { layersOf } from '../combat/hitjuice';
import { daoOf } from './realmAuraRules';
import { FX_PALETTE, paletteOf } from '../../render/vfx/palette';
import { DEFAULT_TINT, METHOD_TINT, tintOfMethod } from '../../render/vfx/phases';

// VS3-2 không đổi hành vi: hình (bảng màu, màu chiêu, hào quang, tiếng đòn) nay đọc từ hướng tu phải ra đúng giá trị viết cứng trước đây.
const OLD_PALETTE = {
  lac_kiem_quyet: { core: 0x0a3f5e, body: 0x2cc7dc, rim: 0xf2fdff, accent: 0xffe58a, shadow: 0x08202e },
  bat_dong_kim_than: { core: 0x3b3210, body: 0xd9b83a, rim: 0xfff1b8, accent: 0xffe27a, shadow: 0x1f1b0a },
  thanh_moc_dan_kinh: { core: 0x06301f, body: 0x23b374, rim: 0x9fe9bd, accent: 0xf2d86b, shadow: 0x071c13 },
};
const OLD_TINT = { lac_kiem_quyet: 0xcff3ff, bat_dong_kim_than: 0xffde96, thanh_moc_dan_kinh: 0x7fe3d0 };

/** `paletteOf` trước VS-3. */
function oldPaletteOf(method: string | undefined) {
  if (!method) return OLD_PALETTE.lac_kiem_quyet;
  const hit = (OLD_PALETTE as Record<string, unknown>)[method] ?? FX_PALETTE[method];
  if (hit) return hit;
  if (/ho_phap|hophap|kim_than/.test(method)) return OLD_PALETTE.bat_dong_kim_than;
  if (/dan_su|dansu|moc_dan/.test(method)) return OLD_PALETTE.thanh_moc_dan_kinh;
  if (/loi/.test(method)) return FX_PALETTE.loi;
  return OLD_PALETTE.lac_kiem_quyet;
}
/** `daoOf` trước VS-3. */
function oldDaoOf(mt: string | undefined) {
  if (!mt) return 'kiem';
  if (/kim_than|ho_phap|hophap/.test(mt)) return 'ho';
  if (/dan_kinh|dan_su|dansu|moc_dan/.test(mt)) return 'dan';
  return 'kiem';
}
/** Lớp tiếng theo công pháp trước VS-3. */
function oldMethodLayer(method: string | undefined, strong: boolean) {
  if (method === 'lac_kiem_quyet' && strong) return { sfx: 'crit', gain: 0.18, rate: 1.2 };
  if (method === 'bat_dong_kim_than') return { sfx: 'impact', gain: 0.2, rate: 1 };
  if (method === 'thanh_moc_dan_kinh') return { sfx: 'cast', gain: 0.12, rate: 1.3 };
  return null;
}

const KEYS = [
  undefined,
  '',
  'lac_kiem_quyet',
  'bat_dong_kim_than',
  'thanh_moc_dan_kinh',
  'ho_phap',
  'hophap',
  'dan_su',
  'dansu',
  'x_kim_than',
  'moc_dan_y',
  'loi',
  'mon_hoa',
  'suy_linh',
  'la_hoan_toan',
];

describe('hình theo hướng tu khớp bảng cứng trước VS-3', () => {
  it('bảng màu VFX: từng công pháp, bí danh cũ, khóa lạ, khóa không phải công pháp (lôi, quái, ngũ suy)', () => {
    for (const k of KEYS) expect(paletteOf(k), String(k)).toEqual(oldPaletteOf(k));
    for (const [m, pal] of Object.entries(OLD_PALETTE)) expect(FX_PALETTE[m], m).toEqual(pal);
  });
  it('màu linh quang của chiêu', () => {
    // Ba công pháp có từ trước VS-3 giữ đúng màu cũ; công pháp thêm sau (TN-2: Dẫn Hồn Kinh) lấy `tint` của hướng tu nó thuộc.
    expect(METHOD_TINT).toMatchObject(OLD_TINT);
    expect(METHOD_TINT.dan_hon_kinh).toBe(0xc9d4e0);
    expect(DEFAULT_TINT).toBe(0xcff3ff);
    for (const k of KEYS) expect(tintOfMethod(k), String(k)).toBe((k && (OLD_TINT as Record<string, number>)[k]) || 0xcff3ff);
  });
  it('đạo của hào quang cảnh giới', () => {
    for (const k of KEYS) expect(daoOf(k), String(k)).toBe(oldDaoOf(k));
  });
  it('lớp tiếng đòn theo công pháp (đòn mạnh và đòn thường)', () => {
    for (const k of KEYS)
      for (const strong of [true, false]) {
        const got = layersOf({ method: k, material: 'flesh' as never, crit: false, strong });
        const want = oldMethodLayer(k, strong);
        expect(got, `${k} ${strong}`).toEqual(want ? [want] : []);
      }
  });
});
