import { describe, expect, it } from 'vitest';
import '@dtl/content'; // đăng ký hộp va chạm arch_sect cho van_lam
import {
  BRIDGE_A,
  BRIDGE_B,
  collisionOf,
  lacKiemSceneColliders,
  SCENE_GLB,
  SECT,
  SECT_ARCH_CIRCLES,
  stepMove,
  TC_GATE,
  terrainOf,
  type BoxShape,
} from '@dtl/shared';
import { heightAt } from '../../base/levelCtx';
import { SCENES, sceneStats } from './lacKiemScenes';

const abs = (x: number, z: number): [number, number] => [SECT.x + x, SECT.z + z];
const own = lacKiemSceneColliders();
const isOwn = (c: { x: number; z: number; r: number }) => own.some((o) => o.x === c.x && o.z === c.z && o.r === c.r);

/** Khoảng cách (XZ) từ điểm tới hộp xoay `b` (0 nếu nằm trong). */
function distBox(px: number, pz: number, b: BoxShape): number {
  const c = Math.cos(b.yaw);
  const s = Math.sin(b.yaw);
  const dx = px - b.x;
  const dz = pz - b.z;
  const lx = c * dx - s * dz;
  const lz = s * dx + c * dz;
  return Math.hypot(Math.max(0, Math.abs(lx) - b.hx), Math.max(0, Math.abs(lz) - b.hz));
}

describe('lacKiemScenes (Chân Cảnh M1+M2)', () => {
  it('tất định và trong ngân sách tam giác (≤ 80k phần thủ tục)', () => {
    const a = sceneStats();
    expect(sceneStats()).toEqual(a);
    expect(a.tris).toBeGreaterThan(2000);
    expect(a.tris).toBeLessThan(80_000);
    expect(a.ponds).toBe(1);
    expect(a.mist).toBeGreaterThanOrEqual(5);
    expect(a.glbKinds).toBeLessThanOrEqual(10); // mỗi loại GLB ≈ 2 draw call: giữ số loại nhỏ
  });

  it('mỗi tiểu cảnh có điểm quan sát và ít nhất một điểm nhấn', () => {
    expect(SCENES.length).toBeGreaterThanOrEqual(6);
    for (const s of SCENES) {
      expect(s.pieces.length).toBeGreaterThan(0);
      expect(Number.isFinite(s.at[0] + s.at[1])).toBe(true);
    }
  });

  it('COL-1: vật đặc của tiểu cảnh nằm trong va chạm của level (client và server cùng đọc)', () => {
    const cols = terrainOf('van_lam').colliders;
    for (const c of own)
      expect(
        cols.some((q) => q.x === c.x && q.z === c.z && q.r === c.r),
        `thiếu ${c.x},${c.z}`,
      ).toBe(true);
    // đèn đá/kiếm/bia/cột cao ≥ 0,6 m đều có vòng; chỉ linh thảo thấp được bỏ
    let solid = 0;
    for (const list of Object.values(SCENE_GLB)) for (const g of list) if (g.id !== 'prop_tc_linh_thao') solid++;
    expect(own.length).toBe(solid + 2);
  });

  it('cổng bài chừa lối giữa ≥ 7 m (người đi xuyên cổng được)', () => {
    const [x, z] = abs(TC_GATE.x, TC_GATE.z);
    const cols = terrainOf('van_lam').colliders;
    for (let dx = -3; dx <= 3; dx += 0.5)
      for (const dz of [-3, 0, 3]) {
        const hit = cols.some((c) => Math.hypot(x + dx - c.x, z + dz - c.z) < c.r + 0.35);
        expect(hit, `bị chặn ở ${dx},${dz}`).toBe(false);
      }
  });

  it('không đặt xuyên tường kiến trúc hay đè lên vật PROP-1/vòng tròn kiến trúc cũ (va chạm thật của level, trừ chính tiểu cảnh)', () => {
    const others = terrainOf('van_lam').colliders.filter((c) => !isOwn(c));
    const boxes = collisionOf('van_lam').shapes.filter((s): s is BoxShape => s.k === 'box' && s.y1 > s.y0);
    expect(boxes.length).toBeGreaterThan(100); // đã nạp hộp arch_sect
    for (const c of own) {
      for (const o of others) expect(Math.hypot(c.x - o.x, c.z - o.z), `đè vòng ${o.x},${o.z}`).toBeGreaterThan(c.r + o.r - 0.2);
      for (const o of SECT_ARCH_CIRCLES) expect(Math.hypot(c.x - o.x, c.z - o.z), `đè kiến trúc ${o.x},${o.z}`).toBeGreaterThan(c.r + o.r);
      for (const b of boxes) expect(distBox(c.x, c.z, b), `xuyên hộp ${b.tag ?? ''} ${b.x},${b.z}`).toBeGreaterThan(c.r - 0.2);
    }
  }, 30_000); // nạp va chạm arch_sect nặng: mặc định 5 s không đủ trên CI chậm

  it('stepMove (server) không cho người đi vào trong một đèn đá của tiểu cảnh', () => {
    const lamp = own.find((c) => c.r === 0.45)!;
    const t = terrainOf('van_lam');
    for (const dir of [-1, 1]) {
      const s = { x: lamp.x, y: heightAt(lamp.x, lamp.z - 4 * dir), z: lamp.z - 4 * dir, vy: 0, grounded: true, flying: false };
      for (let i = 0; i < 120; i++)
        stepMove(s, { s: i, mx: 0, mz: 1, yaw: dir < 0 ? 0 : Math.PI, f: 0 }, { canFly: false, frozen: false, speedMul: 1, terrain: t });
      expect(Math.hypot(s.x - lamp.x, s.z - lamp.z)).toBeGreaterThanOrEqual(lamp.r - 0.05);
    }
  });

  it('cầu treo bắc qua hác: hai đầu cao hơn đáy giữa hác ≥ 6 m (người đi dưới được, không đụng cầu)', () => {
    const mid = abs((BRIDGE_A[0] + BRIDGE_B[0]) / 2, (BRIDGE_A[1] + BRIDGE_B[1]) / 2);
    const a = abs(...BRIDGE_A);
    const b = abs(...BRIDGE_B);
    const hm = heightAt(mid[0], mid[1]);
    expect(Math.min(heightAt(a[0], a[1]), heightAt(b[0], b[1])) - hm).toBeGreaterThanOrEqual(6);
  });
});
