// Tư thế phía client (VS-2e): đọc tin `mth` của server để biết đang giữ tư thế nào và đổi ô trên thanh chiêu. Hàm thuần.
import { stanceActive, stanceBar, type MethodMsg, type SkillDef } from '@dtl/shared';
import { SKILL } from '@dtl/content';

/** Chiêu tư thế đang giữ và số ms còn lại theo giờ server `serverNow`; null nếu không ở tư thế nào. */
export function activeStance(
  method: Pick<MethodMsg, 'st'> | null | undefined,
  serverNow: number,
): { skill: SkillDef; left: number } | null {
  const st = method?.st;
  if (!stanceActive(st, serverNow)) return null;
  const skill = SKILL.get(st.id);
  return skill?.stance ? { skill, left: st.until - serverNow } : null;
}

/** Thanh chiêu sau khi áp tư thế đang giữ (không ở tư thế thì trả nguyên). */
export function barWithStance(bar: readonly SkillDef[], method: Pick<MethodMsg, 'st'> | null | undefined, serverNow: number): SkillDef[] {
  const a = activeStance(method, serverNow);
  return a ? stanceBar(bar, a.skill.stance, (id) => SKILL.get(id)) : [...bar];
}
