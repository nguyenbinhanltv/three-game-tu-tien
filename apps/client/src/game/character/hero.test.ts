import { describe, expect, it } from 'vitest';
import * as THREE from 'three/webgpu';
import { applyProportions, forgetHero, HERO_DEFAULT_TINT, HERO_PROPORTIONS, proportionBones, setHero } from './hero';
import { boneKey } from './ikpose';

function rig(): THREE.Object3D {
  const root = new THREE.Group();
  const hips = new THREE.Bone();
  hips.name = 'pelvis';
  const names = ['clavicle_l', 'clavicle_r', 'Head', 'hand_l', 'hand_r', 'thigh_l'];
  for (const n of names) {
    const b = new THREE.Bone();
    b.name = n;
    hips.add(b);
  }
  root.add(hips);
  return root;
}

describe('tỉ lệ đọc từ trên (C2)', () => {
  it('bảng tỉ lệ trong 10–15% và chỉ chạm vai, đầu, bàn tay', () => {
    for (const [k, s] of Object.entries(HERO_PROPORTIONS)) {
      expect(s).toBeGreaterThanOrEqual(1.05);
      expect(s).toBeLessThanOrEqual(1.15);
      expect(/clavicle|shoulder|head|hand/.test(k)).toBe(true);
    }
  });
  it('tìm đúng xương UE5 và áp scale; xương khác (đùi) giữ nguyên; k=0 trả về 1', () => {
    const r = rig();
    const list = proportionBones(r, boneKey);
    expect(list.map((e) => e.bone.name).sort()).toEqual(['Head', 'clavicle_l', 'clavicle_r', 'hand_l', 'hand_r']);
    applyProportions(list);
    expect(r.getObjectByName('clavicle_l')!.scale.x).toBeCloseTo(1.12);
    expect(r.getObjectByName('hand_r')!.scale.x).toBeCloseTo(1.14);
    expect(r.getObjectByName('thigh_l')!.scale.x).toBe(1);
    applyProportions(list, 0);
    expect(r.getObjectByName('clavicle_l')!.scale.x).toBe(1);
  });
});

describe('hero light: userData theo mesh', () => {
  it('bật/tắt và đổi màu viền chỉ ghi vào mesh của root', () => {
    const root = new THREE.Group();
    const a = new THREE.Mesh();
    const b = new THREE.Mesh();
    root.add(a, b);
    setHero(root, 1, 0x123456);
    expect(a.userData.hero).toEqual({ k: 1, tint: 0x123456 });
    setHero(root, 1, HERO_DEFAULT_TINT);
    expect(b.userData.hero).toEqual({ k: 1, tint: HERO_DEFAULT_TINT });
    setHero(root, 0, 0);
    expect(a.userData.hero).toBeUndefined();
    // Mesh mới thêm sau khi đã nhớ danh sách chỉ được thấy sau khi quên.
    const c = new THREE.Mesh();
    root.add(c);
    setHero(root, 1, 1);
    expect(c.userData.hero).toBeUndefined();
    forgetHero(root);
    setHero(root, 1, 1);
    expect(c.userData.hero).toEqual({ k: 1, tint: 1 });
  });
});
