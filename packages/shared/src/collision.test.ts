import { describe, expect, it } from 'vitest';
import { CollisionSet, type Shape, STEP_UP } from './collision';
import { IN_FLY, IN_JUMP, IN_UP, type MoveInput, type MoveState, PLAYER_RADIUS, stepMove } from './movement';
import { registerTerrain, type Terrain } from './terrain';
import { VAN_LAM_TERRAIN } from './level';

// Địa hình thử riêng (id khác) để không làm bẩn bộ va chạm của level thật.
const T: Terrain = registerTerrain({ ...VAN_LAM_TERRAIN, id: 'col_test', colliders: [] });
const X = 2048;
const Z = 2040; // sân tông môn, phẳng
const G = T.groundAt(X, Z);

function fresh(x = X, z = Z): MoveState {
  return { x, y: T.groundAt(x, z), z, vy: 0, grounded: true, flying: false };
}
const ctx = { canFly: true, frozen: false, speedMul: 1, terrain: T };
let seq = 0;
const inp = (mx: number, mz: number, f = 0): MoveInput => ({ s: ++seq, mx, mz, yaw: 0, f });
/** Đi tiến (-z) n bước. */
function walk(s: MoveState, n: number, f = 0): void {
  for (let i = 0; i < n; i++) stepMove(s, inp(0, 1, f), ctx);
}
function setup(shapes: Shape[]): void {
  T.collision.clear();
  T.collision.add(shapes);
}

describe('va chạm 3D', () => {
  it('đâm vào tường hộp xoay thì dừng trước mặt tường', () => {
    setup([{ k: 'box', x: X, z: Z - 10, hx: 4, hz: 0.5, yaw: 0, y0: G - 1, y1: G + 6 }]);
    const s = fresh();
    walk(s, 60);
    expect(s.z).toBeGreaterThanOrEqual(Z - 10 + 0.5 + PLAYER_RADIUS - 1e-6);
    expect(s.z).toBeLessThan(Z - 10 + 0.5 + PLAYER_RADIUS + 0.2);
  });

  it('tường xoay 45° vẫn chặn, trượt dọc mép', () => {
    setup([{ k: 'box', x: X, z: Z - 10, hx: 6, hz: 0.4, yaw: Math.PI / 4, y0: G - 1, y1: G + 5 }]);
    const s = fresh(X, Z - 6);
    walk(s, 80);
    // không xuyên: khoảng cách từ tâm tới trục tường (theo pháp tuyến) ≥ hz + r
    const dx = s.x - X;
    const dz = s.z - (Z - 10);
    const n = -dx * Math.sin(Math.PI / 4) + dz * Math.cos(Math.PI / 4);
    expect(Math.abs(n)).toBeGreaterThanOrEqual(0.4 + PLAYER_RADIUS - 1e-3);
  });

  it('thân cây (trụ) chặn đi bộ', () => {
    setup([{ k: 'cyl', x: X, z: Z - 8, r: 0.6, y0: G - 0.5, y1: G + 8 }]);
    const s = fresh();
    walk(s, 60);
    expect(Math.hypot(s.x - X, s.z - (Z - 8))).toBeGreaterThanOrEqual(0.6 + PLAYER_RADIUS - 1e-6);
  });

  it('leo chuỗi bậc cao 0,4 m mỗi bậc, rồi đứng trên bệ', () => {
    const steps: Shape[] = [];
    for (let i = 0; i < 6; i++)
      steps.push({ k: 'box', x: X, z: Z - 6 - i * 1.2, hx: 3, hz: 0.6, yaw: 0, y0: G - 1, y1: G + 0.4 * (i + 1) });
    steps.push({ k: 'box', x: X, z: Z - 18, hx: 6, hz: 6, yaw: 0, y0: G - 1, y1: G + 2.4 });
    setup(steps);
    const s = fresh();
    walk(s, 60);
    expect(s.y).toBeCloseTo(G + 2.4, 3);
    expect(s.grounded).toBe(true);
  });

  it('bậc cao hơn 0,5 m chặn đi bộ (không nhảy-leo vách 2 m)', () => {
    setup([{ k: 'box', x: X, z: Z - 6, hx: 3, hz: 3, yaw: 0, y0: G - 1, y1: G + 2 }]);
    const s = fresh();
    walk(s, 60);
    expect(s.y).toBeCloseTo(G, 3);
    expect(s.z).toBeGreaterThan(Z - 6 + 3);
    // nhảy liên tục cũng không lên được (nhảy cao ~1,5 m)
    for (let i = 0; i < 100; i++) stepMove(s, inp(0, 1, IN_JUMP), ctx);
    expect(s.y).toBeLessThan(G + 1.7);
    expect(s.z).toBeGreaterThan(Z - 6 + 3);
  });

  it('dốc/cầu: đi lên mặt nghiêng cao dần', () => {
    setup([{ k: 'box', x: X, z: Z - 12, hx: 2, hz: 10, yaw: 0, y0: G - 2, y1: G + 6, y1b: G }]);
    // -z cục bộ = đầu thấp? y1 ở mép -z (G+6), y1b ở mép +z (G): đi từ +z (thấp) sang -z (cao).
    const s = fresh(X, Z - 1);
    walk(s, 40);
    expect(s.y).toBeGreaterThan(G + 1);
  });

  it('đứng trên đảo bay (y0 cao) và bị chặn từ dưới; ngã khi rơi khỏi mép', () => {
    setup([{ k: 'box', x: X, z: Z - 10, hx: 5, hz: 5, yaw: 0, y0: G + 30, y1: G + 34 }]);
    const s = fresh(X, Z - 10);
    // đứng dưới gầm đảo: nhảy không xuyên đáy
    for (let i = 0; i < 40; i++) stepMove(s, inp(0, 0, i === 0 ? IN_JUMP : 0), ctx);
    expect(s.y).toBeLessThan(G + 3);
    // ngự kiếm lên từ dưới: đội đầu vào đáy, không xuyên
    for (let i = 0; i < 200; i++) stepMove(s, inp(0, 0, IN_FLY | IN_UP), ctx);
    expect(s.y + 1.8).toBeLessThanOrEqual(G + 30 + 1e-6);
    // bay vòng ra ngoài rồi đáp lên đỉnh
    const t = { x: X, y: G + 40, z: Z - 10, vy: 0, grounded: false, flying: true };
    for (let i = 0; i < 60; i++) stepMove(t, inp(0, 0, IN_FLY), ctx);
    for (let i = 0; i < 60; i++) stepMove(t, inp(0, 0, 0), ctx); // tắt bay: rơi
    expect(t.y).toBeCloseTo(G + 34, 3);
    expect(t.grounded).toBe(true);
    // đi ra khỏi mép: rơi xuống đất
    for (let i = 0; i < 100; i++) stepMove(t, inp(0, 1, 0), ctx);
    for (let i = 0; i < 100; i++) stepMove(t, inp(0, 0, 0), ctx);
    expect(t.y).toBeCloseTo(T.groundAt(t.x, t.z), 3);
  });

  it('ngự kiếm xuyên tán lá (pass) nhưng bị tường chặn', () => {
    setup([
      { k: 'cyl', x: X, z: Z - 10, r: 3, y0: G + 3, y1: G + 9, fly: 'pass' },
      { k: 'box', x: X, z: Z - 20, hx: 6, hz: 0.5, yaw: 0, y0: G - 1, y1: G + 20 },
    ]);
    const s = { x: X, y: G + 5, z: Z, vy: 0, grounded: false, flying: true };
    for (let i = 0; i < 20; i++) stepMove(s, inp(0, 1, IN_FLY), ctx);
    expect(s.z).toBeLessThan(Z - 10); // đã bay qua tán
    for (let i = 0; i < 60; i++) stepMove(s, inp(0, 1, IN_FLY), ctx);
    expect(s.z).toBeGreaterThanOrEqual(Z - 20 + 0.5 + PLAYER_RADIUS - 1e-6);
  });

  it('lưới băm: truy vấn hình dài/xoay chỉ trả hình lân cận một lần', () => {
    const c = new CollisionSet();
    c.add([{ k: 'box', x: 100, z: 100, hx: 40, hz: 1, yaw: 0.3, y0: 0, y1: 5 }]);
    let n = 0;
    c.near(100, 100, 30, () => n++);
    expect(n).toBe(1);
    n = 0;
    c.near(500, 500, 5, () => n++);
    expect(n).toBe(0);
    expect(c.standY(100, 100, 5 + STEP_UP)).toBe(5);
  });

  it('ngự kiếm bay thẳng lên xuyên tán lá (fly:pass) nhưng đội đầu vào đáy khối chặn', () => {
    setup([
      { k: 'cyl', x: X, z: Z, r: 3, y0: G + 4, y1: G + 9, fly: 'pass' },
      { k: 'box', x: X + 20, z: Z, hx: 3, hz: 3, yaw: 0, y0: G + 30, y1: G + 34 },
    ]);
    const s = { x: X, y: G + 1.6, z: Z, vy: 0, grounded: false, flying: true };
    for (let i = 0; i < 60; i++) stepMove(s, inp(0, 0, IN_FLY | IN_UP), ctx);
    expect(s.y).toBeGreaterThan(G + 12);
    const t = { x: X + 20, y: G + 1.6, z: Z, vy: 0, grounded: false, flying: true };
    for (let i = 0; i < 60; i++) stepMove(t, inp(0, 0, IN_FLY | IN_UP), ctx);
    expect(t.y + 1.8).toBeLessThanOrEqual(G + 30 + 1e-6);
  });

  it('bộ đếm stamp quấn Int32 không làm truy vấn lặp hình', () => {
    const c = new CollisionSet();
    c.add([{ k: 'box', x: 100, z: 100, hx: 40, hz: 1, yaw: 0, y0: 0, y1: 5 }]);
    (c as unknown as { stamp: number }).stamp = 2147483646;
    for (let k = 0; k < 4; k++) {
      let n = 0;
      c.near(100, 100, 30, () => n++);
      expect(n).toBe(1);
    }
    c.clear();
    expect((c as unknown as { stamp: number }).stamp).toBe(0);
  });

  it('level blockRise: cầu hộp bắc qua mép vách đảo vẫn đi được, không rơi xuyên', () => {
    const IS = registerTerrain({
      ...VAN_LAM_TERRAIN,
      id: 'col_rise',
      colliders: [],
      features: [],
      biomes: [],
      islands: [{ x: 2048, z: 2048, r: 20, edge: 6, y: 200 }],
      voidFloor: 100,
    });
    expect(IS.blockRise).toBe(true);
    const ic = { canFly: false, frozen: false, speedMul: 1, terrain: IS };
    IS.collision.clear();
    // Sàn cầu phẳng ở cao độ mặt đảo, nhô ra khỏi mép đảo trên vực.
    IS.collision.add([{ k: 'box', x: 2048 + 45, z: 2048, hx: 30, hz: 2, yaw: 0, y0: 199, y1: 200.2 }]);
    const s: MoveState = { x: 2048 + 8, y: IS.groundAt(2048 + 8, 2048), z: 2048, vy: 0, grounded: true, flying: false };
    for (let i = 0; i < 90; i++) stepMove(s, { s: i, mx: 0, mz: 1, yaw: -Math.PI / 2, f: 0 }, ic);
    expect(s.x).toBeGreaterThan(2048 + 35);
    expect(s.y).toBeCloseTo(200.2, 2);
    expect(s.grounded).toBe(true);
  });
});
