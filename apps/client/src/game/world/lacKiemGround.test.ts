import { describe, expect, it } from 'vitest';
import '@dtl/content'; // đăng ký địa hình van_lam
import { heightAt } from '../../base/levelCtx';
import { SECT } from '@dtl/shared';
import { buildGroundGeometry, groundStats, vignettes } from './lacKiemGround';

describe('lacKiemGround (Chân Cảnh M3: sáu tiểu cảnh kể chuyện)', () => {
  it('tất định, đúng 2 draw call (ground + puddle) và ≤ 10k tam giác', () => {
    const a = groundStats();
    expect(groundStats()).toEqual(a);
    expect(a.meshes).toBe(2);
    expect(a.tris).toBeGreaterThan(300);
    expect(a.tris).toBeLessThan(10_000);
  });

  it('có 6 tiểu cảnh, mỗi cảnh có lời kể và ít nhất một decal', () => {
    const list = vignettes();
    expect(list.length).toBe(6);
    for (const v of list) {
      expect(v.story.length).toBeGreaterThan(20);
      expect(v.trails.length + v.patches.length, v.id).toBeGreaterThan(0);
    }
    const kinds = new Set(list.flatMap((v) => [...v.trails.map((t) => t.kind), ...v.patches.map((p) => p.kind)]));
    for (const k of ['foot', 'puddle', 'crack', 'burst', 'seal', 'root', 'moss', 'leaves', 'chips'])
      expect(kinds.has(k as never), k).toBe(true);
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
    const g = (x: number, z: number) => heightAt(SECT.x + x, SECT.z + z);
    for (const p of vignettes()
      .flatMap((v) => v.patches)
      .filter((q) => q.kind === 'puddle')) {
      const s = Math.hypot(g(p.x + 1.5, p.z) - g(p.x - 1.5, p.z), g(p.x, p.z + 1.5) - g(p.x, p.z - 1.5)) / 3;
      expect(s).toBeLessThanOrEqual(0.09);
    }
  });
});
