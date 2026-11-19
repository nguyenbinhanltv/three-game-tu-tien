import { describe, expect, it } from 'vitest';
import '@dtl/content';
import { terrainOf } from '@dtl/shared';
import { bacHoangOccupied, inBeastFootprint } from './bhFootprint';
import { BEAST_SPOTS, PILLAR_SPOTS, beastSkeleton, crackGeometry } from './bhWonders';
import { riftPath } from './bacHoangArt';

const def = terrainOf('bac_hoang').def;
const path = riftPath(def);

describe('bhWonders (MAP-5 PR2)', () => {
  it('bộ xương: có hình, kích thước cỡ cự thú (dài > 40 m, cao > 8 m), không NaN', () => {
    const g = beastSkeleton();
    g.computeBoundingBox();
    const b = g.boundingBox!;
    expect(b.max.x - b.min.x).toBeGreaterThan(40);
    expect(b.max.y).toBeGreaterThan(8);
    const p = g.getAttribute('position').array;
    for (let i = 0; i < p.length; i += 997) expect(Number.isFinite(p[i])).toBe(true);
    expect(g.getAttribute('position').count).toBeLessThan(120_000);
  });

  it('vết nứt: tất định, bám địa hình, nằm trong bản đồ', () => {
    const h = (x: number, z: number) => 60 + Math.sin(x * 0.01) * 4 + z * 0;
    const a = crackGeometry(path, h);
    const b = crackGeometry(path, h);
    expect(a.getAttribute('position').count).toBe(b.getAttribute('position').count);
    expect(a.getAttribute('position').count).toBeGreaterThan(500);
    const p = a.getAttribute('position');
    for (let i = 0; i < p.count; i += 13) {
      expect(p.getX(i)).toBeGreaterThan(0);
      expect(p.getX(i)).toBeLessThan(def.size);
    }
  });

  it('xác thú và cột tà trận đặt trong vùng chơi, cách trạm và các điểm đến', () => {
    for (const s of [...BEAST_SPOTS, ...PILLAR_SPOTS]) {
      expect(Math.abs(s.x - def.play!.cx)).toBeLessThan(def.play!.half);
      expect(Math.abs(s.z - def.play!.cz)).toBeLessThan(def.play!.half);
      expect(Math.hypot(s.x - 1024, s.z - 1544)).toBeGreaterThan(70);
    }
  });

  it('sân Trấn Giới Đài và bia nhiệm vụ giữ mặt phẳng ~72 m (vực khe khép lại trước sân)', () => {
    const tr = terrainOf('bac_hoang');
    for (const [x, z] of [
      [1024, 494],
      [1024, 508],
      [1042, 504],
      [1084, 554],
    ] as const)
      expect(Math.abs(tr.heightAt(x, z) - 72)).toBeLessThan(2);
    // vực vẫn sâu ở phần giữa khe
    expect(tr.heightAt(path[3]!.x, path[3]!.z)).toBeLessThan(45);
  });

  it('xác cự thú không đè lên bãi quái, tinh anh/boss, điểm đặt, điểm đáng chú ý hay đường hộ tống (xương không có va chạm)', () => {
    const occ = bacHoangOccupied();
    for (const b of BEAST_SPOTS) {
      const hit = occ.filter((o) => inBeastFootprint(b, o.x, o.z, o.r + 4)).map((o) => o.id);
      expect(hit, `xác tại (${b.x},${b.z}) s=${b.s} đè: ${hit.join(', ')}`).toEqual([]);
    }
  });
});
