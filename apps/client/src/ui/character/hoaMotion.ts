/** Chuyển động "thở" của tranh Hoa Trúc: hàm thuần (không đụng DOM/store) để test được. */
const sm = (a: number, b: number, x: number): number => {
  const k = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return k * k * (3 - 2 * k);
};

/**
 * Bản đồ vùng chuyển động của tranh (không rig): u = 0..1 ngang, v = 0..1 từ đỉnh tóc xuống gót.
 * Trả độ lệch (dx, dy) theo px tại thời điểm `t` giây: ngực phập phồng, tay áo và vạt đung đưa, tóc/dải lụa bay nhẹ ở mép.
 */
export function motionAt(u: number, v: number, t: number, amp = 1): [number, number] {
  const edge = sm(0.45, 1, Math.abs(u - 0.5) * 2);
  const breath = Math.sin(t * 1.5) * (sm(0.12, 0.3, v) * (1 - sm(0.42, 0.55, v)));
  const hair = (1 - sm(0.1, 0.62, v)) * edge * (0.4 + 0.6 * sm(0, 0.15, v));
  const sleeve = sm(0.22, 0.34, v) * (1 - sm(0.52, 0.66, v)) * edge;
  const skirt = sm(0.5, 0.62, v) * (0.35 + 0.65 * edge) * (0.3 + 0.7 * v);
  const dx =
    Math.sin(t * 1.7 + v * 5 + u * 2) * 1.9 * hair + Math.sin(t * 1.25 + u * 4) * 2.1 * sleeve + Math.sin(t * 1.05 + v * 3.2) * 2.8 * skirt;
  const dy = breath * -1.3 + Math.sin(t * 1.25 + u * 3) * 0.9 * sleeve;
  return [dx * amp, dy * amp];
}
