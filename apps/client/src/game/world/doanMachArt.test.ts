import { beforeAll, describe, expect, it } from 'vitest';
import { LEVELS, NPCS } from '@dtl/content';
import { bridgeDeckY } from '@dtl/shared';
import { setActiveLevel, levelTerrain } from '../../base/levelCtx';
import { exclusions, groveDensity, mapleSpots, ownBridge, runeSpots } from './doanMachArt';

const dist = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);

describe('Đoạn Mạch (MAP-2): cây phong, cổ trận, cầu treo', () => {
  beforeAll(() => {
    setActiveLevel('doan_mach');
  });

  it('điểm trồng cây tất định, trong vùng chơi, đủ ba sắc và có cây lớn điểm nhìn', () => {
    const a = mapleSpots();
    expect(a).toEqual(mapleSpots());
    expect(a.length).toBeGreaterThan(150);
    expect(a.length).toBeLessThanOrEqual(703);
    const pb = levelTerrain().playBounds;
    for (const s of a) {
      expect(s.x).toBeGreaterThan(pb.x0);
      expect(s.x).toBeLessThan(pb.x1);
      expect(s.z).toBeGreaterThan(pb.z0);
      expect(s.z).toBeLessThan(pb.z1);
    }
    expect(new Set(a.map((s) => s.kind)).size).toBe(3);
    expect(a.filter((s) => s.hero).length).toBeGreaterThanOrEqual(2);
  });

  it('cây tránh trạm, cổng, điểm nhiệm vụ, điểm đáng chú ý, nút thu thập, NPC, trại quái, đường hộ tống, cầu, vật cản và lòng sông rb_*', () => {
    const lv = LEVELS.doan_mach;
    if (!lv) throw new Error('thiếu level doan_mach');
    const t = levelTerrain();
    const trees = mapleSpots();
    const keepAway: { what: string; p: { x: number; z: number }; r: number }[] = [
      { what: 'trạm', p: { x: 1024, z: 1036 }, r: 60 },
      ...(lv.portals ?? []).map((p) => ({ what: 'cổng', p, r: p.r + 16 })),
      ...(lv.pois ?? []).map((p) => ({ what: 'poi', p, r: 22 })),
      ...(lv.spots ?? []).map((p) => ({ what: 'điểm nhiệm vụ', p, r: 16 })),
      ...(lv.nodes ?? []).map((p) => ({ what: 'nút thu thập', p, r: 12 })),
      ...(lv.camps ?? []).map((p) => ({ what: 'trại quái', p, r: 8 })),
      ...NPCS.filter((n) => n.level === 'doan_mach').map((p) => ({ what: 'NPC', p, r: 14 })),
      ...t.colliders.map((p) => ({ what: 'vật cản', p, r: p.r + 3 })),
      ...t.def.features.filter((f) => f.id.startsWith('rb_')).map((p) => ({ what: 'lòng sông ' + p.id, p, r: p.flatR * 0.9 })),
    ];
    for (const s of trees)
      for (const k of keepAway) expect(dist(s, k.p), `${k.what} (${k.p.x},${k.p.z})`).toBeGreaterThanOrEqual(k.r - 1e-6);
    // đường hộ tống: dải đệm 14 m dọc từng đoạn
    for (const e of lv.escorts ?? []) {
      for (let i = 0; i + 1 < e.path.length; i++) {
        const a = e.path[i];
        const b = e.path[i + 1];
        if (!a || !b) continue;
        for (const s of trees) {
          const l2 = (b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2;
          const u = Math.max(0, Math.min(1, ((s.x - a[0]) * (b[0] - a[0]) + (s.z - a[1]) * (b[1] - a[1])) / l2));
          expect(Math.hypot(s.x - (a[0] + (b[0] - a[0]) * u), s.z - (a[1] + (b[1] - a[1]) * u))).toBeGreaterThan(13);
        }
      }
    }
    // cầu: cả nhịp
    const br = ownBridge();
    if (!br) throw new Error('thiếu cầu own');
    for (const s of trees) {
      for (let i = 0; i <= 10; i++) {
        expect(Math.hypot(s.x - (br.ax + ((br.bx - br.ax) * i) / 10), s.z - (br.az + ((br.bz - br.az) * i) / 10))).toBeGreaterThan(13);
      }
    }
    expect(exclusions().length).toBeGreaterThan(200);
  });

  it('cổ trận nằm trên vách dốc quay vào trong, cách nhau xa', () => {
    const r = runeSpots();
    expect(r.length).toBeGreaterThan(20);
    for (const s of r) {
      expect(s.normal.y).toBeLessThan(0.55);
      expect(s.normal.y).toBeGreaterThan(0.12);
    }
    for (let i = 0; i < r.length; i++) {
      for (let j = i + 1; j < r.length; j++) {
        const p = r[i];
        const q = r[j];
        if (!p || !q) throw new Error('thiếu điểm cổ trận');
        expect(p.pos.distanceTo(q.pos)).toBeGreaterThan(45);
      }
    }
  });

  it('cầu treo là cầu đi được trong địa hình: mặt cầu theo bridgeDeckY, cao hơn đáy khe, hai đầu liền mặt đất', () => {
    const t = levelTerrain();
    const br = ownBridge();
    if (!br) throw new Error('thiếu cầu own');
    for (const u of [0.25, 0.5, 0.75]) {
      const x = br.ax + (br.bx - br.ax) * u;
      const z = br.az + (br.bz - br.az) * u;
      // heightAt gồm mặt cầu; surfaceAt (dựng lưới) bỏ mặt cầu => đáy khe thấp hơn nhiều
      expect(t.heightAt(x, z)).toBeCloseTo(bridgeDeckY(br, u), 1);
      expect(t.heightAt(x, z) - t.surfaceAt(x, z)).toBeGreaterThan(5);
    }
    expect(Math.abs(t.heightAt(br.ax, br.az) - t.surfaceAt(br.ax, br.az))).toBeLessThan(1);
    expect(Math.abs(t.heightAt(br.bx, br.bz) - t.surfaceAt(br.bx, br.bz))).toBeLessThan(1);
  });

  it('mật độ rừng nằm trong [-1, 1]', () => {
    for (let x = 0; x < 2048; x += 97) for (let z = 0; z < 2048; z += 89) expect(Math.abs(groveDensity(x, z))).toBeLessThanOrEqual(1);
  });
});
