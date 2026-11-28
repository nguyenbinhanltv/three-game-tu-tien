import { abs, atan, clamp, dot, float, floor, length, max, min, select, smoothstep, sqrt, vec2, vec4 } from 'three/tsl';
import { vnoise, type N } from './common';

/**
 * Ô sprite thủ tục (sprite → code). Mỗi ô là một hàm TSL giải tích (không phụ thuộc độ phân giải) nhận `uv` 0..1 của quad
 * và trả (độ sáng, độ sáng, độ sáng, alpha) — cùng quy ước với một ô vẽ tay, nên `spriteNodesFor(group, tile)` giữ nguyên
 * bảng màu theo phong cách, độ tan, seed và mọi tham số của timeline JSON.
 *
 * `PROC_TILES` là bảng ánh xạ TÊN Ô ở art.ts → ô thủ tục, chỉ có tác dụng khi `?procfx=1` (cờ mặc định tắt). Ô chỉ được bật mặc định khi
 * qua cổng chất lượng (ảnh đặt cạnh sprite, cổng VFX từng chiêu, --fxperf; ghi kết quả ở docs/handbook/dien-vo-truong.md, mục sprite → code).
 */
export type ProcTile = (q: N) => N;

const gray = (l: N, a: N): N => vec4(l, l, l, a);

/** Lưới lục giác nhìn như mái vòm (`chung_hexweb`): nét sáng trên nền gần trong suốt, viền vành sáng, nét co lại về mép. */
export const hexDome: ProcTile = (q) => {
  const p = q.sub(0.5).mul(2 / 0.84);
  const r = length(p);
  const r2 = min(r.mul(r), 0.95);
  // Chiếu mái vòm: gần mép lưới dày lên và nét mảnh lại (chiếu ngược của hình cầu).
  const k = sqrt(float(1).sub(r2.mul(0.9)));
  const u = p.div(max(k, 0.5)).mul(2.5);
  // Khoảng cách tới biên ô lục giác (lưới lục giác chuẩn, chu kỳ (1, √3)).
  const R = vec2(1, 1.7320508);
  const h = R.mul(0.5);
  const a0 = u.sub(R.mul(floor(u.div(R)))).sub(h);
  const u2 = u.sub(h);
  const b0 = u2.sub(R.mul(floor(u2.div(R)))).sub(h);
  const g = select(dot(a0, a0).lessThan(dot(b0, b0)), a0, b0);
  const ag = abs(g);
  const d = max(dot(ag, vec2(0.5, 0.8660254)), ag.x); // 0 tâm ô → 0.5 biên ô
  const w = float(0.032).add(k.mul(0.02)); // nét mảnh dần về mép
  const line = smoothstep(float(0.5).sub(w.mul(1.6)), float(0.5).sub(w.mul(0.3)), d);
  const rim = smoothstep(0.86, 0.93, r).mul(float(1).sub(smoothstep(0.945, 0.975, r)));
  const inside = float(1).sub(smoothstep(0.93, 0.965, r));
  const lum = clamp(line.mul(0.95).add(rim.mul(0.9)), 0, 1);
  const alpha = clamp(line.mul(0.95).add(rim), 0, 1).mul(inside.add(rim));
  return gray(lum, alpha);
};

/** CHƯA ĐẠT cổng (28/11, lượt 3: vòng trắng trơn, mất gợn sóng xanh mực và nền tối của bản vẽ) nên KHÔNG có trong `PROC_TILES`; giữ để làm tiếp. Vũng mực (`chung_pool`): đĩa elip nằm dưới đất, vòng ngoài dày, hai vòng trong mảnh, nền xám loang; nét bút thô nhờ nhiễu. */
export const inkPool: ProcTile = (q) => {
  const p = q.sub(0.5).mul(2);
  const ang = atan(p.y, p.x);
  const wob = vnoise(vec2(ang.mul(1.4).add(3), 0.5).mul(2.2)).sub(0.5).mul(0.05).add(vnoise(p.mul(6)).sub(0.5).mul(0.025));
  const e = length(vec2(p.x, p.y.mul(1.7))).add(wob);
  const ring = (c: number, w: number): N => float(1).sub(smoothstep(w * 0.55, w, abs(e.sub(c))));
  const outer = ring(0.88, 0.07);
  const mid = ring(0.6, 0.045);
  const inner = ring(0.33, 0.04);
  const fillMask = float(1).sub(smoothstep(0.84, 0.9, e));
  const grad = float(0.07).add(vnoise(p.mul(3.5)).mul(0.07)).add(smoothstep(0.1, 0.7, e).mul(0.05));
  const lum = clamp(max(max(outer.mul(0.95), mid.mul(0.8)), inner.mul(0.7)).add(fillMask.mul(grad)), 0, 1);
  const alpha = clamp(max(max(outer, mid), max(inner, fillMask.mul(0.6))), 0, 1);
  return gray(lum, alpha);
};

/** Tên ô ở art.ts → ô thủ tục đã qua cổng. Khóa của bảng cũng là hậu tố của FxKind `proc_<tên>`. */
export const PROC_TILES: Readonly<Record<string, ProcTile>> = {
  chung_hexweb: hexDome,
};

export const procKind = (name: string): string => `proc_${name}`;
