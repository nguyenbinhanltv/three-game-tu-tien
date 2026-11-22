// Đạp Thiên (TN-7, kết game): qua đủ chín cầu thì được danh hiệu Đạp Thiên và chọn MỘT trong bốn nguồn Cực nguyên (Khởi Nguyên, Tịch Diệt, Cấm Chế,
// Sát Lục), một lần, không đổi. Hàm thuần dùng chung server (phán định ở `KieuSystem.onChoose`) và client (cửa sổ chọn, danh hiệu).
// Phần thưởng là cộng phần trăm bốn chỉ số gốc (hp, mp, atk, def) trong `Character.recalc`, cộng dồn với Kiều Lực và pháp tắc; không tạo vật phẩm/tiền nên không ghi ledger.

import { kieuDone } from './kieu';

/** Bốn nguồn Cực nguyên người chơi chọn được ở kết game (khớp `glossary.origins.special`, `origins.json` nhóm `special`). */
export const DAP_IDS = ['khoi_nguyen', 'tich_diet', 'cam_che', 'sat_luc'] as const;
export type DapId = (typeof DAP_IDS)[number];

export interface DapBonus {
  hp: number;
  mp: number;
  atk: number;
  def: number;
}

/** Thưởng từng nguồn (phân số; mỗi nguồn nghiêng một hướng, tổng ~ 12–14% để ngang Kiều Lực chín cầu 9%). */
export const DAP_BONUS: Readonly<Record<DapId, DapBonus>> = {
  khoi_nguyen: { hp: 0.06, mp: 0.08, atk: 0, def: 0 },
  tich_diet: { hp: 0, mp: 0, atk: 0.09, def: 0.03 },
  cam_che: { hp: 0, mp: 0.04, atk: 0, def: 0.1 },
  sat_luc: { hp: 0.03, mp: 0, atk: 0.1, def: 0 },
};

export function isDapId(v: unknown): v is DapId {
  return typeof v === 'string' && (DAP_IDS as readonly string[]).includes(v);
}

/** Nguồn Cực nguyên đã chọn trong `meta.dap` (chuỗi lạ → chưa chọn). */
export function dapOf(meta: { dap?: unknown } | null | undefined): DapId | null {
  const v = meta?.dap;
  return isDapId(v) ? v : null;
}

/** Danh hiệu Đạp Thiên: đã qua đủ chín cầu (không cần đã chọn nguồn). */
export function hasDapTitle(meta: { kieu?: unknown } | null | undefined): boolean {
  return kieuDone(meta?.kieu);
}

/** Được chọn nguồn lúc này không: đủ chín cầu và chưa chọn. */
export function canChooseDap(meta: { kieu?: unknown; dap?: unknown } | null | undefined): boolean {
  return hasDapTitle(meta) && dapOf(meta) === null;
}

export function dapBonus(meta: { dap?: unknown } | null | undefined): DapBonus {
  const id = dapOf(meta);
  return id ? DAP_BONUS[id] : { hp: 0, mp: 0, atk: 0, def: 0 };
}
