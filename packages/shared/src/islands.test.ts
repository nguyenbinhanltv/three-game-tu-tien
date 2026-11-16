// E3-N: đảo nổi trên biển mây: sàn mây đi bộ được, cầu xích, rơi không chết, đảo giả không đứng được, chặn leo bậc cao.
import { describe, expect, it } from 'vitest';
import { cloneMoveState, GRAVITY, MAX_STEP_UP, type MoveCtx, type MoveInput, type MoveState, registerTerrain, stepMove, type TerrainDef } from './index';

const DEF: TerrainDef = {
  id: 'test_sky',
  seed: 9,
  size: 1024,
  margin: 8,
  natural: { freq: 0.002, baseOct: 1, ridgeOct: 1, level: 0, baseAmp: 0, ridgeAmp: 0, maskFreq: 0.001, maskOct: 1, maskLo: 0, maskHi: 1 },
  features: [],
  islands: [
    { x: 300, z: 500, r: 80, edge: 30, y: 120 },
    { x: 600, z: 500, r: 80, edge: 30, y: 130 },
  ],
  fakeIslands: [{ x: 450, z: 800, r: 50, edge: 20, y: 125 }],
  voidFloor: 60,
  bridges: [{ id: 'b', ax: 370, az: 500, ay: 120, bx: 530, bz: 500, by: 130, halfW: 2.5, sag: 1.5 }],
  colliders: [],
};
const T = registerTerrain(DEF);
const CTX: MoveCtx = { canFly: false, frozen: false, speedMul: 1, terrain: T };
const input = (mx: number, mz: number, yaw = 0, f = 0): MoveInput => ({ s: 0, mx, mz, yaw, f });
/** yaw = -π/2: tiến (mz = 1) đi về +x. */
const EAST = -Math.PI / 2;
const run = (s: MoveState, steps: number, i: MoveInput) => {
  for (let k = 0; k < steps; k++) stepMove(s, i, CTX);
};

describe('E3-N: địa hình đảo', () => {
  it('mặt đảo, sàn mây, đầu cầu liền mạch', () => {
    expect(T.heightAt(300, 500)).toBeCloseTo(120, 6);
    expect(T.heightAt(600, 500)).toBeCloseTo(130, 6);
    expect(T.heightAt(450, 650)).toBeCloseTo(60, 6); // sàn mây
    expect(T.heightAt(370, 500)).toBeCloseTo(120, 3); // đầu cầu A trên mặt đảo
    expect(T.heightAt(530, 500)).toBeCloseTo(130, 3);
  });

  it('mặt cầu nội suy giữa hai đầu, võng ở giữa, ngoài dải là sàn mây', () => {
    const mid = T.heightAt(450, 500);
    expect(mid).toBeCloseTo(125 - 1.5, 3);
    expect(T.heightAt(450, 500 + 2.4)).toBeGreaterThan(mid - 3);
    expect(T.heightAt(450, 500 + 4)).toBeCloseTo(60, 6);
    expect(T.heightAt(450, 500 - 4)).toBeCloseTo(60, 6);
  });

  it('đảo giả không đưa vào heightAt: đứng được chỗ nào cũng là sàn mây', () => {
    expect(T.heightAt(450, 800)).toBeCloseTo(60, 6);
    expect(T.blockRise).toBe(true);
  });

  it('đi bộ trên cầu từ đảo này sang đảo kia, không rơi', () => {
    const s: MoveState = { x: 330, y: 120, z: 500, vy: 0, grounded: true, flying: false };
    run(s, 800, input(0, 1, EAST));
    expect(s.x).toBeGreaterThan(560);
    expect(s.y).toBeGreaterThan(120);
    expect(s.grounded).toBe(true);
  });

  it('bước ra mép cầu thì rơi xuống sàn mây, hạ cánh đứng yên, vẫn đi bộ được', () => {
    const s: MoveState = { x: 450, y: 125 - 1.5, z: 500, vy: 0, grounded: true, flying: false };
    run(s, 40, input(1, 0, EAST)); // đi ngang (phải = hướng nam khi yaw = -π/2)
    expect(s.grounded).toBe(false);
    run(s, 200, input(0, 0));
    expect(s.y).toBeCloseTo(60, 3);
    expect(s.grounded).toBe(true);
    const x0 = s.x;
    run(s, 40, input(0, 1, EAST));
    expect(Math.abs(s.x - x0)).toBeGreaterThan(5); // đi được trên sàn mây
    expect(s.y).toBeCloseTo(60, 3);
  });

  it('đứng trên "đảo giả" là rơi về sàn mây (không có mặt đứng)', () => {
    const s: MoveState = { x: 450, y: 125, z: 800, vy: 0, grounded: false, flying: false };
    run(s, 100, input(0, 0));
    expect(s.y).toBeCloseTo(60, 3);
  });

  it('từ sàn mây đi vào thành cầu bị chặn, không bị "nhấc" lên cầu', () => {
    const s: MoveState = { x: 450, y: 60, z: 480, vy: 0, grounded: true, flying: false };
    // đi hướng +z (nam, yaw 0: tiến = -z; lùi mz=-1 → +z)
    run(s, 80, input(0, -1, 0));
    expect(s.y).toBeCloseTo(60, 3);
    expect(s.z).toBeLessThan(500 - 2.5);
    expect(MAX_STEP_UP).toBeLessThan(5);
  });

  it('rơi từ đảo xuống sàn mây: vận tốc rơi có trần, không chạm vực', () => {
    const s: MoveState = { x: 450, y: 125, z: 650, vy: 0, grounded: false, flying: false };
    let vmin = 0;
    for (let k = 0; k < 120; k++) {
      stepMove(s, input(0, 0), CTX);
      vmin = Math.min(vmin, s.vy);
    }
    expect(vmin).toBeGreaterThanOrEqual(-60);
    expect(GRAVITY).toBeGreaterThan(0);
    expect(s.y).toBeCloseTo(60, 3);
    expect(cloneMoveState(s).grounded).toBe(true);
  });

  it('ngự kiếm bay qua lại giữa đảo, hạ xuống mặt đảo kia', () => {
    const s: MoveState = { x: 300, y: 130, z: 500, vy: 0, grounded: true, flying: false };
    const fly: MoveCtx = { ...CTX, canFly: true };
    for (let k = 0; k < 300; k++) stepMove(s, input(0, 1, EAST, 2), fly);
    expect(s.x).toBeGreaterThan(540);
    for (let k = 0; k < 200; k++) stepMove(s, input(0, 0, EAST, 0), fly);
    expect(s.y).toBeCloseTo(T.heightAt(s.x, s.z), 3);
  });
});
