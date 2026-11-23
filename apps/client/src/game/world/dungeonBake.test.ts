import { describe, expect, it } from 'vitest';
import * as THREE from 'three/webgpu';
import { bakeDungeonCells, geoSignature, planDungeonBake } from './dungeonBake';

const box = () => new THREE.BoxGeometry(1, 1, 1);
const at = (x: number, z: number) => new THREE.Matrix4().makeTranslation(x, 0, z);

describe('dungeonBake', () => {
  it('gộp các bản cùng vật liệu trong một ô thành một lưới', () => {
    const mat = new THREE.MeshBasicMaterial();
    const out = bakeDungeonCells([{ mesh: new THREE.Mesh(box(), mat), mats: [at(1, 1), at(5, 5), at(9, 3)], cast: true }]);
    expect(out).toHaveLength(1);
    expect(out[0]!.geometry.attributes.position!.count).toBe(24 * 3);
  });
  it('tách theo ô, theo vật liệu và theo đổ bóng', () => {
    const a = new THREE.MeshBasicMaterial();
    const b = new THREE.MeshBasicMaterial();
    const out = bakeDungeonCells(
      [
        { mesh: new THREE.Mesh(box(), a), mats: [at(1, 1), at(100, 1)], cast: true },
        { mesh: new THREE.Mesh(box(), b), mats: [at(1, 1)], cast: false },
      ],
      32,
    );
    expect(out).toHaveLength(3);
    expect(out.filter((o) => o.cast)).toHaveLength(2);
  });
  it('nướng đúng vị trí đỉnh và có bán kính bao', () => {
    const out = bakeDungeonCells([{ mesh: new THREE.Mesh(box(), new THREE.MeshBasicMaterial()), mats: [at(10, 20)], cast: true }]);
    const bb = new THREE.Box3().setFromBufferAttribute(out[0]!.geometry.attributes.position as THREE.BufferAttribute);
    expect(bb.getCenter(new THREE.Vector3()).x).toBeCloseTo(10);
    expect(out[0]!.geometry.boundingSphere).not.toBeNull();
  });
  it('chữ ký khác nhau khi thiếu thuộc tính; kế hoạch chặn quá nhiều đỉnh', () => {
    const g = box();
    const h = box();
    h.deleteAttribute('uv');
    expect(geoSignature(g)).not.toBe(geoSignature(h));
    expect(planDungeonBake([{ geo: g, count: 10 }])).toBe(true);
    expect(planDungeonBake([{ geo: g, count: 1e7 }])).toBe(false);
  });
});
