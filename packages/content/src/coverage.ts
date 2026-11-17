// Độ phủ theo cụm (E2-A): khoảng cách từ mỗi điểm trong vùng săn tới MÉP cụm quái gần nhất (tâm cụm trừ bán kính, tối thiểu 0).
// Chuẩn theo level: Vân Lam giữ chuẩn M-1 (độ phủ ≤ 35 m tới quái, đo ở mapreport.ts); bản đồ mở rộng (120 quái/km²) dùng chuẩn này,
// vì với mật độ đó không thể phủ ≤ 35 m (xem docs/e2-map/README.md): mọi điểm trong vùng săn cách mép cụm gần nhất ≤ `COVER_EDGE_MAX`.
import { inPoly, type LevelDef } from '@dtl/shared';

/** Mục tiêu "gần": phần trăm điểm ≤ 70 m tới mép cụm được in ở mapreport. */
export const COVER_EDGE_MAX = 70;
/**
 * Chuẩn cứng theo level (m, đo trên lưới `COVER_STEP`): p95 và điểm xa nhất tới mép cụm gần nhất. Level không có mục thì dùng `DEFAULT_COVER`.
 * Ở 120–140 quái/km² (cụm 3–4 con, bán kính 30) hình học chỉ cho p95 ≈ 61 m và max ≈ 84 m; phủ 100 % ≤ 70 m cần ≈ 150 quái/km².
 */
export interface CoverStd {
  p95: number;
  max: number;
}
export const DEFAULT_COVER: CoverStd = { p95: 65, max: 85 };
export const COVER_BY_LEVEL: Record<string, CoverStd> = { doan_mach: { p95: 65, max: 85 }, van_hai: { p95: 65, max: 85 }, thien_khuyet: { p95: 65, max: 85 } };
export const COVER_STEP = 12;

export interface CampCoverage {
  points: number;
  max: number;
  p50: number;
  p95: number;
  /** Điểm xa nhất (để báo lỗi). */
  worst: { x: number; z: number };
  within: number;
}

/** Quanh boss có đấu trường trống (không cụm nào), không tính vào độ phủ. */
export const BOSS_ARENA_R = 60;

export function campCoverage(lv: Pick<LevelDef, 'zones' | 'camps' | 'spawns'>, step = COVER_STEP, limit = COVER_EDGE_MAX): CampCoverage {
  const zones = lv.zones ?? [];
  const camps = lv.camps ?? [];
  const arenas = lv.spawns.filter((s) => s.mon.startsWith('boss_'));
  const ds: number[] = [];
  let worst = { x: 0, z: 0 };
  let max = -1;
  for (const z of zones) {
    const xs = z.poly.map((p) => p[0]);
    const zs = z.poly.map((p) => p[1]);
    const x0 = Math.floor(Math.min(...xs) / step) * step;
    const x1 = Math.max(...xs);
    const z0 = Math.floor(Math.min(...zs) / step) * step;
    const z1 = Math.max(...zs);
    for (let zz = z0; zz <= z1; zz += step)
      for (let x = x0; x <= x1; x += step) {
        if (!inPoly(z.poly, x, zz) || arenas.some((b) => Math.hypot(b.x - x, b.z - zz) < BOSS_ARENA_R)) continue;
        let best = Infinity;
        for (const c of camps) best = Math.min(best, Math.hypot(c.x - x, c.z - zz) - c.radius);
        best = Math.max(0, best);
        ds.push(best);
        if (best > max) {
          max = best;
          worst = { x, z: zz };
        }
      }
  }
  ds.sort((a, b) => a - b);
  const pick = (p: number) => ds[Math.min(ds.length - 1, Math.floor(p * ds.length))] ?? NaN;
  return { points: ds.length, max, p50: pick(0.5), p95: pick(0.95), worst, within: ds.filter((d) => d <= limit).length / Math.max(1, ds.length) };
}
