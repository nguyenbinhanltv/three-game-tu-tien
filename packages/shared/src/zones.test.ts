import { describe, expect, it } from 'vitest';
import { PLAY_HALF, PLAY_WALL, playDist, SECT } from './level';
import { type MoveCtx, type MoveState, stepMove } from './movement';
import { heightAt } from './terrain';
import type { CampDef, LevelDef } from './types';
import { campSpawns, inPoly, levelSpawns, polyArea, zoneAt } from './zones';

const square: [number, number][] = [
  [0, 0],
  [100, 0],
  [100, 50],
  [0, 50],
];

describe('đa giác vùng', () => {
  it('inPoly và polyArea', () => {
    expect(inPoly(square, 50, 25)).toBe(true);
    expect(inPoly(square, 150, 25)).toBe(false);
    expect(inPoly(square, 50, -1)).toBe(false);
    expect(polyArea(square)).toBe(5000);
  });
  it('zoneAt trả vùng chứa điểm', () => {
    const zones = [{ id: 'a', lvMin: 1, lvMax: 2, color: '#000000', music: 'wild', poly: square }];
    expect(zoneAt(zones, 10, 10)?.id).toBe('a');
    expect(zoneAt(zones, 500, 10)).toBeUndefined();
    expect(zoneAt(undefined, 10, 10)).toBeUndefined();
  });
});

describe('camp → điểm sinh', () => {
  const camp: CampDef = {
    id: 'c',
    zone: 'a',
    mon: 'm1',
    x: 5,
    z: 6,
    count: 3,
    radius: 20,
    levelMin: 1,
    levelMax: 2,
    respawn: 25,
    ranged: 'm2',
  };
  it('count con thường + một con đánh xa cùng tâm', () => {
    const sp = campSpawns(camp);
    expect(sp.map((s) => [s.mon, s.count])).toEqual([
      ['m1', 3],
      ['m2', 1],
    ]);
    expect(sp.every((s) => s.x === 5 && s.z === 6 && s.radius === 20 && s.respawn === 25)).toBe(true);
    expect(campSpawns({ ...camp, ranged: undefined })).toHaveLength(1);
  });
  it('levelSpawns gộp spawns lẻ và camps', () => {
    const lv: LevelDef = {
      id: 'x',
      spawns: [{ mon: 'boss', x: 1, z: 1, radius: 4, count: 1, levelMin: 15, levelMax: 15, respawn: 480 }],
      nodes: [],
      camps: [camp],
    };
    expect(levelSpawns(lv).map((s) => s.mon)).toEqual(['boss', 'm1', 'm2']);
    expect(levelSpawns({ id: 'y', spawns: [], nodes: [] })).toEqual([]);
  });
});

describe('ranh vùng chơi (vách)', () => {
  it('playDist: PLAY_HALF giữa cạnh, lớn hơn ở góc', () => {
    expect(playDist(SECT.x + PLAY_HALF, SECT.z)).toBeCloseTo(PLAY_HALF);
    expect(playDist(SECT.x + PLAY_HALF, SECT.z + PLAY_HALF)).toBeGreaterThan(PLAY_HALF * 1.1);
  });
  it('sau chân vách địa hình dựng cao ít nhất 250 m', () => {
    const foot = heightAt(SECT.x + PLAY_WALL - 20, SECT.z + 300);
    const top = heightAt(SECT.x + PLAY_WALL + 80, SECT.z + 300);
    expect(top - foot).toBeGreaterThan(250);
  });
  it('đi bộ hoặc bay thẳng ra ngoài thì dừng ở chân vách, không dịch chuyển', () => {
    const ctx: MoveCtx = { canFly: true, frozen: false, speedMul: 1 };
    for (const fly of [false, true]) {
      const s: MoveState = { x: SECT.x + PLAY_WALL - 30, y: 200, z: SECT.z + 300, vy: 0, grounded: !fly, flying: fly };
      // yaw = π/2: hướng tiến (-sin, -cos) = (-1, 0); yaw = -π/2: về phía +x (đông).
      for (let k = 0; k < 400; k++) stepMove(s, { s: k, mx: 0, mz: 1, yaw: -Math.PI / 2, f: fly ? 2 : 0 }, ctx);
      expect(playDist(s.x, s.z)).toBeLessThanOrEqual(PLAY_WALL + 0.01);
      expect(s.x).toBeGreaterThan(SECT.x + PLAY_WALL - 60);
    }
  });
});
