/**
 * Hoa Trúc (bước 1, tên tệp khác HoaTruc.tsx vì Windows không phân biệt hoa/thường): hàm thuần chọn tranh vẽ cho bảng Nhân vật. Không đụng DOM, có test.
 * Quy tắc: tranh theo bộ của món ĐANG MẶC (`lookSet`); không có bộ → đồ đệ tử; nam/nữ theo giới tính; nền theo cảnh giới;
 * kiếm theo mẫu kiếm đang mặc. Tên tệp khớp `apps/client/public/hoa-truc/<tên>.webp` (xem tools/hoa-truc/build.py).
 */
import { lookSet, setStatuses, type SetDef } from '@dtl/shared';

/** Bộ có tranh riêng (bước 1). Bộ khác chưa có tranh thì rơi về đồ đệ tử. */
export type OutfitArt =
  | 'lac_kiem'
  | 'de_tu'
  | 'liet_mach'
  | 'dia_giap'
  | 'phuc_mach'
  | 'kinh_quang'
  | 'van_kinh'
  | 'luu_ly'
  | 'tinh_khuyet'
  | 'co_thanh'
  | 'than_tang';
export type RealmArt = 'nk' | 'tc' | 'kd' | 'na' | 'ht' | 'ab';
/** Đạo (theo vai trò công pháp): kiếm tu / hộ pháp / đan sư. */
export type DaoArt = 'kiem' | 'ho_phap' | 'dan_su';
export type SwordArt = 'thanh_phong' | 'han_quang';

/** Bộ có tranh riêng: id bộ → tên tranh (apps/client/public/hoa-truc/<tên>_<nam|nu>.webp). Bộ khác rơi về đồ đệ tử. */
const SET_ART: Record<string, OutfitArt> = {
  set_lac_kiem: 'lac_kiem',
  set_liet_mach: 'liet_mach',
  set_dia_giap: 'dia_giap',
  set_phuc_mach: 'phuc_mach',
  set_kinh_quang: 'kinh_quang',
  set_van_kinh: 'van_kinh',
  set_luu_ly: 'luu_ly',
  set_tinh_khuyet: 'tinh_khuyet',
  set_co_thanh: 'co_thanh',
  set_than_tang: 'than_tang',
};

export interface PortraitPick {
  /** Tên tranh nhân vật: `<bộ>_<nam|nu>`. */
  char: string;
  outfit: OutfitArt;
  /** Tên tranh nền cảnh giới. */
  realm: string;
  sword: string | null;
  /** Đang mặc đủ cả bộ (hiệu ứng "bộ trọn vẹn"). */
  full: boolean;
  /** Id bộ đang quyết định tranh (cho nhãn tên bộ), null = đồ đệ tử mặc định. */
  setId: string | null;
  /** Tầng cảnh giới cao (Thiên Giai): 0 dưới Kết Đan, 1 Kết Đan, 2 Nguyên Anh, 3 Hóa Thần. */
  tier: 0 | 1 | 2 | 3 | 4;
  /** Đạo của công pháp đang tu: quyết định hào quang Nguyên Anh và pháp tướng Hóa Thần. */
  dao: DaoArt | null;
}

/** Nhóm cảnh giới → nền: Ngưng Khí ≤ 15 `nk`, Trúc Cơ 16–19 `tc`, Kết Đan 20–23 `kd`, Nguyên Anh 24–27 `na`, Hóa Thần ≥ 28 `ht`. */
export function realmArt(level: number): RealmArt {
  return level <= 15 ? 'nk' : level < 20 ? 'tc' : level < 24 ? 'kd' : level < 28 ? 'na' : level < 32 ? 'ht' : 'ab';
}

/** Tầng chồng hiệu ứng theo cảnh giới: 1 Kết Đan, 2 Nguyên Anh, 3 Hóa Thần, 4 Dị Biến (đỉnh, cấp tối đa). */
export function realmTier(level: number): 0 | 1 | 2 | 3 | 4 {
  return level >= 32 ? 4 : level >= 28 ? 3 : level >= 24 ? 2 : level >= 20 ? 1 : 0;
}

const DAO_OF_METHOD: Record<string, DaoArt> = { lac_kiem_quyet: 'kiem', bat_dong_kim_than: 'ho_phap', thanh_moc_dan_kinh: 'dan_su' };

/** Mẫu kiếm 3D → lớp kiếm vẽ: nhóm kiếm lạnh (hàn) dùng kiếm băng, còn lại kiếm thanh phong. */
export function swordArt(model: string | undefined): SwordArt {
  return model && /han_/.test(model) ? 'han_quang' : 'thanh_phong';
}

export function pickPortrait(o: {
  sets: readonly SetDef[];
  worn: readonly string[];
  gender: string;
  level: number;
  swordModel?: string;
  hasWeapon: boolean;
  method?: string;
}): PortraitPick {
  const statuses = setStatuses(o.sets, o.worn);
  const set = lookSet(statuses);
  const outfit: OutfitArt = (set && SET_ART[set.id]) || 'de_tu';
  const g = o.gender === 'f' ? 'nu' : 'nam';
  const full = !!set && !!SET_ART[set.id] && statuses.some((s) => s.set.id === set.id && s.n >= s.set.pieces.length);
  return {
    char: `${outfit}_${g}`,
    outfit,
    realm: `${['na', 'ht', 'ab'].includes(realmArt(o.level)) ? 'nen' : 'canh'}_${realmArt(o.level)}`,
    sword: o.hasWeapon ? `kiem_${swordArt(o.swordModel)}` : null,
    full,
    setId: set && SET_ART[set.id] ? set.id : null,
    tier: realmTier(o.level),
    dao: (o.method && DAO_OF_METHOD[o.method]) || null,
  };
}
