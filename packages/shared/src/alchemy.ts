// Phẩm chất đan và đan tăng sức (Phase 3-8). Hàm thuần dùng chung client (hiển thị) và server (roll, áp hiệu lực).
// Phẩm đan lưu ở trường `plus` của ô túi (0 Hạ, 1 Trung, 2 Thượng); đan không có trang bị nên không lẫn với cường hóa.

export const PILL_TIERS = 3;
export type PillBuffKind = 'atk' | 'def' | 'crit';
export const PILL_BUFF_KINDS: PillBuffKind[] = ['atk', 'def', 'crit'];

export interface PillBuff {
  kind: PillBuffKind;
  /** Mức cộng: atk/def là tỉ lệ nhân thêm, crit là cộng thẳng vào tỉ lệ bạo kích. */
  pct: number;
  /** Thời lượng (giây). */
  sec: number;
}

export interface PillQualityCfg {
  /** Xác suất ra Hạ/Trung/Thượng khi luyện thường. */
  base: number[];
  /** Xác suất khi người luyện theo công pháp đan sư (Thanh Mộc Đan Kinh). */
  support: number[];
  /** Hệ số hiệu lực theo phẩm (nhân hồi phục, tu vi, mức buff). */
  potency: number[];
}

export function clampPillQuality(q: unknown): number {
  const n = typeof q === 'number' && Number.isFinite(q) ? Math.floor(q) : 0;
  return Math.max(0, Math.min(PILL_TIERS - 1, n));
}

/** Roll phẩm đan từ một số ngẫu nhiên `r` trong [0,1). Server gọi với nguồn ngẫu nhiên thật. */
export function rollPillQuality(cfg: PillQualityCfg, support: boolean, r: number): number {
  const w = support ? cfg.support : cfg.base;
  let acc = 0;
  for (let i = 0; i < PILL_TIERS; i++) {
    acc += w[i] ?? 0;
    if (r < acc) return i;
  }
  return PILL_TIERS - 1;
}

export function pillPotency(cfg: PillQualityCfg, q: unknown): number {
  return cfg.potency[clampPillQuality(q)] ?? 1;
}

/** Buff đang chạy của một người (lưu trong `characters.meta.buffs`): loại → mức và giờ hết hạn (ms, đồng hồ server). */
export type BuffMap = Partial<Record<PillBuffKind, { m: number; until: number }>>;

/** Mức cộng của một loại buff còn hiệu lực lúc `now` (0 nếu hết hạn hoặc không có). */
export function buffMag(buffs: BuffMap | undefined, kind: PillBuffKind, now: number): number {
  const b = buffs?.[kind];
  return b && b.until > now && b.m > 0 ? b.m : 0;
}

/** Đổi buff theo luật "làm mới": giữ mức cao hơn và thời gian xa hơn, không cộng dồn. Trả bản mới. */
export function mergeBuff(old: { m: number; until: number } | undefined, m: number, until: number, now: number): { m: number; until: number } {
  if (!old || old.until <= now) return { m, until: until };
  return { m: Math.max(old.m, m), until: Math.max(old.until, until) };
}
