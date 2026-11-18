import * as THREE from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { MannequinCharacter, type MannequinTemplate } from './mannequin';
import type { AnimState } from './view';

// Mẫu giả có xương vạt nướng `dtl_o_cloth_0_0/1`; clip `Idle_Loop` có track vạt, `Jog_Fwd_Loop` thì không (lò xo vạt chạy).
function fake(): { m: MannequinCharacter; priv: { cloth: Map<unknown, number>; clothTarget: unknown } } {
  const scene = new THREE.Group();
  const bone = (n: string, parent: THREE.Object3D, y = 0): THREE.Bone => {
    const b = new THREE.Bone();
    b.name = n;
    b.position.set(0, y, 0);
    parent.add(b);
    return b;
  };
  const pelvis = bone('pelvis', scene, 1);
  bone('spine_01', pelvis, 0.1);
  const c0 = bone('dtl_o_cloth_0_0', pelvis, -0.1);
  bone('dtl_o_cloth_0_1', c0, -0.2);
  const q = (n: string) => new THREE.QuaternionKeyframeTrack(`${n}.quaternion`, [0, 1], [0, 0, 0, 1, 0, 0, 0.1, 0.995]);
  const clip = (name: string, n: string) => new THREE.AnimationClip(name, 1, [q(n)]);
  const tpl = {
    bank: null,
    height: 1.8,
    clips: new Map([['Idle_Loop', clip('Idle_Loop', 'spine_01')], ['Jog_Fwd_Loop', clip('Jog_Fwd_Loop', 'spine_01')]]),
    cloth: new Map([['Idle_Loop', clip('cloth_Idle_Loop', 'dtl_o_cloth_0_0')]]),
    handle: { scene },
  } as unknown as MannequinTemplate;
  const m = new MannequinCharacter(tpl);
  return { m, priv: m as unknown as { cloth: Map<unknown, number>; clothTarget: unknown } };
}
const anim = (speed = 0): AnimState => ({ speed, flying: false, meditating: false, dead: false, casting: false, airborne: false });
const run = (m: MannequinCharacter, a: AnimState, sec: number) => {
  for (let i = 0; i < Math.round(sec * 60); i++) m.update(1 / 60, a);
};

describe('MannequinCharacter: track vạt nướng (cloth bake)', () => {
  it('clip có track vạt: phát cùng clip nền với trọng số 1', () => {
    const { m, priv } = fake();
    run(m, anim(0), 0.5);
    expect(priv.clothTarget).not.toBeNull();
    expect([...priv.cloth.values()]).toEqual([1]);
  });
  it('đổi sang clip không có track: track vạt tắt dần, lò xo vạt chạy thay', () => {
    const { m, priv } = fake();
    run(m, anim(0), 0.5);
    run(m, anim(5), 0.6);
    expect(priv.clothTarget).toBeNull();
    expect(priv.cloth.size).toBe(0);
  });
  it('quay lại clip có track: bật lại', () => {
    const { m, priv } = fake();
    run(m, anim(5), 0.5);
    expect(priv.clothTarget).toBeNull();
    run(m, anim(0), 0.5);
    expect(priv.clothTarget).not.toBeNull();
    expect([...priv.cloth.values()]).toEqual([1]);
  });
});
