import { describe, expect, it } from 'vitest';
import { METHODS, SKILL, skillBar, stanceSkill } from '@dtl/content';
import { activeStance, barWithStance } from './stanceView';

describe('tư thế trên thanh chiêu (VS-2e)', () => {
  it('không có tin tư thế hoặc đã hết hạn thì thanh chiêu giữ nguyên', () => {
    const bar = skillBar('lac_kiem_quyet');
    expect(barWithStance(bar, null, 1000)).toEqual(bar);
    expect(barWithStance(bar, { st: { id: 'skl_ngu_kiem_tran', until: 1000 } }, 1000)).toEqual(bar);
    expect(activeStance({ st: { id: 'khong_co', until: 9e9 } }, 0)).toBeNull();
  });
  it('mỗi công pháp: đang giữ tư thế thì đúng ba ô đổi sang chiêu tư thế, các ô còn lại không đổi', () => {
    for (const m of METHODS) {
      const st = stanceSkill(m.id)!;
      const bar = skillBar(m.id);
      const now = 5000;
      const out = barWithStance(bar, { st: { id: st.id, until: now + 10_000 } }, now);
      const changed = out.filter((s, i) => s !== bar[i]);
      expect(changed.map((s) => s.id).sort(), m.id).toEqual(Object.values(st.stance!.swap).sort());
      for (const s of changed) expect(SKILL.get(s.id)?.stanceOf).toBe(st.id);
      expect(activeStance({ st: { id: st.id, until: now + 4000 } }, now)?.left).toBe(4000);
    }
  });
});
