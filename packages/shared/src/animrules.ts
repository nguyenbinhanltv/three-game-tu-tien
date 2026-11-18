// Luật hiển thị animation chiêu (K-4): hàm thuần dùng chung client (máy trạng thái, test) và công cụ. Không đổi luật game:
// server vẫn quyết định sát thương/vị trí, đây chỉ suy ra pha hình từ cùng dữ liệu chiêu (`windup`/`hitAt`/`recovery`/`cancel`/`combo`).

import { castTypeOf } from './skillrules';
import type { SkillDef } from './types';

/** Pha của một lần ra chiêu theo thời gian kể từ lúc bấm. */
export type SkillPhase = 'windup' | 'strike' | 'recovery' | 'done';

/** Dữ liệu thời gian đã chuẩn hóa của một lần ra chiêu (đòn thứ `comboIdx` nếu là chuỗi đánh thường). */
export interface SkillTiming {
  /** Vào thế xong lúc này (giây). */
  windup: number;
  /** Mọi mốc áp hiệu quả (giây từ lúc bấm), tăng dần. */
  hitAt: number[];
  /** Hết thu về lúc này (giây): `hitAt` cuối + `recovery`. */
  end: number;
  /** Từ mốc này di chuyển / lướt hủy được phần thu về (giây); không bao giờ sớm hơn đòn cuối (di chuyển) hay đòn đầu (lướt). */
  cancelMove: number;
  cancelDash: number;
  /** Đòn đẩy lùi (đòn thứ 3 của chuỗi): hình lao tới nhiều hơn. */
  kb: boolean;
}

/** Thời gian thu về mặc định khi dữ liệu không ghi (giây). */
export const DEFAULT_RECOVERY = 0.4;

/** Chuẩn hóa thời gian của chiêu `s`; `comboIdx` chọn mốc `hitAt` của đòn trong chuỗi. */
export function skillTiming(s: SkillDef, comboIdx?: number): SkillTiming {
  const ch = comboIdx !== undefined ? s.combo?.hits[comboIdx] : undefined;
  const hitAt = ch ? [ch.hitAt] : s.hitAt && s.hitAt.length ? [...s.hitAt] : [0];
  const first = hitAt[0] ?? 0;
  const last = hitAt[hitAt.length - 1] ?? first;
  const windup = Math.min(s.windup ?? first, first);
  const end = last + (s.recovery ?? DEFAULT_RECOVERY);
  const cancelMove = Math.max(last, Math.min(end, s.cancel?.move ?? last));
  const cancelDash = Math.max(first, Math.min(end, s.cancel?.dash ?? first));
  return { windup, hitAt, end, cancelMove, cancelDash, kb: !!ch?.kb };
}

/** Pha ở thời điểm `t` (giây từ lúc bấm). `strike` = từ mốc đầu tới mốc cuối (chiêu nhiều mốc). */
export function skillPhaseAt(tm: SkillTiming, t: number): SkillPhase {
  if (t >= tm.end) return 'done';
  const last = tm.hitAt[tm.hitAt.length - 1] ?? 0;
  if (t >= last) return 'recovery';
  if (t >= (tm.hitAt[0] ?? 0)) return 'strike';
  return 'windup';
}

/**
 * Số mốc `hitAt` đã qua ở `t` (mốc i qua khi t ≥ hitAt[i]). Dùng để phát sự kiện đúng một lần cho từng mốc,
 * kể cả khi một khung dài bước qua nhiều mốc.
 */
export function hitsPassed(tm: SkillTiming, t: number): number {
  let n = 0;
  while (n < tm.hitAt.length && t >= (tm.hitAt[n] ?? Infinity)) n++;
  return n;
}

/** Phần thu về có bị hủy bởi hành động `kind` ở thời điểm `t` không. Chưa tới mốc hủy thì không (đòn phải ra). */
export function canCancel(tm: SkillTiming, t: number, kind: 'move' | 'dash'): boolean {
  return t < tm.end && t >= (kind === 'move' ? tm.cancelMove : tm.cancelDash);
}

/** Chiêu không niệm (castType instant): động tác chạy theo `hitAt` tính từ lúc bấm. Chiêu niệm phát theo lịch thanh niệm. */
export function usesStrikeTiming(s: SkillDef): boolean {
  return castTypeOf(s) === 'instant';
}

/** Hướng di chuyển theo mặt nhân vật. */
export type LocoDir = 'forward' | 'back' | 'left' | 'right';

/**
 * Hướng đi so với hướng nhìn `yaw` (cùng quy ước server: nhìn tới (sin yaw, cos yaw), trái là (cos yaw, −sin yaw)).
 * Cho đi lùi/ngang khi nhân vật nhìn mục tiêu mà đi hướng khác. Vùng chính diện/chính lưng rộng ±55° để không chớp qua lại.
 */
export function locoDirOf(yaw: number, vx: number, vz: number): LocoDir {
  const len = Math.hypot(vx, vz);
  if (len < 1e-6) return 'forward';
  const f = (vx * Math.sin(yaw) + vz * Math.cos(yaw)) / len;
  const l = (vx * Math.cos(yaw) - vz * Math.sin(yaw)) / len;
  if (f >= 0.57) return 'forward';
  if (f <= -0.57) return 'back';
  return l > 0 ? 'left' : 'right';
}

/** Hướng đòn tới so với người bị đánh. */
export type HitDir = 'front' | 'back' | 'left' | 'right';

/**
 * Đòn từ phía nào, cho clip trúng đòn có hướng. `dx, dz` là hướng giật (từ người đánh tới người bị đánh, hệ thế giới);
 * người đánh đứng phía ngược lại.
 */
export function hitDirOf(yaw: number, dx: number, dz: number): HitDir {
  const d = locoDirOf(yaw, -dx, -dz);
  return d === 'forward' ? 'front' : d;
}

/**
 * Độ dịch hình về phía trước (m) tại thời điểm `t` của một lần ra đòn: lao ra tới mốc đòn cuối rồi trả về hết lúc thu về.
 * Chỉ để hiển thị (vị trí logic do server giữ).
 */
export function lungeOffset(tm: SkillTiming, t: number, reach: number): number {
  if (reach <= 0 || t <= 0 || t >= tm.end) return 0;
  const peak = tm.hitAt[tm.hitAt.length - 1] ?? 0;
  const ease = (x: number) => x * x * (3 - 2 * x);
  if (t < peak) return reach * ease(Math.max(0, t / Math.max(peak, 1e-3)));
  return reach * (1 - ease((t - peak) / Math.max(tm.end - peak, 1e-3)));
}

/** Tầm lao người (m) của đòn thường liên hoàn: đòn thường 0,5 m, đòn đẩy lùi 1,2 m; chỉ khi có mục tiêu. */
export function lungeReach(tm: SkillTiming, hasTarget: boolean): number {
  if (!hasTarget) return 0;
  return tm.kb ? 1.2 : 0.5;
}
