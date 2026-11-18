import * as THREE from 'three/webgpu';
import { HUMAN_CLIPS, UAL_STATES } from './humanClips';
import type { CharState, ClipMap } from './states';
import { FLAGS } from '../../base/flags';

/** `?ual=0` tắt clip UAL, về clip K-3 cũ (so ảnh/video trước-sau). */
export const UAL_ENABLED = FLAGS.ual;

/** Tên clip cũ mà clip UAL thay (death, hit_light, knockdown, getup, combat_idle, hit_front_*): `addClips(…, replace)`. */
export const UAL_REPLACE: readonly string[] = [
  ...new Set(Object.values(HUMAN_CLIPS).flatMap((c) => (c.lib === 'ual' ? (c.as ?? []) : []))),
];

/** Clip đã retarget → chính nó (tên `ual_*`) cùng các bản sao mang tên clip cũ mà nó thay thế. */
export function ualAliases(clip: THREE.AnimationClip): THREE.AnimationClip[] {
  const out = [clip];
  for (const name of HUMAN_CLIPS[clip.name]?.as ?? []) {
    const c = clip.clone();
    c.name = name;
    out.push(c);
  }
  return out;
}

/** Bảng trạng thái → clip UAL cho những clip đã có (nhảy lơ lửng, lướt). */
export function ualMap(have: (name: string) => boolean): ClipMap {
  const map: ClipMap = {};
  for (const [state, clip] of Object.entries(UAL_STATES) as [CharState, string][]) if (have(clip)) map[state] = clip;
  return map;
}
