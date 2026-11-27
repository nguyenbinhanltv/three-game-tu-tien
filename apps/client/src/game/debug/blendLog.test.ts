import { describe, expect, it } from 'vitest';
import { BlendLog } from './blendLog';

const FRAME = 1000 / 60;

/** Crossfade tuyến tính từ `a` sang `b` trong `ms`, bắt đầu ở `t0`; trả thời điểm kết thúc. */
function fade(log: BlendLog, a: string, b: string, t0: number, ms: number, spin = 0): number {
  const n = Math.max(1, Math.round(ms / FRAME));
  for (let i = 1; i <= n; i++) {
    const k = i / n;
    log.push(t0 + i * FRAME, [
      { name: a, w: 1 - k },
      { name: b, w: k },
    ], spin);
  }
  return t0 + n * FRAME;
}

describe('BlendLog (nhật ký chuyển clip)', () => {
  it('crossfade 200 ms: ghi thời gian tới lúc clip mới trội hẳn, không báo đổi cứng', () => {
    const log = new BlendLog();
    for (let i = 0; i < 10; i++) log.push(i * FRAME, [{ name: 'Idle', w: 1 }]);
    fade(log, 'Idle', 'Jog_Fwd', 10 * FRAME, 200, 300);
    expect(log.rows).toHaveLength(1);
    const r = log.rows[0]!;
    expect(r).toMatchObject({ from: 'Idle', to: 'Jog_Fwd', spin: 300 });
    // Clip mới xuất hiện ở khung đầu của đoạn chuyển và đạt 0,9 sau khoảng 90% của 200 ms.
    expect(r.ms).toBeGreaterThan(140);
    expect(r.ms).toBeLessThan(200);
    expect(r.pop).toBeLessThan(0.15);
    expect(log.current).toBe('Jog_Fwd');
  });

  it('đổi cứng trong một khung: 0 ms, bước nhảy trọng số bằng 1', () => {
    const log = new BlendLog();
    log.push(0, [{ name: 'Idle', w: 1 }]);
    log.push(FRAME, [{ name: 'Hit_Chest', w: 1 }]);
    expect(log.rows).toEqual([{ from: 'Idle', to: 'Hit_Chest', at: FRAME, ms: 0, pop: 1, spin: 0, bone: '' }]);
  });

  it('trọng số chưa chuẩn hóa (three chia theo tổng) vẫn cho cùng kết quả; action trùng tên được cộng', () => {
    const log = new BlendLog();
    log.push(0, [{ name: 'Idle', w: 0.5 }]);
    log.push(FRAME, [
      { name: 'Idle', w: 0.25 },
      { name: 'Walk', w: 0.125 },
      { name: 'Walk', w: 0.125 },
    ]);
    log.push(2 * FRAME, [
      { name: 'Idle', w: 0.02 },
      { name: 'Walk', w: 0.2 },
      { name: 'Walk', w: 0.2 },
    ]);
    expect(log.rows).toHaveLength(1);
    expect(log.rows[0]).toMatchObject({ from: 'Idle', to: 'Walk', pop: 0.5 });
  });

  it('clip đang chuyển tới bị bỏ giữa chừng: tính tiếp từ clip gốc sang clip trội mới', () => {
    const log = new BlendLog();
    log.push(0, [{ name: 'Idle', w: 1 }]);
    log.push(FRAME, [
      { name: 'Idle', w: 0.7 },
      { name: 'Walk', w: 0.3 },
    ]);
    // Đổi ý: Walk tắt, Dodge lên thay.
    log.push(2 * FRAME, [
      { name: 'Idle', w: 0.5 },
      { name: 'Dodge', w: 0.5 },
    ]);
    log.push(3 * FRAME, [{ name: 'Dodge', w: 1 }]);
    expect(log.rows.map((r) => `${r.from}>${r.to}`)).toEqual(['Idle>Dodge']);
  });

  it('clip đi/chạy trộn theo tốc độ đổi trọng số qua lại không tính là chuyển; clip dừng lên thay mới tính, đo từ lúc nó bắt đầu lên', () => {
    const log = new BlendLog();
    let t = 0;
    log.push(t, [{ name: 'Run', w: 0.6 }, { name: 'Sprint', w: 0.4 }]);
    for (let i = 0; i < 30; i++) {
      t += FRAME;
      const k = 0.5 + 0.1 * Math.sin(i / 3);
      log.push(t, [{ name: 'Run', w: k }, { name: 'Sprint', w: 1 - k }]);
    }
    expect(log.rows).toHaveLength(0);
    // Clip dừng lên trong 4 khung, clip chạy bị hạ về 0 cùng lúc.
    const t0 = t;
    for (let i = 1; i <= 4; i++) {
      t += FRAME;
      const k = i / 4;
      log.push(t, [{ name: 'Run', w: 0.55 * (1 - k) }, { name: 'Sprint', w: 0.45 * (1 - k) }, { name: 'Stop', w: k }], i === 2 ? 700 : 300, i === 2 ? 'thigh_l' : 'head');
    }
    expect(log.rows).toHaveLength(1);
    const r = log.rows[0]!;
    expect(r.to).toBe('Stop');
    expect(r.at).toBeCloseTo(t0 + FRAME, 6);
    expect(r.ms).toBeGreaterThan(15);
    expect(r.ms).toBeLessThan(55);
    expect(r.pop).toBeLessThan(0.5);
    expect(r.spin).toBe(700);
    expect(r.bone).toBe('thigh_l');
  });

  it('chuỗi đứng → chạy → dừng ghi đủ hai lần chuyển; khung không có clip nào thì bỏ qua', () => {
    const log = new BlendLog();
    log.push(0, [{ name: 'Idle', w: 1 }]);
    let t = fade(log, 'Idle', 'Jog_Fwd', 0, 150);
    log.push(t + FRAME, []);
    t = fade(log, 'Jog_Fwd', 'Idle', t + FRAME, 250);
    expect(log.rows.map((r) => `${r.from}>${r.to}`)).toEqual(['Idle>Jog_Fwd', 'Jog_Fwd>Idle']);
    expect(log.rows[1]!.ms).toBeGreaterThan(log.rows[0]!.ms);
  });
});
