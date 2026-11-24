import * as THREE from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { ANIM_FX } from './animFx';
import { MannequinCharacter, type MannequinTemplate } from './mannequin';
import type { AnimState } from './view';

// Mẫu giả như mannequinPerform.test: cây xương tối thiểu + clip nền và các clip Patch.
function fake(): MannequinCharacter {
  const scene = new THREE.Group();
  for (const n of ['pelvis', 'spine_01', 'spine_02']) {
    const b = new THREE.Bone();
    b.name = n;
    scene.add(b);
  }
  const clip = (name: string, dur = 1) =>
    new THREE.AnimationClip(name, dur, [
      new THREE.QuaternionKeyframeTrack('spine_02.quaternion', [0, dur], [0, 0, 0, 1, 0, 0, 0.1, 0.995]),
    ]);
  const names = [
    'Idle_Loop',
    'Jog_Fwd_Loop',
    'PM_Run',
    'PM_Idle_To_Run',
    'PM_Run_To_Idle',
    'PM_Idle_To_Walk',
    'PM_Walk_To_Idle',
    'PM_Idle_Tired',
  ];
  const tpl = {
    bank: null,
    height: 1.8,
    clips: new Map(names.map((n) => [n, clip(n, n.startsWith('PM_') ? 2.2 : 1)])),
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
const run = (m: MannequinCharacter, a: AnimState, sec: number) => {
  for (let i = 0; i < Math.round(sec * 60); i++) m.update(1 / 60, a);
};
const priv = (m: MannequinCharacter) => m as unknown as { patchShot: THREE.AnimationAction | null; patchKind: string | null };

describe('MannequinCharacter: clip Patch (bắt đầu/dừng/thở dốc)', () => {
  it('bật cờ: bắt đầu chạy phát PM_Idle_To_Run, dừng phát PM_Run_To_Idle', () => {
    const was = ANIM_FX.patch;
    ANIM_FX.patch = true;
    try {
      const m = fake();
      run(m, anim(), 0.3);
      run(m, anim({ speed: 5.4 }), 0.3);
      expect(priv(m).patchKind).toBe('start');
      expect(priv(m).patchShot?.getClip().name).toBe('PM_Idle_To_Run');
      run(m, anim({ speed: 5.4 }), 2);
      run(m, anim({ speed: 0 }), 0.2);
      expect(priv(m).patchKind).toBe('stop');
      expect(priv(m).patchShot?.getClip().name).toBe('PM_Run_To_Idle');
    } finally {
      ANIM_FX.patch = was;
    }
  });
  it('lại chạy giữa clip dừng thì hủy clip dừng', () => {
    const was = ANIM_FX.patch;
    ANIM_FX.patch = true;
    try {
      const m = fake();
      run(m, anim(), 0.3);
      run(m, anim({ speed: 5.4 }), 2.5);
      run(m, anim({ speed: 0 }), 0.2);
      expect(priv(m).patchKind).toBe('stop');
      run(m, anim({ speed: 5.4 }), 0.1);
      expect(priv(m).patchShot).toBeNull();
    } finally {
      ANIM_FX.patch = was;
    }
  });
  it('tắt cờ: không phát clip Patch', () => {
    const was = ANIM_FX.patch;
    ANIM_FX.patch = false;
    try {
      const m = fake();
      run(m, anim(), 0.3);
      run(m, anim({ speed: 5.4 }), 2.5);
      run(m, anim({ speed: 0 }), 0.3);
      expect(priv(m).patchShot).toBeNull();
    } finally {
      ANIM_FX.patch = was;
    }
  });
  it('đang bay/chết thì không phát', () => {
    const was = ANIM_FX.patch;
    ANIM_FX.patch = true;
    try {
      const m = fake();
      run(m, anim(), 0.3);
      run(m, anim({ speed: 5.4, flying: true }), 2.5);
      run(m, anim({ speed: 0, flying: true }), 0.3);
      expect(priv(m).patchShot).toBeNull();
    } finally {
      ANIM_FX.patch = was;
    }
  });
});
