// Linh ngọc: bảng chỉ số, id, tách id, dòng chỉ số cộng vào món. Tách khỏi upgrade.ts để items.ts dùng `gemAffixes` mà upgrade.ts
// (cần items.ts) không phải import vòng. upgrade.ts re-export nên API công khai không đổi.

import { at } from './arr';
import { ELEMENTS, type Element } from './elements';
import type { AffixRoll, AffixStat } from './itemtypes';

export const GEM_TIERS = 3;
/** Số ngọc cùng cấp ghép thành một ngọc cấp trên. */
export const GEM_MERGE_COUNT = 3;

/** Mỗi hệ: dòng chính của ngọc theo cấp 1..3. Mọi ngọc còn cộng thêm sát thương theo hệ của nó (`GEM_ELEM_DMG`). */
export const GEM_STATS: Record<Element, { stat: AffixStat; v: readonly [number, number, number] }> = {
  kim: { stat: 'atk_pct', v: [0.02, 0.035, 0.05] },
  moc: { stat: 'hp_pct', v: [0.03, 0.05, 0.08] },
  thuy: { stat: 'mp_pct', v: [0.03, 0.05, 0.08] },
  hoa: { stat: 'crit_dmg', v: [0.04, 0.07, 0.1] },
  tho: { stat: 'def_pct', v: [0.02, 0.035, 0.05] },
};
export const GEM_ELEM_DMG: readonly [number, number, number] = [0.01, 0.02, 0.03];

export function gemId(elem: Element, tier: number): string {
  return `gem_${elem}_${tier}`;
}

export function allGemIds(): string[] {
  const out: string[] = [];
  for (const e of ELEMENTS) for (let t = 1; t <= GEM_TIERS; t++) out.push(gemId(e, t));
  return out;
}

/** Tách id ngọc; null nếu không phải ngọc hợp lệ. */
export function parseGem(id: unknown): { elem: Element; tier: number } | null {
  if (typeof id !== 'string') return null;
  const m = /^gem_([a-z]+)_([1-9])$/.exec(id);
  if (!m) return null;
  const elem = (ELEMENTS as readonly string[]).includes(m[1] ?? '') ? (m[1] as Element) : null;
  const tier = Number(m[2]);
  return elem && tier >= 1 && tier <= GEM_TIERS ? { elem, tier } : null;
}

/** Các dòng chỉ số một viên ngọc cộng vào món được khảm (cùng dạng dòng phụ nên tính chung với `computePlayerStats`). */
export function gemAffixes(id: string): AffixRoll[] {
  const g = parseGem(id);
  if (!g) return [];
  const main = GEM_STATS[g.elem];
  return [
    { id: main.stat, v: at(main.v, g.tier - 1, 'GEM_STATS.v') },
    { id: 'elem_dmg', p: g.elem, v: at(GEM_ELEM_DMG, g.tier - 1, 'GEM_ELEM_DMG') },
  ];
}
