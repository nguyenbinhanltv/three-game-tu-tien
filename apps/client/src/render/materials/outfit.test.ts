import { describe, expect, it } from 'vitest';
import * as THREE from 'three/webgpu';
import { hasOutfitMask } from './outfit';

function orm(mask: boolean): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial();
  const t = new THREE.Texture();
  m.roughnessMap = m.metalnessMap = t; // GLTFLoader gán như vậy cho mọi texture ORM
  if (mask) m.userData.dtl_outfitMask = 1;
  return m;
}

describe('hasOutfitMask', () => {
  it('ORM thường của Tripo (bản tạm #119) không phải mặt nạ', () => {
    expect(hasOutfitMask(orm(false))).toBe(false);
  });
  it('material có đánh dấu dtl_outfitMask và ORM chung texture là mặt nạ', () => {
    expect(hasOutfitMask(orm(true))).toBe(true);
  });
  it('có dấu nhưng thiếu texture thì không', () => {
    const m = new THREE.MeshStandardMaterial();
    m.userData.dtl_outfitMask = 1;
    expect(hasOutfitMask(m)).toBe(false);
  });
});
