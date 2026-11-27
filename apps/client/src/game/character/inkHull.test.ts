import * as THREE from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { INK_HULL_MAX, INK_MAX_OF_BODY, INK_STATE, INK_WIDTH, InkHulls, inkStateOf, inkWidthOf, skinnedWorldScale } from './inkHull';

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
  // Thể thật luôn nằm trong cảnh; thể bị gỡ khỏi cảnh thì `sync` trả chỗ viền.
  new THREE.Group().add(g);
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

describe('InkHulls chọn lưới LOD thấp cho vỏ', () => {
  it('có lưới LOD 1 thì vỏ dùng hình học của nó; vỏ hiện khi bất kỳ bậc nào đang hiện', () => {
    const h = new InkHulls();
    const a = body();
    const lod0 = a.children[0] as THREE.SkinnedMesh;
    const lod1 = (body().children[0] as THREE.SkinnedMesh).clone();
    lod1.geometry = lod0.geometry.clone();
    lod1.userData.lod = 1;
    lod1.visible = false;
    a.add(lod1);
    expect(h.attach(a)).toBe(true);
    const hull = a.children.find((o) => o.userData.inkHull) as THREE.SkinnedMesh;
    expect(hull.geometry).toBe(lod1.geometry);
    h.sync();
    expect(hull.visible).toBe(true);
    lod0.visible = false;
    h.sync();
    expect(hull.visible).toBe(false);
    lod1.visible = true;
    h.sync();
    expect(hull.visible).toBe(true);
    h.dispose();
  });
});

describe('InkHulls với skin quái (Diễn Võ Trường tìm ra)', () => {
  it('vỏ theo đúng kiểu gắn xương của lưới gốc (skin quái dùng kiểu detached)', () => {
    const g = body();
    const src = g.children[0] as THREE.SkinnedMesh;
    src.bindMode = THREE.DetachedBindMode;
    const h = new InkHulls();
    expect(h.attach(g)).toBe(true);
    const hull = src.parent!.children.find((c) => c.userData.inkHull) as THREE.SkinnedMesh;
    expect(hull.bindMode).toBe(THREE.DetachedBindMode);
  });

  it('kiểu detached: tỉ lệ thế giới lấy cả ma trận của nút lưới (xương nằm ngoài cảnh)', () => {
    const g = body(2);
    const src = g.children[0] as THREE.SkinnedMesh;
    expect(skinnedWorldScale(src)).toBeCloseTo(2, 5);
    // Dựng lại như skin quái: xương ở không gian riêng (không nằm dưới nút lưới), lưới detached đặt nó vào thế giới.
    const bone = new THREE.Bone();
    bone.updateMatrixWorld(true);
    src.bindMode = THREE.DetachedBindMode;
    src.bind(new THREE.Skeleton([bone]), new THREE.Matrix4());
    expect(skinnedWorldScale(src)).toBeCloseTo(2, 5);
  });

  it('thể bị gỡ khỏi cảnh thì sync trả chỗ, thể mới gắn được dù trước đó đã đầy', () => {
    const h = new InkHulls();
    const olds = Array.from({ length: INK_HULL_MAX }, () => body());
    for (const o of olds) expect(h.attach(o)).toBe(true);
    const fresh = body();
    expect(h.attach(fresh)).toBe(false);
    for (const o of olds.slice(0, 3)) o.removeFromParent();
    h.sync();
    expect(h.count).toBe(INK_HULL_MAX - 3);
    expect(h.attach(fresh)).toBe(true);
  });
});

describe('inkWidthOf (bề dày viền theo cỡ thân)', () => {
  it('thân lớn: đủ bề dày của trạng thái; thân nhỏ: bị trần theo bán kính, nhưng không mỏng hơn viền thường', () => {
    const mul = INK_STATE.weak.mul;
    expect(inkWidthOf(mul, 3)).toBeCloseTo(INK_WIDTH * mul, 6);
    expect(inkWidthOf(mul, 0.9)).toBeCloseTo(0.9 * INK_MAX_OF_BODY, 6);
    expect(inkWidthOf(mul, 0.1)).toBe(INK_WIDTH);
    expect(inkWidthOf(1, 0.9)).toBe(INK_WIDTH);
  });

  it('want + sync: chia suất theo điểm ưu tiên, thể không xin nữa bị nhả, thể gần hơn giành suất của thể xa', () => {
    const h = new InkHulls();
    const scene = new THREE.Scene();
    const all = Array.from({ length: INK_HULL_MAX + 4 }, () => body());
    all.forEach((b) => scene.add(b));
    all.forEach((b, i) => h.want(b, i === 0 ? -2 : i * 10));
    h.sync();
    expect(h.count).toBe(INK_HULL_MAX);
    expect(h.has(all[0]!)).toBe(true);
    expect(h.has(all[INK_HULL_MAX + 3]!)).toBe(false);
    // Khung sau: thể xa nhất lại gần hẳn, thể đầu không xin nữa.
    all.forEach((b, i) => i !== 0 && h.want(b, i === INK_HULL_MAX + 3 ? 1 : i * 10));
    h.sync();
    expect(h.has(all[0]!)).toBe(false);
    expect(h.has(all[INK_HULL_MAX + 3]!)).toBe(true);
    expect(h.count).toBe(INK_HULL_MAX);
    // Không ai xin: giữ nguyên (đường cũ gọi attach/release trực tiếp không bị ảnh hưởng).
    h.sync();
    expect(h.count).toBe(INK_HULL_MAX);
    h.dispose();
  });
});
