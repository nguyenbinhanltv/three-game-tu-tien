/**
 * Hoa Trúc (bước 1, tên tệp khác HoaTruc.tsx vì Windows không phân biệt hoa/thường): hàm thuần chọn tranh vẽ cho bảng Nhân vật. Không đụng DOM, có test.
 * Quy tắc: tranh theo bộ của món ĐANG MẶC (`lookSet`); không có bộ → đồ đệ tử; nam/nữ theo giới tính; nền theo cảnh giới;
 * kiếm theo mẫu kiếm đang mặc. Tên tệp khớp `apps/client/public/hoa-truc/<tên>.webp` (xem tools/hoa-truc/build.py).
 */
import { lookSet, setStatuses, type SetDef } from '@dtl/shared';

/** Bộ có tranh riêng (bước 1). Bộ khác chưa có tranh thì rơi về đồ đệ tử. */
export type OutfitArt = 'lac_kiem' | 'de_tu' | 'liet_mach';
export type RealmArt = 'nk' | 'tc' | 'kd' | 'na' | 'ht';
export type SwordArt = 'thanh_phong' | 'han_quang';

const SET_ART: Record<string, OutfitArt> = { set_lac_kiem: 'lac_kiem', set_liet_mach: 'liet_mach' };

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
  tier: 0 | 1 | 2 | 3;
  /** Công pháp kiếm tu: có chùm 9 phi kiếm (Nguyên Anh) và pháp tướng kiếm long (Hóa Thần). */
  kiem: boolean;
}

/** Nhóm cảnh giới → nền: Ngưng Khí ≤ 15 `nk`, Trúc Cơ 16–19 `tc`, Kết Đan 20–23 `kd`, Nguyên Anh 24–27 `na`, Hóa Thần ≥ 28 `ht`. */
export function realmArt(level: number): RealmArt {
  return level <= 15 ? 'nk' : level < 20 ? 'tc' : level < 24 ? 'kd' : level < 28 ? 'na' : 'ht';
}

/** Tầng chồng hiệu ứng theo cảnh giới (0 = không có). */
export function realmTier(level: number): 0 | 1 | 2 | 3 {
  return level >= 28 ? 3 : level >= 24 ? 2 : level >= 20 ? 1 : 0;
}

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
    realm: `canh_${realmArt(o.level)}`,
    sword: o.hasWeapon ? `kiem_${swordArt(o.swordModel)}` : null,
    full,
    setId: set && SET_ART[set.id] ? set.id : null,
    tier: realmTier(o.level),
    kiem: o.method === 'lac_kiem_quyet',
  };
}
