// Thang sao Cổ Thần (TN-5): Nhất Tinh … Cửu Tinh, trục riêng của hướng Cổ Thần (không đổi sang cảnh giới).
// Hàm thuần dùng chung server (phán định, trừ vật phẩm) và client (thanh sao), cùng content:check.
// Dữ liệu ở packages/content/data/stars.json; sao lưu ở `characters.meta.stars` (0–9).

export const COTHAN_METHOD = 'co_than_quyet';
export const COTHAN_STAR_MAX = 9;
/** Chiêu tư thế Hóa Hình: đang giữ nó thì thân Cổ Thần to lớn (cờ `hh` trong state). */
export const HOA_HINH_SKILL = 'skl_hoa_hinh';

export interface StarDef {
  /** 1–9. */
  star: number;
  /** Cảnh giới (cấp) tối thiểu để rèn sao này. */
  level: number;
  /** Vật phẩm rèn thân (Cổ Huyết Tinh) và linh thạch phải trả. */
  mats: number;
  gold: number;
  /** Cộng dồn: khí huyết tối đa và giảm sát thương nhận (tỉ lệ) khi giữ Cổ Thần Quyết. */
  hpPct: number;
  reducePct: number;
}

export interface StarTable {
  /** Vật phẩm rèn thân. */
  item: string;
  stars: StarDef[];
}

/** Sao hợp lệ từ giá trị đọc DB/tin lạ: số nguyên 0–9. */
export function sanitizeStars(raw: unknown): number {
  return typeof raw === 'number' && Number.isInteger(raw) ? Math.min(COTHAN_STAR_MAX, Math.max(0, raw)) : 0;
}

/** Sao kế tiếp cần rèn (undefined khi đã Cửu Tinh). */
export function starNext(t: StarTable, cur: number): StarDef | undefined {
  return t.stars.find((s) => s.star === cur + 1);
}

export type StarCheck = 'ok' | 'max' | 'level' | 'method';

/** Có rèn được sao kế tiếp không (chưa tính vật phẩm/linh thạch: giao dịch kiểm lúc trừ). */
export function starCheck(t: StarTable, cur: number, level: number, method: string | undefined): StarCheck {
  const n = starNext(t, cur);
  if (!n) return 'max';
  if (method !== COTHAN_METHOD) return 'method';
  return level >= n.level ? 'ok' : 'level';
}

/** Thưởng cộng dồn theo sao đã đạt (chỉ có tác dụng khi giữ Cổ Thần Quyết: nơi gọi kiểm). */
export function starBonus(t: StarTable, cur: number): { hp: number; reduce: number } {
  let hp = 0;
  let reduce = 0;
  for (const s of t.stars) {
    if (s.star > cur) break;
    hp += s.hpPct;
    reduce += s.reducePct;
  }
  return { hp, reduce };
}

/** Chiêu cần `need` sao: đủ chưa (không khai = luôn đủ). */
export function starEnough(cur: number, need: number | undefined): boolean {
  return !need || cur >= need;
}

/** Kiểm bảng sao; trả danh sách lỗi (rỗng = hợp lệ). */
export function starErrors(t: StarTable, itemOk: (id: string) => boolean): string[] {
  const errs: string[] = [];
  if (!itemOk(t.item)) errs.push(`stars: vật phẩm rèn thân "${t.item}" không tồn tại`);
  if (t.stars.length !== COTHAN_STAR_MAX) errs.push(`stars: cần đúng ${COTHAN_STAR_MAX} sao, có ${t.stars.length}`);
  t.stars.forEach((s, i) => {
    const at = `stars[${i}]`;
    if (s.star !== i + 1) errs.push(`${at}: star phải là ${i + 1}`);
    if (!Number.isInteger(s.mats) || s.mats < 1) errs.push(`${at}: mats phải là số nguyên ≥ 1`);
    if (!Number.isInteger(s.gold) || s.gold < 0) errs.push(`${at}: gold phải là số nguyên ≥ 0`);
    if (!(s.hpPct >= 0 && s.reducePct >= 0)) errs.push(`${at}: thưởng không âm`);
    const p = t.stars[i - 1];
    if (p && (s.level < p.level || s.mats < p.mats || s.gold < p.gold))
      errs.push(`${at}: cấp/vật phẩm/linh thạch không được giảm so với sao trước`);
  });
  const hp = starBonus(t, COTHAN_STAR_MAX);
  if (hp.hp > 0.4 || hp.reduce > 0.2) errs.push('stars: tổng thưởng quá lớn (khí huyết ≤ 40%, giảm sát thương ≤ 20%)');
  return errs;
}
