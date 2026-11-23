import { describe, expect, it } from 'vitest';
import { COLLIDERS, SECT } from '@dtl/shared';
import { heightAt } from '../../base/levelCtx';
import { BRIDGE_A, BRIDGE_B, SCENES, sceneStats } from './lacKiemScenes';

const abs = (x: number, z: number): [number, number] => [SECT.x + x, SECT.z + z];

describe('lacKiemScenes (Chân Cảnh M1+M2)', () => {
  it('tất định và trong ngân sách tam giác (≤ 60k cho cả bản đồ)', () => {
    const a = sceneStats();
    expect(sceneStats()).toEqual(a);
    expect(a.tris).toBeGreaterThan(2000);
    expect(a.tris).toBeLessThan(60_000);
    expect(a.water).toBe(1);
    expect(a.mist).toBe(1);
  });

  it('mỗi tiểu cảnh có điểm quan sát và ít nhất một điểm nhấn', () => {
    expect(SCENES.length).toBeGreaterThanOrEqual(6);
    for (const s of SCENES) {
      expect(s.pieces.length).toBeGreaterThan(0);
      expect(Number.isFinite(s.at[0] + s.at[1])).toBe(true);
    }
  });

  it('vật đặt riêng lẻ không nằm trong vòng va chạm của công trình (không có vật vô hình chặn đường lẫn vật xuyên công trình)', () => {
    for (const s of SCENES)
      for (const p of s.pieces) {
        if (p.k === 'den_da' || p.k === 'bia' || p.k === 'kiem_da' || p.k === 'da' || p.k === 'ao' || p.k === 'cong_bai') {
          const [x, z] = abs(p.x, p.z);
          for (const c of COLLIDERS) expect(Math.hypot(x - c.x, z - c.z), `${s.id}/${p.k}`).toBeGreaterThan(c.r + 0.5);
        }
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
