// Chú giải chiêu (Chân Cảnh U4): sát thương, tầm, hình vùng, nhánh công pháp. Hàm thuần, chỉ đọc dữ liệu chiêu và công kích
// server đã gửi cho mình; sát thương thật do server tính (trừ giáp, dao động ±10%, bạo kích).
import type { ResolvedSkill, SkillDef } from '@dtl/shared';
import { METHOD, t } from '@dtl/content';
import type { TipLine } from './skillChain';

/** Hình vùng chiêu trên sàn, đơn vị mét, người ra chiêu ở gốc nhìn lên. */
export type SkillShape =
  | { k: 'single'; range: number }
  | { k: 'circle'; range: number; r: number; self: boolean }
  | { k: 'line'; len: number; width: number }
  | { k: 'dash'; dist: number; width: number };

const DAMAGE_KINDS = new Set(['damage', 'aoe', 'line']);

export function skillShape(sk: SkillDef, rs?: Pick<ResolvedSkill, 'radius'>): SkillShape | null {
  const r = rs?.radius ?? sk.radius;
  if (sk.line) return { k: 'line', len: sk.line.len, width: sk.line.width };
  if (sk.kind === 'dash' && sk.dash) return { k: 'dash', dist: sk.dash.dist, width: sk.dash.pierce ? sk.dash.pierce.r * 2 : 1 };
  if (sk.kind === 'aoe' && r) return { k: 'circle', range: sk.self ? 0 : sk.range, r, self: !!sk.self };
  if (sk.kind === 'damage' && sk.range > 0) return { k: 'single', range: sk.range };
  if (sk.kind === 'taunt' && r) return { k: 'circle', range: 0, r, self: true };
  return null;
}

const vi = (x: number) => String(Math.round(x * 10) / 10).replace('.', ',');

/** Sát thương mỗi nhát ước tính = công × hệ số (chưa trừ giáp mục tiêu). */
export function hitDamages(rs: Pick<ResolvedSkill, 'hits' | 'power'>, atk: number): number[] {
  const hits = rs.hits.length ? rs.hits : [rs.power];
  return hits.map((h) => Math.max(1, Math.round(atk * h)));
}

/** Dòng chỉ số của chú giải: sát thương, hồi, tầm, vùng, nhánh. Không gồm hồi chiêu/linh lực (đã có ở `useSkillView`). */
export function skillStatLines(sk: SkillDef, rs: ResolvedSkill, atk: number): TipLine[] {
  const lines: TipLine[] = [];
  if (DAMAGE_KINDS.has(sk.kind) || (sk.kind === 'dash' && rs.power > 0)) {
    const d = hitDamages(rs, atk);
    const text =
      d.length > 1 ? t('ui.skill.dmg_multi', { n: d.length, min: Math.min(...d), max: Math.max(...d) }) : t('ui.skill.dmg', { n: d[0]! });
    lines.push({ text, tone: 'good' });
  } else if (['hot', 'revive', 'shield'].includes(sk.kind) && rs.power > 0) {
    lines.push({
      text: t(sk.kind === 'shield' ? 'ui.skill.shield_pct' : 'ui.skill.heal_pct', { p: Math.round(rs.power * 100) }),
      tone: 'good',
    });
  }
  if (sk.range > 0 && !sk.self) lines.push({ text: t('ui.skill.range', { n: vi(sk.range) }) });
  const sh = skillShape(sk, rs);
  if (sh?.k === 'circle') lines.push({ text: t(sh.self ? 'ui.skill.area_self' : 'ui.skill.area_circle', { n: vi(sh.r) }) });
  else if (sh?.k === 'line') lines.push({ text: t('ui.skill.area_line', { len: vi(sh.len), w: vi(sh.width) }) });
  else if (sh?.k === 'dash') lines.push({ text: t('ui.skill.area_dash', { n: vi(sh.dist) }) });
  const b = branchOfSkill(sk);
  if (b) lines.push({ text: t('ui.skill.branch', { name: t(`branch.${b.m}.${b.b}.name`) }), tone: 'set' });
  return lines;
}

/** Nhánh công pháp (VS-2d) cấp chiêu này, nếu có. */
export function branchOfSkill(sk: SkillDef): { m: string; b: string } | null {
  const m = sk.method ? METHOD.get(sk.method) : undefined;
  const b = m?.branches.find((x) => x.grants.includes(sk.id));
  return m && b ? { m: m.id, b: b.id } : null;
}
