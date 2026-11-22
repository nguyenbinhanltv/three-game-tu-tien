/**
 * Điểm ngắm theo con trỏ (Thiên Nhãn P1) và né (Space). Client chỉ gửi ý định (điểm trên mặt đất);
 * server kiểm số hữu hạn, kẹp trong `AIM_MAX_DIST` quanh người chơi, rồi tự chọn mục tiêu / hướng chiêu.
 */

/** Điểm ngắm xa nhất tính từ người chơi (m); xa hơn bị kẹp, không bị bỏ (kéo chuột ra rìa vẫn ra chiêu theo hướng đó). */
export const AIM_MAX_DIST = 45;
/** Bán kính (m) quanh điểm ngắm để tự khóa quái gần nhất. */
export const AIM_PICK_R = 5;

/** Né: quãng (m), khung bất tử (ms) sau khi bấm, hồi (ms), khe tối thiểu giữa hai lần (ms). */
export const DODGE_DIST = 6;
export const DODGE_IFRAME_MS = 450;
export const DODGE_CD_MS = 2500;
export const DODGE_MIN_GAP_MS = 400;

/**
 * Đọc điểm ngắm `{ ax, az }` trong tin client. Trả null khi thiếu/không phải số hữu hạn; điểm xa hơn `AIM_MAX_DIST` bị kẹp vào vòng tròn đó.
 * Gần như trùng người chơi (< 0,3 m) coi là không có hướng.
 */
export function sanitizeAim(msg: unknown, px: number, pz: number): { x: number; z: number } | null {
  const m = msg as { ax?: unknown; az?: unknown } | null;
  if (!m || typeof m.ax !== 'number' || typeof m.az !== 'number') return null;
  if (!Number.isFinite(m.ax) || !Number.isFinite(m.az)) return null;
  const dx = m.ax - px;
  const dz = m.az - pz;
  const d = Math.hypot(dx, dz);
  if (d < 0.3) return null;
  if (d <= AIM_MAX_DIST) return { x: m.ax, z: m.az };
  const k = AIM_MAX_DIST / d;
  return { x: px + dx * k, z: pz + dz * k };
}

/** Phần tử gần điểm (px, pz) nhất trong bán kính `r`; id rỗng nếu không có. */
export function nearestTo(px: number, pz: number, cands: Iterable<{ id: string; x: number; z: number }>, r = AIM_PICK_R): string {
  let best = '';
  let bd = r;
  for (const c of cands) {
    const d = Math.hypot(c.x - px, c.z - pz);
    if (d <= bd) {
      bd = d;
      best = c.id;
    }
  }
  return best;
}
