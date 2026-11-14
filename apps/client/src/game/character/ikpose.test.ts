import * as THREE from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { POSE, POSES } from '@dtl/content';
import { POSE_REF, type PoseDef, type PoseVec, validatePose } from '@dtl/shared';
import { bakePose, formatProbe, IkRig, makeAdditive, maskClip, type PoseSample, poseClipName, probeClip, resolveKeys, samplePose } from './ikpose';
import { buildMixamoFixture } from './mixamoFixture';
import { SkinnedCharacter } from './skinned';
import type { AnimState } from './view';

const dist = (a: PoseVec, b: PoseVec) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const dot = (a: PoseVec, b: PoseVec) => (a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) / (Math.hypot(...a) * Math.hypot(...b));
const ARM = POSE_REF.upperArm + POSE_REF.foreArm;

const base = (o: Partial<PoseSample> = {}): PoseSample => ({
  hipsPos: [0, 0, 0],
  hipsRot: [0, 0, 0],
  spine: [0, 0, 0],
  head: [0, 0, 0],
  elbowR: [-0.5, -0.7, -0.4],
  elbowL: [0.5, -0.7, -0.4],
  kneeR: [0, 0, 1],
  kneeL: [0, 0, 1],
  ...o,
});

/** Rig ở cả hai dạng: xương mét, và Armature scale 0,01 (xương cm) đặt lệch/xoay trong cảnh như GLB thật. */
function rigs(): [string, IkRig][] {
  const cm = buildMixamoFixture({ centimeters: true });
  cm.position.set(3, 1, -2);
  cm.rotation.y = 0.7;
  cm.updateMatrixWorld(true);
  return [
    ['mét', IkRig.from(buildMixamoFixture())!],
    ['cm + xoay', IkRig.from(cm)!],
  ];
}

describe('IK hai đốt', () => {
  it('nhận rig Mixamo (tên mixamorigXxx) và đo đúng tỉ lệ', () => {
    for (const [, rig] of rigs()) {
      expect(rig.scale).toBeCloseTo(1, 5);
      expect(rig.tracked.length).toBe(18);
    }
    expect(IkRig.from(new THREE.Group())).toBeNull();
  });

  it('cổ tay tới điểm đích trong 1mm (mọi điểm trong tầm với, hai dạng rig)', () => {
    const rnd = mulberry(7);
    for (const [name, rig] of rigs()) {
      for (let i = 0; i < 60; i++) {
        for (const side of [-1, 1] as const) {
          const sh: PoseVec = [POSE_REF.shoulder[0] * side, POSE_REF.shoulder[1], 0];
          // Điểm ngẫu nhiên phía trước, cách vai 0,15–0,95 tầm với.
          const dir = new THREE.Vector3(rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 1.2 - 0.2).normalize();
          const r = ARM * (0.15 + rnd() * 0.8);
          const t: PoseVec = [sh[0] + dir.x * r, sh[1] + dir.y * r, sh[2] + dir.z * r];
          rig.apply(base(side < 0 ? { handR: t } : { handL: t }));
          const p = rig.probe();
          const got = side < 0 ? p.handR : p.handL;
          expect(dist(got, t), `${name} ${side} ${t}`).toBeLessThan(1e-3);
        }
      }
    }
  });

  it('ngoài tầm với thì duỗi thẳng về phía đích', () => {
    const [, rig] = rigs()[0];
    rig.apply(base({ handR: [-0.18, 0.45, 1.5] }));
    const p = rig.probe();
    expect(Math.hypot(...p.handRFromShoulder)).toBeCloseTo(ARM, 3);
    expect(dot(p.handRFromShoulder, [0, 0, 1])).toBeGreaterThan(0.9999);
  });

  it('khuỷu gập về phía pole', () => {
    const [, rig] = rigs()[0];
    const elbowY = (pole: PoseVec) => {
      rig.apply(base({ handR: [-0.18, 0.45, 0.35], elbowR: pole }));
      rig.root.updateMatrixWorld(true);
      return rig.bones.foreArmR!.getWorldPosition(new THREE.Vector3()).y;
    };
    expect(elbowY([0, -1, 0])).toBeLessThan(1.4 - 0.1);
    expect(elbowY([0, 1, 0])).toBeGreaterThan(1.4 + 0.1);
  });

  it('chân chạm đất khi hông hạ và xoay', () => {
    for (const [name, rig] of rigs()) {
      rig.apply(base({ hipsPos: [0.03, -0.12, 0.05], hipsRot: [5, 20, 0], footR: [-0.12, 0, 0.16], footL: [0.15, 0, -0.14] }));
      const p = rig.probe();
      expect(Math.abs(p.footR[1]), name).toBeLessThan(1e-3);
      expect(Math.abs(p.footL[1]), name).toBeLessThan(1e-3);
      expect(dist(p.footR, [-0.12, 0, 0.16])).toBeLessThan(1e-3);
      // Bàn chân phẳng như lúc nghỉ: mũi chân cùng độ cao với lúc T-pose.
      const toe = rig.root.worldToLocal(rig.root.getObjectByName('mixamorigRightToeBase')!.getWorldPosition(new THREE.Vector3()));
      expect(toe.y).toBeCloseTo(0.02, 3);
    }
  });

  it('kiếm chỉ đúng hướng mũi và lưỡi', () => {
    for (const [, rig] of rigs()) {
      rig.apply(base({ handR: [-0.1, 0.3, 0.4], sword: [0.3, 0.6, 0.7], edge: [0, -1, 0.5] }));
      const p = rig.probe();
      expect(dot(p.sword, [0.3, 0.6, 0.7])).toBeGreaterThan(0.9999);
      // Lưỡi vuông góc với mũi, cùng phía với hướng đã cho.
      expect(Math.abs(dot(p.sword, p.edge))).toBeLessThan(1e-4);
      expect(dot(p.edge, [0, -1, 0.5])).toBeGreaterThan(0.5);
    }
  });
});

describe('key pose dữ liệu', () => {
  it('mọi pose trong content hợp lệ', () => {
    expect(POSES.length).toBeGreaterThanOrEqual(2);
    for (const p of POSES) expect(validatePose(p)).toEqual([]);
  });

  it('validatePose bắt lỗi dữ liệu', () => {
    const bad: PoseDef = {
      id: 'Bad',
      duration: 1,
      loop: false,
      hit: [0.8, 0.2],
      keys: [
        { t: 0.1, handR: [-0.18, 0.45, 0.9] },
        { t: 0.05, sword: [0, 0, 1], edge: [0, 0, 2], footL: [0.1, -0.05, 0] },
      ],
    };
    const errs = validatePose(bad).join('\n');
    for (const m of ['id không hợp lệ', 'hit', 'key đầu', 'ngoài tầm với', 't phải tăng', 'song song', 'nhấc âm']) expect(errs).toContain(m);
  });

  it('trường thiếu giữ giá trị key trước; clip lặp nối về key đầu', () => {
    const def = POSE.get('kiem_thu')!;
    const keys = resolveKeys(def);
    expect(keys[1].footR).toEqual(def.keys[0].footR);
    expect(keys[1].edge).toEqual(def.keys[0].edge);
    const end = samplePose(def, keys, def.duration);
    expect(dist(end.handR!, def.keys[0].handR!)).toBeLessThan(1e-9);
  });

  for (const id of ['kiem_thu', 'chem_ngang']) {
    it(`nướng ${id}: tay tới đích ở mọi key, chân chạm đất mọi khung`, () => {
      const def = POSE.get(id)!;
      const keys = resolveKeys(def);
      for (const [name, rig] of rigs()) {
        const clip = bakePose(def, rig);
        expect(clip.name).toBe(poseClipName(id));
        expect(clip.duration).toBe(def.duration);
        for (const k of keys) {
          const p = probeClip(rig, clip, k.t);
          expect(dist(p.handR, k.handR!), `${name} t=${k.t} tay phải`).toBeLessThan(2e-3);
          expect(dist(p.handL, k.handL!), `${name} t=${k.t} tay trái`).toBeLessThan(2e-3);
          expect(dot(p.sword, k.sword!), `${name} t=${k.t} kiếm`).toBeGreaterThan(0.999);
        }
        for (let t = 0; t <= def.duration; t += 1 / 60) {
          const p = probeClip(rig, clip, t);
          expect(Math.abs(p.footR[1]), `${name} t=${t}`).toBeLessThan(5e-3);
          expect(Math.abs(p.footL[1]), `${name} t=${t}`).toBeLessThan(5e-3);
        }
      }
    });
  }

  it('đầu dò: thế thủ có tay trước vai; chém ngang đi phải → trước → trái', () => {
    const rig = IkRig.from(buildMixamoFixture())!;
    const guard = probeClip(rig, bakePose(POSE.get('kiem_thu')!, rig), 0);
    console.log('[đầu dò] kiem_thu t=0\n' + formatProbe(guard));
    expect(guard.handRFromShoulder[2]).toBeGreaterThan(0.25);
    expect(guard.sword[2]).toBeGreaterThan(0.5);

    const def = POSE.get('chem_ngang')!;
    const clip = bakePose(def, rig);
    const at = (t: number) => probeClip(rig, clip, t);
    const wind = at(0.3);
    const strike = at(0.42);
    const follow = at(0.56);
    console.log('[đầu dò] chem_ngang lấy đà t=0.30\n' + formatProbe(wind));
    console.log('[đầu dò] chem_ngang chém t=0.42\n' + formatProbe(strike));
    console.log('[đầu dò] chem_ngang quá đà t=0.56\n' + formatProbe(follow));
    // Mũi kiếm quét từ bên phải-sau (−X) qua trước (+Z) sang trái (+X), lưỡi đi trước.
    expect(wind.sword[0]).toBeLessThan(-0.5);
    expect(strike.sword[2]).toBeGreaterThan(0.95);
    expect(follow.sword[0]).toBeGreaterThan(0.5);
    expect(strike.edge[0]).toBeGreaterThan(0.95);
    expect(strike.handRFromShoulder[2]).toBeGreaterThan(0.3);
    // Khung sát thương nằm quanh nhịp vung.
    expect(def.hit![0]).toBeLessThanOrEqual(0.42);
    expect(def.hit![1]).toBeGreaterThanOrEqual(0.42);
  });
});

describe('trộn với clip khác', () => {
  it('mask chia track thành thân trên/dưới không chồng nhau', () => {
    const rig = IkRig.from(buildMixamoFixture())!;
    const clip = bakePose(POSE.get('chem_ngang')!, rig);
    const up = maskClip(clip, rig, 'upper');
    const lo = maskClip(clip, rig, 'lower');
    const names = (c: THREE.AnimationClip) => c.tracks.map((t) => t.name);
    expect(up.tracks.length + lo.tracks.length).toBe(clip.tracks.length);
    expect(names(up)).toContain('mixamorigRightHand.quaternion');
    expect(names(up)).toContain('mixamorigSpine.quaternion');
    expect(names(lo)).toContain('mixamorigHips.position');
    expect(names(lo)).toContain('mixamorigLeftFoot.quaternion');
    expect(names(up)).not.toContain('mixamorigHips.quaternion');
  });

  it('đè thân trên: chân theo clip nền, tay theo pose', () => {
    const rig = IkRig.from(buildMixamoFixture())!;
    const pose = bakePose(POSE.get('kiem_thu')!, rig);
    // Clip nền: chân bước dài (giả lập clip chạy của Tripo).
    const stride = bakePose({ id: 'stride', duration: 1, loop: true, keys: [{ t: 0, footR: [-0.1, 0.05, 0.22], footL: [0.1, 0, -0.25], handR: [-0.3, -0.2, -0.1] }] }, rig);
    const mixer = new THREE.AnimationMixer(rig.root);
    mixer.clipAction(maskClip(stride, rig, 'lower')).play();
    mixer.clipAction(maskClip(pose, rig, 'upper')).play();
    mixer.update(0);
    const p = rig.probe();
    mixer.stopAllAction();
    rig.reset();
    expect(dist(p.footR, [-0.1, 0.05, 0.22])).toBeLessThan(2e-3);
    // Tay vẫn ở thế thủ tương đối với vai (hông không xoay như pose gốc nên so bằng khoảng cách tới vai).
    const guard = probeClip(rig, pose, 0);
    expect(Math.abs(Math.hypot(...p.handRFromShoulder) - Math.hypot(...guard.handRFromShoulder))).toBeLessThan(2e-3);
    expect(p.handRFromShoulder[2]).toBeGreaterThan(0.2);
  });

  it('additive trên tư thế nghỉ cho đúng tư thế pose', () => {
    const rig = IkRig.from(buildMixamoFixture())!;
    const pose = bakePose(POSE.get('chem_ngang')!, rig);
    const add = makeAdditive(pose, rig);
    expect(add.blendMode).toBe(THREE.AdditiveAnimationBlendMode);
    expect(pose.blendMode).toBe(THREE.NormalAnimationBlendMode);
    const want = probeClip(rig, pose, 0.42);
    const got = probeClip(rig, add, 0.42);
    expect(dist(got.handR, want.handR)).toBeLessThan(2e-3);
    expect(dot(got.sword, want.sword)).toBeGreaterThan(0.999);
  });

  it('áp lên SkinnedCharacter: thế thủ khi giao chiến, chém khi ra đòn', () => {
    const scene = buildMixamoFixture({ mesh: true });
    const rig = IkRig.from(scene)!;
    const clips = POSES.map((p) => bakePose(p, rig));
    const ch = new SkinnedCharacter({
      scene,
      clips,
      clipMap: { combatIdle: poseClipName('kiem_thu'), attack: poseClipName('chem_ngang') },
      height: 1.75,
      refSpeed: 4,
    });
    const a: AnimState = { speed: 0, flying: false, meditating: false, dead: false, casting: false, airborne: false, combat: true };
    for (let i = 0; i < 30; i++) ch.update(1 / 60, a);
    expect(ch.state).toBe('combatIdle');
    const guard = rig.probe();
    expect(guard.handRFromShoulder[2]).toBeGreaterThan(0.25);

    ch.attack();
    for (let t = 0; t < 0.42; t += 1 / 60) ch.update(1 / 60, a);
    expect(ch.state).toBe('attack');
    const strike = rig.probe();
    expect(strike.sword[2]).toBeGreaterThan(0.9);
    expect(Math.abs(strike.footR[1])).toBeLessThan(5e-3);
    ch.dispose();
  });
});

/** PRNG có hạt giống để test lặp lại được. */
function mulberry(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
