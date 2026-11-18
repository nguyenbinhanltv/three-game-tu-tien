import * as THREE from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { ARM_FIT, ARM_FIT_DEFAULT, MannequinCharacter, type MannequinTemplate } from './mannequin';
import type { AnimState } from './view';

// Mẫu giả: hai cánh tay buông xuống (hoặc giơ ngang) dưới xương `spine`; kiểm ARM_FIT (dạng tay) có hệ số theo độ buông.
function fake(id: string, raised = false): MannequinCharacter {
  const scene = new THREE.Group();
  const bone = (n: string, parent: THREE.Object3D, x = 0, y = 0): THREE.Bone => {
    const b = new THREE.Bone();
    b.name = n;
    b.position.set(x, y, 0);
    parent.add(b);
    return b;
  };
  const pelvis = bone('pelvis', scene, 0, 1);
  const th = bone('thigh_l', pelvis, 0.1, -0.1);
  void th;
  const spine = bone('spine_01', pelvis, 0, 0.2);
  const ul = bone('upperarm_l', spine, 0.2, 0.2);
  const ur = bone('upperarm_r', spine, -0.2, 0.2);
  if (raised) {
    bone('lowerarm_l', ul, 0.3, 0);
    bone('lowerarm_r', ur, -0.3, 0);
  } else {
    bone('lowerarm_l', ul, 0, -0.3);
    bone('lowerarm_r', ur, 0, -0.3);
  }
  const track = new THREE.QuaternionKeyframeTrack('spine_01.quaternion', [0, 1], [0, 0, 0, 1, 0, 0, 0, 1]);
  const clip = new THREE.AnimationClip('Idle_Loop', 1, [track]);
  const tpl = { bank: null, height: 1.8, clips: new Map([['Idle_Loop', clip]]), handle: { id, scene } } as unknown as MannequinTemplate;
  return new MannequinCharacter(tpl);
}
const anim: AnimState = { speed: 0, flying: false, meditating: false, dead: false, casting: false, airborne: false };
const spin = (m: MannequinCharacter) => {
  for (let i = 0; i < 4; i++) {
    m.update(1 / 60, anim);
    m.root.updateMatrixWorld(true);
  }
};
const elbowX = (m: MannequinCharacter, name: string) =>
  (m as unknown as { rig: THREE.Object3D }).rig.getObjectByName(name)!.getWorldPosition(new THREE.Vector3()).x;

describe('ARM_FIT: dạng tay theo model, hệ số theo độ buông', () => {
  it('tay buông: dạng ra khỏi thân (trái +x, phải −x), đối xứng, theo góc của model', () => {
    ARM_FIT['t_off'] = 0;
    ARM_FIT['t_on'] = (16 * Math.PI) / 180;
    const off = fake('t_off');
    spin(off);
    const on = fake('t_on');
    spin(on);
    delete ARM_FIT['t_off'];
    delete ARM_FIT['t_on'];
    const dl = elbowX(on, 'lowerarm_l') - elbowX(off, 'lowerarm_l');
    const dr = elbowX(on, 'lowerarm_r') - elbowX(off, 'lowerarm_r');
    expect(dl).toBeGreaterThan(0.05);
    expect(dr).toBeLessThan(-0.05);
    expect(Math.abs(dl + dr)).toBeLessThan(0.01);
  });
  it('tay giơ ngang: không dạng thêm dù góc lớn', () => {
    ARM_FIT['t_raised'] = (16 * Math.PI) / 180;
    const m = fake('t_raised', true);
    spin(m);
    delete ARM_FIT['t_raised'];
    expect(elbowX(m, 'lowerarm_l')).toBeCloseTo(0.5, 2); // 0,2 (vai) + 0,3 (cẳng tay giơ ngang)
  });
  it('model không khai: dùng mặc định', () => {
    expect(ARM_FIT['t_khong_co']).toBeUndefined();
    expect(ARM_FIT_DEFAULT).toBeGreaterThan(0);
  });
});
