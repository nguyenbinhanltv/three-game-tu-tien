import { describe, expect, it } from 'vitest';
import { DIEN_VO_CENTER, DIEN_VO_HALF, DIEN_VO_PROPS, DIEN_VO_ZONES, dienVoSpawnAt, dienVoZone } from './props.dienvo';

const inFloor = (x: number, z: number, pad = 0) =>
  Math.abs(x - DIEN_VO_CENTER.x) <= DIEN_VO_HALF - pad && Math.abs(z - DIEN_VO_CENTER.z) <= DIEN_VO_HALF - pad;

describe('Diễn Võ Trường: bố cục sáu khu', () => {
  it('đủ sáu khu, khu nào cũng nằm trọn trong sàn', () => {
    expect(DIEN_VO_ZONES.map((z) => z.id).sort()).toEqual(['arena', 'boss', 'fx', 'light', 'props', 'stage']);
    for (const z of DIEN_VO_ZONES) {
      const hx = z.r ?? z.hx ?? 0;
      const hz = z.r ?? z.hz ?? 0;
      expect(inFloor(z.x - hx, z.z - hz) && inFloor(z.x + hx, z.z + hz), z.id).toBe(true);
    }
  });

  it('đạo cụ nằm trong sàn và không đứng trong vòng đánh của sàn đấu hay hố boss', () => {
    for (const p of DIEN_VO_PROPS) {
      expect(inFloor(p.x, p.z), p.id).toBe(true);
      for (const id of ['arena', 'boss'] as const) {
        const z = dienVoZone(id);
        expect(Math.hypot(p.x - z.x, p.z - z.z), `${p.id} trong ${id}`).toBeGreaterThan((z.r ?? 0) - 1.6);
      }
    }
  });

  it('quái gọi ra đứng trong khu của nó, cách nhau đủ xa', () => {
    for (const boss of [false, true]) {
      const z = dienVoZone(boss ? 'boss' : 'arena');
      for (const n of [1, 3, 5, 10, 20]) {
        const pts = Array.from({ length: n }, (_, i) => dienVoSpawnAt(i, n, boss));
        for (const p of pts) expect(Math.hypot(p.x - z.x, p.z - z.z)).toBeLessThanOrEqual((z.r ?? 0) - 1);
        if (n > 1 && n <= 10) {
          const d = Math.hypot(pts[0]!.x - pts[1]!.x, pts[0]!.z - pts[1]!.z);
          expect(d).toBeGreaterThan(boss ? 1 : 1.5);
        }
      }
    }
  });
});
