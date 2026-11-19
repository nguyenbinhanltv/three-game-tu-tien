import { SPAWN_POINT, TELE_PADS } from '@dtl/shared';
import { describe, expect, it } from 'vitest';
import { ARCH_BY_LEVEL } from './colliders';
import { reachability } from './connect';
import { LEVELS, NPCS } from './index';

// COL-1: collider mới không được bịt lối tới NPC / trận truyền tống trong tông môn (đi bộ từ điểm hồi sinh, theo đúng luật `stepMove`).
describe('thông đường Lạc Kiếm Tông', () => {
  it('từ điểm hồi sinh tới NPC và trận truyền tống quanh tông môn; khối rắn lớn không tới được (đối chứng)', () => {
    const box = { x0: 1900, z0: 1930, x1: 2200, z1: 2150 };
    const reach = reachability('van_lam', SPAWN_POINT, box, 2);
    const inBox = (x: number, z: number): boolean => x > box.x0 && x < box.x1 && z > box.z0 && z < box.z1;
    const targets = [
      ...NPCS.filter((n) => inBox(n.x, n.z)).map((n) => [n.id, n.x, n.z] as const),
      ...TELE_PADS.filter((p) => inBox(p.x, p.z)).map((p) => [p.id, p.x, p.z] as const),
    ];
    expect(targets.length).toBeGreaterThanOrEqual(4);
    const bad = targets.filter(([, x, z]) => !reach(x, z)).map(([id]) => id);
    expect(bad, `không tới được: ${bad.join(', ')}`).toEqual([]);

    // Đối chứng: tâm các khối rắn cao > 2 m, diện tích ≥ 4 m² (nền điện, tường dày, tháp) phần lớn KHÔNG tới được, nếu không BFS vô nghĩa.
    const solids: { x: number; z: number }[] = [];
    for (const b of ARCH_BY_LEVEL.van_lam![0]!.boxes) {
      const [bx0, bz0, bx1, bz1, by0, by1, walk] = b as [number, number, number, number, number, number, number];
      const cx = (bx0 + bx1) / 2;
      const cz = (bz0 + bz1) / 2;
      if (walk === 0 && by1 - by0 > 2 && (bx1 - bx0) * (bz1 - bz0) >= 4 && inBox(cx, cz)) solids.push({ x: cx, z: cz });
    }
    expect(solids.length).toBeGreaterThan(3);
    expect(solids.filter((s) => reach(s.x, s.z)).length / solids.length).toBeLessThan(0.5);
  }, 120_000);
});

// COL-B/COL-A2: bí cảnh Phục Mạch Quật / Kính Nguyệt Cung / Kiếm Trủng (collider kiến trúc từ GLB): đi bộ từ điểm vào tới lối ra và tâm hầm (nơi giao chiến).
describe('thông đường bí cảnh (COL-B)', () => {
  for (const level of ['phuc_mach', 'kinh_nguyet', 'kiem_trung', 'than_tang', 'xich_tan_khich']) {
    it(`${level}: từ điểm vào tới lối ra và tâm hầm`, () => {
      const dg = LEVELS[level]!.dungeon!;
      const b = dg.bound ?? 90;
      const box = { x0: dg.center.x - b, z0: dg.center.z - b, x1: dg.center.x + b, z1: dg.center.z + b };
      const reach = reachability(level, dg.spawn, box, 2);
      expect(reach(dg.exit.x, dg.exit.z), 'lối ra').toBe(true);
      expect(reach(dg.center.x, dg.center.z), 'tâm hầm').toBe(true);
    }, 120_000);
  }
});
