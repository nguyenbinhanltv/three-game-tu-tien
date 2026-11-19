import { beforeAll, describe, expect, it } from 'vitest';
import { setActiveLevel, levelTerrain } from '../../base/levelCtx';
import { BRIDGE, groveDensity, mapleSpots, runeSpots } from './doanMachArt';

describe('Đoạn Mạch (MAP-2): cây phong, cổ trận, cầu treo', () => {
  beforeAll(() => {
    setActiveLevel('doan_mach');
  });

  it('điểm trồng cây tất định, trong vùng chơi, đất bằng và tránh trạm, vật cản, đầu cầu', () => {
    const a = mapleSpots();
    const b = mapleSpots();
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(200);
    expect(a.length).toBeLessThanOrEqual(820);
    const t = levelTerrain();
    const pb = t.playBounds;
    for (const s of a) {
      expect(s.x).toBeGreaterThan(pb.x0);
      expect(s.x).toBeLessThan(pb.x1);
      expect(s.z).toBeGreaterThan(pb.z0);
      expect(s.z).toBeLessThan(pb.z1);
      expect(Math.hypot(s.x - 1024, s.z - 1036)).toBeGreaterThan(60);
      for (const e of [BRIDGE.a, BRIDGE.b]) expect(Math.hypot(s.x - e[0], s.z - e[1])).toBeGreaterThan(14);
      for (const c of t.colliders) expect(Math.hypot(s.x - c.x, s.z - c.z)).toBeGreaterThan(c.r);
    }
    // đủ ba sắc lá
    expect(new Set(a.map((s) => s.kind)).size).toBe(3);
  });

  it('cổ trận nằm trên vách dốc quay vào trong, cách nhau xa', () => {
    const r = runeSpots();
    expect(r.length).toBeGreaterThan(8);
    for (const s of r) {
      expect(s.normal.y).toBeLessThan(0.55);
      expect(s.normal.y).toBeGreaterThan(0.12);
    }
    for (let i = 0; i < r.length; i++)
      for (let j = i + 1; j < r.length; j++) {
        const p = r[i];
        const q = r[j];
        if (!p || !q) throw new Error('thiếu điểm cổ trận');
        expect(p.pos.distanceTo(q.pos)).toBeGreaterThan(55);
      }
  });

  it('hai đầu cầu cùng cao độ (lệch dưới 3 m) và giữa nhịp là khe sâu', () => {
    const t = levelTerrain();
    const h0 = t.heightAt(BRIDGE.a[0], BRIDGE.a[1]);
    const h1 = t.heightAt(BRIDGE.b[0], BRIDGE.b[1]);
    const hm = t.heightAt((BRIDGE.a[0] + BRIDGE.b[0]) / 2, (BRIDGE.a[1] + BRIDGE.b[1]) / 2);
    expect(Math.abs(h0 - h1)).toBeLessThan(3);
    expect(Math.min(h0, h1) - hm).toBeGreaterThan(6);
  });

  it('mật độ rừng nằm trong [-1, 1]', () => {
    for (let x = 0; x < 2048; x += 97) for (let z = 0; z < 2048; z += 89) expect(Math.abs(groveDensity(x, z))).toBeLessThanOrEqual(1);
  });
});
