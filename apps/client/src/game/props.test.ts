import * as THREE from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { allProps } from './propScatter';
import { bakeGeometry, PropLayer } from './props';

describe('prop layer (P2-A4)', () => {
  it('bakeGeometry: vị trí int16 chuẩn hóa + ma trận nút ra đúng kích thước, không bị kẹp về [-1, 1]', () => {
    const g = new THREE.BufferGeometry();
    // Hộp đơn vị lượng tử hóa: ±32767 ↔ ±1, nút giải lượng tử bằng tỉ lệ 1,4 và dịch chuyển lên 1,4 (như prop_den_da).
    g.setAttribute('position', new THREE.BufferAttribute(new Int16Array([-32767, -32767, -32767, 32767, 32767, 32767, 32767, -32767, 0]), 3, true));
    g.setAttribute('normal', new THREE.BufferAttribute(new Int8Array([0, 127, 0, 0, 127, 0, 0, 127, 0]), 3, true));
    const m = new THREE.Matrix4().compose(new THREE.Vector3(0, 1.4, 0), new THREE.Quaternion(), new THREE.Vector3(1.4, 1.4, 1.4));
    const b = bakeGeometry(g, m);
    const box = b.boundingBox!;
    expect(box.min.y).toBeCloseTo(0, 3);
    expect(box.max.y).toBeCloseTo(2.8, 3);
    expect(box.max.x).toBeCloseTo(1.4, 3);
    expect(b.getAttribute('position').array).toBeInstanceOf(Float32Array);
    expect(b.getAttribute('normal').getY(0)).toBeCloseTo(1, 2);
  });

  it('gom instance theo ô × asset, không mất instance nào', () => {
    const layer = new PropLayer({} as never);
    expect(layer.count).toBe(allProps().length);
    layer.dispose();
  });
});
