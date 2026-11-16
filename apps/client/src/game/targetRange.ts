/**
 * Tầm giữ mục tiêu ở client (chỉ là trạng thái hiển thị/chọn mục tiêu; server vẫn tự kiểm tầm mỗi chiêu).
 * Chiêu xa nhất 30 m. Quái ở xa hơn `TARGET_KEEP` thì bỏ chọn, để khung mục tiêu, thanh máu boss và chỉ báo ngoài màn hình
 * không bám theo một con quái đã bỏ lại sau lưng (dịch chuyển, chết rồi hồi sinh ở tông môn, bay đi).
 */
export const TARGET_KEEP = { mon: 90, boss: 140 } as const;
/** Thanh máu boss ở đầu màn hình chỉ hiện khi boss trong tầm này, kể cả khi đang chọn nó. */
export const BOSS_BAR_RANGE = 140;

/** Có giữ mục tiêu là quái ở khoảng cách ngang `dist` (m) không. */
export function keepMonsterTarget(dist: number, boss: boolean): boolean {
  return Number.isFinite(dist) && dist <= (boss ? TARGET_KEEP.boss : TARGET_KEEP.mon);
}
