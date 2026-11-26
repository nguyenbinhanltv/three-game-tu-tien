import * as THREE from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { MannequinCharacter, type MannequinTemplate } from './mannequin';
import { KNOCK_TOTAL_S } from './hitDir';
import type { AnimState } from './view';

const anim = (o: Partial<AnimState> = {}): AnimState => ({
  speed: 0,
  flying: false,
  meditating: false,
  dead: false,
  casting: false,
  airborne: false,
  ...o,
});

function fake(): MannequinCharacter {
  const scene = new THREE.Group();
  for (const n of ['pelvis', 'spine_01', 'spine_02']) {
    const b = new THREE.Bone();
    b.name = n;
    scene.add(b);
  }
  const clip = (name: string, dur: number) =>
    new THREE.AnimationClip(name, dur, [
      new THREE.QuaternionKeyframeTrack('spine_02.quaternion', [0, dur], [0, 0, 0, 1, 0, 0, 0.1, 0.995]),
    ]);
  const clips = new Map<string, THREE.AnimationClip>();
  for (const [n, d] of [
    ['Idle_Loop', 1],
    ['Jog_Fwd_Loop', 1],
    ['Walk_Loop', 1],
    ['Sprint_Loop', 1],
    ['Hit_Chest', 0.33],
    ['Roll', 1],
    ['Hit_Knockback', 0.83],
    ['LayToIdle', 1.53],
  ] as const)
    clips.set(n, clip(n, d));
  return new MannequinCharacter({ bank: null, height: 1.8, clips, handle: { scene } } as unknown as MannequinTemplate);
}

const run = (m: MannequinCharacter, sec: number, a: Partial<AnimState> = {}) => {
  for (let i = 0; i < Math.round(sec * 60); i++) m.update(1 / 60, anim(a));
};
const knocking = (m: MannequinCharacter) => (m as unknown as { knocking: boolean }).knocking;

describe('knockdown chỉ là hình (TP-2)', () => {
  it('ngã + đứng dậy xong trong KNOCK_TOTAL_S (+ chút dung sai nhịp khung)', () => {
    const m = fake();
    run(m, 0.2);
    m.knockdown();
    expect(knocking(m)).toBe(true);
    run(m, 0.3);
    expect(knocking(m)).toBe(true);
    run(m, KNOCK_TOTAL_S + 0.15 - 0.3);
    expect(knocking(m)).toBe(false);
  });
  it('server báo di chuyển giữa lúc ngã thì hủy ngay', () => {
    const m = fake();
    run(m, 0.2);
    m.knockdown();
    run(m, 0.2);
    expect(knocking(m)).toBe(true);
    run(m, 1 / 60, { speed: 3 });
    expect(knocking(m)).toBe(false);
  });
  it('niệm chú hoặc ra đòn giữa lúc ngã cũng hủy; đứng yên thì không', () => {
    const a = fake();
    a.knockdown();
    run(a, 0.1, { casting: true });
    expect(knocking(a)).toBe(false);
    const b = fake();
    b.knockdown();
    run(b, 0.1);
    expect(knocking(b)).toBe(true);
    b.attack({ skill: 'skl_test', combo: 1 });
    expect(knocking(b)).toBe(false);
  });
});
