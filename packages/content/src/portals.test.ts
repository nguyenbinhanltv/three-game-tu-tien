import { describe, expect, it } from 'vitest';
import { reachability } from './connect';
import { LEVELS } from './index';

// COL-1: cổng, cầu, đình có hình va chạm (prop-boxes.json) không được bịt đường tới cổng bí cảnh: từ điểm hồi sinh đi bộ tới mọi `portals` của level.
describe('thông đường tới cổng bí cảnh (portal)', () => {
  for (const level of ['doan_mach', 'van_hai', 'thien_khuyet', 'bac_hoang']) {
    it(`${level}: từ điểm hồi sinh tới mọi cổng`, () => {
      const L = LEVELS[level]!;
      const portals = L.portals ?? [];
      expect(portals.length, 'level phải có portal').toBeGreaterThan(0);
      const from = L.spawn ?? { x: portals[0]!.x, z: portals[0]!.z };
      const xs = [from.x, ...portals.map((p) => p.x)];
      const zs = [from.z, ...portals.map((p) => p.z)];
      const box = { x0: Math.min(...xs) - 60, z0: Math.min(...zs) - 60, x1: Math.max(...xs) + 60, z1: Math.max(...zs) + 60 };
      const reach = reachability(level, from, box, level === 'van_hai' ? 1 : 2); // cầu xích Vân Hải hẹp: lưới 1 m
      const bad = portals.filter((p) => !reach(p.x, p.z)).map((p) => `${p.to}@${p.x},${p.z}`);
      expect(bad, `không tới được cổng: ${bad.join(', ')}`).toEqual([]);
    }, 300_000);
  }
});
