import { describe, expect, it } from 'vitest';
import '@dtl/content';
import { LEVELS } from '@dtl/content';
import { terrainOf } from '@dtl/shared';
import { regionTrack } from '../audio/musicDirector';
import { scatterXich, xichCrackDist, xichCracks, xichGroundColor } from './xichArt';

const tr = terrainOf('xich_tan_khich');
const def = tr.def;
const c = def.canyon!;
const h = (x: number, z: number) => tr.heightAt(x, z);
const cracks = xichCracks(def, h);

describe('xichArt (DV-3K)', () => {
  it('ba vết nứt nằm trọn trong sàn hẻm, mỗi 10 m một điểm, đáy khớp mặt đất', () => {
    expect(cracks.length).toBe(3);
    for (const p of cracks) {
      expect(p.length).toBeGreaterThan(10);
      for (const q of p) {
        expect(Math.abs(q.x - c.cx)).toBeLessThan(c.halfW - 6);
        expect(Math.abs(q.z - c.cz)).toBeLessThan(c.halfL);
        expect(q.y).toBeCloseTo(h(q.x, q.z), 6);
      }
    }
    expect(xichCrackDist(cracks, cracks[0]![3]!.x, cracks[0]![3]!.z)).toBeLessThan(0.01);
  });

  it('màu đất hợp lệ 0..1 ở sàn, vách, cao nguyên; vách tối và đỏ/tím hơn cao nguyên tro', () => {
    const out: [number, number, number] = [0, 0, 0];
    for (const [dx, dz] of [
      [0, 20],
      [40, 0],
      [c.halfW + 10, 0],
      [c.halfW + 60, 0],
      [-c.halfW - 60, 40],
    ]) {
      const x = c.cx + dx!;
      const z = c.cz + dz!;
      xichGroundColor(def, cracks, x, z, h(x, z), 0.9, out);
      for (const v of out) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThan(2);
      }
    }
  });

  it('rải đá: tất định, chừa vòng cấm quanh bia và vết nứt, không lên cao nguyên', () => {
    const d = LEVELS.xich_tan_khich!.dungeon!;
    const clear = [
      { x: d.center.x, z: d.center.z, r: 16 },
      { x: d.spawn.x, z: d.spawn.z, r: 9 },
    ];
    const a = scatterXich({ def, heightAt: h, clear, cracks });
    const b = scatterXich({ def, heightAt: h, clear, cracks });
    expect(a.length).toBeGreaterThan(30);
    expect(a.length).toBeLessThan(900);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    for (const r of a) {
      expect(Math.hypot(r.x - d.center.x, r.z - d.center.z)).toBeGreaterThan(15);
      expect(xichCrackDist(cracks, r.x, r.z)).toBeGreaterThan(4.4);
      expect(h(r.x, r.z) - def.natural.level).toBeLessThan(c.wallH - 9);
    }
  });

  it('nhạc: Xích Tẫn Khích có bài riêng, phó bản khác vẫn là dungeon', () => {
    expect(regionTrack(true, 'wild', 'xich_tan_khich')).toBe('dungeon_rift');
    expect(regionTrack(true, 'wild', 'phuc_mach')).toBe('dungeon');
    expect(regionTrack(true, 'dungeon')).toBe('dungeon');
  });
});
