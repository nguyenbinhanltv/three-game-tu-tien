import * as THREE from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { INK_HULL_MAX, INK_STATE, INK_WIDTH, InkHulls, inkStateOf } from './inkHull';

function body(scale = 1): THREE.Group {
  const g = new THREE.Group();
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Array(12).fill(0), 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], 4));
  const bone = new THREE.Bone();
  const mesh = new THREE.SkinnedMesh(geo, new THREE.MeshStandardNodeMaterial());
  mesh.add(bone);
  mesh.bind(new THREE.Skeleton([bone]));
  g.add(mesh);
  g.scale.setScalar(scale);
  g.updateMatrixWorld(true);
  return g;
}

describe('inkStateOf (màu viền theo trạng thái quái)', () => {
  it('vỡ thế thắng lộ yếu điểm, rồi tới boss đã sang pha sau, còn lại là mực thường', () => {
    expect(inkStateOf(false, false, 0)).toBe('normal');
    expect(inkStateOf(true, false, 0)).toBe('weak');
    expect(inkStateOf(true, true, 2)).toBe('broken');
    expect(inkStateOf(false, false, 1)).toBe('rage');
  });

  it('màu lộ yếu điểm là vàng (không cam/đỏ: đỏ chỉ cho cuồng nộ và vạch báo)', () => {
    const c = INK_STATE.weak.color;
    const r = (c >> 16) & 255;
    const g = (c >> 8) & 255;
    expect(g).toBeGreaterThan(r * 0.75);
  });
});

describe('InkHulls', () => {
  it('gắn một vỏ dùng chung hình học + bộ xương, bề dày đổi theo tỉ lệ thế giới và trạng thái', () => {
    const h = new InkHulls();
    const a = body(2);
    expect(h.attach(a)).toBe(true);
    expect(h.attach(a)).toBe(true);
    expect(h.count).toBe(1);
    const hull = a.children.find((o) => o.userData.inkHull) as THREE.SkinnedMesh;
    const src = a.children.find((o) => !o.userData.inkHull) as THREE.SkinnedMesh;
    expect(hull.geometry).toBe(src.geometry);
    expect(hull.skeleton).toBe(src.skeleton);
    expect(hull.castShadow).toBe(false);
    expect(hull.userData.ink.w).toBeCloseTo(INK_WIDTH / 2);
    h.style(a, 'rage');
    expect(hull.userData.ink.w).toBeCloseTo((INK_WIDTH * INK_STATE.rage.mul) / 2);
    expect(hull.userData.ink.color).toBe(INK_STATE.rage.color);
    h.dispose();
    expect(a.children.some((o) => o.userData.inkHull)).toBe(false);
  });

  it('có trần: hết chỗ thì không gắn thêm, nhả một thể thì thể khác vào được', () => {
    const h = new InkHulls();
    const all = Array.from({ length: INK_HULL_MAX + 2 }, () => body());
    const ok = all.map((b) => h.attach(b));
    expect(ok.filter(Boolean).length).toBe(INK_HULL_MAX);
    expect(h.count).toBe(INK_HULL_MAX);
    h.release(all[0]!);
    expect(h.attach(all[INK_HULL_MAX + 1]!)).toBe(true);
    h.dispose();
  });

  it('ẩn theo lưới gốc; thể không có lưới có xương thì không gắn', () => {
    const h = new InkHulls();
    const a = body();
    h.attach(a);
    const hull = a.children.find((o) => o.userData.inkHull)!;
    const src = a.children.find((o) => !o.userData.inkHull)!;
    src.visible = false;
    h.sync();
    expect(hull.visible).toBe(false);
    src.visible = true;
    h.sync();
    expect(hull.visible).toBe(true);
    expect(h.attach(new THREE.Group())).toBe(false);
    h.dispose();
  });
});
