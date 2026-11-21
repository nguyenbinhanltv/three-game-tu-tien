// Hợp kích tổ đội (VS-2f): một người mở bằng ấn, MỘT ĐỒNG ĐỘI KHÁC cùng tổ đội kết thúc để cả hai được thưởng.
// Hàm thuần dùng chung server (phán định) và content:check. Dữ liệu ở packages/content/data/joints.json.

import type { MarkDef, MarkId } from './marks';

/**
 * Cách kết thúc hợp kích:
 * - `spend`: đồng đội đánh mục tiêu mang ấn (ấn trên quái) bằng chiêu vừa xả tài nguyên riêng.
 * - `kill_or_ult`: đồng đội đang mang ấn (ấn trên đạo hữu) hạ gục quái hoặc tung chiêu tối thượng.
 */
export type JointFinisher = 'spend' | 'kill_or_ult';

export interface JointDef {
  id: string;
  /** Ấn mở hợp kích; người đặt ấn là người mở. */
  mark: MarkId;
  finisher: JointFinisher;
  /** `spend`: nhân sát thương của chiêu kết thúc lên mục tiêu mang ấn. */
  powerMul?: number;
  /** Cả người mở lẫn người kết thúc nhận chừng này vòng sạc chiêu tối thượng. */
  charge?: number;
  /** `kill_or_ult`: mọi thành viên tổ đội trong `r` mét quanh người kết thúc hồi tỉ lệ này của khí huyết tối đa. */
  healPct?: number;
  r?: number;
  /** Người mở nhận chừng này điểm tài nguyên riêng. */
  res?: number;
  /** Hồi nội bộ theo cặp (người mở → người kết thúc), giây. */
  cd: number;
}

export const JOINT_CD_MIN = 3;

/** Khóa hồi nội bộ của một cặp cho một hợp kích. */
export function jointKey(jointId: string, openerId: number, finisherId: number): string {
  return `${jointId}:${openerId}:${finisherId}`;
}

/**
 * Hợp kích có nổ được không: phải là hai người khác nhau, cùng tổ đội, và cặp này đã hết hồi nội bộ.
 * `readyAt`: giờ (ms) cặp dùng lại được (undefined = chưa từng dùng).
 */
export function jointAllowed(o: {
  openerId: number;
  finisherId: number;
  sameParty: boolean;
  readyAt: number | undefined;
  nowMs: number;
}): boolean {
  if (o.openerId === o.finisherId || !o.sameParty) return false;
  return o.readyAt === undefined || o.nowMs >= o.readyAt;
}

/** Kiểm bảng hợp kích; trả danh sách lỗi (rỗng = hợp lệ). */
export function jointErrors(defs: readonly JointDef[], marks: ReadonlyMap<string, MarkDef>): string[] {
  const errs: string[] = [];
  const seen = new Set<string>();
  const usedMarks = new Set<string>();
  for (const d of defs) {
    const at = `joint ${d.id}`;
    if (!/^[a-z0-9_]+$/.test(d.id)) errs.push(`${at}: id phải là snake_case`);
    if (seen.has(d.id)) errs.push(`${at}: trùng id`);
    seen.add(d.id);
    const mk = marks.get(d.mark);
    if (!mk) errs.push(`${at}: mark "${d.mark}" không phải ấn`);
    if (usedMarks.has(d.mark)) errs.push(`${at}: ấn ${d.mark} đã mở một hợp kích khác`);
    usedMarks.add(d.mark);
    if (d.finisher !== 'spend' && d.finisher !== 'kill_or_ult') errs.push(`${at}: finisher lạ`);
    if (mk && d.finisher === 'spend' && mk.on !== 'mon') errs.push(`${at}: finisher spend cần ấn trên quái`);
    if (mk && d.finisher === 'kill_or_ult' && mk.on !== 'ally') errs.push(`${at}: finisher kill_or_ult cần ấn trên đạo hữu`);
    if (!(d.cd >= JOINT_CD_MIN && d.cd <= 60)) errs.push(`${at}: cd ${JOINT_CD_MIN}–60 giây`);
    if (d.powerMul !== undefined && !(d.powerMul > 1 && d.powerMul <= 2)) errs.push(`${at}: powerMul trong (1, 2]`);
    if (d.powerMul !== undefined && d.finisher !== 'spend') errs.push(`${at}: powerMul chỉ dùng với finisher spend`);
    if (d.charge !== undefined && !(d.charge > 0 && d.charge <= 30)) errs.push(`${at}: charge trong (0, 30]`);
    if (d.healPct !== undefined && !(d.healPct > 0 && d.healPct <= 0.2)) errs.push(`${at}: healPct trong (0; 0,2]`);
    if (d.healPct !== undefined && !(d.r !== undefined && d.r > 0 && d.r <= 20)) errs.push(`${at}: healPct cần r 0–20 m`);
    if (d.res !== undefined && !(d.res > 0 && d.res <= 50)) errs.push(`${at}: res trong (0, 50]`);
    if (d.powerMul === undefined && d.charge === undefined && d.healPct === undefined && d.res === undefined)
      errs.push(`${at}: không có thưởng nào`);
  }
  return errs;
}
