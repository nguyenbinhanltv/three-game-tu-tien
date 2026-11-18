// Bay lơ lửng (E3-B, chỉ hình): `MonsterDef.hover` là độ cao thân (m) so với mặt đất. Server vẫn đặt quái trên đất nên mọi
// vạch báo, tầm đánh, va chạm đều theo mặt đất; client chỉ nâng model, nên hàm ở đây thuần để test được.

/** Tỉ lệ độ cao khi quái lộ yếu điểm / choáng / quỵ: hạ thấp để đánh gần (cửa sổ đánh, docs/EXPANSION_DESIGN.md 5.4). */
export const HOVER_LOW = 0.3;
/** Biên độ nhấp nhô (m) khi đang ở độ cao đầy đủ, và chu kỳ (s). */
export const HOVER_BOB = 0.28;
const HOVER_BOB_PERIOD = 3.6;

/** Độ cao đích (m): chết thì hạ hẳn xuống đất, lộ yếu điểm / choáng thì hạ thấp, còn lại bay đủ cao. */
export function hoverTarget(hover: number, dead: boolean, low: boolean): number {
  if (hover <= 0 || dead) return 0;
  return low ? hover * HOVER_LOW : hover;
}

/** Tiến độ cao hiện tại về đích (mũ mượt, độc lập tốc độ khung); hạ nhanh hơn khi chết. */
export function stepHover(cur: number, target: number, dt: number, dead: boolean): number {
  const k = 1 - Math.exp(-dt * (dead ? 3.2 : 1.6));
  const next = cur + (target - cur) * k;
  return Math.abs(next - target) < 0.002 ? target : next;
}

/** Nhấp nhô theo thời gian, nhỏ dần khi đã hạ thấp; pha lệch theo từng con để bầy không nhấp cùng nhịp. */
export function hoverBob(hover: number, cur: number, time: number, phase: number): number {
  if (hover <= 0 || cur <= 0) return 0;
  return Math.sin((time / HOVER_BOB_PERIOD) * Math.PI * 2 + phase) * HOVER_BOB * Math.min(1, cur / hover);
}
