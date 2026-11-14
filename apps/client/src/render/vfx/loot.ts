import * as THREE from 'three/webgpu';
import { abs, float, min, normalView, pow, smoothstep, time, uv, vec2 } from 'three/tsl';
import { vnoise, type FxUniforms } from './common';

/**
 * Đồ rơi trực quan (M4-6). Chỉ là lớp hình: server đã cho đồ vào túi rồi mới gửi `S.SYS` loại `loot`
 * kèm id vật phẩm và id quái. Client vẽ vật nảy ra từ xác, chạm đất, cột sáng theo bậc phẩm chất,
 * chuông ngân, rồi bay vào nút túi đồ. Không có gì ở đây phụ thuộc tỉ lệ rơi.
 *
 * Ba bậc theo `rarity` của vật phẩm (art bible mục 4 và 7: đồ quý dùng `spirit_gold`, không tím):
 * - bậc 0 (`rarity` 0): sương sớm `air_mist`, cột thấp mảnh.
 * - bậc 1 (`rarity` 1): linh khí ngọc `spirit_jade`, cột vừa, có vòng sáng dưới đất.
 * - bậc 2 (`rarity` ≥ 2): kim quang `spirit_gold`, cột cao hai lớp, hạt sáng bay lên, giữ lâu hơn.
 */

export type LootTier = 0 | 1 | 2;

export interface LootTierSpec {
  /** Màu sRGB hex của viên đồ và cột sáng. */
  color: number;
  /** Cao (m) và bán kính (m) của cột sáng. */
  height: number;
  radius: number;
  /** Độ trong lớn nhất của cột. */
  alpha: number;
  /** Thời gian (giây) đồ nằm trên đất trước khi bay vào túi. */
  hold: number;
  /** Hạt sáng bay lên trong cột (mỗi lần). */
  sparks: number;
  /** Có lõi sáng thứ hai bên trong. */
  core: boolean;
}

export const LOOT_TIERS: readonly LootTierSpec[] = [
  { color: 0xdce6df, height: 2.6, radius: 0.22, alpha: 0.45, hold: 0.55, sparks: 0, core: false },
  { color: 0x7fe3d0, height: 5.5, radius: 0.32, alpha: 0.6, hold: 0.8, sparks: 6, core: false },
  { color: 0xffde96, height: 10, radius: 0.45, alpha: 0.85, hold: 1.3, sparks: 16, core: true },
];

/** Màu vàng của đồng tiền nảy ra (không cột sáng, không bay vào túi). */
export const LOOT_GOLD = 0xffde96;

export function lootTier(rarity: number | undefined): LootTier {
  const r = rarity ?? 0;
  return r >= 2 ? 2 : r >= 1 ? 1 : 0;
}

/** Thời gian bay vồng từ xác xuống đất, và nảy lại một lần (giây). */
export const LOOT_ARC = 0.55;
export const LOOT_BOUNCE = 0.22;

/**
 * Độ cao (m, so với đường thẳng nối điểm đầu và điểm chạm) của viên đồ ở thời điểm `t` giây sau khi
 * nảy ra: vồng lên `peak` rồi rơi, chạm đất ở `LOOT_ARC`, nảy lại thấp (`peak` × 0,22), rồi nằm yên.
 */
export function lootHop(t: number, peak = 1.6): number {
  if (t <= 0) return 0;
  if (t < LOOT_ARC) {
    const k = t / LOOT_ARC;
    return 4 * peak * k * (1 - k);
  }
  const b = t - LOOT_ARC;
  if (b < LOOT_BOUNCE) {
    const k = b / LOOT_BOUNCE;
    return 4 * peak * 0.22 * k * (1 - k);
  }
  return 0;
}

/** Tổng thời lượng phần 3D của một món (nảy + nằm + tan cột), giây. */
export function lootDuration(tier: LootTier): number {
  return LOOT_ARC + LOOT_BOUNCE + LOOT_TIERS[tier].hold + 0.7;
}

/** Ống hở hai đầu cho cột sáng; uv.y = 0 ở chân, 1 ở đỉnh. Gốc ở chân ống. */
export const BEAM_GEO = new THREE.CylinderGeometry(1, 1, 1, 16, 1, true).translate(0, 0.5, 0);

/**
 * Shader cột sáng (`beam`): cộng sáng, đậm ở chân, nhạt dần lên đỉnh, có vệt sáng chảy lên theo
 * nhiễu; mép hình bóng mờ đi (theo pháp tuyến nhìn) để không thành ống đặc.
 * `fxA` = (độ dâng 0..1 từ chân lên đỉnh, 0, 0, seed).
 */
export function beamNodes(u: FxUniforms): { color: unknown; opacity: unknown } {
  const p = uv();
  const h = p.y;
  const rise = smoothstep(u.a.x, u.a.x.sub(0.1), h);
  const fade = pow(float(1).sub(h), 1.7).mul(smoothstep(0, 0.05, h));
  const streak = vnoise(vec2(p.x.mul(9).add(u.a.w), h.mul(2.4).sub(time.mul(1.3))));
  const rim = pow(abs(normalView.z), 1.3);
  const hot = float(1).sub(u.k).pow(2).mul(0.3).add(1);
  const color = min(u.color.mul(streak.mul(0.8).add(0.7)).mul(hot), u.maxHdr);
  const opacity = u.opacity.mul(fade).mul(rise).mul(rim).mul(streak.mul(0.5).add(0.5));
  return { color, opacity };
}
