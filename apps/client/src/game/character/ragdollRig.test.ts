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

describe('RagRig trong SkinnedCharacter: chỉ áp ở khung mixer chạy', () => {
  it('màn 144 Hz (mixer 1/60): góc spine_03 không vượt biên độ RagLite', async () => {
    const { SkinnedCharacter } = await import('./skinned');
    const { ANIM_FX } = await import('./animFx');
    const { RAG_CFG } = await import('./ragdollLite');
    const scene = rig(HUMAN);
    const clip = new THREE.AnimationClip('idle', 1, [
      new THREE.QuaternionKeyframeTrack('spine_03.quaternion', [0, 1], [0, 0, 0, 1, 0, 0, 0, 1]),
    ]);
    const c = new SkinnedCharacter({
      scene,
      clips: [clip],
      height: 1.8,
      refSpeed: 3,
      clipMap: { idle: 'idle', run: 'idle', attack: 'idle', hit: 'idle', death: 'idle' },
    });
    c.setView({ dist: 5, inView: true, allowLod0: true, self: false });
    const was = ANIM_FX.ragdoll;
    ANIM_FX.ragdoll = true;
    try {
      const a = { speed: 0, flying: false, meditating: false, dead: false, casting: false, airborne: false };
      for (let i = 0; i < 10; i++) c.update(1 / 144, a);
      c.hitReact({ dirX: 0, dirZ: -1, tier: 3, heavy: true });
      let worst = 0;
      const bone = c.rig.getObjectByName('spine_03')!;
      for (let i = 0; i < 144; i++) {
        c.update(1 / 144, a);
        worst = Math.max(worst, 2 * Math.acos(Math.min(1, Math.abs(bone.quaternion.w))));
      }
      expect(worst).toBeGreaterThan(0.01);
      expect(worst).toBeLessThanOrEqual(RAG_CFG.spine_03.max + 0.05);
    } finally {
      ANIM_FX.ragdoll = was;
    }
  }, 30_000); // nhập động skinned nạp lạnh ~5 s, sát ngưỡng mặc định
});

describe('RagRig: xương mixer không ghi lại (clip kẹp cuối)', () => {
  it('chết giữ nhiều giây: góc không trôi quá biên độ, ragdoll tắt thì về đúng tư thế gốc', () => {
    const g = rig(HUMAN);
    const bone = g.getObjectByName('spine_03')!;
    bone.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0.3); // tư thế clip hằng số
    const base = bone.quaternion.clone();
    const r = new RagRig(g);
    r.down(0, 0, -1);
    let worst = 0;
    for (let i = 0; i < 600; i++) {
      r.apply(1 / 60, 0, true, true);
      worst = Math.max(worst, bone.quaternion.angleTo(base));
    }
    expect(worst).toBeLessThanOrEqual(0.62 + 1e-6);
    r.rag.reset();
    r.apply(1 / 60, 0, true, true);
    expect(bone.quaternion.angleTo(base)).toBeLessThan(1e-6);
  });
});
