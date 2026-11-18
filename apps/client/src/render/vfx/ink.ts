import { float, length, max, min, smoothstep, uv } from 'three/tsl';
import { vnoise, type FxUniforms } from './common';

/**
 * Vết mực loang trên đất (M4-14): khi quái chết hoặc dưới đòn nặng. Một tấm phẳng (SIGIL_GEO) áp theo
 * mặt đất; hình vết, mép loang, giọt bắn và lúc tan đều vẽ trong fragment, nên mọi vết dùng chung MỘT
 * material (`inkpool`), lấy lưới từ FxPool. Chỉ là hình riêng mỗi client, không đụng server.
 *
 * Tông: mực `attire_ink` (#29292C) ngả lam ngọc rất nhẹ cho hợp bóng `shadowTint`, không tím, không
 * đen tuyền (art bible mục 4, 8.5). Hòa trộn thường, có sương để vết xa chìm vào cảnh.
 *
 * Tham số theo lưới: `fxA` = (độ loang 0..1, độ tan 0..1, độ đậm mép 0..1, seed).
 */

/** Màu mực của vết (sRGB). */
export const INK_POOL = 0x1d2424;
/** Số vết tối đa cùng lúc; vượt thì vết cũ nhất tan nhanh. */
export const MAX_INK = 14;
/** Độ trong lớn nhất của vết chết / vệt đòn nặng. */
export const INK_ALPHA = 0.9;

export interface InkTiming {
  /** Giây loang ra hết. */
  spread: number;
  /** Giây bắt đầu tan. */
  fadeAt: number;
  /** Tổng thời lượng. */
  dur: number;
}

/** Vết khi quái chết: loang nhanh, nằm lại, tan dần theo nhiễu trong 4,5 giây cuối (tổng 11 giây). */
export const INK_DEATH: InkTiming = { spread: 0.45, fadeAt: 6.5, dur: 11 };
/** Vệt mờ dưới đòn nặng: nhỏ, ngắn. */
export const INK_HIT: InkTiming = { spread: 0.18, fadeAt: 1.8, dur: 4.5 };

/** Độ loang và độ tan ở thời điểm `t` giây (0..1 mỗi giá trị). */
export function inkPhase(t: number, T: InkTiming): { spread: number; dissolve: number } {
  const s = Math.min(1, Math.max(0, t / T.spread));
  const spread = 1 - (1 - s) * (1 - s) * (1 - s);
  const dissolve = t <= T.fadeAt ? 0 : Math.min(1, (t - T.fadeAt) / (T.dur - T.fadeAt));
  return { spread, dissolve };
}

/**
 * Chọn vết phải tan sớm khi vượt `MAX_INK`: trả chỉ số vết cũ nhất (tuổi lớn nhất) chưa bị ép tan,
 * hoặc -1 nếu chưa vượt giới hạn.
 */
export function inkEvict(ages: readonly number[], forced: readonly boolean[], max = MAX_INK): number {
  let live = 0;
  for (let i = 0; i < ages.length; i++) if (!forced[i]) live++;
  if (live < max) return -1;
  let best = -1;
  for (let i = 0; i < ages.length; i++) if (!forced[i] && (best < 0 || ages[i]! > ages[best]!)) best = i;
  return best;
}

export function inkNodes(u: FxUniforms): { color: unknown; opacity: unknown } {
  const q = uv().sub(0.5).mul(2);
  const d = length(q);
  const sd = u.a.w;
  // Mép không tròn: nhiễu theo hướng (vector đơn vị, không có đường nối như góc atan).
  const dir = q.div(max(d, 0.001));
  const rimN = vnoise(dir.mul(2.2).add(sd))
    .mul(0.6)
    .add(vnoise(dir.mul(5.3).add(sd.mul(1.7))).mul(0.4));
  const radius = u.a.x.mul(rimN.mul(0.38).add(0.42));
  const body = smoothstep(radius.add(0.035), radius.sub(0.035), d);
  // Giọt bắn ngoài mép: chấm nhiễu ngưỡng cao, chỉ trong vòng ngoài thân vết, hiện theo độ loang.
  const blot = vnoise(q.mul(7).add(sd.mul(2.3)));
  const drops = smoothstep(0.74, 0.8, blot)
    .mul(smoothstep(0.98, 0.6, d))
    .mul(smoothstep(radius.mul(0.85), radius.add(0.05), d))
    .mul(smoothstep(0.35, 0.9, u.a.x));
  const mask = max(body, drops);
  // Tan theo hạt nhiễu: phần hạt thấp tan trước, vết vỡ thành đốm rồi mất.
  const grain = vnoise(q.mul(8.5).add(sd))
    .mul(0.65)
    .add(vnoise(q.mul(22).add(sd.mul(0.7))).mul(0.35));
  const th = u.a.y.mul(1.1);
  const alive = smoothstep(th.sub(0.07), th, grain);
  // Mực đọng đậm ở mép (như mực loang trên giấy), giữa nhạt hơn và có vân.
  const edge = smoothstep(radius.sub(0.25), radius, d).mul(u.a.z);
  const shade = edge.mul(0.3).add(grain.mul(0.12)).add(0.66);
  const opacity = min(mask.mul(alive).mul(shade).mul(u.opacity), 1);
  const color = u.color.mul(float(1).sub(edge.mul(0.3)));
  return { color, opacity };
}
