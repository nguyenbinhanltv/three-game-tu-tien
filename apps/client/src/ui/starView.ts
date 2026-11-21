// Thang sao Cổ Thần (TN-5) ở bảng Công pháp. Hàm thuần: quyết định chữ và trạng thái nút rèn sao;
// server mới là nơi kiểm thật (cảnh giới, vật phẩm, linh thạch, đứng gần người truyền công pháp, không giao chiến).
import { COTHAN_STAR_MAX, sanitizeStars, starBonus, starCheck, starNext, type StarTable } from '@dtl/shared';

export interface StarView {
  /** Sao đã rèn (0–9). */
  stars: number;
  /** Chín ô sao, `true` = đã rèn. */
  pips: boolean[];
  /** Sao kế tiếp; undefined khi đã Cửu Tinh. */
  next?: { star: number; level: number; mats: number; gold: number };
  /** Vì sao chưa rèn được (rỗng = rèn được, chỉ còn phụ thuộc người truyền công pháp ở gần). */
  block: '' | 'max' | 'method' | 'level' | 'mats' | 'gold';
  /** Thưởng cộng dồn đã có (khí huyết, giảm sát thương, theo tỉ lệ). */
  bonus: { hp: number; reduce: number };
}

export function starView(o: {
  table: StarTable;
  stars: number | undefined;
  level: number;
  method: string | undefined;
  mats: number;
  gold: number;
}): StarView {
  const stars = sanitizeStars(o.stars);
  const nx = starNext(o.table, stars);
  const chk = starCheck(o.table, stars, o.level, o.method);
  let block: StarView['block'] = chk === 'ok' ? '' : chk;
  if (!block && nx) block = o.mats < nx.mats ? 'mats' : o.gold < nx.gold ? 'gold' : '';
  return {
    stars,
    pips: Array.from({ length: COTHAN_STAR_MAX }, (_, i) => i < stars),
    next: nx && { star: nx.star, level: nx.level, mats: nx.mats, gold: nx.gold },
    block,
    bonus: starBonus(o.table, stars),
  };
}
