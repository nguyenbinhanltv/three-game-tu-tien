import * as THREE from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { matchLimbLengths } from './mannequinPoses';

const q = (name: string) => new THREE.QuaternionKeyframeTrack(`${name}.quaternion`, [0, 1], [0, 0, 0, 1, 0, 0, 0, 1]);
const p = (name: string, v: number[]) => new THREE.VectorKeyframeTrack(`${name}.position`, [0, 1], [...v, ...v.map((x) => x * 2)]);

describe('matchLimbLengths: clip pose khớp độ dài xương chi với clip nền', () => {
  const ref = new THREE.AnimationClip('Idle_Loop', 1, [
    p('pelvis', [0, 1, 0]),
    p('upperarm_l', [0.22, 0, 0]),
    p('lowerarm_l', [0.27, 0, 0]),
    p('thigh_l', [0, -0.4, 0]),
  ]);
  it('thêm track vị trí hằng (khung đầu của nền) cho xương chi pose có điều khiển xoay', () => {
    const clip = new THREE.AnimationClip('pose', 1, [q('upperarm_l'), q('lowerarm_l'), q('pelvis')]);
    matchLimbLengths(clip, ref);
    const pos = clip.tracks.filter((t) => t.name.endsWith('.position'));
    expect(pos.map((t) => t.name).sort()).toEqual(['lowerarm_l.position', 'upperarm_l.position']);
    const up = pos.find((t) => t.name === 'upperarm_l.position')!;
    expect(up.values).toHaveLength(3);
    expect(up.values[0]).toBeCloseTo(0.22, 5);
    expect(up.values[1]).toBe(0);
    expect(Array.from(up.times)).toEqual([0]);
  });
  it('không đụng hông, xương pose không xoay, hay track vị trí đã có', () => {
    const own = p('upperarm_l', [9, 9, 9]);
    const clip = new THREE.AnimationClip('pose', 1, [q('upperarm_l'), own, q('pelvis')]);
    matchLimbLengths(clip, ref);
    const pos = clip.tracks.filter((t) => t.name.endsWith('.position'));
    expect(pos).toEqual([own]);
    expect(clip.tracks.some((t) => t.name === 'thigh_l.position')).toBe(false);
  });
  it('không có clip nền thì giữ nguyên', () => {
    const clip = new THREE.AnimationClip('pose', 1, [q('upperarm_l')]);
    matchLimbLengths(clip, undefined);
    expect(clip.tracks).toHaveLength(1);
  });
});
