// Bộ trang bị Phase 3-4: đếm số món đang mặc, thưởng 2 món (chỉ số) và hiệu ứng bậc cao (hook combat ở server).
// Hàm thuần. Bảng bộ nằm ở packages/content/data/equipment/sets.json và được truyền vào qua `SetDef[]`.
// Server quyết định kích hoạt (tính từ trang bị thật); client chỉ dùng cùng hàm này để hiển thị x/4 và dòng sáng.

import type { AffixStat } from './items';
import { EQUIP_SLOTS, type EquipSlot } from './types';

/** Hiệu ứng combat của bậc cao: server đọc cờ này trong `executeSkill`/`hitMonster`/`damagePlayer`. */
export type SetFxId =
  | 'phi_kiem_extra'
  | 'shield_boost'
  | 'heal_share'
  | 'crit_slow'
  | 'hoanh_kiem'
  | 'kim_chung'
  | 'moc_linh'
  | 'nghich_kiem'
  | 'dich_son'
  | 'ngung_dan'
  | 'phan_anh'
  | 'anh_thiet'
  | 'anh_duoc'
  | 'thuan_tram'
  | 'thuan_ho'
  | 'cuu_vien';

export interface SetLine {
  id: AffixStat;
  /** Tham số (ngũ hành) cho dòng `elem_res`. */
  p?: string;
  v: number;
}

export interface SetTier {
  /** Số món cần mặc. */
  n: number;
  /** Cộng chỉ số (cùng dạng dòng phụ, tính chung với trần trong `computePlayerStats`). */
  lines?: SetLine[];
  /** Hiệu ứng combat. */
  fx?: SetFxId;
  /** Tham số hiệu ứng (tỉ lệ ra thêm, +% khiên, hồi cho đồng đội...). */
  v?: number;
  /** Tham số phụ (phản sát thương, thời gian làm chậm...). */
  w?: number;
}

export interface SetLook {
  hex: string;
  trim: string;
  /** Màu ánh kiếm khi mặc món vũ khí của bộ hoặc đủ bộ. */
  blade: string;
}

export interface SetDef {
  id: string;
  /** id các món của bộ (mỗi món một ô). */
  pieces: string[];
  tiers: SetTier[];
  /** Phối màu đạo bào/vũ khí khi mặc từ `LOOK_MIN` món. */
  look: SetLook;
  /** Nguồn: chế tạo ở Thiết lão hay rơi từ ai (chỉ để hiển thị tooltip, server đọc từ loot.json/forge.json). */
  src: 'forge' | 'drop';
}

/** Từ số món này trở lên nhân vật đổi màu áo theo bộ (nhìn là biết bộ nào). */
export const SET_LOOK_MIN = 2;

export interface SetStatus {
  set: SetDef;
  /** Số món của bộ đang mặc. */
  n: number;
  /** Các bậc đã kích hoạt (n ≤ số món). */
  active: SetTier[];
}

export interface SetFx {
  /** Xác suất Phi Kiếm bắn thêm một thanh. 0 = không. */
  phiKiemExtra: number;
  /** Khiên Linh Khí Hộ Thể đỡ thêm (phân số) và phản lại (phân số phần sát thương khiên đã đỡ). */
  shieldBoost: number;
  shieldReflect: number;
  /** Hồi Nguyên Thuật hồi thêm cho đồng đội gần: tỉ lệ so với lượng hồi bản thân. */
  healShare: number;
  /** Đòn bạo kích làm chậm mục tiêu, số giây. 0 = không. */
  critSlowSec: number;
  /** Bộ bậc 2 (E2-F). Chiêu đích thuộc E2-G: Hoành Kiếm Phá Mạch (`skl_hoanh_kiem_pha_mach`) tăng sát thương (phân số) và tầm (mét). */
  hoanhKiemPower: number;
  hoanhKiemReach: number;
  /** Kim Chung Trấn (`skl_kim_chung_tran`) phản thêm (phân số). */
  kimChungReflect: number;
  /** Mộc Linh Trận (`skl_moc_linh_tran`) kéo dài thêm (phân số thời lượng). */
  mocLinhDur: number;
  /** Bộ bậc 3 (E3-F). Nghịch Kiếm Chuyển Phong (`skl_nghich_kiem_chuyen_phong`) hoàn phần hồi chiêu (phân số) nếu lướt hạ được mục tiêu. */
  nghichKiemRefund: number;
  /** Dịch Sơn Xung (`skl_dich_son_xung`) choáng thêm (giây). */
  dichSonStun: number;
  /** Ngưng Đan Hộ Thế (`skl_ngung_dan_ho_the`) khiên mạnh thêm (phân số). */
  ngungDanBoost: number;
  /** Bộ bậc 4 (SETS-4). Phân Anh Kiếm Ảnh (`skl_phan_anh_kiem_anh`): sát thương kiếm ảnh tăng thêm (phân số; 1 = gấp đôi). Chiêu còn khóa (E2-G), chưa có sát thương kiếm ảnh để nối. */
  phanAnhPower: number;
  /** Anh Thiết Thân (`skl_anh_thiet_than`): đồng đội gần cũng giảm chừng này sát thương nhận (phân số). */
  anhThietShare: number;
  /** Anh Dược Hóa Thân (`skl_anh_duoc_hoa_than`): hồi thêm (phân số). */
  anhDuocBoost: number;
  /** Bộ bậc 5 (E4-F, tạm chờ DV3-F). Thuấn Di Trảm (`skl_thuan_di_tram`) gây thêm sát thương (phân số). */
  thuanTramPower: number;
  /** Thuấn Di Hộ Thế (`skl_thuan_di_ho_the`): khiên dày thêm (phân số). */
  thuanHoBoost: number;
  /** Thuấn Di Cứu Viện (`skl_thuan_di_cuu_vien`): người được cứu sống lại với thêm khí huyết (phân số của khí huyết tối đa). */
  cuuVienBoost: number;
}

export const NO_SET_FX: SetFx = {
  phiKiemExtra: 0,
  shieldBoost: 0,
  shieldReflect: 0,
  healShare: 0,
  critSlowSec: 0,
  hoanhKiemPower: 0,
  hoanhKiemReach: 0,
  kimChungReflect: 0,
  mocLinhDur: 0,
  nghichKiemRefund: 0,
  dichSonStun: 0,
  ngungDanBoost: 0,
  phanAnhPower: 0,
  anhThietShare: 0,
  anhDuocBoost: 0,
  thuanTramPower: 0,
  thuanHoBoost: 0,
  cuuVienBoost: 0,
};

/** Đếm món bộ đang mặc theo `setOf(itemId)`; chỉ tính mỗi món một lần (mỗi ô một món nên tự khác nhau). */
export function setStatuses(sets: readonly SetDef[], wornIds: readonly string[]): SetStatus[] {
  const out: SetStatus[] = [];
  for (const set of sets) {
    const n = wornIds.filter((id, i) => set.pieces.includes(id) && wornIds.indexOf(id) === i).length;
    if (n > 0) out.push({ set, n, active: set.tiers.filter((t) => t.n <= n) });
  }
  return out;
}

/** Bộ đang quyết định màu áo: bộ có nhiều món nhất (từ `SET_LOOK_MIN`), hòa thì bộ khai báo trước. */
export function lookSet(statuses: readonly SetStatus[]): SetDef | null {
  let best: SetStatus | null = null;
  for (const s of statuses) if (s.n >= SET_LOOK_MIN && (!best || s.n > best.n)) best = s;
  return best ? best.set : null;
}

export function setFxOf(statuses: readonly SetStatus[]): SetFx {
  const fx: SetFx = { ...NO_SET_FX };
  for (const s of statuses) {
    for (const t of s.active) {
      switch (t.fx) {
        case 'phi_kiem_extra':
          fx.phiKiemExtra = Math.max(fx.phiKiemExtra, t.v ?? 0);
          break;
        case 'shield_boost':
          fx.shieldBoost = Math.max(fx.shieldBoost, t.v ?? 0);
          fx.shieldReflect = Math.max(fx.shieldReflect, t.w ?? 0);
          break;
        case 'heal_share':
          fx.healShare = Math.max(fx.healShare, t.v ?? 0);
          break;
        case 'crit_slow':
          fx.critSlowSec = Math.max(fx.critSlowSec, t.v ?? 0);
          break;
        case 'hoanh_kiem':
          fx.hoanhKiemPower = Math.max(fx.hoanhKiemPower, t.v ?? 0);
          fx.hoanhKiemReach = Math.max(fx.hoanhKiemReach, t.w ?? 0);
          break;
        case 'kim_chung':
          fx.kimChungReflect = Math.max(fx.kimChungReflect, t.v ?? 0);
          break;
        case 'moc_linh':
          fx.mocLinhDur = Math.max(fx.mocLinhDur, t.v ?? 0);
          break;
        case 'nghich_kiem':
          fx.nghichKiemRefund = Math.max(fx.nghichKiemRefund, t.v ?? 0);
          break;
        case 'dich_son':
          fx.dichSonStun = Math.max(fx.dichSonStun, t.v ?? 0);
          break;
        case 'ngung_dan':
          fx.ngungDanBoost = Math.max(fx.ngungDanBoost, t.v ?? 0);
          break;
        case 'phan_anh':
          fx.phanAnhPower = Math.max(fx.phanAnhPower, t.v ?? 0);
          break;
        case 'anh_thiet':
          fx.anhThietShare = Math.max(fx.anhThietShare, t.v ?? 0);
          break;
        case 'anh_duoc':
          fx.anhDuocBoost = Math.max(fx.anhDuocBoost, t.v ?? 0);
          break;
        case 'thuan_tram':
          fx.thuanTramPower = Math.max(fx.thuanTramPower, t.v ?? 0);
          break;
        case 'thuan_ho':
          fx.thuanHoBoost = Math.max(fx.thuanHoBoost, t.v ?? 0);
          break;
        case 'cuu_vien':
          fx.cuuVienBoost = Math.max(fx.cuuVienBoost, t.v ?? 0);
          break;
      }
    }
  }
  return fx;
}

// ---------- chế tạo ở Thiết lão ----------

/** Công thức chế một món của bộ. Phẩm do server roll theo `q` (trọng số 5 phẩm), dòng chính/phụ roll như đồ rơi. */
export interface ForgeRecipe {
  id: string;
  npc: string;
  /** id món của bộ (mẫu). */
  output: string;
  /** Cấp vật phẩm của món chế ra. */
  ilvl: number;
  /** Trọng số 5 phẩm Phàm..Thiên. */
  q: number[];
  inputs: { id: string; n: number }[];
  gold: number;
  /** Cảnh giới tối thiểu để chế (đồ bậc 2 trở lên). */
  reqLevel?: number;
  /** Thợ khác cũng chế được công thức này (Hứa lão ở Đoạn Mạch, Thiết lão ở tông môn). */
  alsoAt?: string[];
}

// ---------- phụ kiện hình dáng (hiển thị) ----------

/** Thứ tự ô trong mã phụ kiện (mỗi ô một ký tự), khớp `EQUIP_SLOTS`. */
const ACC_SLOTS: readonly EquipSlot[] = EQUIP_SLOTS;

/**
 * Mã phụ kiện của người chơi cho client dựng hình: mỗi ô trang bị một ký tự, '0' = không phải đồ bộ, '1'.. = thứ tự
 * (từ 1) của bộ trong bảng `sets`. Trả '' nếu không mặc món bộ nào (đa số người chơi), để schema không tốn byte.
 * Không phụ thuộc số món, nên một món lẻ cũng hiện phụ kiện của nó.
 */
/** Số bộ tối đa mã hóa được trong `accessoryCode` (mỗi ký tự = mã ASCII 48 + thứ tự bộ; E3-F vượt mốc 9 chữ số cũ). */
export const ACC_MAX_SETS = 40;

export function accessoryCode(sets: readonly SetDef[], equip: Partial<Record<EquipSlot, { id: string } | undefined>>): string {
  let any = false;
  let out = '';
  for (const slot of ACC_SLOTS) {
    const id = equip[slot]?.id;
    const i = id ? sets.findIndex((s) => s.pieces.includes(id)) : -1;
    if (i >= 0 && i < ACC_MAX_SETS) any = true;
    out += i >= 0 && i < ACC_MAX_SETS ? String.fromCharCode(48 + i + 1) : '0';
  }
  return any ? out : '';
}

/** Giải mã `accessoryCode`: id bộ theo ô (ô không có phụ kiện thì vắng mặt). Mã lạ bị bỏ qua từng ký tự. */
export function parseAccessoryCode(sets: readonly SetDef[], code: string): Partial<Record<EquipSlot, string>> {
  const out: Partial<Record<EquipSlot, string>> = {};
  for (let i = 0; i < ACC_SLOTS.length && i < code.length; i++) {
    const n = code.charCodeAt(i) - 48;
    const slot = ACC_SLOTS[i];
    const set = sets[n - 1];
    if (slot && set && n >= 1 && n <= sets.length) out[slot] = set.id;
  }
  return out;
}
