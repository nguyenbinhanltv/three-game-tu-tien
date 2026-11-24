import { describe, expect, it } from 'vitest';
import '@dtl/content'; // đăng ký địa hình van_lam
import { heightAt } from '../../base/levelCtx';
import { gorgeDrop, SECT, TC_GORGE } from '@dtl/shared';
import { buildGroundGeometry, groundLayout, groundStats, WASH_MAX_RANGE } from './lacKiemGround';

describe('lacKiemGround (Chân Cảnh M3)', () => {
  it('tất định, 6 draw call (một mesh/loại) và ≤ 40k tam giác', () => {
    const a = groundStats();
    expect(groundStats()).toEqual(a);
    expect(a.kinds).toBe(6);
    expect(a.tris).toBeGreaterThan(500);
    expect(a.tris).toBeLessThan(40_000);
  });

  it('có đủ năm loại: vết chân, vũng nước, gạch vỡ, ấn trận, rễ', () => {
    const l = groundLayout();
    expect(l.trails.length).toBeGreaterThanOrEqual(3);
    for (const k of ['puddle', 'crack', 'seal', 'root'] as const)
      expect(l.patches.filter((p) => p.kind === k).length, k).toBeGreaterThanOrEqual(3);
  });

  it('decal bám địa hình: đỉnh cao hơn mặt đất 0,03–0,15 m, không chìm không bay', () => {
    for (const { acc } of buildGroundGeometry().values())
      for (let i = 0; i < acc.pos.length; i += 3) {
        const dy = acc.pos[i + 1]! - heightAt(SECT.x + acc.pos[i]!, SECT.z + acc.pos[i + 2]!);
        expect(dy).toBeGreaterThan(0.03);
        expect(dy).toBeLessThan(0.15);
      }
  });

  it('vũng nước chỉ nằm chỗ gần phẳng (dốc ≤ ~5°)', () => {
    for (const p of groundLayout().patches.filter((q) => q.kind === 'puddle')) {
      const g = (x: number, z: number) => heightAt(SECT.x + x, SECT.z + z);
      const s = Math.hypot(g(p.x + 1.5, p.z) - g(p.x - 1.5, p.z), g(p.x, p.z + 1.5) - g(p.x, p.z - 1.5)) / 3;
      expect(s).toBeLessThanOrEqual(0.09);
    }
  });

  it('lớp wash bỏ ô dốc/hác: tâm mọi tam giác sát mặt đất và không nằm trên hác cầu treo', () => {
    const { acc } = buildGroundGeometry().get('wash')!;
    expect(acc.idx.length).toBeGreaterThan(300);
    for (let t = 0; t < acc.idx.length; t += 3) {
      const v = [0, 1, 2].map((k) => acc.idx[t + k]! * 3);
      const cx = (acc.pos[v[0]!]! + acc.pos[v[1]!]! + acc.pos[v[2]!]!) / 3;
      const cy = (acc.pos[v[0]! + 1]! + acc.pos[v[1]! + 1]! + acc.pos[v[2]! + 1]!) / 3;
      const cz = (acc.pos[v[0]! + 2]! + acc.pos[v[1]! + 2]! + acc.pos[v[2]! + 2]!) / 3;
      expect(Math.abs(cy - heightAt(SECT.x + cx, SECT.z + cz)), `tam giác ${t / 3} lơ lửng/cắm đất`).toBeLessThan(WASH_MAX_RANGE * 0.6);
      expect(gorgeDrop(TC_GORGE, SECT.x + cx, SECT.z + cz)).toBe(0);
    }
  });
});
