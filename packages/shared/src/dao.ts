// Đạo (TN-3, chương 6): từ Vấn Đỉnh (cấp 36) người chơi chọn MỘT Nguồn chính trong sáu nguồn Bản Nguyên đã mở, một lần.
// Đạo cộng thêm nửa thưởng của nguồn đó (cộng dồn với Bản Nguyên mang sẵn; chọn trùng nguồn thì thành 1,5 lần) và mở biến thể
// lĩnh vực theo Ý cảnh của nguồn. Hàm thuần dùng chung server (phán định) và client (hiển thị). Server là nơi duy nhất ghi `meta.dao`.

import { isRootId, type RootId } from './realm';
import type { OriginDef } from './origin';
import { VAN_DINH_LEVEL } from './formulas';
import { ELEMENTS, ELEM_BEATS, type Element } from './elements';
import type { MonsterDao } from './types';

/** Cấp mở Đạo: Vấn Đỉnh sơ kỳ. */
export const DAO_UNLOCK_LEVEL = VAN_DINH_LEVEL;
/** Phần thưởng của nguồn Đạo so với nguồn Bản Nguyên thường (0,5 = một nửa). */
export const DAO_MUL = 0.5;

/** Đạo hợp lệ trong `meta.dao` (chuỗi lạ, nguồn đã khóa hay thiếu → không có Đạo). */
export function daoOf(meta: { dao?: unknown } | null | undefined): RootId | null {
  const v = meta?.dao;
  return isRootId(v) ? v : null;
}

/** Bản Nguyên của Đạo đã nhân `DAO_MUL` (đối tượng mới, không đụng bảng gốc); null nếu không có Đạo/nguồn. */
export function daoOrigin(def: OriginDef | null | undefined): OriginDef | null {
  if (!def) return null;
  const stat: OriginDef['stat'] = {};
  for (const [k, v] of Object.entries(def.stat) as [keyof OriginDef['stat'], number][]) stat[k] = v * DAO_MUL;
  return {
    ...def,
    ...(def.elemDmg !== undefined ? { elemDmg: def.elemDmg * DAO_MUL } : {}),
    ...(def.allDmg !== undefined ? { allDmg: def.allDmg * DAO_MUL } : {}),
    stat,
  };
}

/** Có được chọn Đạo lúc này không: đủ cấp và chưa chọn. */
export function canChooseDao(level: number, meta: { dao?: unknown } | null | undefined): boolean {
  return level >= DAO_UNLOCK_LEVEL && daoOf(meta) === null;
}

/**
 * Biến thể lĩnh vực theo nguồn Đạo (cộng vào hiệu ứng theo vai trò công pháp của lĩnh vực, nhân `domainScale`):
 * `crit` bạo kích cho chủ, `reduce` giảm sát thương nhận cho chủ và đồng đội trong vùng (lấy mức cao nhất, không cộng dồn giữa chủ),
 * `regen` hồi khí huyết mỗi giây (tỉ lệ khí huyết tối đa) cho chủ và đồng đội trong vùng. Màu vòng ở `origins.json`.
 */
export interface DomainVariant {
  crit?: number;
  reduce?: number;
  regen?: number;
}
export const DAO_DOMAIN: Readonly<Record<RootId, DomainVariant>> = {
  kim: { crit: 0.03 },
  moc: { regen: 0.003 },
  thuy: { reduce: 0.03 },
  hoa: { crit: 0.02, regen: 0.001 },
  tho: { reduce: 0.04 },
  loi: { crit: 0.025 },
};

export function domainVariant(dao: RootId | null): DomainVariant {
  return dao ? DAO_DOMAIN[dao] : {};
}

/** Nguồn Bản Nguyên của người chơi để boss kháng: Đạo nếu có, không thì linh căn. Chỉ ngũ hành có nghĩa ('' cho Lôi/không rõ). */
export function sourceElem(root: string | undefined, dao: RootId | null): Element | '' {
  const e = dao ?? root;
  return (ELEMENTS as readonly string[]).includes(e ?? '') ? (e as Element) : '';
}

/** Hình thái (hành) của boss ở pha `ph`; '' nếu không kháng ở pha này. */
export function daoForm(cfg: MonsterDao, ph: number): string {
  return cfg.forms[Math.max(0, Math.min(ph, cfg.forms.length - 1))] ?? '';
}

/** Hệ số sát thương lên quái có `dao` theo nguồn người đánh: cùng hành → `same`, khắc hành → `beat`, còn lại 1. */
export function daoResistMul(cfg: MonsterDao, ph: number, src: string): number {
  const form = daoForm(cfg, ph);
  if (!form || !src) return 1;
  if (src === form) return cfg.same;
  return ELEM_BEATS[src as Element] === form ? cfg.beat : 1;
}
