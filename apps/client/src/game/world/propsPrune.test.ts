import * as THREE from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { pruneMinorMeshes } from './props';

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
