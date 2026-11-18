import * as THREE from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { pushOutCapsule } from './spring';

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

describe('pushOutCapsule (va chạm vạt với đùi)', () => {
  const a = v(0, 1, 0);
  const b = v(0, 0.5, 0);
  it('điểm ngoài viên nang giữ nguyên', () => {
    const p = v(0.2, 0.8, 0);
    expect(pushOutCapsule(p, a, b, 0.1, v(1, 0, 0))).toBe(false);
    expect(p.x).toBeCloseTo(0.2);
  });
  it('điểm trong thân bị đẩy ra đúng bán kính theo phương vuông góc', () => {
    const p = v(0.03, 0.8, 0);
    expect(pushOutCapsule(p, a, b, 0.1, v(1, 0, 0))).toBe(true);
    expect(p.x).toBeCloseTo(0.1, 5);
    expect(p.y).toBeCloseTo(0.8, 5);
  });
  it('điểm gần đầu mút được đẩy theo hình cầu, và trên trục đúng thì dùng hướng dự phòng', () => {
    const q = v(0, 1.05, 0.02);
    pushOutCapsule(q, a, b, 0.1, v(1, 0, 0));
    expect(q.distanceTo(a)).toBeCloseTo(0.1, 5);
    const onAxis = v(0, 0.75, 0);
    pushOutCapsule(onAxis, a, b, 0.1, v(0, 0, -1));
    expect(onAxis.z).toBeCloseTo(-0.1, 5);
  });
});
