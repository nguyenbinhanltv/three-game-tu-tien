import { describe, expect, it } from 'vitest';
import * as THREE from 'three/webgpu';
import { bodyKeep, dressedIndex, outfitAssetId, remapSkin } from './outfit';

function skinned(names: string[], joints: number[], index: number[]): THREE.SkinnedMesh {
  const g = new THREE.BufferGeometry();
  const n = joints.length;
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  g.setAttribute('skinIndex', new THREE.BufferAttribute(new Uint16Array(joints.flatMap((j) => [j, 0, 0, 0])), 4));
  g.setAttribute('skinWeight', new THREE.BufferAttribute(new Float32Array(joints.flatMap(() => [1, 0, 0, 0])), 4));
  g.setIndex(index);
  const bones = names.map((x) => Object.assign(new THREE.Bone(), { name: x }));
  const m = new THREE.SkinnedMesh(g);
  m.bind(new THREE.Skeleton(bones));
  return m;
}

describe('outfit', () => {
  it('giữ đầu, cổ, bàn tay; bỏ phần áo che', () => {
    expect(bodyKeep('head')).toBe(true);
    expect(bodyKeep('neck')).toBe(true);
    expect(bodyKeep('lefthandindex1')).toBe(true);
    expect(bodyKeep('spine2')).toBe(false);
    expect(bodyKeep('leftforearm')).toBe(false);
  });

  it('dressedIndex chỉ giữ tam giác có cả ba đỉnh thuộc nhóm giữ', () => {
    // joint 0 = mixamorig_Head, 1 = mixamorig_Spine2
    const m = skinned(['mixamorig_Head', 'mixamorig_Spine2'], [0, 0, 0, 1], [0, 1, 2, 1, 2, 3]);
    expect([...dressedIndex(m)!]).toEqual([0, 1, 2]);
    const all = skinned(['mixamorig_Head', 'mixamorig_Spine2'], [0, 0, 0], [0, 1, 2]);
    expect(dressedIndex(all)).toBeNull();
  });

  it('remapSkin đổi chỉ số xương theo tên', () => {
    const garment = skinned(['mixamorig_Hips', 'mixamorig_Spine'], [1, 0], [0, 1, 0]);
    const geo = remapSkin(garment, [{ name: 'mixamorig_Spine' }, { name: 'extra' }, { name: 'mixamorig_Hips' }])!;
    const si = geo.getAttribute('skinIndex');
    expect([si.getX(0), si.getX(1)]).toEqual([0, 2]);
  });

  it('outfitAssetId thêm hậu tố giới theo model', () => {
    expect(outfitAssetId('set_liet_mach_kiem_y', 'chr_kiem_tu_nam')).toBe('set_liet_mach_kiem_y_nam');
    expect(outfitAssetId('set_liet_mach_kiem_y', 'chr_kiem_tu_nu')).toBe('set_liet_mach_kiem_y_nu');
    expect(outfitAssetId(undefined, 'chr_kiem_tu_nam')).toBeNull();
  });
});
