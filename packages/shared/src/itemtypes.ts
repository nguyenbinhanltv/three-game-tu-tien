// Kiểu dữ liệu lá của hệ trang bị (phẩm, chỉ số, dòng phụ, món đã roll): không import module nào trong gói để items.ts, types.ts,
// sets.ts, gems.ts... cùng dùng mà không tạo vòng phụ thuộc (R-6). items.ts re-export lại để API công khai (@dtl/shared) không đổi.

/** 0 Phàm, 1 Linh, 2 Huyền, 3 Địa, 4 Thiên, 5 Thần. */
export type Quality = 0 | 1 | 2 | 3 | 4 | 5;

/** Mỗi 1 điểm ngân sách đổi thành bao nhiêu đơn vị chỉ số. */
export const STAT_PER_POINT = { atk: 1, def: 1, hp: 8, mp: 4 } as const;
export type MainStat = keyof typeof STAT_PER_POINT;
/** Mười bốn loại dòng phụ (thiết kế 3.3). Giá trị là phân số (0,03 = 3%). */
export type AffixStat =
  | 'atk_pct'
  | 'def_pct'
  | 'hp_pct'
  | 'mp_pct'
  | 'crit_rate'
  | 'crit_dmg'
  | 'cdr'
  | 'skill_dmg'
  | 'elem_dmg'
  | 'elem_res'
  | 'lifesteal'
  | 'heal_recv'
  | 'elite_dmg'
  | 'move_speed';

export interface AffixRoll {
  id: AffixStat;
  /** Tham số: id chiêu hoặc ngũ hành (khi `AffixDef.param` có). */
  p?: string;
  v: number;
}

/** Phần "đã roll" của một món trang bị. Mẫu (id, ô) nằm ở `InvItem.id`. */
export interface ItemInst {
  q: Quality;
  ilvl: number;
  /** Dòng chính đã chốt lúc roll (đổi công thức sau này không làm đổi đồ đã rơi). */
  main: Partial<Record<MainStat, number>>;
  affixes: AffixRoll[];
  /** Ngọc khảm; '' = lỗ trống. Độ dài = số lỗ. */
  gems: string[];
  /** Đã ràng buộc (mặc rồi, không giao dịch được). */
  bound: boolean;
}
