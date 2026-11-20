// Thiên Nhân Ngũ Suy (TN-4): chuỗi năm ải suy kiệt. Hàm thuần dùng chung server (phán định ở apps/server/src/game/tribsuy.ts)
// và client (HUD, dấu trên sân). Dữ liệu ở `tribulations.json` (kiếp `ngu_suy`, mỗi pha một ải, khối `suy`).
//
// Thanh suy khí của một ải: 0..100, tăng dần theo thời gian (nặng dần về cuối ải), chạm 100 là ải thất bại.
// Mỗi ải có một thao tác riêng kéo thanh xuống; năm thao tác khác nhau, không ải nào qua được bằng cách đứng yên chịu đòn.

import { at } from './arr';
import { TRIB_DEFS, tribPhaseStart, type TribDef, type TribLaw, type TribPhaseDef, type TribSuy, type TribSuyThuc } from './tribulation';

export const NGU_SUY_ID = 'ngu_suy';
/** Cơ chế của năm ải, theo thứ tự chuỗi. */
export const SUY_MECHANICS = ['suy_linh', 'suy_the', 'suy_thuc', 'suy_tho', 'suy_tam'] as const;
export type SuyMechanic = (typeof SUY_MECHANICS)[number];

export function isSuyMechanic(id: string | undefined): id is SuyMechanic {
  return (SUY_MECHANICS as readonly string[]).includes(id ?? '');
}

/** Số ải của chuỗi `def` (0 nếu không phải kiếp chuỗi). */
export function suyStages(def: TribDef = TRIB_DEFS.ngu_suy): number {
  return def.chain ? def.phases.length : 0;
}

/** Số ải đã qua (đã làm sạch: số nguyên trong [0, số ải]). `raw` lấy từ `meta.suy` của nhân vật, có thể hỏng. */
export function suyCleared(raw: unknown, def: TribDef = TRIB_DEFS.ngu_suy): number {
  const n = typeof raw === 'number' && Number.isFinite(raw) ? Math.floor(raw) : 0;
  return Math.max(0, Math.min(suyStages(def), n));
}

/** Đã qua đủ chuỗi? */
export function suyDone(raw: unknown, def: TribDef = TRIB_DEFS.ngu_suy): boolean {
  const n = suyStages(def);
  return n > 0 && suyCleared(raw, def) >= n;
}

/** Thời lượng còn lại (giây) của chuỗi khi vào tiếp từ ải thứ `cleared` (0-based): lần sau không phải làm lại ải đã qua. */
export function suyRemaining(def: TribDef, cleared: number): number {
  return def.duration - tribPhaseStart(def, Math.max(0, Math.min(def.phases.length - 1, cleared)));
}

/** Nội tại pháp tắc: chỉ có khi đã qua đủ chuỗi. */
export function lawPassive(raw: unknown, def: TribDef = TRIB_DEFS.ngu_suy): TribLaw | null {
  return def.law && suyDone(raw, def) ? def.law : null;
}

/** Tiến độ trong ải (0 đầu phần tăng, 1 cuối ải); trong lúc điều tức là 0. */
export function suyProgress(def: TribDef, phaseIdx: number, elapsed: number): number {
  const ph = at(def.phases, phaseIdx, 'phases');
  const a = tribPhaseStart(def, phaseIdx) + (ph.suy?.rest ?? 0);
  return Math.min(1, Math.max(0, (elapsed - a) / Math.max(1e-6, ph.end - a)));
}

/** Nội suy tuyến tính theo tiến độ ải `k` (0..1). */
export function suyLerp(a: number, b: number, k: number): number {
  return a + (b - a) * Math.min(1, Math.max(0, k));
}

/** Tốc độ thanh tự tăng (%/giây) tại tiến độ `k` của ải. */
export function suyRise(cfg: Pick<TribSuy, 'rise' | 'riseEnd'>, k: number): number {
  return suyLerp(cfg.rise, cfg.riseEnd, k);
}

/** Một bước của thanh: cộng `rate` %/giây trong `dt` giây, kẹp 0..100. */
export function stepSuy(pg: number, dt: number, rate: number): number {
  return Math.max(0, Math.min(100, pg + rate * dt));
}

/** Cộng/trừ thẳng một lượng vào thanh, kẹp 0..100. */
export function bumpSuy(pg: number, delta: number): number {
  return Math.max(0, Math.min(100, pg + delta));
}

/** Điểm thứ `i` trong `n` điểm chia đều trên vòng bán kính `ring` quanh `c` (Thọ Đăng). */
export function suyRingPos(c: { x: number; z: number }, ring: number, i: number, n: number): { x: number; z: number } {
  const a = (i * Math.PI * 2) / n;
  return { x: c.x + Math.sin(a) * ring, z: c.z + Math.cos(a) * ring };
}

/** Cung (0..n-1) chứa điểm `(x, z)` quanh tâm `c`; cung `i` trải góc `[i, i + 1) × 2π/n` tính từ +Z quay về +X. */
export function suySectorOf(c: { x: number; z: number }, x: number, z: number, n: number): number {
  const two = Math.PI * 2;
  const a = (Math.atan2(x - c.x, z - c.z) + two) % two;
  return Math.min(n - 1, Math.floor((a / two) * n));
}

/** Hướng giữa cung `i` (radian, cùng quy ước `yaw` của vạch báo). */
export function suySectorYaw(i: number, n: number): number {
  return ((i + 0.5) * Math.PI * 2) / n;
}

/** Điểm `(x, z)` có trúng đợt lôi ẩn không: ngoài sân luôn trúng (rời sân không né được), trong sân thì theo bit cung trong `unsafeMask`. */
export function suyThucHit(
  c: { x: number; z: number },
  cfg: Pick<TribSuyThuc, 'sectors' | 'r'>,
  unsafeMask: number,
  x: number,
  z: number,
): boolean {
  if (Math.hypot(x - c.x, z - c.z) > cfg.r) return true;
  return (unsafeMask & (1 << suySectorOf(c, x, z, cfg.sectors))) !== 0;
}

/** Hồi chiêu ngưng thần (giây) khi thanh đang ở `pg`: thần thức càng suy càng lâu mới ngưng thần lại được. */
export function suyRevealCd(cfg: Pick<TribSuyThuc, 'cd' | 'cdEnd'>, pg: number): number {
  return suyLerp(cfg.cd, cfg.cdEnd, pg / 100);
}

/** Chọn `safe` cung yên trong `n` cung bằng `rnd` (0..1); trả mặt nạ bit các cung NỔ. */
export function suyThucWave(n: number, safe: number, rnd: () => number): number {
  const idx = Array.from({ length: n }, (_, i) => i);
  let mask = (1 << n) - 1;
  for (let k = 0; k < Math.min(safe, n); k++) {
    const j = Math.min(idx.length - 1, Math.floor(rnd() * idx.length));
    mask &= ~(1 << at(idx, j, 'sectors'));
    idx.splice(j, 1);
  }
  return mask;
}

/** Ải (pha) thứ `i` của chuỗi có khối `suy`, hoặc undefined. */
export function suyPhase(def: TribDef, i: number): (TribPhaseDef & { suy: TribSuy }) | undefined {
  const ph = def.phases[i];
  return ph?.suy ? (ph as TribPhaseDef & { suy: TribSuy }) : undefined;
}
