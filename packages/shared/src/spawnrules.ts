// Luật bãi quái (M-2): hồi sinh theo số người trong vùng, trần số con khi đông, đội hình cụm, vùng quan tâm (AOI).
// Hàm thuần dùng chung server (phán định) và công cụ/test.

/** Hồi sinh một cụm: nhanh nhất / chậm nhất (giây). Dữ liệu `respawn` của bãi chỉ là mốc chậm nhất, kẹp ở `CAMP_RESPAWN_MAX`. */
export const CAMP_RESPAWN_MIN = 12;
export const CAMP_RESPAWN_MAX = 25;
/** Mỗi người thêm trong vùng rút ngắn thời gian hồi (hệ số 1 / (1 + k·(n−1))). */
export const CAMP_RESPAWN_CROWD_K = 0.1;
/** Khi đông, cụm đẻ tối đa chừng này lần số con gốc (làm tròn xuống). */
export const CAMP_CROWD_MUL = 1.5;
/** Số người trong vùng để cụm đạt trần đông. */
export const CAMP_CROWD_FULL = 10;

/** Giây hồi sinh cả cụm: `base` (từ dữ liệu bãi) và `players` người đang sống trong vùng. Luôn 12–25 giây. */
export function campRespawnSec(base: number, players: number): number {
  const n = Math.max(1, Math.floor(players));
  const t = Math.min(base, CAMP_RESPAWN_MAX) / (1 + CAMP_RESPAWN_CROWD_K * (n - 1));
  return Math.min(CAMP_RESPAWN_MAX, Math.max(CAMP_RESPAWN_MIN, t));
}

/** Số con thường của cụm khi hồi sinh: `count` gốc, tăng dần theo số người tới tối đa `count × 1,5` (làm tròn xuống). */
export function campMeleeCount(count: number, players: number): number {
  const n = Math.max(1, Math.floor(players));
  const extra = Math.floor(count * (CAMP_CROWD_MUL - 1) * Math.min(1, (n - 1) / (CAMP_CROWD_FULL - 1)) + 1e-9);
  return count + extra;
}

export interface Slot {
  x: number;
  z: number;
}

/**
 * Đội hình cụm quanh tâm: `n` con thường đứng đều trên một vòng (bán kính ~40% bán kính bãi, 4–9 m), con đánh xa đứng
 * phía sau gần tâm. `phase` (radian) cố định theo bãi để mỗi lần tái sinh vẫn là đội hình cũ. Vị trí là điểm nhà (leash).
 */
export function formationSlots(
  cx: number,
  cz: number,
  radius: number,
  n: number,
  phase: number,
  ranged: boolean,
): { melee: Slot[]; ranged?: Slot } {
  const ring = Math.min(9, Math.max(4, radius * 0.4));
  const melee: Slot[] = [];
  for (let i = 0; i < n; i++) {
    const a = phase + (i * Math.PI * 2) / Math.max(1, n);
    melee.push({ x: cx + Math.cos(a) * ring, z: cz + Math.sin(a) * ring });
  }
  return ranged ? { melee, ranged: { x: cx - Math.cos(phase) * ring * 0.3, z: cz - Math.sin(phase) * ring * 0.3 } } : { melee };
}

// ---- Vùng quan tâm (AOI) ----

/**
 * Quái thường và người chơi: vào tầm nhìn khi cách ≤ AOI_IN, rời khi > AOI_OUT (trễ để không nhấp nháy ở mép).
 * Camera chéo khóa góc (Thiên Nhãn) chỉ thấy ~±30 m ngang, ~45 m sâu (phòng boss khổng lồ ×1,4), nên 120/140 m còn dư nhiều lần cho vạch báo,
 * chiêu tầm xa và chấm minimap gần; trước là 160/190 cho camera xoay tự do (Chân Cảnh O5).
 */
export const AOI_IN = 120;
export const AOI_OUT = 140;
/** Boss (vạch báo/chiêu rộng, thấy từ xa hơn quái thường): tầm rộng hơn. */
export const AOI_BOSS_IN = 200;
export const AOI_BOSS_OUT = 230;
/** Chu kỳ cập nhật AOI (ms). */
export const AOI_PERIOD_MS = 200;

/** Đã/đang trong tầm: `inView` là trạng thái hiện tại (để áp độ trễ). */
export function aoiVisible(d2: number, inView: boolean, boss: boolean): boolean {
  const r = inView ? (boss ? AOI_BOSS_OUT : AOI_OUT) : boss ? AOI_BOSS_IN : AOI_IN;
  return d2 <= r * r;
}

// Client: bản ghi của thực thể ngoài tầm AOI là bản ghi rỗng (mọi trường `@view()` chưa tới). Lọc bằng hai hàm này.
/** Quái có dữ liệu thật (trong tầm AOI)? Bản ghi ngoài tầm có `t` rỗng/undefined. */
export function visibleMon(m: { t?: string } | undefined): boolean {
  return !!m && !!m.t;
}
/** Người chơi có dữ liệu thật (trong tầm AOI hoặc chính mình)? Bản ghi ngoài tầm có `name` rỗng/undefined. */
export function visiblePlayer(p: { name?: string } | undefined): boolean {
  return !!p && !!p.name;
}
