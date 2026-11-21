import { describe, expect, it } from 'vitest';
import { CRIT_MULT, ELEMENTS, originErrors, originOpen, ROOT_IDS, type OriginDef } from '@dtl/shared';
import { GLOSSARY, ORIGIN, ORIGINS, ROOT, ROOTS, t } from './index';

// Bảng linh căn trước TN-1 (roots.json): năm nguồn ngũ hành phải giữ nguyên số.
const LEGACY_ROOTS = [
  { id: 'kim', elem: 'kim', elemDmg: 0.08, stat: { critRate: 0.05 } },
  { id: 'moc', elem: 'moc', elemDmg: 0.08, stat: { healRecv: 0.05 } },
  { id: 'thuy', elem: 'thuy', elemDmg: 0.08, stat: { mpPct: 0.05 } },
  { id: 'hoa', elem: 'hoa', elemDmg: 0.08, stat: { atkPct: 0.05 } },
  { id: 'tho', elem: 'tho', elemDmg: 0.08, stat: { defPct: 0.05 } },
];

/** Phần tăng sát thương kỳ vọng của một nguồn khi `share` phần sát thương thuộc đúng hệ của nó. */
const dmgGain = (o: OriginDef, share: number) =>
  share * (o.elemDmg ?? 0) + (o.allDmg ?? 0) + (o.stat.atkPct ?? 0) + (o.stat.critRate ?? 0) * (CRIT_MULT - 1);

describe('origins.json (TN-1)', () => {
  it('hợp lệ theo luật chung; 14 nguồn chia 6 + 4 + 4 đúng bảng thuật ngữ', () => {
    expect(originErrors(ORIGINS, ELEMENTS, ROOT_IDS)).toEqual([]);
    const gl = GLOSSARY.origins as Record<string, Record<string, string>>;
    for (const g of ['real', 'void', 'special'])
      expect(
        ORIGINS.filter((o) => o.group === g).map((o) => o.id),
        g,
      ).toEqual(Object.keys(gl[g]!));
    expect(ORIGINS).toHaveLength(14);
    for (const o of ORIGINS) expect(t(`origin.${o.id}.name`), o.id).toBe(gl[o.group]![o.id]);
  });

  it('năm nguồn ngũ hành giữ đúng số của linh căn cũ; ROOTS = năm nguồn đó + Lôi (TN1-2)', () => {
    expect(ROOTS.map((r) => r.id)).toEqual([...ROOT_IDS]);
    expect(ROOTS.slice(0, 5).map(({ id, elem, elemDmg, stat }) => ({ id, elem, elemDmg, stat }))).toEqual(LEGACY_ROOTS);
    for (const r of LEGACY_ROOTS) expect(ROOT.get(r.id)).toBe(ORIGIN.get(r.id));
  });

  it('sáu nguồn Hành nguyên đã mở (có Lôi); tám nguồn còn lại khóa theo chương và chưa có thưởng', () => {
    expect(ORIGINS.filter(originOpen).map((o) => o.id)).toEqual(['kim', 'moc', 'thuy', 'hoa', 'tho', 'loi']);
    for (const o of ORIGINS.filter((x) => !originOpen(x))) {
      expect(o.chapter, o.id).toBeGreaterThanOrEqual(6);
      expect(dmgGain(o, 1), o.id).toBe(0);
    }
  });

  it('cân bằng Lôi: không trội hơn Hỏa lệch hệ, không kém Kim lệch hệ, luôn dưới nguồn ngũ hành khi đánh đúng hệ', () => {
    const loi = ORIGIN.get('loi')!;
    const g = dmgGain(loi, 0);
    expect(g).toBeLessThanOrEqual(dmgGain(ORIGIN.get('hoa')!, 0));
    expect(g).toBeGreaterThanOrEqual(dmgGain(ORIGIN.get('kim')!, 0));
    for (const id of ['kim', 'hoa']) expect(g, id).toBeLessThan(dmgGain(ORIGIN.get(id)!, 0.5));
  });
});
