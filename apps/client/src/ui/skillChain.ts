// Dòng tooltip của chuỗi chiêu (VS-2b): đọc `chain` từ dữ liệu chiêu, không mang luật (server phán định).
import { chainBonus, chainMp, type SkillDef } from '@dtl/shared';
import { t } from '@dtl/content';

export interface TipLine {
  text: string;
  tone?: 'good' | 'bad' | 'dim' | 'set';
}

/** Số thập phân kiểu Việt: 1.25 → "1,25". */
const vi = (x: number) => String(Math.round(x * 100) / 100).replace('.', ',');
const pctOff = (mul: number) => Math.round((1 - mul) * 100);

/** Phần thưởng của chuỗi thành chữ: "hiệu quả ×1,5, linh lực −30%". */
export function chainBonusText(sk: SkillDef): string {
  if (!sk.chain) return '';
  const b = chainBonus(sk.chain);
  const parts: string[] = [];
  if (b.powerMul !== 1) parts.push(t('ui.skill.chain.power', { x: vi(b.powerMul) }));
  if (b.mpMul !== 1) parts.push(t('ui.skill.chain.mp', { p: pctOff(b.mpMul) }));
  if (b.cdMul !== 1) parts.push(t('ui.skill.chain.cd', { p: pctOff(b.cdMul) }));
  return parts.join(', ');
}

/**
 * Dòng tooltip cho chiêu có chuỗi. `open`: cửa sổ đang mở (server báo qua tin `cd`). Chiêu không có chuỗi trả mảng rỗng.
 * `after` hiện tên các chiêu mở chuỗi, cách nhau bằng "hoặc".
 */
export function chainLines(sk: SkillDef, open: boolean): TipLine[] {
  const ch = sk.chain;
  if (!ch) return [];
  const after = ch.after.map((id) => t(`skill.${id}.name`)).join(t('ui.skill.chain.or'));
  const line: TipLine = { text: t('ui.skill.chain', { n: vi(ch.window), after, bonus: chainBonusText(sk) }) };
  return open
    ? [
        { text: t('ui.skill.chain.open'), tone: 'good' },
        { ...line, tone: 'good' },
      ]
    : [line];
}

/** Linh lực chiêu tốn lúc này: cửa sổ chuỗi đang mở thì theo thưởng chuỗi. */
export function skillMpNow(sk: SkillDef, open: boolean): number {
  return open && sk.chain ? chainMp(sk.mp, chainBonus(sk.chain)) : sk.mp;
}
