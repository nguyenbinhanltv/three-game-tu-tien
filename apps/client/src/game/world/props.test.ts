import * as THREE from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { allProps } from './propScatter';
import { bakeGeometry, PropLayer, treeInView } from './props';

describe('prop layer (P2-A4)', () => {
  it('bakeGeometry: vị trí int16 chuẩn hóa + ma trận nút ra đúng kích thước, không bị kẹp về [-1, 1]', () => {
    const g = new THREE.BufferGeometry();
    // Hộp đơn vị lượng tử hóa: ±32767 ↔ ±1, nút giải lượng tử bằng tỉ lệ 1,4 và dịch chuyển lên 1,4 (như prop_den_da).
    g.setAttribute(
      'position',
      new THREE.BufferAttribute(new Int16Array([-32767, -32767, -32767, 32767, 32767, 32767, 32767, -32767, 0]), 3, true),
    );
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

  it('dispose giải phóng hình học đã nướng (không thuộc AssetHandle) đúng một lần và nhả handle', async () => {
    const scene = new THREE.Group();
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Int16Array([0, 0, 0, 32767, 0, 0, 0, 32767, 0]), 3, true));
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial());
    mesh.scale.setScalar(2); // nút không phải ma trận đơn vị → phải nướng
    scene.add(mesh);
    let released = 0;
    const cache = { acquire: async () => ({ id: 'prop_den_da', scene, animations: [], release: () => released++ }) };
    const layer = new PropLayer(cache as never, [{ id: 'prop_den_da', x: 10, y: 0, z: 10, yaw: 0, s: 1 }]);
    layer.update(1, 10, 10); // yêu cầu nạp
    await new Promise((r) => setTimeout(r, 20));
    const t = (
      layer as unknown as { templates: Map<string, { lods: { geometry: THREE.BufferGeometry; owned?: boolean }[][] }> }
    ).templates.get('prop_den_da')!;
    const baked = t.lods[0]![0]!;
    expect(baked.owned).toBe(true);
    expect(baked.geometry).not.toBe(geo);
    let disposed = 0;
    baked.geometry.addEventListener('dispose', () => disposed++);
    layer.dispose();
    expect(disposed).toBe(1);
    expect(released).toBe(1);
  });

  it('treeInView: camera chéo chỉ giữ cây trong/sát khung nhìn, bỏ cây ngoài màn hình (giảm tam giác pool)', () => {
    // Camera giống game: FOV 32°, nghiêng 52° (nhìn xuống), cách 20 m, nhìn về (100, 0, 100).
    const cam = new THREE.PerspectiveCamera(32, 16 / 9, 0.5, 600);
    const pitch = (52 * Math.PI) / 180;
    cam.position.set(100, Math.sin(pitch) * 20, 100 + Math.cos(pitch) * 20);
    cam.lookAt(100, 0, 100);
    cam.updateMatrixWorld();
    const fr = new THREE.Frustum().setFromProjectionMatrix(
      new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse),
      cam.coordinateSystem,
    );
    const sp = new THREE.Sphere();
    expect(treeInView(fr, sp, 100, 0, 100, 1, 10)).toBe(true); // ngay giữa khung
    expect(treeInView(fr, sp, 100, 0, 220, 1, 10)).toBe(false); // sau lưng camera
    expect(treeInView(fr, sp, 100, 0, -150, 1, 10)).toBe(false); // quá xa phía trước
    expect(treeInView(fr, sp, 300, 0, 100, 1, 10)).toBe(false); // lệch ngang 200 m
    // lề lớn hơn (có bóng) giữ thêm cây sát khung
    const near = treeInView(fr, sp, 100 + 45, 0, 100, 1, 10);
    expect(treeInView(fr, sp, 100 + 45, 0, 100, 1, 32) || !near).toBe(true);
  });
});
