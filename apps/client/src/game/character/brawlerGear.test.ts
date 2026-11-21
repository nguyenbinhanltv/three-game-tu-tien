import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { PATHS } from '@dtl/content';
import { attachBrawlerGear, BRAWLER_WEAPON, snapshotBind } from './brawlerGear';

function bone(name: string, x: number, y: number, z = 0, parent?: THREE.Object3D): THREE.Bone {
  const b = new THREE.Bone();
  b.name = name;
  b.position.set(x, y, z);
  parent?.add(b);
  return b;
}

/** Bộ xương tối giản đủ tên xương cần cho găng/giáp (A-pose, nhìn +Z). */
function rig(): THREE.Group {
  const g = new THREE.Group();
  const pelvis = bone('pelvis', 0, 0.95, 0, g);
  const s1 = bone('spine_01', 0, 0.1, 0, pelvis);
  const s2 = bone('spine_02', 0, 0.12, 0, s1);
  const s3 = bone('spine_03', 0, 0.12, 0, s2);
  for (const [sd, sg] of [
    ['l', 1],
    ['r', -1],
  ] as const) {
    const up = bone(`upperarm_${sd}`, 0.2 * sg, 0.1, 0, s3);
    const lo = bone(`lowerarm_${sd}`, 0.15 * sg, -0.1, 0, up);
    bone(`hand_${sd}`, 0.12 * sg, -0.12, 0, lo);
    const th = bone(`thigh_${sd}`, 0.1 * sg, -0.05, 0, pelvis);
    const ca = bone(`calf_${sd}`, 0, -0.42, 0, th);
    bone(`foot_${sd}`, 0, -0.4, 0, ca);
  }
  return g;
}

describe('Thể tu: găng + giáp nhẹ thủ tục', () => {
  it('hướng the_tu khai tay không; hai hướng kia vẫn cầm kiếm', () => {
    expect(PATHS.find((p) => p.id === 'the_tu')!.weapons).toEqual([BRAWLER_WEAPON]);
    for (const p of PATHS.filter((p) => p.id !== 'the_tu')) expect(p.weapons).not.toContain(BRAWLER_WEAPON);
  });

  it('gắn 7 mesh vào đúng xương, mỗi mesh một vật liệu chung, hữu hạn và theo chiều cao', () => {
    const r = rig();
    const gear = attachBrawlerGear(r, snapshotBind(r), 1.7);
    expect(gear.meshes).toHaveLength(7);
    expect(new Set(gear.meshes.map((m) => m.material)).size).toBe(1);
    const parents = gear.meshes.map((m) => m.parent!.name).sort();
    expect(parents).toEqual(['calf_l', 'calf_r', 'hand_l', 'hand_r', 'spine_01', 'spine_03', 'upperarm_l']);
    expect(parents).toContain('upperarm_l');
    expect(parents).not.toContain('upperarm_r'); // giáp vai chỉ bên trái (có chủ ý)
    r.updateMatrixWorld(true);
    for (const m of gear.meshes) {
      const bb = new THREE.Box3().setFromObject(m);
      expect(Number.isFinite(bb.min.x + bb.max.y + bb.max.z)).toBe(true);
      expect(bb.getSize(new THREE.Vector3()).length()).toBeLessThan(1);
    }
  });

  it('đứng đúng chỗ sau khi xương đổi tư thế (theo xương, không dính hệ rig)', () => {
    const r = rig();
    const gear = attachBrawlerGear(r, snapshotBind(r), 1.7);
    r.updateMatrixWorld(true);
    const hand = gear.meshes.find((m) => m.parent!.name === 'hand_l')!;
    const before = new THREE.Box3().setFromObject(hand).getCenter(new THREE.Vector3());
    r.getObjectByName('upperarm_l')!.rotateZ(0.6);
    r.updateMatrixWorld(true);
    const after = new THREE.Box3().setFromObject(hand).getCenter(new THREE.Vector3());
    const handBone = r.getObjectByName('hand_l')!.getWorldPosition(new THREE.Vector3());
    expect(after.distanceTo(before)).toBeGreaterThan(0.05);
    expect(after.distanceTo(handBone)).toBeLessThan(0.25);
  });

  it('ẩn/hiện và dọn sạch', () => {
    const r = rig();
    const gear = attachBrawlerGear(r, snapshotBind(r), 1.7);
    gear.setVisible(false);
    expect(gear.meshes.every((m) => !m.visible)).toBe(true);
    gear.dispose();
    expect(gear.meshes).toHaveLength(0);
    expect(r.getObjectByName('dtl_brawler_hand_l')).toBeUndefined();
  });

  it('thiếu xương thì bỏ món đó, không lỗi', () => {
    const g = new THREE.Group();
    bone('spine_01', 0, 1, 0, g);
    const gear = attachBrawlerGear(g, snapshotBind(g), 1.7);
    expect(gear.meshes.map((m) => m.parent!.name)).toEqual(['spine_01']);
  });
});
