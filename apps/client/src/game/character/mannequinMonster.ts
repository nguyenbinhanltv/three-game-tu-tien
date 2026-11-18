// Quái hình người dùng bộ xương UE5 Mannequin (DV-2 đợt 2): lưới `mon_*`/`elite_*` dựng bằng tools/blender/chr_v3.py, clip UAL phát TRỰC TIẾP
// từ thư viện `anim_ual_native` (cùng tên xương và tư thế nghỉ, không retarget) qua `SkinnedMonster` thường: chỉ cần ClipMap trỏ tên clip UAL.
// Server không đổi; mọi thứ ở đây chỉ là hình.
import * as THREE from 'three/webgpu';
import type { BossMove } from './skinned';
import type { ClipMap } from './states';
import type { BossMoveKind } from './view';

/** Thư viện clip dùng chung với nhân vật v3 (mannequin.ts `V3_LIB`). */
export const MQ_LIB = 'anim_ual_native';

/** Bảng clip nền của quái hình người: UAL 'Idle_Loop', 'Jog_Fwd_Loop'... Quái đổi từng trạng thái ở bảng dưới. */
export const MQ_CLIPS: ClipMap = {
  idle: 'Idle_Loop',
  walk: 'Walk_Loop',
  run: 'Jog_Fwd_Loop',
  attack: 'Sword_Attack',
  hit: 'Hit_Chest',
  death: 'Death01',
  stun: 'Hit_Knockback',
  cast: 'Spell_Simple_Idle_Loop',
};
/** Tẫn chủng (người xương): dáng zombie, vồ bằng `Zombie_Scratch`. */
export const MQ_ZOMBIE_CLIPS: ClipMap = { ...MQ_CLIPS, idle: 'Zombie_Idle_Loop', walk: 'Zombie_Walk_Fwd_Loop', attack: 'Zombie_Scratch' };
/** Trọng Binh: thủ khiên khi đứng. */
export const MQ_SHIELD_CLIPS: ClipMap = { ...MQ_CLIPS, idle: 'Idle_Shield_Loop' };

/**
 * Thời điểm chạm (giây trong clip ở 1×) đo bằng tốc độ cổ tay đạt đỉnh (Blender, UAL1/UAL2 gốc): Sword_Attack 0,33,
 * Sword_Regular_A 0,20, Zombie_Scratch 0,47, Melee_Hook 0,20. Quái mặc giáp/khiên tránh clip nhào lộn (Sword_Regular_C, Melee_Hook): áo choàng gắn cứng bị vẫy quá mạnh.
 */
export const MQ_MOVES: Partial<Record<BossMoveKind, BossMove>> = {
  slam: { clip: 'Sword_Attack', impact: 0.33 },
  sweep: { clip: 'Sword_Regular_A', impact: 0.2 },
};
export const MQ_ZOMBIE_MOVES: Partial<Record<BossMoveKind, BossMove>> = {
  slam: { clip: 'Zombie_Scratch', impact: 0.47 },
  sweep: { clip: 'Melee_Hook', impact: 0.2 },
};

/**
 * Clip của thư viện đã chỉnh độ cao hông theo lưới này: kênh vị trí của `pelvis` nhân tỉ lệ độ cao hông lưới / bộ xương mẫu
 * (cùng cách `mannequinTemplate` làm cho nhân vật). Trả bản sao, không sửa clip gốc dùng chung.
 */
export function pelvisScaledClips(
  asset: THREE.Object3D,
  lib: THREE.Object3D,
  clips: readonly THREE.AnimationClip[],
): THREE.AnimationClip[] {
  const a = asset.getObjectByName('pelvis')?.position;
  const b = lib.getObjectByName('pelvis')?.position;
  const k = a && b && b.length() > 1e-6 ? a.length() / b.length() : 1;
  return clips.map((c) => {
    const cl = c.clone();
    for (const t of cl.tracks) if (t.name === 'pelvis.position') for (let i = 0; i < t.values.length; i++) t.values[i] *= k;
    return cl;
  });
}
