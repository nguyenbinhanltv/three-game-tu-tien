import * as THREE from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { FEET, hipDrop, MqFeet, needStep, stepArc, wrapAngle } from './mannequinFeet';

describe('mannequinFeet: hàm thuần', () => {
  it('wrapAngle đưa về (−π, π]', () => {
    expect(wrapAngle(Math.PI * 2 + 0.1)).toBeCloseTo(0.1);
    expect(wrapAngle(-Math.PI * 2 - 0.1)).toBeCloseTo(-0.1);
  });
  it('needStep: xoay quá ~40° hoặc lệch quá 0,3 m thì bước', () => {
    expect(needStep(0.5, 0.05)).toBe(false);
    expect(needStep(-0.8, 0.05)).toBe(true);
    expect(needStep(0.1, 0.4)).toBe(true);
  });
  it('stepArc: 0 ở hai đầu, cao nhất giữa bước', () => {
    expect(stepArc(0)).toBeCloseTo(0);
    expect(stepArc(1)).toBeCloseTo(0);
    expect(stepArc(0.5)).toBeCloseTo(FEET.lift);
  });
  it('hipDrop theo chân thấp; nâng tối đa 40% mức hạ', () => {
    expect(hipDrop(-0.1, 0.2, 0.5)).toBeCloseTo(-0.1);
    expect(hipDrop(0.3, 0.4, 0.5)).toBeCloseTo(0.2);
    expect(hipDrop(-0.9, 0, 0.5)).toBe(-0.5);
  });
});

/** Rig tối giản: root → pelvis → thigh/calf/foot (chân thẳng đứng dài 0,5 + 0,5). */
function rig() {
  const root = new THREE.Group();
  const model = new THREE.Group();
  root.add(model);
  const bone = (n: string, y: number, x = 0) => {
    const b = new THREE.Bone();
    b.name = n;
    b.position.set(x, y, 0);
    return b;
  };
  const pelvis = bone('pelvis', 1.0);
  model.add(pelvis);
  for (const [s, x] of [
    ['l', 0.1],
    ['r', -0.1],
  ] as const) {
    const th = bone(`thigh_${s}`, 0, x);
    const ca = bone(`calf_${s}`, -0.5);
    const fo = bone(`foot_${s}`, -0.5);
    ca.rotation.x = 0.05; // gối hơi gập để IK có hướng gập
    pelvis.add(th);
    th.add(ca);
    ca.add(fo);
  }
  root.updateMatrixWorld(true);
  return { root, model, feet: MqFeet.from(model, root, 1.8)! };
}

const flat = () => 0;
const worldY = (root: THREE.Object3D, n: string) => root.getObjectByName(n)!.getWorldPosition(new THREE.Vector3()).y;

describe('MqFeet', () => {
  it('thiếu xương chân thì null', () => {
    expect(MqFeet.from(new THREE.Group(), new THREE.Group(), 1.8)).toBeNull();
  });
  it('bám dốc: chân cao hơn thì cổ chân được nâng lên, hông hạ theo chân thấp', () => {
    const { root, feet } = rig();
    const ground = (x: number) => (x > 0 ? 0.15 : 0); // chân trái (x=+0,1) trên bậc cao 15 cm
    const before = worldY(root, 'foot_l');
    for (let i = 0; i < 30; i++) feet.update(1 / 60, { active: true, standing: false }, ground);
    root.updateMatrixWorld(true);
    expect(worldY(root, 'foot_l')).toBeGreaterThan(before + 0.1);
    expect(worldY(root, 'foot_r')).toBeCloseTo(before, 1);
  });
  it('đứng yên (chân khóa) trên dốc: độ cao cổ chân so với đất dưới chân bằng nhau, không tính chênh dốc hai lần', () => {
    const { root, feet } = rig();
    const ground = (x: number) => (x > 0 ? 0.15 : 0);
    for (let i = 0; i < 60; i++) feet.update(1 / 60, { active: true, standing: true }, ground);
    root.updateMatrixWorld(true);
    const clear = (n: string) => {
      const p = root.getObjectByName(n)!.getWorldPosition(new THREE.Vector3());
      return p.y - ground(p.x);
    };
    expect(Math.abs(clear('foot_l') - clear('foot_r'))).toBeLessThan(0.02);
  });
  it('thôi hoạt động thì trả hông và chân về chỗ cũ', () => {
    const { root, feet } = rig();
    const p0 = root.getObjectByName('pelvis')!.position.y;
    for (let i = 0; i < 30; i++) feet.update(1 / 60, { active: true, standing: false }, (x) => (x > 0 ? -0.2 : 0));
    for (let i = 0; i < 60; i++) feet.update(1 / 60, { active: false, standing: false }, flat);
    expect(root.getObjectByName('pelvis')!.position.y).toBeCloseTo(p0, 5);
  });
  it('xoay tại chỗ: chân khóa không đổi vị trí thế giới, quá ngưỡng thì bước một chân rồi khóa lại', () => {
    const { root, feet } = rig();
    const foot = root.getObjectByName('foot_l')!;
    for (let i = 0; i < 20; i++) feet.update(1 / 60, { active: true, standing: true }, flat);
    expect(feet.planted).toBe(true);
    const p0 = foot.getWorldPosition(new THREE.Vector3());
    // Xoay thân 0,4 rad (dưới ngưỡng): chân trái đứng yên trong thế giới (bán kính hông 0,1 nên chân clip dịch ~4 cm).
    root.rotation.y = 0.4;
    for (let i = 0; i < 20; i++) feet.update(1 / 60, { active: true, standing: true }, flat);
    root.updateMatrixWorld(true);
    expect(feet.steps).toBe(0);
    expect(foot.getWorldPosition(new THREE.Vector3()).distanceTo(p0)).toBeLessThan(0.03);
    // Quay tiếp quá ngưỡng: có bước chân.
    root.rotation.y = 1.2;
    let stepped = false;
    for (let i = 0; i < 90; i++) {
      feet.update(1 / 60, { active: true, standing: true }, flat);
      if (feet.stepping) stepped = true;
    }
    expect(stepped).toBe(true);
    expect(feet.steps).toBeGreaterThanOrEqual(1);
    expect(feet.stepping).toBe(0);
    expect(feet.planted).toBe(true);
  });
  it('đang đi thì không khóa chân', () => {
    const { root, feet } = rig();
    for (let i = 0; i < 20; i++) feet.update(1 / 60, { active: true, standing: true }, flat);
    for (let i = 0; i < 30; i++) feet.update(1 / 60, { active: true, standing: false }, flat);
    root.rotation.y = 2;
    for (let i = 0; i < 30; i++) feet.update(1 / 60, { active: true, standing: false }, flat);
    expect(feet.steps).toBe(0);
    expect(feet.planted).toBe(false);
  });
});
