import * as THREE from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { MannequinCharacter, SPRING2, type MannequinTemplate } from './mannequin';
import type { AnimState } from './view';

// Mẫu giả: hai cánh tay buông xuống (hoặc giơ ngang) dưới xương `spine`; kiểm hàm chừa khoảng cách tay (dạng ra khi buông, không dạng khi giơ).
function fake(id: string, raised = false): { m: MannequinCharacter; lower: { l: THREE.Object3D; r: THREE.Object3D } } {
  const scene = new THREE.Group();
  const bone = (n: string, parent: THREE.Object3D, x = 0, y = 0): THREE.Bone => {
    const b = new THREE.Bone();
    b.name = n;
    b.position.set(x, y, 0);
    parent.add(b);
    return b;
  };
  const pelvis = bone('pelvis', scene, 0, 1);
  const spine = bone('spine_01', pelvis, 0, 0.2);
  const ul = bone('upperarm_l', spine, 0.2, 0.2);
  const ur = bone('upperarm_r', spine, -0.2, 0.2);
  // cẳng tay: buông xuống (−y) hoặc giơ ngang (±x)
  const ll = raised ? bone('lowerarm_l', ul, 0.3, 0) : bone('lowerarm_l', ul, 0, -0.3);
  const lr = raised ? bone('lowerarm_r', ur, -0.3, 0) : bone('lowerarm_r', ur, 0, -0.3);
  const track = new THREE.QuaternionKeyframeTrack('spine_01.quaternion', [0, 1], [0, 0, 0, 1, 0, 0, 0, 1]);
  const clip = new THREE.AnimationClip('Idle_Loop', 1, [track]);
  const tpl = { bank: null, height: 1.8, clips: new Map([['Idle_Loop', clip]]), handle: { id, scene } } as unknown as MannequinTemplate;
  return { m: new MannequinCharacter(tpl), lower: { l: ll, r: lr } };
}
const anim: AnimState = { speed: 0, flying: false, meditating: false, dead: false, casting: false, airborne: false };
const spin = (m: MannequinCharacter) => {
  for (let i = 0; i < 4; i++) {
    m.update(1 / 60, anim);
    m.root.updateMatrixWorld(true);
  }
};
const rigOf = (m: MannequinCharacter) => (m as unknown as { rig: THREE.Object3D }).rig;
const elbowX = (m: MannequinCharacter, name: string) => rigOf(m).getObjectByName(name)!.getWorldPosition(new THREE.Vector3()).x;

describe('chừa khoảng cách tay (lò xo v2)', () => {
  it('tay buông: dạng ra khỏi thân (trái +x, phải −x), đối xứng', () => {
    const saved = SPRING2.armDeg;
    SPRING2.armDeg = 0;
    const off = fake('chr_v3b2_lac_kiem_nam');
    spin(off.m);
    SPRING2.armDeg = 16;
    const on = fake('chr_v3b2_lac_kiem_nam');
    spin(on.m);
    SPRING2.armDeg = saved;
    const dl = elbowX(on.m, 'lowerarm_l') - elbowX(off.m, 'lowerarm_l');
    const dr = elbowX(on.m, 'lowerarm_r') - elbowX(off.m, 'lowerarm_r');
    expect(dl).toBeGreaterThan(0.05);
    expect(dr).toBeLessThan(-0.05);
    expect(Math.abs(dl + dr)).toBeLessThan(0.01);
  });
  it('tay giơ ngang: không dạng thêm; asset không phải v3b2 thì không đổi', () => {
    const saved = SPRING2.armDeg;
    SPRING2.armDeg = 16;
    const a = fake('chr_v3b2_lac_kiem_nam', true);
    spin(a.m);
    const x0 = elbowX(a.m, 'lowerarm_l');
    const b = fake('chr_v3b_lac_kiem_nam');
    spin(b.m);
    const x1 = elbowX(b.m, 'lowerarm_l');
    SPRING2.armDeg = saved;
    expect(x0).toBeCloseTo(0.5, 2); // 0,2 (vai) + 0,3 (cẳng tay giơ ngang)
    expect(x1).toBeCloseTo(0.2, 2); // v3b: không áp
  });
});
