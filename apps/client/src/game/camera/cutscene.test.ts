import { groundAt } from '@dtl/shared';
import { describe, expect, it } from 'vitest';
import {
  bossIntroPath,
  minBossDist,
  sightBlocked,
  Cutscene,
  pathParam,
  phaseShiftPath,
  SECT_CUTSCENE,
  SECT_PATH,
  samplePath,
  type Vec3,
} from './cutscene';

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

describe('đường cảnh boss (P2-B2/B3)', () => {
  const boss: Vec3 = { x: 100, y: 10, z: 100 };
  const flat = (): number => 0;

  it('xuất hiện: camera ở phía mặt boss, lệch khỏi trục nhìn, trên đất, nhìn vào boss', () => {
    // Boss nhìn về +z (yaw 0), người chơi ở phía trước-phải.
    const player: Vec3 = { x: 105, y: 10, z: 130 };
    for (const yaw of [0, 2.1, -1.3]) {
      const fx = Math.sin(yaw);
      const fz = Math.cos(yaw);
      const path = bossIntroPath(boss, yaw, 2.4, player, flat);
      expect(path).toHaveLength(2);
      for (const w of path) {
        const rx = w.p.x - boss.x;
        const rz = w.p.z - boss.z;
        expect(rx * fx + rz * fz).toBeGreaterThan(3); // phía trước mặt boss
        expect(Math.abs(rx * fz - rz * fx)).toBeGreaterThan(3); // lệch khỏi trục
        expect(w.p.y).toBeGreaterThanOrEqual(0.9);
        expect(w.look.y).toBeGreaterThan(boss.y);
      }
    }
  });

  it('cự kiếm chắn tầm nhìn thì đổi góc: không camera nào bị chắn (xuất hiện và chuyển pha)', () => {
    const player: Vec3 = { x: 100, y: 10, z: 130 };
    const base = bossIntroPath(boss, 0, 2.4, player, flat, []);
    // Đặt cột chắn đúng giữa camera đầu tiên và boss.
    const w = base[0].p;
    const pillar = [{ x: (w.x + boss.x) / 2, z: (w.z + boss.z) / 2, r: 3.4 }];
    expect(sightBlocked(w.x, w.z, boss.x, boss.z, pillar)).toBe(true);
    const moved = bossIntroPath(boss, 0, 2.4, player, flat, pillar);
    for (const m of moved) expect(sightBlocked(m.p.x, m.p.z, boss.x, boss.z, pillar)).toBe(false);
    const cam: Vec3 = { x: 100, y: 14, z: 88 };
    const p0 = phaseShiftPath(cam, boss, boss, 0, 2, flat, []);
    const q = p0[2].p;
    const pillar2 = [{ x: (q.x + boss.x) / 2, z: (q.z + boss.z) / 2, r: 3.4 }];
    const p1 = phaseShiftPath(cam, boss, boss, 0, 2, flat, pillar2);
    for (const m of p1.slice(1)) expect(sightBlocked(m.p.x, m.p.z, boss.x, boss.z, pillar2)).toBe(false);
  });

  it('vật cản sát boss (boss đứng cạnh cột) không làm kẹt việc chọn góc', () => {
    expect(sightBlocked(0, 0, 10, 0, [{ x: 10.5, z: 0, r: 3 }])).toBe(false);
    expect(minBossDist(2.8)).toBeGreaterThan(minBossDist(1));
  });

  it('chuyển pha: điểm đầu đúng camera hiện tại, điểm sau lùi xa boss và cao hơn', () => {
    const cam: Vec3 = { x: 100, y: 14, z: 112 };
    const look: Vec3 = { x: 100, y: 11, z: 100 };
    const path = phaseShiftPath(cam, look, boss, 0, 2, flat);
    expect(path[0].p).toEqual(cam);
    expect(path[0].look).toEqual(look);
    expect(path).toHaveLength(3);
  });

  it('chuyển pha: camera cuối ở phía mặt boss dù camera đang ở sau lưng, điểm giữa không xuyên thân', () => {
    // Boss nhìn về +z (yaw 0); camera đang ở sau lưng (z nhỏ hơn).
    const cam: Vec3 = { x: 100, y: 14, z: 88 };
    const path = phaseShiftPath(cam, boss, boss, 0, 2, flat);
    const last = path[path.length - 1].p;
    expect(last.z).toBeGreaterThan(boss.z + 4);
    // Điểm giữa cách boss ít nhất bán kính an toàn.
    expect(Math.hypot(path[1].p.x - boss.x, path[1].p.z - boss.z)).toBeGreaterThan(8);
    for (const w of path.slice(1)) expect(w.look.y).toBeGreaterThan(boss.y);
  });

  it('cảnh ngắn chạy hết rồi báo finished, bỏ qua thì không', () => {
    const c = new Cutscene();
    const p = z3();
    const l = z3();
    c.start(bossIntroPath(boss, 0, 2, { x: 100, y: 10, z: 130 }, flat), 2.6, 0.35);
    let n = 0;
    while (c.update(1 / 30, END_P, END_L, p, l) && n++ < 200);
    expect(c.finished).toBe(true);
    expect(n).toBeLessThan(90);
    c.start(bossIntroPath(boss, 0, 2, { x: 100, y: 10, z: 130 }, flat), 2.6, 0.35);
    c.update(0.5, END_P, END_L, p, l);
    c.skip();
    while (c.update(1 / 30, END_P, END_L, p, l) && n++ < 400);
    expect(c.finished).toBe(false);
  });
});

describe('danTranPath (E2-D)', () => {
  it('bắt đầu đúng camera hiện tại, kết thúc trên cao nhìn vào tâm vòng, không xuyên đất', async () => {
    const { danTranPath } = await import('./cutscene');
    const ground = (x: number, z: number) => 5 + Math.sin(x * 0.1) * 0.5 + z * 0;
    const cam = { x: 100, y: 12, z: 112 };
    const look = { x: 100, y: 8, z: 100 };
    const c = { x: 100, y: 5, z: 100 };
    const p = danTranPath(cam, look, c, ground);
    expect(p.length).toBe(3);
    expect(p[0].p).toEqual(cam);
    for (const w of p.slice(1)) {
      expect(w.p.y).toBeGreaterThan(ground(w.p.x, w.p.z) + 1);
      expect(Math.hypot(w.p.x - c.x, w.p.z - c.z)).toBeGreaterThan(8);
      expect(w.look.x).toBe(c.x);
      expect(w.look.z).toBe(c.z);
    }
  });
});
