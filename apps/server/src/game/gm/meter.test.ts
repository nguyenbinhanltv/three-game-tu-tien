import { describe, expect, it } from 'vitest';
import { DpsMeter, METER_DOT, METER_OTHER } from './meter';

describe('đồng hồ sát thương phòng tập', () => {
  it('không có lần đo thì không ghi gì', () => {
    const m = new DpsMeter<object>();
    const p = {};
    m.cast(p, 'skl_a');
    m.hit(p, 1000, 'm1', 'mon_x', 500, 100, false, false);
    m.kill(p, 2000, 'm1');
    expect(m.active(p)).toBe(false);
    expect(m.report(p)).toBeNull();
    expect(m.drain(p)).toEqual([]);
  });

  it('cộng dồn theo chiêu, tính DPS từ đòn đầu tới đòn cuối, tách sát thương theo thời gian', () => {
    const m = new DpsMeter<object>();
    const p = {};
    m.start(p, 0);
    m.hit(p, 500, 'm1', 'mon_x', 1000, 50, false, false); // chưa ra chiêu nào
    m.cast(p, 'skl_a');
    m.hit(p, 1000, 'm1', 'mon_x', 1000, 100, true, false);
    m.hit(p, 2000, 'm1', 'mon_x', 1000, 100, false, false);
    m.cast(p, 'skl_b');
    m.hit(p, 4500, 'm1', 'mon_x', 1000, 300, false, false);
    m.hit(p, 4500, 'm1', 'mon_x', 1000, 50, false, true); // độc
    m.hit(p, 4600, 'm1', 'mon_x', 1000, 0, false, false); // miễn: bỏ qua
    const r = m.report(p)!;
    expect(r.total).toBe(600);
    expect(r.hits).toBe(5);
    expect(r.secs).toBe(4);
    expect(r.dps).toBe(150);
    expect(r.critRate).toBeCloseTo(0.2);
    expect(r.skills.map((s) => s.id)).toEqual(['skl_b', 'skl_a', METER_OTHER, METER_DOT]);
    expect(r.skills[0]!.share).toBeCloseTo(0.5);
    expect(r.skills[1]).toMatchObject({ dmg: 200, hits: 2, crits: 1 });
    // Mục tiêu đang đánh dở: ước thời gian hạ = máu tối đa / DPS.
    expect(r.est).toEqual({ def: 'mon_x', mhp: 1000, secs: 1000 / 150 });
  });

  it('thời gian hạ tính từ đòn đầu lên từng con; drain trả mỗi lần hạ đúng một lần', () => {
    const m = new DpsMeter<object>();
    const p = {};
    m.start(p, 0);
    m.hit(p, 1000, 'm1', 'mon_x', 300, 300, false, false);
    m.hit(p, 2000, 'm2', 'mon_x', 300, 100, false, false);
    m.kill(p, 4000, 'm1');
    m.kill(p, 7000, 'm2');
    m.kill(p, 7000, 'm3'); // con mình chưa đánh: không tính
    expect(m.drain(p)).toEqual([
      { def: 'mon_x', ttk: 3 },
      { def: 'mon_x', ttk: 5 },
    ]);
    expect(m.drain(p)).toEqual([]);
    const r = m.report(p)!;
    expect(r.kills).toEqual([{ def: 'mon_x', n: 2, avg: 4, min: 3, max: 5 }]);
    expect(r.targets).toBe(2);
    expect(r.est).toBeUndefined();
  });

  it('một đòn duy nhất: thời lượng tối thiểu 1 giây; start lại thì về 0; stop thì hết đo', () => {
    const m = new DpsMeter<object>();
    const p = {};
    m.start(p, 0);
    m.hit(p, 100, 'm1', 'mon_x', 300, 80, false, false);
    expect(m.report(p)!.dps).toBe(80);
    m.start(p, 200);
    expect(m.report(p)).toMatchObject({ total: 0, dps: 0, secs: 0, hits: 0 });
    m.stop(p);
    expect(m.report(p)).toBeNull();
  });
});
