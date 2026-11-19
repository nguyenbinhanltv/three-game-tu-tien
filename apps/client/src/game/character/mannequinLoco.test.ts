import * as THREE from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { MannequinCharacter, type MannequinTemplate } from './mannequin';
import type { AnimState } from './view';

function fake(): MannequinCharacter {
  const scene = new THREE.Group();
  for (const n of ['pelvis', 'spine_01', 'spine_02']) {
    const b = new THREE.Bone();
    b.name = n;
    scene.add(b);
  }
  const clip = (name: string, y: number) =>
    new THREE.AnimationClip(name, 1, [
      new THREE.QuaternionKeyframeTrack('spine_02.quaternion', [0, 1], [0, 0, y, Math.sqrt(1 - y * y), 0, 0, y, Math.sqrt(1 - y * y)]),
    ]);
  const names = ['Idle_Loop', 'Jog_Fwd_Loop', 'Walk_Loop', 'Sprint_Loop'];
  const tpl = {
    bank: null,
    height: 1.8,
    clips: new Map(names.map((n, i) => [n, clip(n, i * 0.1)])),
    handle: { scene },
  } as unknown as MannequinTemplate;
  return new MannequinCharacter(tpl);
}
const anim = (o: Partial<AnimState> = {}): AnimState => ({
  speed: 0,
  flying: false,
  meditating: false,
  dead: false,
  casting: false,
  airborne: false,
  ...o,
});

describe('MannequinCharacter: dừng chạy không nhảy tư thế', () => {
  it('Jog → Idle: trọng số thật của walk/sprint không tăng đột ngột ở khung chuyển', () => {
    const m = fake();
    for (let i = 0; i < 60; i++) m.update(1 / 60, anim({ speed: 6 })); // jog ~ thuần, walk = 0, sprint nhỏ
    const acts = (m as unknown as { companions: THREE.AnimationAction[] }).companions;
    const before = acts.map((a) => a.getEffectiveWeight());
    m.update(1 / 60, anim({ speed: 0 }));
    const after = acts.map((a) => a.getEffectiveWeight());
    // Walk ≈ 0 trước khi dừng: sau khi dừng nó chỉ được giảm, không nhảy lên ~1.
    expect(before[0]).toBeLessThan(0.05);
    expect(after[0]).toBeLessThanOrEqual(before[0]! + 0.02);
    expect(after[1]).toBeLessThanOrEqual(before[1]! + 0.05);
  });
});

describe('MannequinCharacter: đi lùi / ngang / chéo (A1)', () => {
  function fakeDir(): MannequinCharacter {
    const scene = new THREE.Group();
    for (const n of ['pelvis', 'spine_01', 'spine_02']) {
      const b = new THREE.Bone();
      b.name = n;
      scene.add(b);
    }
    const names = ['Idle_Loop', 'Jog_Fwd_Loop', 'Walk_Loop', 'Sprint_Loop'];
    for (const band of ['Walk', 'Jog', 'Sprint']) for (const d of ['Bwd', 'StrafeL', 'StrafeR']) names.push(`${band}_${d}_Loop`);
    const clip = (name: string, y: number) =>
      new THREE.AnimationClip(name, 1, [
        new THREE.QuaternionKeyframeTrack('spine_02.quaternion', [0, 1], [0, 0, y, Math.sqrt(1 - y * y), 0, 0, y, Math.sqrt(1 - y * y)]),
      ]);
    const tpl = {
      bank: null,
      height: 1.8,
      clips: new Map(names.map((n, i) => [n, clip(n, i * 0.05)])),
      handle: { scene },
    } as unknown as MannequinTemplate;
    return new MannequinCharacter(tpl);
  }
  const weightsByName = (m: MannequinCharacter): Record<string, number> => {
    const priv = m as unknown as { base: THREE.AnimationAction; companions: THREE.AnimationAction[] };
    const out: Record<string, number> = {};
    for (const a of [priv.base, ...priv.companions]) out[a.getClip().name] = a.getEffectiveWeight();
    return out;
  };
  const run = (angle: number, speed = 5.36) => {
    const m = fakeDir();
    for (let i = 0; i < 90; i++) m.update(1 / 60, anim({ speed, moveAngle: angle }));
    return weightsByName(m);
  };
  it('đi thẳng chỉ phát clip tới; lùi/trái/phải phát đúng clip hướng', () => {
    expect(run(0).Jog_Fwd_Loop).toBeGreaterThan(0.95);
    expect(run(Math.PI).Jog_Bwd_Loop).toBeGreaterThan(0.95);
    expect(run(Math.PI / 2).Jog_StrafeL_Loop).toBeGreaterThan(0.95);
    expect(run(-Math.PI / 2).Jog_StrafeR_Loop).toBeGreaterThan(0.95);
  });
  it('chéo 45° trộn clip tới và clip trái; tổng trọng số ≈ 1', () => {
    const w = run(Math.PI / 4);
    expect(w.Jog_Fwd_Loop).toBeGreaterThan(0.4);
    expect(w.Jog_StrafeL_Loop).toBeGreaterThan(0.4);
    expect(Object.values(w).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 2);
  });
  it('tốc độ chạy nhanh dùng clip hướng của dải chạy nhanh', () => {
    expect(run(Math.PI, 9).Sprint_Bwd_Loop).toBeGreaterThan(0.95);
  });
});
