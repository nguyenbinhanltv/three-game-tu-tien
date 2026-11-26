import * as THREE from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { registerCollision } from '@dtl/shared';
import {
  beginFeetFrame,
  FEET,
  feetSlot,
  groundNormal,
  hipDrop,
  MqFeet,
  needStep,
  resetFeetSlots,
  smoothGround,
  supportY,
  stepArc,
  walkableGround,
  wrapAngle,
} from './mannequinFeet';

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

describe('mannequinFeet: mặt đứng dưới chân', () => {
  it('smoothGround: NaN hoặc chênh > groundSnap thì lấy ngay', () => {
    expect(smoothGround(Number.NaN, 0.4, 1 / 60)).toBe(0.4);
    expect(smoothGround(0, FEET.groundSnap + 0.1, 1 / 60)).toBe(FEET.groundSnap + 0.1);
    expect(smoothGround(0, -FEET.groundSnap - 0.1, 1 / 60)).toBe(-FEET.groundSnap - 0.1);
  });
  it('smoothGround: lên tối đa groundUp·dt, xuống tối đa groundDown·dt, tới đích thì dừng', () => {
    const dt = 1 / 240;
    expect(smoothGround(0, 0.5, dt)).toBeCloseTo(FEET.groundUp * dt);
    expect(smoothGround(0, -0.5, dt)).toBeCloseTo(-FEET.groundDown * dt);
    expect(smoothGround(0, 0.001, dt)).toBe(0.001);
    expect(smoothGround(0, -0.001, dt)).toBe(-0.001);
  });
  it('hằng số tốc độ đổi mặt đứng được khóa (đổi phải có đo tpmove)', () => {
    expect(FEET.groundUp).toBe(13);
    expect(FEET.lookAhead).toBe(0.1);
    expect(FEET.lookMax).toBe(0.4);
    expect(FEET.groundDown).toBe(9);
    expect(FEET.groundSnap).toBe(0.7);
    expect(FEET.maxDown).toBe(0.3);
  });
  it('supportY: kẹp ở level − maxDown, không thấp hơn', () => {
    expect(supportY(-1, 0)).toBeCloseTo(-FEET.maxDown);
    expect(supportY(-0.1, 0)).toBeCloseTo(-0.1);
    expect(supportY(0.5, 0)).toBe(0.5);
    expect(supportY(-1, 0, 0.5)).toBeCloseTo(-0.5);
  });
});

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
  it('nhìn trước: bậc cách xa ~1 m không nâng chân trên nền phẳng, bậc trong tầm lookMax thì nâng sớm', () => {
    const run = (stepAt: number, frames: number) => {
      const a = rig();
      const b = rig();
      const stepped = (_x: number, z: number) => (z > stepAt ? 0.25 : 0);
      let maxDiff = 0;
      for (let i = 0; i < frames; i++) {
        // Chạy dọc +z 5 m/s (chân clip dựng đứng; chỉ gốc di chuyển).
        for (const r of [a, b]) {
          r.root.position.z = (5 * i) / 60;
          r.root.updateMatrixWorld(true);
        }
        a.feet.update(1 / 60, { active: true, standing: false }, flat);
        b.feet.update(1 / 60, { active: true, standing: false }, stepped);
        a.root.updateMatrixWorld(true);
        b.root.updateMatrixWorld(true);
        maxDiff = Math.max(maxDiff, worldY(b.root, 'foot_l') - worldY(a.root, 'foot_l'));
      }
      return maxDiff;
    };
    // Gốc dừng ở z = 0,5: bậc ở z = 1,6 cách xa hơn lookMax + bán kính chân → không ảnh hưởng.
    expect(run(1.6, 7)).toBeLessThan(0.005);
    // Bậc ngay trước mũi (z = 0,45 khi gốc tới 0,5): mặt đứng đã nâng.
    expect(run(0.45, 7)).toBeGreaterThan(0.02);
  });
  it('drop > 0: chân chưa khóa được nâng đúng bằng drop', () => {
    const a = rig();
    const b = rig();
    for (let i = 0; i < 30; i++) {
      a.feet.update(1 / 60, { active: true, standing: false }, flat);
      b.feet.update(1 / 60, { active: true, standing: false, drop: 0.1 }, flat);
    }
    a.root.updateMatrixWorld(true);
    b.root.updateMatrixWorld(true);
    expect(worldY(b.root, 'foot_l') - worldY(a.root, 'foot_l')).toBeCloseTo(0.1, 2);
    expect(worldY(b.root, 'foot_r') - worldY(a.root, 'foot_r')).toBeCloseTo(0.1, 2);
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
  it('thân nhảy xa khi đứng yên (tp): khóa lại ngay tại chân clip, không bước từ chỗ cũ', () => {
    const { root, feet } = rig();
    for (let i = 0; i < 20; i++) feet.update(1 / 60, { active: true, standing: true }, flat);
    root.position.x += 20;
    for (let i = 0; i < 5; i++) feet.update(1 / 60, { active: true, standing: true }, flat);
    root.updateMatrixWorld(true);
    expect(feet.steps).toBe(0);
    expect(feet.stepping).toBe(0);
    for (const n of ['foot_l', 'foot_r']) expect(root.getObjectByName(n)!.getWorldPosition(new THREE.Vector3()).x).toBeGreaterThan(19.8);
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

describe('groundNormal', () => {
  const n = new THREE.Vector3();
  it('đất phẳng: thẳng đứng', () => {
    groundNormal(() => 0, 3, 4, n);
    expect(n.y).toBeCloseTo(1);
    expect(n.x).toBeCloseTo(0);
  });
  it('dốc 15° dọc x: pháp tuyến nghiêng ngược chiều dốc', () => {
    const t = Math.tan(0.26);
    groundNormal((x) => x * t, 0, 0, n);
    expect(Math.acos(n.y)).toBeCloseTo(0.26, 2);
    expect(n.x).toBeLessThan(0);
  });
  it('dốc dựng đứng bị kẹp ở tiltMax', () => {
    groundNormal((x) => x * 0.4, 0, 0, n); // chênh 0,096 < tiltEdge nhưng góc ~22° > tiltMax
    expect(Math.acos(n.y)).toBeLessThanOrEqual(FEET.tiltMax + 1e-6);
    expect(n.length()).toBeCloseTo(1);
  });
  it('mép bậc (nhảy cao) coi là phẳng, bàn chân không gật', () => {
    groundNormal((x) => (x > 0 ? 0.3 : 0), 0, 0, n);
    expect(n.y).toBeCloseTo(1);
  });
});

const terrainGround = () => 0;

describe('walkableGround (COL-1)', () => {
  it('bậc thang: lấy mặt bậc cao hơn địa hình, đỉnh quá tầm bước thì bỏ qua', () => {
    const t0 = terrainGround();
    const t5 = terrainGround();
    registerCollision('mqfeet_test', [
      { k: 'box', x: 0, z: 0, hx: 1, hz: 1, y0: t0 - 1, y1: t0 + 0.3, yaw: 0 },
      { k: 'box', x: 5, z: 0, hx: 1, hz: 1, y0: t5 - 1, y1: t5 + 3, yaw: 0 },
    ]);
    const g = walkableGround(t0, 'mqfeet_test', terrainGround);
    expect(g(0, 0)).toBeCloseTo(t0 + 0.3, 3);
    expect(g(5, 0)).toBeCloseTo(t5, 3); // đỉnh cao hơn tầm bước: không đứng được
    expect(g(20, 20)).toBeCloseTo(terrainGround(), 5);
  });
  it('chân trên bậc cao: cổ chân được nâng theo mặt bậc', () => {
    const t = terrainGround();
    registerCollision('mqfeet_test2', [{ k: 'box', x: 0.1, z: 0, hx: 0.04, hz: 1, y0: t - 1, y1: t + 0.2, yaw: 0 }]);
    const { root, feet } = rig();
    root.position.y = terrainGround();
    root.updateMatrixWorld(true);
    const g = walkableGround(root.position.y, 'mqfeet_test2', terrainGround);
    const y0 = worldY(root, 'foot_l');
    for (let i = 0; i < 40; i++) feet.update(1 / 60, { active: true, standing: false }, g);
    root.updateMatrixWorld(true);
    expect(worldY(root, 'foot_l')).toBeGreaterThan(y0 + 0.1);
  });
});

describe('MqFeet: bàn chân theo dốc', () => {
  it('đứng trên dốc 15°: bàn chân nghiêng theo mặt đất, trả về thẳng khi tắt', () => {
    const { root, feet } = rig();
    const t = Math.tan(0.26);
    const foot = root.getObjectByName('foot_l')!;
    const up = (o: THREE.Object3D) => new THREE.Vector3(0, 1, 0).applyQuaternion(o.getWorldQuaternion(new THREE.Quaternion()));
    const rest = up(foot).angleTo(new THREE.Vector3(0, 1, 0));
    for (let i = 0; i < 90; i++) feet.update(1 / 60, { active: true, standing: false }, (x) => x * t);
    root.updateMatrixWorld(true);
    expect(up(foot).angleTo(new THREE.Vector3(0, 1, 0))).toBeGreaterThan(rest + 0.15);
    for (let i = 0; i < 90; i++) feet.update(1 / 60, { active: false, standing: false }, flat);
    root.updateMatrixWorld(true);
    expect(up(foot).angleTo(new THREE.Vector3(0, 1, 0))).toBeCloseTo(rest, 2);
  });
});

describe('feetSlot: chọn theo khoảng cách camera', () => {
  /** Một khung: `beginFeetFrame` rồi mỗi nhân vật xin suất; phần tử đầu là mình khi `selfFirst`. */
  const frame = (dists: number[], selfFirst = false) => {
    beginFeetFrame();
    return dists.map((d, i) => feetSlot(d, selfFirst && i === 0));
  };
  it('chính mình luôn được, người xa nhất bị loại khi đông, người gần được giữ', () => {
    resetFeetSlots();
    const dists = [0, 9, 3, 12, 5, 7, 2, 20];
    frame(dists, true); // khung 1 chỉ thu thập
    const got = frame(dists, true);
    expect(got[0]).toBe(true);
    const byDist = Object.fromEntries(dists.map((d, i) => [d, got[i]]));
    // maxPerFrame - 1 người gần nhất (khác mình): 2, 3, 5 được; 7, 9, 12, 20 bị loại.
    expect([byDist[2], byDist[3], byDist[5]]).toEqual([true, true, true]);
    expect([byDist[7], byDist[9], byDist[12], byDist[20]]).toEqual([false, false, false, false]);
  });
  it('mình ở xa camera vẫn được và không chiếm suất của người khác', () => {
    resetFeetSlots();
    const dists = [50, 2, 3, 4, 8];
    frame(dists, true);
    const got = frame(dists, true);
    expect(got).toEqual([true, true, true, true, false]);
  });
  it('thứ tự gọi không đổi kết quả', () => {
    resetFeetSlots();
    const a = [20, 2, 12, 3, 7, 5];
    frame(a);
    const g = frame(a);
    expect(a.filter((_, i) => g[i]).sort((x, y) => x - y)).toEqual([2, 3, 5]);
  });
  it('ít người hơn ngưỡng thì ai cũng được', () => {
    resetFeetSlots();
    frame([4, 8]);
    expect(frame([4, 8])).toEqual([true, true]);
  });
  it('không phụ thuộc thời gian: nhiều khung liền nhau (240 Hz) vẫn cấp đủ, không từ chối cả bọn', () => {
    resetFeetSlots();
    for (let f = 0; f < 5; f++) expect(frame([1, 2, 3])).toEqual([true, true, true]);
  });
  it('ngoài danh sách (không gọi) thì không ảnh hưởng khung sau', () => {
    resetFeetSlots();
    frame([1, 2, 3, 4, 5, 6]);
    frame([]); // khung không ai xin
    expect(frame([9])).toEqual([true]);
  });
});
