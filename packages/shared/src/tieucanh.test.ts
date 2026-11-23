import { describe, expect, it } from 'vitest';
import { VAN_LAM } from './terrain';
import {
  BRIDGE_A,
  PLAYER_RADIUS,
  TC_GATE,
  TC_LOI_VACH,
  TC_ORIGIN,
  TC_POND,
  lacKiemSceneColliders,
  maxPathSlope,
  slopeDeg,
  walkableRouteLength,
  WALK_MAX_SLOPE,
  WALK_MAX_SLOPE_DEG,
} from './index';

const O = TC_ORIGIN;
const world = (p: readonly [number, number]): [number, number] => [O.x + p[0], O.z + p[1]];
const g = VAN_LAM.groundAt;
const solids = lacKiemSceneColliders();

describe('Lạc Kiếm Tông: trần độ dốc đi bộ', () => {
  it(`lối men vách dốc ≤ ${WALK_MAX_SLOPE_DEG}° (quét heightmap mỗi 0,5 m)`, () => {
    const r = maxPathSlope(g, TC_LOI_VACH.map(world));
    expect(slopeDeg(r.slope), `gắt nhất tại ${r.x.toFixed(1)}, ${r.z.toFixed(1)}`).toBeLessThanOrEqual(WALK_MAX_SLOPE_DEG);
  });

  it('lối men vách bắt đầu ở sân, kết thúc ở đầu cầu', () => {
    expect(TC_LOI_VACH[0]).toEqual([-92, 54]);
    expect(TC_LOI_VACH.at(-1)).toEqual(BRIDGE_A);
  });

  it('không vật đặc nào chắn lối men vách (chừa bán kính người + 0,3 m)', () => {
    const pts = TC_LOI_VACH.map(world);
    for (let i = 0; i + 1 < pts.length; i++) {
      const [ax, az] = pts[i]!;
      const [bx, bz] = pts[i + 1]!;
      const n = Math.ceil(Math.hypot(bx - ax, bz - az) / 0.5);
      for (let k = 0; k <= n; k++) {
        const x = ax + ((bx - ax) * k) / n;
        const z = az + ((bz - az) * k) / n;
        for (const s of solids)
          expect(Math.hypot(x - s.x, z - s.z), `vật tại ${s.x - O.x}, ${s.z - O.z}`).toBeGreaterThan(s.r + PLAYER_RADIUS + 0.3);
      }
    }
  });

  // Từ tâm tông môn tới mọi điểm nhấn phải có đường đi bộ ≤ trần độ dốc, tránh mọi vật đặc: không buộc người chơi leo dốc gắt.
  const targets: [string, [number, number]][] = [
    ['cổng bài', [TC_GATE.x, TC_GATE.z - 6]],
    ['ao sen', [TC_POND.x + 14, TC_POND.z - 6]],
    ['kiếm bia', [66, 58]],
    ['thạch lâm', [96, -8]],
    ['đầu cầu treo', [BRIDGE_A[0], BRIDGE_A[1]]],
  ];
  const blocked = (x: number, z: number) => solids.some((s) => Math.hypot(x - s.x, z - s.z) < s.r + PLAYER_RADIUS);
  for (const [name, t] of targets)
    it(`có đường đi bộ ≤ ${WALK_MAX_SLOPE_DEG}° từ tâm tông môn tới ${name}`, () => {
      const len = walkableRouteLength(g, world([0, 0]), world(t), {
        box: { x0: O.x - 200, z0: O.z - 120, x1: O.x + 200, z1: O.z + 200 },
        maxSlope: WALK_MAX_SLOPE,
        blocked,
      });
      expect(len, `không có đường tới ${name}`).not.toBeNull();
      // đường vòng không dài quá 2,2 lần đường chim bay (nếu dài hơn là buộc leo vòng vèo)
      expect(len!).toBeLessThan(Math.hypot(t[0], t[1]) * 2.2 + 20);
    });

  it('hằng số trần dốc hợp lý', () => {
    expect(WALK_MAX_SLOPE_DEG).toBeGreaterThanOrEqual(30);
    expect(WALK_MAX_SLOPE_DEG).toBeLessThanOrEqual(35);
    expect(WALK_MAX_SLOPE).toBeCloseTo(Math.tan((WALK_MAX_SLOPE_DEG * Math.PI) / 180), 6);
  });
});
