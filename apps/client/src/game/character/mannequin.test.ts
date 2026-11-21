import { describe, expect, it } from 'vitest';
import * as THREE from 'three/webgpu';
import { baseClipOf, CHR_V3, JOG_SPEED, lod0Slots, V3_MODELS, v3AssetOf } from './mannequin';
import { lodOf, mergeLodMeshes } from './mannequinLod';
import type { AnimState } from './view';

const st = (o: Partial<AnimState> = {}): AnimState => ({
  speed: 0,
  flying: false,
  meditating: false,
  dead: false,
  casting: false,
  airborne: false,
  ...o,
});

describe('baseClipOf (v3, clip UAL)', () => {
  it('chọn clip nền theo trạng thái, chết thắng mọi thứ', () => {
    expect(baseClipOf(st())).toBe('Idle_Loop');
    expect(baseClipOf(st({ combat: true }))).toBe('Sword_Idle');
    expect(baseClipOf(st({ speed: 3 }))).toBe('Jog_Fwd_Loop');
    expect(baseClipOf(st({ meditating: true }))).toBe('Sitting_Idle_Loop');
    expect(baseClipOf(st({ casting: true }))).toBe('Spell_Simple_Idle_Loop');
    expect(baseClipOf(st({ airborne: true }))).toBe('Jump_Loop');
    expect(baseClipOf(st({ flying: true }))).toBe('NinjaJump_Idle_Loop');
    expect(baseClipOf(st({ dead: true, speed: 3, flying: true }))).toBe('Death01');
  });
  it('tốc độ chân trụ tham chiếu khớp số đo trong game (5,4 m/s)', () => {
    expect(JOG_SPEED).toBeCloseTo(5.4, 2);
  });
});

describe('v3AssetOf (chọn asset v3 theo giới + skin)', () => {
  it('không skin, không bộ: Đồ Đệ Tử (đồ khởi đầu) theo giới', () => {
    expect(v3AssetOf('f')).toBe('chr_v3_de_tu_nu');
    expect(v3AssetOf('m')).toBe('chr_v3_de_tu_nam');
  });
  it('theo bộ trang bị: bộ có model riêng, bộ khác về model cùng nhánh', () => {
    expect(v3AssetOf('m', undefined, 'set_huyen_giap')).toBe('chr_v3_huyen_giap_nam');
    expect(v3AssetOf('f', undefined, 'set_dan_tam')).toBe('chr_v3_dan_tam_nu');
    expect(v3AssetOf('f', undefined, 'set_lac_kiem')).toBe(V3_MODELS.f);
    expect(v3AssetOf('m', undefined, 'set_dia_giap')).toBe('chr_v3_dia_long_nam');
    expect(v3AssetOf('f', undefined, 'set_co_thanh')).toBe('chr_v3_co_thanh_nu');
    expect(v3AssetOf('m', undefined, 'set_van_kinh')).toBe('chr_v3_van_kinh_nam');
    expect(v3AssetOf('m', undefined, 'set_tan_thiet')).toBe('chr_v3_huyen_giap_nam');
    expect(v3AssetOf('f', undefined, 'set_luu_ly')).toBe('chr_v3_luu_ly_nu');
    expect(v3AssetOf('m', undefined, 'set_phuc_mach')).toBe('chr_v3_phuc_mach_nam');
    expect(v3AssetOf('f', undefined, 'set_than_tang')).toBe('chr_v3_than_tang_nu');
    expect(v3AssetOf('f', undefined, 'set_tinh_dan_bao')).toBe('chr_v3_dan_tam_nu');
    expect(v3AssetOf('m', undefined, 'set_tinh_khuyet')).toBe('chr_v3_tinh_khuyet_nam');
    expect(v3AssetOf('f', undefined, 'set_kinh_quang')).toBe('chr_v3_kinh_quang_nu');
    expect(v3AssetOf('m', undefined, 'set_liet_mach')).toBe('chr_v3_liet_mach_nam');
    expect(v3AssetOf('m', undefined, 'set_han_giao')).toBe(V3_MODELS.m);
    expect(v3AssetOf('m', undefined, 'set_khong_co')).toBe(V3_MODELS.m);
  });
  it('skin đè bộ trang bị', () => {
    expect(v3AssetOf('f', 'set_skin_duskrella', 'set_huyen_giap')).toBe('chr_v3_duskrella_nu');
  });
  it('skin đúng giới đổi asset', () => {
    expect(v3AssetOf('f', 'set_skin_duskrella')).toBe('chr_v3_duskrella_nu');
    expect(v3AssetOf('m', 'set_skin_crimson')).toBe('chr_v3_crimson_nam');
    expect(v3AssetOf('f', 'set_skin_noxavyra')).toBe('chr_v3_noxavyra_nu');
    expect(v3AssetOf('f', 'set_skin_kings_demon')).toBe('chr_v3_kings_demon_nu');
    expect(v3AssetOf('m', 'set_skin_korvaden')).toBe('chr_v3_korvaden_nam');
    expect(v3AssetOf('m', 'set_skin_shadow_wolf')).toBe('chr_v3_shadow_wolf_nam');
  });
  it('skin sai giới hoặc không có bản v3 thì về model theo bộ (không bộ: Đồ Đệ Tử)', () => {
    expect(v3AssetOf('m', 'set_skin_duskrella')).toBe('chr_v3_de_tu_nam');
    expect(v3AssetOf('f', 'set_skin_crimson')).toBe('chr_v3_de_tu_nu');
    expect(v3AssetOf('m', 'set_skin_noxavyra')).toBe('chr_v3_de_tu_nam');
    expect(v3AssetOf('m', 'set_skin_kings_demon')).toBe('chr_v3_de_tu_nam');
    expect(v3AssetOf('f', 'set_skin_khong_co')).toBe('chr_v3_de_tu_nu');
  });
});

describe('twist (N-4)', () => {
  it('tách góc xoắn quanh trục xương, bỏ phần swing', async () => {
    const { twistAngle } = await import('./mannequin');
    const THREE = await import('three');
    const axis = new THREE.Vector3(0, 1, 0);
    expect(twistAngle(new THREE.Quaternion().setFromAxisAngle(axis, 0.8), axis)).toBeCloseTo(0.8, 5);
    expect(twistAngle(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.8), axis)).toBeCloseTo(0, 5);
    const both = new THREE.Quaternion()
      .setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.6)
      .multiply(new THREE.Quaternion().setFromAxisAngle(axis, -0.5));
    expect(twistAngle(both, axis)).toBeCloseTo(-0.5, 1);
  });
});

describe('jogRate (chống trượt chân)', () => {
  it('phát theo tốc độ chạy / 5,4 và kẹp trong [0,4; 2]', async () => {
    const { jogRate, JOG_SPEED } = await import('./mannequin');
    expect(jogRate(JOG_SPEED)).toBeCloseTo(1, 5);
    expect(jogRate(JOG_SPEED * 1.3)).toBeCloseTo(1.3, 5);
    expect(jogRate(0.1)).toBe(0.4);
    expect(jogRate(100)).toBe(2);
  });
});

describe('lod0Slots', () => {
  it('LOD0 gốc Tripo ~100k tam giác chiếm 3 suất, LOD 24k chiếm 1', () => {
    expect(lod0Slots(99518)).toBe(3);
    expect(lod0Slots(102000)).toBe(3);
    expect(lod0Slots(102001)).toBe(4);
    expect(lod0Slots(24000)).toBe(1);
    expect(lod0Slots(0)).toBe(1);
  });
});

describe('CHR_V3 (N-7)', () => {
  it('không có cờ URL thì nhân vật v3 bật (mặc định)', () => {
    expect(CHR_V3).toBe(true);
  });
});

describe('lodOf (N-7: LOD của lưới nhiều primitive)', () => {
  it('lấy mức LOD của nhóm cha khi lưới con không có userData.lod', () => {
    const root = new THREE.Group();
    const lod0 = new THREE.Mesh();
    const group = new THREE.Group();
    group.userData.lod = 2;
    const a = new THREE.Mesh();
    const b = new THREE.Mesh();
    group.add(a, b);
    const single = new THREE.Mesh();
    single.userData.lod = 1;
    root.add(lod0, group, single);
    expect([lod0, a, b, single].map((m) => lodOf(m, root))).toEqual([0, 2, 2, 1]);
  });

  it('không đọc quá gốc rig', () => {
    const outer = new THREE.Group();
    outer.userData.lod = 2;
    const root = new THREE.Group();
    const m = new THREE.Mesh();
    root.add(m);
    outer.add(root);
    expect(lodOf(m, root)).toBe(0);
  });
});

describe('mergeLodMeshes (N-7: một draw call mỗi mức LOD xa)', () => {
  const tri = (n: number) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 9), 3));
    g.setAttribute('skinIndex', new THREE.BufferAttribute(new Uint16Array(n * 12), 4));
    g.setAttribute('skinWeight', new THREE.BufferAttribute(new Float32Array(n * 12), 4));
    g.setIndex([...Array(n * 3).keys()]);
    return g;
  };
  function model() {
    const scene = new THREE.Group();
    const bone = new THREE.Bone();
    scene.add(bone);
    const mat = new THREE.MeshStandardMaterial();
    // Như asset thật: mỗi lưới một `Skeleton` riêng trên cùng danh sách xương.
    const skinned = (g: THREE.BufferGeometry, name: string) => {
      const m = new THREE.SkinnedMesh(g, mat);
      m.name = name;
      m.bind(new THREE.Skeleton([bone]), new THREE.Matrix4());
      return m;
    };
    const groupOf = (lod: number, ...ms: THREE.SkinnedMesh[]) => {
      const g = new THREE.Group();
      g.userData.lod = lod;
      g.add(...ms);
      return g;
    };
    scene.add(skinned(tri(10), 'body'), skinned(tri(2), 'sleeve'));
    scene.add(groupOf(1, skinned(tri(3), 'b1a'), skinned(tri(2), 'b1b')), groupOf(1, skinned(tri(1), 's1a'), skinned(tri(1), 's1b')));
    const single = skinned(tri(2), 'b2');
    single.userData.lod = 2;
    scene.add(single);
    return { scene, bone, mat };
  }
  const meshesAt = (scene: THREE.Object3D, lod: number) => {
    const out: THREE.SkinnedMesh[] = [];
    scene.traverse((o) => {
      if ((o as THREE.SkinnedMesh).isSkinnedMesh && lodOf(o, scene) === lod) out.push(o as THREE.SkinnedMesh);
    });
    return out;
  };

  it('LOD1 bốn primitive gộp còn một lưới, đủ tam giác, cùng bộ xương; LOD0 và mức chỉ có một lưới giữ nguyên', () => {
    const { scene, bone, mat } = model();
    const made = mergeLodMeshes(scene);
    expect(made).toHaveLength(1);
    const l1 = meshesAt(scene, 1);
    expect(l1).toHaveLength(1);
    expect(l1[0]!.geometry.index!.count / 3).toBe(7);
    expect(l1[0]!.skeleton.bones).toEqual([bone]);
    expect(l1[0]!.material).toBe(mat);
    expect(l1[0]!.visible).toBe(false);
    expect(meshesAt(scene, 0).map((m) => m.name)).toEqual(['body', 'sleeve']);
    expect(meshesAt(scene, 2).map((m) => m.name)).toEqual(['b2']);
  });

  it('thuộc tính đỉnh lệch nhau thì không gộp (để nguyên)', () => {
    const { scene } = model();
    meshesAt(scene, 1)[0]!.geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(9 * 4), 4));
    expect(mergeLodMeshes(scene)).toHaveLength(0);
    expect(meshesAt(scene, 1)).toHaveLength(4);
  });
});
