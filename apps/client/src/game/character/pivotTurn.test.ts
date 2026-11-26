import { describe, expect, it } from 'vitest';
import { PIVOT, PivotTurn, pivotBell, pivotSpeedMul } from './pivotTurn';

const DT = 1 / 60;
/** Chạy `sec` giây với hướng `h` (rad) và tốc độ `sp`; gốc quay theo hướng chạy. */
function run(p: PivotTurn, sec: number, sp: number, h: number, ok = true): boolean {
  let started = false;
  for (let i = 0; i < Math.round(sec / DT); i++) started = p.update(DT, sp, h, h, ok) || started;
  return started;
}

describe('pivotTurn: kích hoạt', () => {
  it('chạy nhanh rồi đảo ≥ 115° thì kích hoạt', () => {
    const p = new PivotTurn();
    run(p, 1, 6, 0);
    expect(run(p, DT, 6, Math.PI)).toBe(true);
    expect(p.active).toBe(true);
    expect(p.count).toBe(1);
  });
  it('rẽ 90° không phải đảo chiều', () => {
    const p = new PivotTurn();
    run(p, 1, 6, 0);
    expect(run(p, 0.5, 6, Math.PI / 2)).toBe(false);
    expect(p.active).toBe(false);
  });
  it('chạy chậm (< minSpeed) thì không kích hoạt', () => {
    const p = new PivotTurn();
    run(p, 1, 2, 0);
    expect(run(p, 0.5, 2, Math.PI)).toBe(false);
    expect(p.count).toBe(0);
  });
  it('cooldown chặn lần đảo thứ hai trong 0,55 s, hết cooldown thì được', () => {
    const p = new PivotTurn();
    run(p, 1, 6, 0);
    expect(run(p, DT, 6, Math.PI)).toBe(true);
    // Hết nhịp (0,38 s) nhưng còn cooldown: nhớ hướng mới đủ rồi đảo lại ngay vẫn bị chặn.
    run(p, PIVOT.duration + 0.02, 6, Math.PI);
    expect(p.active).toBe(false);
    expect(run(p, 0.05, 6, 0)).toBe(false);
    expect(p.count).toBe(1);
    run(p, 0.6, 6, Math.PI);
    expect(run(p, DT, 6, 0)).toBe(true);
    expect(p.count).toBe(2);
  });
});

describe('pivotTurn: kết thúc nhịp', () => {
  const rest = (p: PivotTurn) => {
    expect(p.active).toBe(false);
    expect(p.yawOffset).toBe(0);
    expect(p.dip).toBe(0);
    expect(p.lean).toBe(0);
    expect(p.twist).toBe(0);
    expect(p.arm).toBe(0);
    expect(p.speedMul).toBe(1);
  };
  it('giữa nhịp có hiệu ứng; hết nhịp mọi trường về trạng thái nghỉ', () => {
    const p = new PivotTurn();
    run(p, 1, 6, 0);
    p.update(DT, 6, Math.PI, 0); // gốc chưa quay: thân lệch hướng
    for (let i = 0; i < 12; i++) p.update(DT, 6, Math.PI, Math.PI * Math.min(1, i / 8));
    expect(p.active).toBe(true);
    expect(p.dip).toBeGreaterThan(0);
    expect(p.speedMul).toBeLessThan(1);
    run(p, PIVOT.duration + 0.05, 6, Math.PI);
    rest(p);
  });
  it('yawOffset tiến về 0 theo nhịp khi gốc đã quay', () => {
    const p = new PivotTurn();
    run(p, 1, 6, 0);
    p.update(DT, 6, Math.PI, 0);
    for (let i = 0; i < 6; i++) p.update(DT, 6, Math.PI, Math.PI);
    expect(Math.abs(p.yawOffset)).toBeGreaterThan(1);
    const abs: number[] = [];
    for (let i = 0; i < 18 && p.active; i++) {
      p.update(DT, 6, Math.PI, Math.PI);
      abs.push(Math.abs(p.yawOffset));
    }
    expect(abs[abs.length - 1]!).toBeLessThan(abs[0]!);
  });
  it('ok=false giữa nhịp thì kết thúc ngay', () => {
    const p = new PivotTurn();
    run(p, 1, 6, 0);
    run(p, 0.1, 6, Math.PI);
    expect(p.active).toBe(true);
    p.update(DT, 6, Math.PI, Math.PI, false);
    rest(p);
  });
  it('tốc độ < holdSpeed giữa nhịp thì kết thúc ngay', () => {
    const p = new PivotTurn();
    run(p, 1, 6, 0);
    run(p, 0.1, 6, Math.PI);
    expect(p.active).toBe(true);
    p.update(DT, PIVOT.holdSpeed - 0.1, Math.PI, Math.PI);
    rest(p);
  });
  it('reset quên hướng nhớ: không đảo chiều giả ngay sau đó', () => {
    const p = new PivotTurn();
    run(p, 1, 6, 0);
    p.reset();
    expect(run(p, DT * 3, 6, Math.PI)).toBe(false);
    expect(p.count).toBe(0);
  });
});

describe('pivotBell / pivotSpeedMul', () => {
  it('chuông: 0 ở hai đầu và ngoài [0, 1], 1 ở đỉnh', () => {
    expect(pivotBell(0, 0.3)).toBe(0);
    expect(pivotBell(1, 0.3)).toBe(0);
    expect(pivotBell(-0.2, 0.3)).toBe(0);
    expect(pivotBell(1.4, 0.3)).toBe(0);
    expect(pivotBell(0.3, 0.3)).toBeCloseTo(1);
  });
  it('hệ số tốc độ: 1 ở biên, tụt tới `slow` ở giữa', () => {
    expect(pivotSpeedMul(0)).toBe(1);
    expect(pivotSpeedMul(1)).toBe(1);
    expect(pivotSpeedMul(0.3)).toBeCloseTo(PIVOT.slow);
    expect(pivotSpeedMul(0.3, 0.5)).toBeCloseTo(0.5);
  });
});
