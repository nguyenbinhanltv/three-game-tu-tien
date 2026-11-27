import { describe, expect, it } from 'vitest';
import { inArc, inHazard, inLine, type HazardGeom } from '@dtl/shared';
import { inZone, zoneArea, zoneBounds, zoneDistOutside, zoneOfArc, zoneOfHazard, zoneOfLine, zoneOutline } from './zoneShapes';

const HAZARDS: HazardGeom[] = [
  { x: 1300, z: 985, r: 6 },
  { x: 1300, z: 985, r: 12, sh: 'rect', yaw: 0.7, w: 3 },
  { x: 1300, z: 985, r: 9, sh: 'rect', yaw: -2.1 },
  { x: 1300, z: 985, r: 8, sh: 'cone', yaw: 1.9, w: 0.6 },
  { x: 1300, z: 985, r: 10, sh: 'cone', yaw: -0.4 },
];

/** Số ngẫu nhiên xác định (test lặp lại được). */
function rng(seed: number): () => number {
  let s = seed;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

describe('vùng trúng thật: hình dựng từ dữ liệu server', () => {
  it('trong/ngoài vùng khớp TUYỆT ĐỐI với inHazard của server ở 2000 điểm mỗi hình', () => {
    for (const h of HAZARDS) {
      const zn = zoneOfHazard(h);
      const rnd = rng(7);
      for (let i = 0; i < 2000; i++) {
        const x = h.x + (rnd() - 0.5) * 30;
        const z = h.z + (rnd() - 0.5) * 30;
        expect(inZone(zn, x, z), `${h.sh ?? 'circle'} @ ${x},${z}`).toBe(inHazard(h, x, z));
      }
    }
  });

  it('đường viền nằm đúng ranh: nhích vào tâm thì trong vùng, nhích ra thì ngoài', () => {
    for (const h of HAZARDS) {
      const zn = zoneOfHazard(h);
      const pts = zoneOutline(zn, 0.2);
      const b = zoneBounds(zn);
      // Tâm khối của đa giác viền (nằm trong vùng với mọi hình lồi ở đây).
      const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
      const cz = pts.reduce((s, p) => s + p[1], 0) / pts.length;
      expect(inHazard(h, cx, cz)).toBe(true);
      for (const [x, z] of pts) {
        const dx = cx - x;
        const dz = cz - z;
        const l = Math.hypot(dx, dz);
        expect(inHazard(h, x + (dx / l) * 0.02, z + (dz / l) * 0.02)).toBe(true);
        expect(inHazard(h, x - (dx / l) * 0.02, z - (dz / l) * 0.02)).toBe(false);
        // Hộp bao dựng từ viền thô hơn (bước 0,3 m): lệch tối đa vài mm trên cung.
        expect(x >= b.x0 - 0.02 && x <= b.x1 + 0.02 && z >= b.z0 - 0.02 && z <= b.z1 + 0.02).toBe(true);
      }
    }
  });

  it('chiêu đường thẳng của người chơi khớp inLine; đòn chém quét khớp inArc (không cộng thân quái)', () => {
    const line = zoneOfLine(1300, 985, 1306, 993, 3);
    const u = { x: 0.6, z: 0.8 };
    const arc = zoneOfArc(1300, 985, 1303, 989, 4.5, 120);
    const rnd = rng(11);
    for (let i = 0; i < 2000; i++) {
      const x = 1300 + (rnd() - 0.5) * 30;
      const z = 985 + (rnd() - 0.5) * 30;
      expect(inZone(line, x, z)).toBe(inLine(1300, 985, u.x, u.z, 10, 3, x, z));
      expect(inZone(arc, x, z)).toBe(inArc(1300, 985, 3, 4, x, z, 4.5, 120));
    }
    expect(zoneOfArc(0, 0, 1, 0, 3, 360)).toEqual({ kind: 'circle', x: 0, z: 0, r: 3 });
  });

  it('khoảng cách ra ngoài vùng: 0 khi ở trong, đúng số mét khi ở ngoài', () => {
    expect(zoneDistOutside({ kind: 'circle', x: 0, z: 0, r: 5 }, 3, 0)).toBe(0);
    expect(zoneDistOutside({ kind: 'circle', x: 0, z: 0, r: 5 }, 0, 8)).toBeCloseTo(3, 6);
    const rect = { kind: 'rect', x: 0, z: 0, yaw: 0, len: 10, w: 4 } as const;
    expect(zoneDistOutside(rect, 1, 5)).toBe(0);
    expect(zoneDistOutside(rect, 5, 5)).toBeCloseTo(3, 3);
    expect(zoneDistOutside(rect, 0, 12)).toBeCloseTo(2, 3);
    expect(zoneDistOutside(rect, 5, 14)).toBeCloseTo(5, 3);
    const cone = { kind: 'cone', x: 0, z: 0, yaw: 0, r: 6, half: Math.PI / 4 } as const;
    expect(zoneDistOutside(cone, 0, 3)).toBe(0);
    expect(zoneDistOutside(cone, 0, 9)).toBeCloseTo(3, 2);
    expect(zoneDistOutside(cone, 0, -2)).toBeCloseTo(2, 2);
  });

  it('diện tích', () => {
    expect(zoneArea({ kind: 'circle', x: 0, z: 0, r: 2 })).toBeCloseTo(Math.PI * 4, 6);
    expect(zoneArea({ kind: 'rect', x: 0, z: 0, yaw: 1, len: 10, w: 3 })).toBe(30);
    expect(zoneArea({ kind: 'cone', x: 0, z: 0, yaw: 0, r: 4, half: Math.PI / 2 })).toBeCloseTo(Math.PI * 8, 6);
  });
});
