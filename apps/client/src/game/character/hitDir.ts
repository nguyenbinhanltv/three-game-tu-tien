import { flinchDirOf } from './mannequinAnim';

/**
 * Trúng đòn theo hướng + cấp đòn, ngã chết theo hướng (Chân Cảnh C3b). Hàm thuần để test; chỉ là lớp hình ở client.
 * Thư viện UAL chỉ có `Hit_Chest`, `Hit_Head`, `Hit_Knockback`, `Death01`: hướng khác nhau đọc được nhờ chọn clip + độ giật thân (flinch)
 * theo hướng (xem `flinchDirOf`) + biên độ theo cấp đòn S1, và ngã chết quay thân để ngã ra xa người hạ gục.
 */

export type HitSide = 'front' | 'back' | 'left' | 'right';

/** Đòn tới từ phía nào của người bị đánh (`yaw` hướng nhìn; `dx, dz` từ người đánh tới người bị đánh, hệ thế giới). Không có hướng: phía trước. */
export function hitSideOf(yaw: number, dx: number, dz: number): HitSide {
  const { pitch, roll } = flinchDirOf(yaw, dx, dz);
  if (Math.abs(pitch) >= Math.abs(roll)) return pitch < 0 ? 'front' : 'back';
  return roll > 0 ? 'left' : 'right';
}

/** Clip trúng đòn: nặng thì ngã lùi; nhẹ thì chạm ngực (trước/bên) hoặc giật đầu (sau gáy). */
export function hitClipOf(side: HitSide, heavy: boolean): 'Hit_Chest' | 'Hit_Head' | 'Hit_Knockback' {
  if (heavy) return 'Hit_Knockback';
  return side === 'back' ? 'Hit_Head' : 'Hit_Chest';
}

/** Biên độ giật thân (rad) theo cấp đòn S1 (`DmgMsg.tr`: 0 nhẹ … 3 chiêu cuối); không có cấp thì theo cờ cũ (bạo kích/đòn nặng). */
export const FLINCH_BY_TIER = [0.1, 0.16, 0.26, 0.36] as const;
export function flinchAmpOf(tier: number | undefined, crit: boolean, heavy: boolean): number {
  if (tier !== undefined && tier >= 0 && tier < FLINCH_BY_TIER.length) return Math.max(FLINCH_BY_TIER[tier]!, crit ? 0.18 : 0);
  return heavy ? 0.26 : crit ? 0.18 : 0.12;
}

/** Độ lệch hướng (rad, kẹp [−π, π]) cần xoay thân để `Death01` (ngã ngửa) đổ ra xa người hạ gục: thân quay mặt về phía người đánh. */
export function deathYawOffset(yaw: number, dx: number, dz: number): number {
  if (Math.hypot(dx, dz) < 1e-6) return 0;
  const want = Math.atan2(-dx, -dz);
  let d = want - yaw;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d;
}

/** Hướng hạ gục còn dùng được (đòn trúng cuối cách chết không quá `DEATH_DIR_TTL` giây). */
export const DEATH_DIR_TTL = 1.5;
/** Thời gian (giây) xoay thân sang hướng ngã. */
export const DEATH_TURN_S = 0.14;
