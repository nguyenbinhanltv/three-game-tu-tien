import * as THREE from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { MannequinCharacter, type MannequinTemplate } from './mannequin';
import type { AnimState } from './view';

// Xương spine_03 KHÔNG có track trong clip nào: mixer không bao giờ ghi nó, đúng trường hợp lớp cộng dồn (giật khi trúng đòn) tích lũy.
function fake(): MannequinCharacter {
  const scene = new THREE.Group();
  for (const n of ['pelvis', 'spine_01', 'spine_02', 'spine_03']) {
    const b = new THREE.Bone();
    b.name = n;
    scene.add(b);
  }
  const clip = (name: string) =>
    new THREE.AnimationClip(name, 1, [new THREE.QuaternionKeyframeTrack('spine_02.quaternion', [0, 1], [0, 0, 0, 1, 0, 0, 0.1, 0.995])]);
  const names = ['Idle_Loop', 'Sword_Idle', 'Hit_Chest', 'Hit_Knockback'];
  const tpl = {
    bank: null,
    height: 1.8,
    clips: new Map(names.map((n) => [n, clip(n)])),
    handle: { scene },
  } as unknown as MannequinTemplate;
  return new MannequinCharacter(tpl);
}
const anim = (o: Partial<AnimState> = {}): AnimState => ({ speed: 0, flying: false, meditating: false, dead: false, casting: false, airborne: false, ...o });
const run = (m: MannequinCharacter, sec: number, a = anim()) => {
  for (let i = 0; i < Math.round(sec * 60); i++) m.update(1 / 60, a);
};
const boneQ = (m: MannequinCharacter, n: string): THREE.Quaternion => {
  const rig = (m as unknown as { rig: THREE.Object3D }).rig;
  return rig.getObjectByName(n)!.quaternion.clone();
};

describe('MannequinCharacter: lớp thủ tục cộng dồn không tích lũy trên xương mixer không ghi', () => {
  it('khựng hình lúc trúng đòn: thân giật quá một nhịp rồi đứng, không xoay đều theo số khung', () => {
    const m = fake();
    run(m, 0.3);
    const rest = boneQ(m, 'spine_03');
    m.hitReact({ tier: 3, heavy: true, crit: true, dirX: 0, dirZ: 1, stop: 0.4 });
    // khung đầu sau trúng đòn (tuổi giật còn nhỏ), rồi khựng hình ~0,4 s
    let worst = 0;
    for (let i = 0; i < 40; i++) {
      m.update(1 / 60, anim());
      worst = Math.max(worst, rest.angleTo(boneQ(m, 'spine_03')));
    }
    // biên độ giật tối đa của thân vài chục độ (flinchAmpOf ≤ ~0,5 rad chia hai khớp): không được vượt xa
    expect(worst).toBeLessThan(0.6);
  });

  it('xương mixer không ghi trở về đúng tư thế gốc sau khi giật tắt hẳn', () => {
    const m = fake();
    run(m, 0.3);
    const rest = boneQ(m, 'spine_03');
    m.hitReact({ tier: 2, heavy: true, dirX: 0, dirZ: 1, stop: 0.3 });
    run(m, 1.5);
    expect(rest.angleTo(boneQ(m, 'spine_03'))).toBeLessThan(0.03);
  });
});
