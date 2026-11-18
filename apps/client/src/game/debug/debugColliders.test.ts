import { describe, expect, it } from 'vitest';
import { collidersNear, writeCollider } from './debugColliders';

describe('khung va chạm (bảng F3)', () => {
  const list = [
    { x: 0, z: 0, r: 2 },
    { x: 100, z: 0, r: 5 },
    { x: 400, z: 0, r: 10 },
    { x: 228, z: 0, r: 10 },
  ];

  it('chỉ lấy collider trong tầm, tính cả bán kính', () => {
    expect(collidersNear(list, 0, 0).map((c) => c.x)).toEqual([0, 100, 228]);
    expect(collidersNear(list, 0, 0, 50).map((c) => c.x)).toEqual([0]);
  });

  it('vòng tròn nằm đúng bán kính, bám mặt đất, có cọc đứng ở tâm', () => {
    const out = new Float32Array(200 * 3);
    const end = writeCollider(out, 0, { x: 10, z: 20, r: 4 }, (x) => x * 0.1);
    const verts = end / 3;
    expect(verts).toBe(28 * 2 + 2);
    for (let v = 0; v < verts - 2; v++) {
      const [x, y, z] = [out[v * 3], out[v * 3 + 1], out[v * 3 + 2]];
      expect(Math.hypot(x - 10, z - 20)).toBeCloseTo(4, 4);
      expect(y).toBeCloseTo(x * 0.1 + 0.25, 4);
    }
    // Đoạn kề nhau nối liền: đỉnh cuối đoạn k trùng đỉnh đầu đoạn k + 1.
    expect(out[3]).toBeCloseTo(out[6], 5);
    const post = (verts - 2) * 3;
    expect([out[post], out[post + 2], out[post + 3], out[post + 5]]).toEqual([10, 20, 10, 20]);
    expect(out[post + 4] - out[post + 1]).toBeCloseTo(3, 5);
  });
});
