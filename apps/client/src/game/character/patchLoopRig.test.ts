import * as THREE from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { ANIM_FX } from './animFx';
import { MannequinCharacter, type MannequinTemplate } from './mannequin';
import type { AnimState } from './view';

// Mẫu giả như patchMoveRig.test: cây xương tối thiểu + clip UAL (đi/chạy/chạy nhanh) và clip Patch (chạy/chạy nhanh).
function fake(names: string[]): MannequinCharacter {
  const scene = new THREE.Group();
  for (const n of ['pelvis', 'spine_01', 'spine_02']) {
    const b = new THREE.Bone();
    b.name = n;
    scene.add(b);
  }
  const dur = (n: string) => (n === 'PM_Run' ? 0.667 : n === 'PM_Sprint' ? 0.6 : n === 'Jog_Fwd_Loop' ? 0.933 : 1);
  const clip = (name: string) =>
    new THREE.AnimationClip(name, dur(name), [
      new THREE.QuaternionKeyframeTrack('spine_02.quaternion', [0, dur(name)], [0, 0, 0, 1, 0, 0, 0.1, 0.995]),
    ]);
  const tpl = {
    bank: null,
    height: 1.8,
    clips: new Map(names.map((n) => [n, clip(n)])),
    handle: { scene },
  } as unknown as MannequinTemplate;
  return new MannequinCharacter(tpl);
}
const UAL = ['Idle_Loop', 'Jog_Fwd_Loop', 'Walk_Loop', 'Sprint_Loop', 'Hit_Chest', 'Hit_Head', 'Hit_Knockback'];
const PM = ['PM_Run', 'PM_Sprint'];
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
const priv = (m: MannequinCharacter) =>
  m as unknown as { base: THREE.AnimationAction | null; companions: THREE.AnimationAction[]; locoTable: { jog: { clip: string } } };
const withFlags = (patch: boolean, loop: boolean, fn: () => void) => {
  const was = [ANIM_FX.patch, ANIM_FX.patchLoop];
  ANIM_FX.patch = patch;
  ANIM_FX.patchLoop = loop;
  try {
    fn();
  } finally {
    [ANIM_FX.patch, ANIM_FX.patchLoop] = was as [boolean, boolean];
  }
};

describe('MannequinCharacter: vòng chạy bằng clip Patch', () => {
  it('bật patchLoop + có PM_Run/PM_Sprint: nền là PM_Run, companion chạy nhanh là PM_Sprint; đi bộ vẫn UAL', () => {
    withFlags(true, true, () => {
      const m = fake([...UAL, ...PM, 'PM_Run_To_Idle']);
      run(m, anim({ speed: 5.4 }), 0.5);
      expect(priv(m).locoTable.jog.clip).toBe('PM_Run');
      expect(priv(m).base?.getClip().name).toBe('PM_Run');
      const names = priv(m).companions.map((c) => c.getClip().name);
      expect(names).toContain('PM_Sprint');
      expect(names).toContain('Walk_Loop');
      expect(names).not.toContain('Sprint_Loop');
    });
  });

  it('tắt patchLoop hoặc thiếu clip Patch: giữ vòng UAL', () => {
    withFlags(true, false, () => {
      const m = fake([...UAL, ...PM]);
      run(m, anim({ speed: 5.4 }), 0.5);
      expect(priv(m).locoTable.jog.clip).toBe('Jog_Fwd_Loop');
      expect(priv(m).base?.getClip().name).toBe('Jog_Fwd_Loop');
    });
    withFlags(true, true, () => {
      const m = fake([...UAL, 'PM_Run']); // thiếu PM_Sprint
      run(m, anim({ speed: 5.4 }), 0.5);
      expect(priv(m).locoTable.jog.clip).toBe('Jog_Fwd_Loop');
      expect(priv(m).base?.getClip().name).toBe('Jog_Fwd_Loop');
    });
  });

  it('pha: thời gian clip PM_Run = (pha chung − 0,029) × thời lượng, trong [0, dur)', () => {
    withFlags(true, true, () => {
      const m = fake([...UAL, ...PM]);
      run(m, anim({ speed: 5.4 }), 1.3);
      const t = priv(m).base!.time;
      expect(t).toBeGreaterThanOrEqual(0);
      expect(t).toBeLessThan(0.667);
    });
  });
});
