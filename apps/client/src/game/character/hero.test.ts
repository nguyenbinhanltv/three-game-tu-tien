import { describe, expect, it } from 'vitest';
import * as THREE from 'three/webgpu';
import { applyProportions, forgetHero, HERO_DEFAULT_TINT, HERO_PROPORTIONS, heroTintOf, proportionBones, setHero } from './hero';
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

describe('màu viền luôn hợp lệ (hồi quy C1: tint không được undefined/NaN)', () => {
  it('heroTintOf: hex có/không có #, thiếu hoặc sai thì màu mặc định', () => {
    expect(heroTintOf('c8a96e')).toBe(0xc8a96e);
    expect(heroTintOf('#38bdf8')).toBe(0x38bdf8);
    for (const bad of [undefined, null, '', 'zzzz', '#', 'ffffffff1', '-12']) {
      const v = heroTintOf(bad as string | undefined);
      expect(Number.isFinite(v)).toBe(true);
      expect(v).toBe(HERO_DEFAULT_TINT);
    }
  });
});

describe('vật liệu bản sao viền (hồi quy C1: không dùng MeshBasicNodeMaterial)', () => {
  it('là MeshStandardNodeMaterial không đèn, trong suốt, không ghi sâu', async () => {
    const { createHeroGhostMaterial } = await import('../../render/materials/world');
    const m = createHeroGhostMaterial();
    expect((m as unknown as { isMeshStandardNodeMaterial?: boolean }).isMeshStandardNodeMaterial).toBe(true);
    expect((m as unknown as { isMeshBasicNodeMaterial?: boolean }).isMeshBasicNodeMaterial).toBeFalsy();
    expect(m.lights).toBe(false);
    expect(m.transparent).toBe(true);
    expect(m.depthWrite).toBe(false);
    expect(m.depthNode).toBeTruthy();
  });
});
