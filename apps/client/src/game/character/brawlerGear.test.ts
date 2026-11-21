import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { PATHS } from '@dtl/content';
import { attachBrawlerGear, BRAWLER_COLORS, BRAWLER_WEAPON, COTHAN_COLORS, gearShown, snapshotBind } from './brawlerGear';

function bone(name: string, x: number, y: number, z = 0, parent?: THREE.Object3D): THREE.Bone {
  const b = new THREE.Bone();
  b.name = name;
  b.position.set(x, y, z);
  parent?.add(b);
  return b;
}

/** Bộ xương tối giản đủ tên xương cần cho găng/giáp (A-pose, nhìn +Z) + một mesh da tham chiếu chung bộ xương. */
function rig(withSkin = true): THREE.Group {
  const g = new THREE.Group();
  const all: THREE.Bone[] = [];
  const mk = (...a: Parameters<typeof bone>): THREE.Bone => {
    const b = bone(...a);
    all.push(b);
    return b;
  };
  const pelvis = mk('pelvis', 0, 0.95, 0, g);
  const s1 = mk('spine_01', 0, 0.1, 0, pelvis);
  const s2 = mk('spine_02', 0, 0.12, 0, s1);
  const s3 = mk('spine_03', 0, 0.12, 0, s2);
  for (const [sd, sg] of [
    ['l', 1],
    ['r', -1],
  ] as const) {
    const up = mk(`upperarm_${sd}`, 0.2 * sg, 0.1, 0, s3);
    const lo = mk(`lowerarm_${sd}`, 0.15 * sg, -0.1, 0, up);
    mk(`hand_${sd}`, 0.12 * sg, -0.12, 0, lo);
    const th = mk(`thigh_${sd}`, 0.1 * sg, -0.05, 0, pelvis);
    const ca = mk(`calf_${sd}`, 0, -0.42, 0, th);
    mk(`foot_${sd}`, 0, -0.4, 0, ca);
  }
  g.updateMatrixWorld(true);
  if (withSkin) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3));
    geo.setAttribute('skinIndex', new THREE.BufferAttribute(new Uint16Array(12), 4));
    geo.setAttribute('skinWeight', new THREE.BufferAttribute(new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]), 4));
    const sm = new THREE.SkinnedMesh(geo, new THREE.MeshBasicMaterial());
    g.add(sm);
    sm.bind(new THREE.Skeleton(all));
  }
  return g;
}

describe('Thể tu: găng + giáp nhẹ thủ tục', () => {
  it('hướng the_tu khai tay không; hai hướng kia vẫn cầm kiếm (Cổ Thần cũng tay không)', () => {
    expect(PATHS.find((p) => p.id === 'the_tu')!.weapons).toEqual([BRAWLER_WEAPON]);
    for (const p of PATHS.filter((p) => p.id !== 'the_tu' && p.id !== 'co_than')) expect(p.weapons).not.toContain(BRAWLER_WEAPON);
  });

  it('gộp thành MỘT SkinnedMesh dùng chung bộ xương, đủ thuộc tính da, tam giác trong ngân sách', () => {
    const r = rig();
    const gear = attachBrawlerGear(r, snapshotBind(r), 1.7);
    expect(gear.meshes).toHaveLength(1);
    const m = gear.meshes[0] as THREE.SkinnedMesh;
    expect(m.isSkinnedMesh).toBe(true);
    const ref = r.children.find((c) => (c as THREE.SkinnedMesh).isSkinnedMesh && c !== m) as THREE.SkinnedMesh;
    expect(m.skeleton).toBe(ref.skeleton);
    const g = m.geometry;
    const n = g.getAttribute('position').count;
    expect(g.getAttribute('skinIndex').count).toBe(n);
    expect(g.getAttribute('color').count).toBe(n);
    expect(n / 3).toBeLessThan(6000); // tam giác
    // đủ xương: tay ×2, ống quyển ×2, vai trái, quấn vai phải, đai lưng, đai ngực
    const used = new Set<number>();
    for (let i = 0; i < n; i++) used.add(g.getAttribute('skinIndex').getX(i));
    const names = [...used].map((i) => ref.skeleton.bones[i]!.name).sort();
    expect(names).toEqual(['calf_l', 'calf_r', 'hand_l', 'hand_r', 'spine_01', 'spine_03', 'upperarm_l', 'upperarm_r']);
    expect(names).not.toContain('upperarm_l_r');
    g.computeBoundingBox();
    expect(g.boundingBox!.getSize(new THREE.Vector3()).length()).toBeLessThan(3);
    for (let i = 0; i < n * 3; i++) expect(Number.isFinite((g.getAttribute('position').array as Float32Array)[i])).toBe(true);
  });

  it('theo xương khi đổi tư thế (không dính hệ rig)', () => {
    const r = rig();
    const gear = attachBrawlerGear(r, snapshotBind(r), 1.7);
    const m = gear.meshes[0] as THREE.SkinnedMesh;
    r.updateMatrixWorld(true);
    const v = new THREE.Vector3();
    const handIdx = m.skeleton.bones.findIndex((b) => b.name === 'hand_l');
    const sample = (): THREE.Vector3 => {
      const a = m.geometry.getAttribute('skinIndex');
      for (let i = 0; i < a.count; i++)
        if (a.getX(i) === handIdx) {
          m.getVertexPosition(i, v);
          return v.clone().applyMatrix4(m.matrixWorld);
        }
      throw new Error('không có đỉnh tay trái');
    };
    const before = sample();
    r.getObjectByName('upperarm_l')!.rotateZ(0.6);
    r.updateMatrixWorld(true);
    expect(sample().distanceTo(before)).toBeGreaterThan(0.05);
  });

  it('chỉ vẽ ở LOD0 và khi đang là Thể tu (không tốn draw call ở xa)', () => {
    expect(gearShown(true, 0)).toBe(true);
    expect(gearShown(true, 1)).toBe(false);
    expect(gearShown(true, 2)).toBe(false);
    expect(gearShown(false, 0)).toBe(false);
    // quay về gần sau khi ở xa: bật lại đúng theo `on`, không theo trạng thái ẩn lần trước
    const r = rig();
    const gear = attachBrawlerGear(r, snapshotBind(r), 1.7);
    const m = gear.meshes[0]!;
    for (const [on, lod, want] of [
      [true, 2, false],
      [true, 0, true],
      [false, 0, false],
    ] as const) {
      gear.setVisible(gearShown(on, lod));
      expect(m.visible).toBe(want);
    }
  });

  it('ẩn/hiện và dọn sạch', () => {
    const r = rig();
    const gear = attachBrawlerGear(r, snapshotBind(r), 1.7);
    const m = gear.meshes[0]!;
    gear.setVisible(false);
    expect(m.visible).toBe(false);
    gear.dispose();
    expect(r.getObjectByName('dtl_brawler_gear')).toBeUndefined();
  });

  it('không có mesh da hoặc thiếu xương thì không lỗi', () => {
    const none = rig(false);
    expect(attachBrawlerGear(none, snapshotBind(none), 1.7).meshes).toHaveLength(0);
    const g = new THREE.Group();
    bone('spine_01', 0, 1, 0, g);
    expect(attachBrawlerGear(g, snapshotBind(g), 1.7).meshes).toHaveLength(0);
  });
});

describe('Cổ Thần: bộ giáp nâng cấp (huyết đồng + gai xương)', () => {
  const colors = (geo: THREE.BufferGeometry): Set<string> => {
    const a = geo.getAttribute('color');
    const out = new Set<string>();
    const c = new THREE.Color();
    for (let i = 0; i < a.count; i++) out.add(c.fromBufferAttribute(a, i).getHexString());
    return out;
  };
  it('vẫn một SkinnedMesh, nhiều tam giác hơn bộ Thể tu (thêm gai) nhưng trong ngân sách; đỉnh gai ăn xương vai trái', () => {
    const r = rig();
    const base = attachBrawlerGear(r, snapshotBind(r), 1.7).meshes[0] as THREE.SkinnedMesh;
    const r2 = rig();
    const gear = attachBrawlerGear(r2, snapshotBind(r2), 1.7, true);
    expect(gear.meshes).toHaveLength(1);
    const m = gear.meshes[0] as THREE.SkinnedMesh;
    expect(m.name).toBe('dtl_cothan_gear');
    expect(m.geometry.getAttribute('position').count).toBeGreaterThan(base.geometry.getAttribute('position').count);
    expect(m.geometry.getAttribute('position').count / 3).toBeLessThan(6500);
    expect(m.geometry.getAttribute('skinIndex').count).toBe(m.geometry.getAttribute('position').count);
  });
  it('đổi màu sang huyết đồng, không còn màu đồng gốc của Thể tu; vải gai giữ nguyên', () => {
    const r = rig();
    const base = colors((attachBrawlerGear(r, snapshotBind(r), 1.7).meshes[0] as THREE.Mesh).geometry);
    const r2 = rig();
    const up = colors((attachBrawlerGear(r2, snapshotBind(r2), 1.7, true).meshes[0] as THREE.Mesh).geometry);
    const hex = (n: number): string => new THREE.Color(n).getHexString();
    expect(base.has(hex(BRAWLER_COLORS.bronze))).toBe(true);
    for (const k of ['earth', 'bronze', 'brass'] as const) {
      expect(up.has(hex(BRAWLER_COLORS[k]))).toBe(false);
      expect(up.has(hex(COTHAN_COLORS[k]))).toBe(true);
    }
    expect(up.has(hex(BRAWLER_COLORS.linen))).toBe(true);
  });
});
