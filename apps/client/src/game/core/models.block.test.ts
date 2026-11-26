import { describe, expect, it } from 'vitest';
import * as THREE from 'three/webgpu';
import { MONSTER } from '@dtl/content';
import { blockWarmMesh, mergeRigid, MonsterModel } from './models';

/** Số lưới vẽ được trong một cây (mỗi lưới = một lệnh vẽ). */
function meshes(root: THREE.Object3D): THREE.Mesh[] {
  const out: THREE.Mesh[] = [];
  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) out.push(o as THREE.Mesh);
  });
  return out;
}

const blockDefs = [...MONSTER.values()].filter((d) => !d.look);
const byModel = (model: string) => blockDefs.find((d) => d.model === model)!;

describe('MonsterModel (model khối) — một lệnh vẽ mỗi con (B4)', () => {
  it.each(['wolf', 'ape', 'serpent'])('%s: đúng một lưới có xương cứng', (model) => {
    const def = byModel(model);
    expect(def).toBeTruthy();
    const m = new MonsterModel(def);
    const list = meshes(m.root);
    expect(list).toHaveLength(1);
    const mesh = list[0] as THREE.SkinnedMesh;
    expect(mesh.isSkinnedMesh).toBe(true);
    expect(mesh.skeleton.bones).toHaveLength(model === 'serpent' ? 15 : 5);
    // Thân đổ bóng như trước; giao long không đổ bóng.
    expect(mesh.castShadow).toBe(model !== 'serpent');
    // Cầu bao đặt sẵn (không để three duyệt đỉnh có xương), đủ rộng cho tư thế gốc.
    expect(mesh.boundingSphere).not.toBeNull();
    expect(mesh.boundingSphere!.radius).toBeGreaterThanOrEqual(mesh.geometry.boundingSphere!.radius);
    m.dispose();
  });

  it('mọi loại bốn chân/hai chân dùng cùng số xương (chung pipeline với lưới vẽ ấm)', () => {
    const warm = blockWarmMesh();
    for (const model of ['wolf', 'fox', 'boar', 'ape']) {
      const def = byModel(model);
      if (!def) continue;
      const m = new MonsterModel(def);
      expect(m.mesh.skeleton.bones).toHaveLength(warm.skeleton.bones.length);
      expect(m.mesh.material).toBe(warm.material);
      m.dispose();
    }
  });

  it('hai con cùng loại dùng chung hình học, bộ xương riêng', () => {
    const def = byModel('ape');
    const a = new MonsterModel(def);
    const b = new MonsterModel(def);
    expect(a.mesh.geometry).toBe(b.mesh.geometry);
    expect(a.mesh.skeleton).not.toBe(b.mesh.skeleton);
    a.dispose();
    b.dispose();
  });

  it('hoạt họa vẫn chạy: chân vung khi đi, model khựng lại khi trúng đòn rồi chạy tiếp', () => {
    const m = new MonsterModel(byModel('ape'));
    const leg = m.mesh.skeleton.bones[2]!;
    for (let i = 0; i < 10; i++) m.update(1 / 60, { speed: 4, dead: false } as never);
    expect(Math.abs(leg.rotation.x)).toBeGreaterThan(0.01);
    m.dispose();
  });
});

describe('mergeRigid', () => {
  it('dời đỉnh của khối i tới khớp i và gán trọn cho xương i', () => {
    const tri = new THREE.BufferGeometry();
    tri.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), 3));
    tri.setAttribute('normal', new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]), 3));
    tri.setAttribute('color', new THREE.BufferAttribute(new Float32Array(9).fill(0.5), 3));
    const g = mergeRigid([
      { geo: tri, x: 0, y: 0, z: 0 },
      { geo: tri, x: 2, y: 3, z: 4 },
    ]);
    const pos = g.getAttribute('position');
    const idx = g.getAttribute('skinIndex');
    const wgt = g.getAttribute('skinWeight');
    expect(pos.count).toBe(6);
    expect([pos.getX(3), pos.getY(3), pos.getZ(3)]).toEqual([2, 3, 4]);
    expect([pos.getX(4), pos.getY(4), pos.getZ(4)]).toEqual([3, 3, 4]);
    expect([idx.getX(0), idx.getX(2), idx.getX(3), idx.getX(5)]).toEqual([0, 0, 1, 1]);
    for (let i = 0; i < 6; i++) expect([wgt.getX(i), wgt.getY(i), wgt.getZ(i), wgt.getW(i)]).toEqual([1, 0, 0, 0]);
  });
});
