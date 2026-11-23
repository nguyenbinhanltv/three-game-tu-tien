import { describe, expect, it } from 'vitest';
import {
  BRIDGE,
  cauTreoDeckY,
  bridgeModel,
  bridgeSurfaceT,
  collisionOf,
  DASH_MAX_SLOPE,
  IN_JUMP,
  planDash,
  standingY,
  type MoveState,
  stepMove,
  VAN_LAM,
  WALK_MAX_SLOPE,
} from '@dtl/shared';
import './index';

const T = VAN_LAM;
const M = bridgeModel(T.groundAt);
const col = collisionOf('van_lam');
const ctx = { canFly: false, frozen: false, speedMul: 1, terrain: T, collision: col };
const yawFor = (dx: number, dz: number) => Math.atan2(-dx, -dz);
const deckAt = (x: number, z: number) => {
  const t = bridgeSurfaceT(M, x, z, 0);
  return t === null ? null : cauTreoDeckY(M, t);
};

function mk(x: number, z: number): MoveState {
  return { x, z, y: T.groundAt(x, z), vy: 0, grounded: true, flying: false };
}
function walk(s: MoveState, dx: number, dz: number, steps: number, f = 0, mz = 1, mx = 0, onStep?: (i: number) => void) {
  for (let i = 0; i < steps; i++) {
    stepMove(s, { s: i, mx, mz, yaw: yawFor(dx, dz), f }, ctx);
    onStep?.(i);
  }
}

describe('Cầu treo Lạc Kiếm đi được (server stepMove + va chạm chung)', () => {
  it('đi từ đầu A sang đầu B trên ván: đứng đúng mặt cầu, không rơi xuống hác', () => {
    const s = mk(M.ax - M.dx * 5, M.az - M.dz * 5);
    let minAbove = Infinity;
    let atMid = -1;
    for (let i = 0; i < 2000 && Math.hypot(s.x - M.bx, s.z - M.bz) > 3; i++) {
      walk(s, M.dx, M.dz, 1);
      const t = bridgeSurfaceT(M, s.x, s.z, 0);
      if (t !== null) {
        minAbove = Math.min(minAbove, s.y - cauTreoDeckY(M, t));
        if (atMid < 0 && t > 0.5) atMid = s.y - T.groundAt(s.x, s.z);
      }
    }
    expect(Math.hypot(s.x - M.bx, s.z - M.bz)).toBeLessThanOrEqual(3);
    expect(minAbove).toBeGreaterThan(-0.2); // không bao giờ tụt xuống dưới ván
    expect(atMid).toBeGreaterThan(8); // giữa nhịp: cao hơn đáy hác nhiều mét
  });

  it('đi tới hết cầu rồi bước xuống đất ở bờ bên kia (A → B) và ngược lại (B → A)', () => {
    for (const dir of [1, -1]) {
      const start = dir > 0 ? [M.ax, M.az] : [M.bx, M.bz];
      const end = dir > 0 ? [M.bx, M.bz] : [M.ax, M.az];
      const s = mk(start[0]! - M.dx * dir * 5, start[1]! - M.dz * dir * 5);
      walk(s, M.dx * dir, M.dz * dir, 1200);
      expect(Math.hypot(s.x - end[0]!, s.z - end[1]!), `dir ${dir}`).toBeGreaterThan(5); // đã đi qua hẳn đầu cầu bên kia
      expect(Math.hypot(s.x - start[0]!, s.z - start[1]!), `dir ${dir}`).toBeGreaterThan(M.len);
      expect(bridgeSurfaceT(M, s.x, s.z, 0), 'ra khỏi cầu').toBeNull();
      expect(Math.abs(s.y - T.groundAt(s.x, s.z)), 'đứng trên đất bờ bên kia').toBeLessThan(0.6);
    }
  });

  it('lan can chặn: đi ngang hay nhảy ngang trên cầu đều không rơi xuống hác', () => {
    for (const side of [-1, 1])
      for (const f of [0, IN_JUMP]) {
        const s = mk(M.ax - M.dx * 5, M.az - M.dz * 5);
        walk(s, M.dx, M.dz, 60); // lên cầu, quanh giữa nhịp
        expect(bridgeSurfaceT(M, s.x, s.z, 0)).not.toBeNull();
        // đẩy ngang vuông góc nhịp 300 bước (nhấn nhảy liên tục nếu f)
        walk(s, M.dx, M.dz, 300, f, 0, side);
        const t = bridgeSurfaceT(M, s.x, s.z, 0.01);
        expect(t, `side ${side} f ${f}: rơi khỏi ván tại ${s.x.toFixed(1)}, ${s.z.toFixed(1)}`).not.toBeNull();
        const d = deckAt(s.x, s.z)!;
        expect(s.y - d).toBeLessThan(2.2);
        expect(s.y - d).toBeGreaterThan(-0.2);
      }
  });

  it('đứng dưới đáy hác đi ngang qua dưới cầu không bị hút lên ván', () => {
    const mx = (M.ax + M.bx) / 2;
    const mz = (M.az + M.bz) / 2;
    // đi dọc trục hác (vuông góc nhịp cầu) qua chính giữa nhịp
    const ax = -M.dz;
    const az = M.dx;
    const s = mk(mx - ax * 10, mz - az * 10);
    let maxRise = 0;
    walk(s, ax, az, 200, 0, 1, 0, () => (maxRise = Math.max(maxRise, s.y - T.groundAt(s.x, s.z))));
    expect(maxRise).toBeLessThan(0.6);
  });

  it('đoạn cầu dốc ≤ trần đi bộ và hai đầu bước lên được từ đất', () => {
    const n = 200;
    let worst = 0;
    for (let i = 0; i < n; i++) worst = Math.max(worst, Math.abs(cauTreoDeckY(M, (i + 1) / n) - cauTreoDeckY(M, i / n)) / (M.len / n));
    expect(worst).toBeLessThanOrEqual(WALK_MAX_SLOPE);
    expect(BRIDGE.lift).toBeLessThanOrEqual(0.5);
    expect(cauTreoDeckY(M, 0) - T.groundAt(M.ax, M.az)).toBeCloseTo(BRIDGE.lift, 5);
  });

  it('hác thật: đáy sâu hơn hai đầu cầu ≥ 12 m, hai đầu cầu không bị khoét', () => {
    const mid = T.groundAt((M.ax + M.bx) / 2, (M.az + M.bz) / 2);
    expect(Math.min(M.ya, M.yb) - mid).toBeGreaterThanOrEqual(12);
  });

  // Server đặt y sau dịch chuyển tức thời (né Space, lướt, đẩy lùi, thuấn di, hồi thân xác) bằng `standingY` (shared), không `groundAt` thuần.
  it('né/lướt/đẩy lùi trên cầu (dọc nhịp và vuông góc): y vẫn ở mặt ván, không rơi xuống đáy hác', () => {
    const along = { x: M.dx, z: M.dz };
    const across = { x: -M.dz, z: M.dx };
    for (const t0 of [0.3, 0.5, 0.7])
      for (const [name, dir] of [
        ['dọc +', along],
        ['dọc −', { x: -along.x, z: -along.z }],
        ['ngang +', across],
        ['ngang −', { x: -across.x, z: -across.z }],
      ] as const) {
        const x = M.ax + M.dx * M.len * t0;
        const z = M.az + M.dz * M.len * t0;
        const s: MoveState = { x, z, y: cauTreoDeckY(M, t0), vy: 0, grounded: true, flying: false };
        const plan = planDash(s, dir, 6, undefined, { terrain: T, collision: col });
        const t1 = bridgeSurfaceT(M, plan.x, plan.z, 0.01);
        expect(t1, `${name} t0=${t0}: điểm đến phải còn trên ván`).not.toBeNull();
        const y = standingY(T, col, plan.x, plan.z, s.y, plan.dist * DASH_MAX_SLOPE);
        expect(Math.abs(y - cauTreoDeckY(M, t1!)), `${name} t0=${t0}`).toBeLessThan(0.3);
        // cách cũ (heightmap thuần) rơi xuống đáy hác: chứng minh test có răng
        expect(s.y - T.groundAt(plan.x, plan.z)).toBeGreaterThan(8);
      }
  });

  it('standingY: đứng dưới đáy hác thì vẫn là mặt đất, không nhảy lên ván', () => {
    const mx = (M.ax + M.bx) / 2;
    const mz = (M.az + M.bz) / 2;
    const g = T.groundAt(mx, mz);
    expect(standingY(T, col, mx, mz, g)).toBeCloseTo(g, 5);
  });
});
