/**
 * Điểm ngắm theo con trỏ (Thiên Nhãn P1) và né (Space). Client chỉ gửi ý định (điểm trên mặt đất);
 * server kiểm số hữu hạn, kẹp trong `AIM_MAX_DIST` quanh người chơi, rồi tự chọn mục tiêu / hướng chiêu.
 */

/** Điểm ngắm xa nhất tính từ người chơi (m); xa hơn bị kẹp, không bị bỏ (kéo chuột ra rìa vẫn ra chiêu theo hướng đó). */
export const AIM_MAX_DIST = 45;
/** Bán kính (m) quanh điểm ngắm để tự khóa quái gần nhất. */
export const AIM_PICK_R = 5;

/** Né: quãng (m), khung bất tử (ms) sau khi bấm, khe tối thiểu giữa hai lần (ms). */
export const DODGE_DIST = 6;
export const DODGE_IFRAME_MS = 450;
export const DODGE_MIN_GAP_MS = 400;
/** Chân Cảnh S5: né có `DODGE_CHARGES` lượt nạp; mỗi lượt nạp lại sau `DODGE_RECHARGE_MS` (nạp tuần tự). Dài hạn vẫn 1 né / 2,5 s. */
export const DODGE_CHARGES = 2;
export const DODGE_RECHARGE_MS = 2500;
/** Tên cũ của thời gian nạp một lượt (giữ để mã/ test cũ còn dùng). */
export const DODGE_CD_MS = DODGE_RECHARGE_MS;
/** Chiêu lướt (`dash`) cho khung bất tử ngắn: lướt đúng lúc xuyên qua vòng cảnh báo. */
export const DASH_IFRAME_MS = 250;

/** Kho lượt né: số lượt còn và lúc nạp xong lượt kế (giờ server, ms; chỉ có nghĩa khi chưa đầy). */
export interface DodgeBank {
  charges: number;
  nextAt: number;
}
export const newDodgeBank = (): DodgeBank => ({ charges: DODGE_CHARGES, nextAt: 0 });

/** Nạp lại các lượt đã tới hạn (mutate). */
export function dodgeRefill(b: DodgeBank, now: number): void {
  while (b.charges < DODGE_CHARGES && now >= b.nextAt) {
    b.charges++;
    if (b.charges < DODGE_CHARGES) b.nextAt += DODGE_RECHARGE_MS;
  }
}

/** Dùng một lượt né: false nếu hết lượt. Bắt đầu đếm nạp khi kho đang đầy (mutate). */
export function dodgeSpend(b: DodgeBank, now: number): boolean {
  dodgeRefill(b, now);
  if (b.charges <= 0) return false;
  if (b.charges === DODGE_CHARGES) b.nextAt = now + DODGE_RECHARGE_MS;
  b.charges--;
  return true;
}

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
