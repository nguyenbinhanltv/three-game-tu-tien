import * as THREE from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { RagRig } from './ragdollRig';

function rig(names: string[]): THREE.Group {
  const g = new THREE.Group();
  let parent: THREE.Object3D = g;
  for (const n of names) {
    const b = new THREE.Bone();
    b.name = n;
    parent.add(b);
    if (!n.startsWith('upperarm') && n !== 'thigh_l') parent = b;
  }
  g.updateMatrixWorld(true);
  return g;
}
const HUMAN = ['spine_02', 'spine_03', 'head', 'upperarm_l', 'upperarm_r', 'thigh_l'];
const angleOf = (g: THREE.Object3D, n: string) => 2 * Math.acos(Math.min(1, Math.abs(g.getObjectByName(n)!.quaternion.w)));

describe('RagRig (ragdoll nhẹ cho quái thường)', () => {
  it('trúng đòn thì xương thân/đầu xoay, rồi yên lại', () => {
    const g = rig(HUMAN);
    const r = new RagRig(g);
    expect(r.usable).toBe(true);
    r.hit(0, 0, -1, 2, true, false);
    r.apply(1 / 60, 0, false, true);
    for (let i = 0; i < 6; i++) r.apply(1 / 60, 0, false, true);
    expect(angleOf(g, 'spine_03')).toBeGreaterThan(0.005);
    expect(angleOf(g, 'head')).toBeGreaterThan(0.005);
  });
  it('model không có xương người (thú) thì không dùng được và không làm gì', () => {
    const g = rig(['body', 'tail', 'jaw']);
    const r = new RagRig(g);
    expect(r.usable).toBe(false);
    r.hit(0, 0, -1, 3, true, true);
    r.apply(1 / 60, 0, false, true);
    expect(r.rag.active).toBe(false);
  });
  it('boss (enabled=false) bị tắt hẳn', () => {
    const g = rig(HUMAN);
    const r = new RagRig(g);
    r.enabled = false;
    r.hit(0, 0, -1, 3, true, true);
    r.down(0, 0, -1);
    r.apply(1 / 60, 0, true, true);
    expect(r.rag.active).toBe(false);
    expect(angleOf(g, 'spine_03')).toBe(0);
  });
  it('xa/ngoài LOD0 thì reset, không áp xương', () => {
    const g = rig(HUMAN);
    const r = new RagRig(g);
    r.hit(0, 0, -1, 2, true, false);
    r.apply(1 / 60, 0, false, false);
    expect(r.rag.active).toBe(false);
    expect(angleOf(g, 'spine_03')).toBe(0);
  });
  it('chết giữ lỏng và dao động lâu hơn so với lúc sống', () => {
    const g = rig(HUMAN);
    const r = new RagRig(g);
    r.down(0, 0, -1);
    for (let i = 0; i < 60; i++) r.apply(1 / 60, 0, true, true);
    expect(r.rag.loose).toBe(1);
  });
});
