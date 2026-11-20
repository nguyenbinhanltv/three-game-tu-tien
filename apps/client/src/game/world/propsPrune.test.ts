import * as THREE from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { mergePlainMeshes, pruneMinorMeshes } from './props';

const box = (s: number) => ({ geometry: new THREE.BoxGeometry(s, s, s) });

describe('pruneMinorMeshes: bỏ mảnh nhỏ ở LOD xa', () => {
  it('giữ mảnh lớn, bỏ mảnh có hộp bao < tỉ lệ', () => {
    const big = box(2);
    const mid = box(1.2);
    const tiny = box(0.3);
    const out = pruneMinorMeshes([big, mid, tiny], true, 0.4);
    expect(out).toEqual([big, mid]);
  });
  it('không đụng khi mức dùng chung mảng với mức trước hoặc chỉ có một mảnh', () => {
    const a = [box(2), box(0.1)];
    expect(pruneMinorMeshes(a, false)).toBe(a);
    const one = [box(0.1)];
    expect(pruneMinorMeshes(one, true)).toBe(one);
  });
  it('thẻ tán lá phẳng (ít tam giác nhưng rộng) không bị bỏ', () => {
    const wood = { geometry: new THREE.BoxGeometry(0.6, 6, 0.6) };
    const leaf = { geometry: new THREE.PlaneGeometry(5, 5) };
    expect(pruneMinorMeshes([wood, leaf], true, 0.5)).toHaveLength(2);
  });
});

describe('mergePlainMeshes: gộp mảnh đặc ở LOD xa', () => {
  const mk = (name: string, opts: Partial<THREE.MeshStandardMaterial> = {}) => {
    const material = new THREE.MeshStandardMaterial({ name, ...opts });
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const n = geometry.getAttribute('position').count;
    geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(0.5), 3));
    return { geometry, material, owned: false as boolean | undefined };
  };
  const make = (geometry: THREE.BufferGeometry) => ({
    geometry,
    material: new THREE.MeshStandardMaterial({ name: 'far' }),
    owned: true as boolean | undefined,
  });

  it('gộp ≥ 2 mảnh đặc thành một, giữ riêng mảnh phát sáng và alpha', () => {
    const a = mk('arch_sect_stone');
    const b = mk('arch_sect_wood');
    const lamp = mk('arch_sect_lamp', { emissive: new THREE.Color(1, 0.7, 0.3), emissiveIntensity: 1 });
    const leaf = mk('prop_tc_leaf', { transparent: true });
    const out = mergePlainMeshes([a, b, lamp, leaf], make);
    expect(out).toHaveLength(3);
    expect(out[0]!.owned).toBe(true);
    expect(out[0]!.geometry.getAttribute('position').count).toBe(a.geometry.getAttribute('position').count * 2);
    expect(out).toContain(lamp);
    expect(out).toContain(leaf);
  });
  it('vải phát sáng rất nhẹ vẫn gộp được; vải đung đưa (cloth=false) thì không', () => {
    const cloth = mk('arch_sect_cloth', { emissive: new THREE.Color(1, 0.85, 0.7), emissiveIntensity: 0.06 });
    const wood = mk('arch_sect_wood');
    expect(mergePlainMeshes([wood, cloth], make, true)).toHaveLength(1);
    expect(mergePlainMeshes([wood, cloth], make, false)).toHaveLength(2);
  });
  it('chỉ một mảnh đặc: không đổi', () => {
    const only = [mk('arch_sect_stone'), mk('prop_tc_leaf', { transparent: true })];
    expect(mergePlainMeshes(only, make)).toBe(only);
  });
});
