import { featureWeight, LAKE, PORTAL_PAD, SECT, WATER_Y } from '@dtl/shared';
import { heightAt, inLakeWater } from '../../base/levelCtx';
import { distToPaths, PATH_HALF_WIDTH, pathPolylines, sectPaving } from '../../render/groundMask';

/**
 * Chất liệu mặt đất dưới chân, dùng chọn tiếng bước chân (P2-D3). Suy ra từ cùng dữ liệu với mặt nạ vùng của shader
 * mặt đất (render/groundMask.ts: đường mòn, sân lát đá, cát ven hồ) và độ dốc, nên tiếng khớp với thứ người chơi nhìn thấy.
 */
export type Surface = 'stone' | 'grass' | 'dirt' | 'sand' | 'wood' | 'water';

export const SURFACES: readonly Surface[] = ['stone', 'grass', 'dirt', 'sand', 'wood', 'water'];

/** Độ dốc (Δy/Δx) từ đó mặt đất là đá trơ (lớp rock/cliff của shader). */
export const ROCK_SLOPE = 0.7;
/** Độ cao (m) từ đó mặt đất là đá (khớp smoothstep(175, 235) của lớp rock trong render/materials/ground.ts, lấy điểm giữa). */
const ROCK_HEIGHT = 205;

interface Rect {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

/**
 * Sàn gỗ đi lên được (cầu, sàn đài). Hiện bản đồ chưa có kiến trúc gỗ đi bộ được (sàn đình ở tông môn là đá),
 * nên danh sách rỗng; thêm vùng vào đây khi có cầu gỗ thì tiếng bước chân tự đổi, không cần sửa nơi khác.
 */
export const WOOD_ZONES: Rect[] = [];

/** Bậc thang đá ngoài cổng tông môn (sect.ts buildStaticRest): x ± 3,75 quanh trục, z từ 2136, 26 bậc × 4,2 m. */
const STAIRS: Rect = { x0: SECT.x - 4, z0: 2136, x1: SECT.x + 4, z1: 2136 + 26 * 4.2 };

let lines: ReturnType<typeof pathPolylines> | null = null;

const inRect = (r: Rect, x: number, z: number) => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1;

/**
 * Chất liệu tại (x, z). `level` 'kiem_trung' (bí cảnh) là nền đá. Thứ tự ưu tiên: nước nông > gỗ > đá lát/bậc thang >
 * cát ven hồ > sườn dốc/đỉnh cao (đá) > đường đất mòn > cỏ.
 */
export function surfaceAt(x: number, z: number, level: 'van_lam' | 'kiem_trung' = 'van_lam'): Surface {
  if (level === 'kiem_trung') return 'stone';
  const h = heightAt(x, z);
  // Lội nước: trong mặt hồ và đáy thấp hơn mặt nước (bờ hồ thoải nên đoạn lội rộng vài mét).
  if (h < WATER_Y - 0.05 && inLakeWater(x, z)) return 'water';
  for (const r of WOOD_ZONES) if (inRect(r, x, z)) return 'wood';
  // Khớp ngưỡng của groundMask.maskPixel (kênh G): sân tông môn và bệ cổng bí cảnh.
  if (sectPaving(x - SECT.x, z - SECT.z) > 0.5 || (featureWeight(PORTAL_PAD, x, z) - 0.88) * 12 > 0.5 || inRect(STAIRS, x, z))
    return 'stone';
  // Cát (kênh B > 0,5): (WATER_Y + 2,6 − h) / 1,8 > 0,5.
  if (featureWeight(LAKE, x, z) > 0 && h < WATER_Y + 1.7) return 'sand';
  const sx = (heightAt(x + 1.5, z) - heightAt(x - 1.5, z)) / 3;
  const sz = (heightAt(x, z + 1.5) - heightAt(x, z - 1.5)) / 3;
  // Dốc đứng, hoặc đỉnh núi cao (shader pha lớp rock từ ~175 m): đá trơ. Shader cũng bỏ lớp đường mòn ở nơi có đá, nên đá xét trước đất.
  if (Math.hypot(sx, sz) > ROCK_SLOPE || h > ROCK_HEIGHT) return 'stone';
  lines ??= pathPolylines();
  if (distToPaths(x, z, lines) < PATH_HALF_WIDTH + 0.3) return 'dirt';
  return 'grass';
}
