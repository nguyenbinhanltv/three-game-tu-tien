import { describe, expect, it } from 'vitest';
import { BUDGET_MS, FrameBudget, overBudget, totalMs } from './frameBudget';

function clock() {
  let t = 0;
  return { now: () => t, adv: (ms: number) => void (t += ms) };
}

describe('FrameBudget', () => {
  it('tính thời gian giữa các mốc cho đúng hệ, trung bình và đỉnh', () => {
    const c = clock();
    const b = new FrameBudget(c.now);
    for (const render of [4, 6]) {
      b.begin();
      c.adv(1);
      b.mark('anim');
      c.adv(render);
      b.mark('render');
      b.end();
    }
    const s = b.snapshot();
    const get = (n: string) => s.find((x) => x.section === n)!;
    expect(get('anim').avg).toBe(1);
    expect(get('render').avg).toBe(5);
    expect(get('render').max).toBe(6);
    expect(totalMs(s)).toBe(6);
  });
  it('cùng hệ nhiều mốc cộng dồn; snapshot đặt lại', () => {
    const c = clock();
    const b = new FrameBudget(c.now);
    b.begin();
    c.adv(1);
    b.mark('fx');
    c.adv(2);
    b.mark('fx');
    b.end();
    expect(b.snapshot().find((x) => x.section === 'fx')!.avg).toBe(3);
    expect(b.snapshot().find((x) => x.section === 'fx')!.avg).toBe(0);
  });
  it('overBudget chỉ liệt kê hệ vượt hạn mức, nặng nhất trước', () => {
    const c = clock();
    const b = new FrameBudget(c.now);
    b.begin();
    c.adv(BUDGET_MS.anim * 2);
    b.mark('anim');
    c.adv(BUDGET_MS.render * 1.2);
    b.mark('render');
    c.adv(BUDGET_MS.ui * 0.5);
    b.mark('ui');
    b.end();
    expect(overBudget(b.snapshot()).map((s) => s.section)).toEqual(['anim', 'render']);
  });
});
