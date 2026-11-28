import * as THREE from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { CELL_MIN_TRIS, splitMeshByCells, splitMeshesUnder } from './meshCells';

/** Lưới phẳng n×n ô vuông (2 tam giác mỗi ô) kích thước size×size, góc ở (x0, z0). */
function grid(n: number, size: number, x0: number, z0: number): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(size, size, n, n);
  g.rotateX(-Math.PI / 2);
  g.translate(x0 + size / 2, 0, z0 + size / 2);
  return g;
}

describe('splitMeshByCells', () => {
  const mat = new THREE.MeshBasicMaterial();
  it('giữ nguyên lưới nhỏ', () => {
    expect(splitMeshByCells(new THREE.Mesh(grid(10, 100, 0, 0), mat))).toBeNull();
  });
  it('chia lưới lớn thành ô, bảo toàn tam giác và thuộc tính', () => {
    const geo = grid(80, 128, 0, 0); // 12 800 tam giác, 4×4 ô 32 m
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = 'arch';
    mesh.castShadow = true;
    const parts = splitMeshByCells(mesh, 32)!;
    expect(parts.length).toBe(16);
    const tris = parts.reduce((a, p) => a + p.geometry.index!.count / 3, 0);
    expect(tris).toBe(geo.index!.count / 3);
    for (const p of parts) {
      expect(p.castShadow).toBe(true);
      expect(p.frustumCulled).toBe(true);
      expect(p.material).toBe(mat);
      expect(p.geometry.getAttribute('uv').count).toBe(p.geometry.getAttribute('position').count);
      expect(p.geometry.boundingSphere!.radius).toBeLessThan(40);
      expect(p.geometry.index!.count / 3).toBeGreaterThanOrEqual(CELL_MIN_TRIS);
    }
  });
  it('lưới có biến đổi cục bộ: ô theo toạ độ thế giới, lưới con giữ biến đổi', () => {
    const root = new THREE.Group();
    root.position.set(1024, 0, 1024);
    const mesh = new THREE.Mesh(grid(80, 128, 0, 0), mat);
    root.add(mesh);
    const r = splitMeshesUnder(root, 32);
    expect(r).toEqual({ split: 1, made: 16 });
    expect(root.children.length).toBe(16);
    root.updateMatrixWorld(true);
    const box = new THREE.Box3();
    for (const p of root.children as THREE.Mesh[]) box.union(new THREE.Box3().setFromObject(p));
    expect(box.min.x).toBeCloseTo(1024, 3);
    expect(box.max.z).toBeCloseTo(1152, 3);
  });
  it('bỏ qua nhóm vật liệu, instancing', () => {
    const geo = grid(80, 128, 0, 0);
    geo.addGroup(0, 100, 0);
    geo.addGroup(100, 100, 1);
    expect(splitMeshByCells(new THREE.Mesh(geo, [mat, mat]))).toBeNull();
    expect(splitMeshByCells(new THREE.InstancedMesh(grid(80, 128, 0, 0), mat, 2))).toBeNull();
  });
});
