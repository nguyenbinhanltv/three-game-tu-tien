import * as THREE from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { lowerBodyOf, mannequinToMixamo } from './mannequinPoses';

describe('mannequinToMixamo (bảng đổi tên xương cho pose K-5)', () => {
  it('thân, tay, chân, ngón theo đúng tên Mixamo của asset nguồn', () => {
    expect(mannequinToMixamo('pelvis')).toBe('mixamorig_hips');
    expect(mannequinToMixamo('spine_03')).toBe('mixamorig_spine2');
    expect(mannequinToMixamo('Head')).toBe('mixamorig_head');
    expect(mannequinToMixamo('clavicle_l')).toBe('mixamorig_leftshoulder');
    expect(mannequinToMixamo('upperarm_r')).toBe('mixamorig_rightarm');
    expect(mannequinToMixamo('lowerarm_l')).toBe('mixamorig_leftforearm');
    expect(mannequinToMixamo('thigh_r')).toBe('mixamorig_rightupleg');
    expect(mannequinToMixamo('calf_l')).toBe('mixamorig_leftleg');
    expect(mannequinToMixamo('ball_r')).toBe('mixamorig_righttoebase');
    expect(mannequinToMixamo('index_02_l')).toBe('mixamorig_lefthandindex2');
    expect(mannequinToMixamo('thumb_03_r')).toBe('mixamorig_righthandthumb3');
  });
  it('xương không có tương ứng (twist, lò xo, dtl_*, xương lá, root) trả undefined', () => {
    for (const n of ['root', 'upperarm_twist_l', 'dtl_o_skirt_0_0', 'dtl_sword', 'index_04_leaf_l', 'ball_leaf_r']) expect(mannequinToMixamo(n)).toBeUndefined();
  });
});

describe('lowerBodyOf', () => {
  it('chỉ giữ kênh hông và chân, đặt tên riêng', () => {
    const mk = (n: string) => new THREE.QuaternionKeyframeTrack(`${n}.quaternion`, [0, 1], [0, 0, 0, 1, 0, 0, 0, 1]);
    const clip = new THREE.AnimationClip('Jog', 1, ['pelvis', 'thigh_l', 'calf_r', 'foot_l', 'ball_r', 'spine_01', 'upperarm_l', 'Head'].map(mk));
    const low = lowerBodyOf(clip);
    expect(low.tracks.map((t) => t.name.split('.')[0]).sort()).toEqual(['ball_r', 'calf_r', 'foot_l', 'pelvis', 'thigh_l']);
    expect(low.name).toBe('Jog|lower');
    expect(lowerBodyOf(clip)).toBe(low);
  });
});

describe('retargetClips với bảng đổi tên + trackedOnly', () => {
  const chain = (names: string[], _type: 'bone' = 'bone') => {
    const root = new THREE.Group();
    let parent: THREE.Object3D = root;
    names.forEach((n, i) => {
      const b = new THREE.Bone();
      b.name = n;
      b.position.set(0, i === 0 ? 1 : 0.3, 0);
      parent.add(b);
      parent = b;
    });
    root.updateMatrixWorld(true);
    return root;
  };
  it('xuất kênh theo tên xương đích, tách nửa thân khi trackedOnly', async () => {
    const { retargetClips } = await import('./animLib');
    const src = chain(['mixamorig_hips', 'mixamorig_spine']);
    const dst = chain(['pelvis', 'spine_01']);
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), 0.5);
    const clip = new THREE.AnimationClip('c', 1, [new THREE.QuaternionKeyframeTrack('mixamorig_spine.quaternion', [0, 1], [0, 0, 0, 1, q.x, q.y, q.z, q.w])]);
    const all = retargetClips(src, [clip], dst, { dstName: mannequinToMixamo })[0];
    expect(all.tracks.map((t) => t.name).sort()).toEqual(['pelvis.quaternion', 'spine_01.quaternion']);
    const only = retargetClips(src, [clip], dst, { dstName: mannequinToMixamo, trackedOnly: true })[0];
    expect(only.tracks.map((t) => t.name)).toEqual(['spine_01.quaternion']);
    const end = only.tracks[0].values.slice(-4);
    expect(Math.abs(end[2] - q.z)).toBeLessThan(1e-4); // cùng hệ trục nên xoay giữ nguyên
  });
});
