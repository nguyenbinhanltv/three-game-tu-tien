import { groundAt } from '@dtl/shared';
import { describe, expect, it } from 'vitest';
import { Cutscene, pathParam, SECT_CUTSCENE, SECT_PATH, samplePath, type Vec3 } from './cutscene';

const END_P: Vec3 = { x: 2048, y: 156.4, z: 2100 };
const END_L: Vec3 = { x: 2048, y: 151.6, z: 2088 };
const z3 = (): Vec3 => ({ x: 0, y: 0, z: 0 });

describe('đường cảnh mở đầu', () => {
  it('bắt đầu ở điểm đầu, kết thúc đúng camera người chơi', () => {
    const p = z3();
    const l = z3();
    samplePath(SECT_PATH, END_P, END_L, 0, p, l);
    expect(p).toEqual(SECT_PATH[0].p);
    samplePath(SECT_PATH, END_P, END_L, 1, p, l);
    expect(p.x).toBeCloseTo(END_P.x);
    expect(p.y).toBeCloseTo(END_P.y);
    expect(p.z).toBeCloseTo(END_P.z);
    expect(l.y).toBeCloseTo(END_L.y);
  });

  it('pathParam đơn điệu, 0→1, chậm hẳn ở cuối', () => {
    let prev = -1;
    for (let i = 0; i <= 100; i++) {
      const u = pathParam(i / 100);
      expect(u).toBeGreaterThanOrEqual(prev);
      prev = u;
    }
    expect(pathParam(0)).toBe(0);
    expect(pathParam(1)).toBe(1);
    expect(pathParam(1) - pathParam(0.98)).toBeLessThan(0.01);
  });

  it('không xuyên địa hình, nằm trên mây ở đầu cảnh, chui lọt cổng tam quan', () => {
    const p = z3();
    const l = z3();
    for (let i = 0; i <= 600; i++) {
      samplePath(SECT_PATH, END_P, END_L, i / 600, p, l);
      expect(p.y - groundAt(p.x, p.z), `u=${i / 600}`).toBeGreaterThanOrEqual(3.5);
      if (i / 600 < 0.3) expect(p.y).toBeGreaterThan(125); // mây cao nhất y≈121
      // Cổng tam quan z=2128: trụ ở x±8, xà dưới tấm biển ~156,7.
      if (p.z > 2120 && p.z < 2136) {
        expect(Math.abs(p.x - 2048)).toBeLessThan(4);
        expect(p.y).toBeLessThan(155.5);
        expect(p.y).toBeGreaterThan(151.5);
      }
      expect(p.z).toBeGreaterThan(2095); // không lọt qua chỗ lư hương/kiếm đá
    }
  });
});

describe('Cutscene', () => {
  const run = (c: Cutscene, secs: number, dt = 1 / 60): void => {
    const p = z3();
    const l = z3();
    for (let t = 0; t < secs; t += dt) c.update(dt, END_P, END_L, p, l);
  };

  it('chạy đủ thời lượng rồi tự tắt và báo kết thúc tự nhiên', () => {
    const c = new Cutscene();
    c.start();
    run(c, SECT_CUTSCENE.dur - 0.5);
    expect(c.active).toBe(true);
    run(c, 1);
    expect(c.active).toBe(false);
    expect(c.finished).toBe(true);
  });

  it('bỏ qua: tan trong 0,45 giây, không báo kết thúc tự nhiên, camera liền mạch', () => {
    const c = new Cutscene();
    c.start();
    run(c, 3);
    c.skip();
    const p = z3();
    const l = z3();
    c.update(0.016, END_P, END_L, p, l);
    const dFirst = Math.hypot(p.x - END_P.x, p.y - END_P.y, p.z - END_P.z);
    expect(dFirst).toBeGreaterThan(50); // chưa nhảy cóc về camera thường
    run(c, 0.6);
    expect(c.active).toBe(false);
    expect(c.finished).toBe(false);
  });

  it('skip khi chưa chạy là vô hại', () => {
    const c = new Cutscene();
    c.skip();
    expect(c.active).toBe(false);
  });
});
