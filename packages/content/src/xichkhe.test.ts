import { describe, expect, it } from 'vitest';
import { IN_FLY, IN_UP, type MoveCtx, type MoveInput, type MoveState, stepMove, terrainOf } from '@dtl/shared';
import { LEVELS } from './index';

// DV-3K: hẻm núi của phó bản Xích Tẫn Khích (`TerrainDef.canyon`): chỉ đổi địa hình, không đổi luật đợt quái.
const dg = LEVELS.xich_tan_khich.dungeon!;
const tr = terrainOf('xich_tan_khich');
const c = tr.def.canyon!;
const floor = tr.def.natural.level;

describe('địa hình hẻm Xích Tẫn Khích', () => {
  it('level dùng địa hình riêng, không còn là Vân Lam', () => {
    expect(tr.id).toBe('xich_tan_khich');
    expect(tr.blockRise).toBe(true);
  });

  it('sàn quanh tâm bí cảnh, lối vào, lối ra và vòng quái (bán kính 32) phẳng trong ±3 m', () => {
    const pts: [number, number][] = [
      [dg.center.x, dg.center.z],
      [dg.spawn.x, dg.spawn.z],
      [dg.exit.x, dg.exit.z],
    ];
    for (let a = 0; a < 24; a++)
      for (const r of [14, 24, 32])
        pts.push([dg.center.x + Math.cos((a / 24) * Math.PI * 2) * r, dg.center.z + Math.sin((a / 24) * Math.PI * 2) * r]);
    for (const v of [
      { x: 1539, z: 1311 },
      { x: 1501, z: 1311 },
      { x: 1520, z: 1278 },
    ])
      pts.push([v.x, v.z]); // khe mạch của Tử Quang Dực Chủ
    for (const [x, z] of pts) expect(Math.abs(tr.heightAt(x, z) - floor), `${x},${z}`).toBeLessThan(3);
  });

  it('vách dựng lên hàng chục mét hai bên và cao nguyên ngoài vách cao bằng wallH', () => {
    expect(tr.heightAt(c.cx + c.halfW + c.rise + 25, c.cz) - floor).toBeGreaterThan(c.wallH * 0.85);
    expect(tr.heightAt(c.cx - c.halfW - c.rise - 25, c.cz) - floor).toBeGreaterThan(c.wallH * 0.85);
    expect(tr.heightAt(c.cx, c.cz - c.halfL - c.rise - 25) - floor).toBeGreaterThan(c.wallH * 0.85);
  });

  it('chặn leo vách: chạy thẳng vào vách hai bên và đầu hẻm không lên được quá chân vách', () => {
    const ctx: MoveCtx = {
      canFly: false,
      frozen: false,
      speedMul: 1,
      terrain: tr,
      bound: { x: dg.center.x, z: dg.center.z, r: dg.bound! },
    };
    // yaw hướng +x (đông), -x, +z, -z: thử cả bốn; vị trí đầu là sàn bằng.
    for (const yaw of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
      const st: MoveState = { x: c.cx, y: floor, z: c.cz, vy: 0, grounded: true, flying: false };
      const inp: MoveInput = { s: 1, mx: 0, mz: 1, yaw, f: 0 };
      for (let k = 0; k < 600; k++) stepMove(st, inp, ctx);
      expect(st.y - floor, `yaw ${yaw}`).toBeLessThan(c.rise * 0.5);
    }
  });

  it('ngự kiếm/ngự không: bay hết cỡ về mọi hướng không ra khỏi sàn hẻm và không lên cao nguyên', () => {
    const ctx: MoveCtx = { canFly: true, frozen: false, speedMul: 1, terrain: tr, bound: { x: dg.center.x, z: dg.center.z, r: dg.bound! } };
    for (const yaw of [0, Math.PI / 2, Math.PI, -Math.PI / 2, 0.8, 2.4]) {
      const st: MoveState = { x: c.cx, y: floor + 10, z: c.cz, vy: 0, grounded: false, flying: true };
      const inp: MoveInput = { s: 1, mx: 0, mz: 1, yaw, f: IN_FLY | IN_UP };
      for (let k = 0; k < 900; k++) stepMove(st, inp, ctx);
      expect(Math.abs(st.x - c.cx), `x yaw ${yaw}`).toBeLessThan(c.halfW);
      expect(Math.abs(st.z - c.cz), `z yaw ${yaw}`).toBeLessThan(c.halfL);
      expect(tr.groundAt(st.x, st.z) - floor, `đáp yaw ${yaw}`).toBeLessThan(4);
    }
  });

  it('tất định: hai lần hỏi cùng một điểm ra cùng độ cao', () => {
    expect(tr.heightAt(1555.5, 1262.25)).toBe(tr.heightAt(1555.5, 1262.25));
  });
});
