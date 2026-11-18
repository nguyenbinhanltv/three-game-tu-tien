import type { CharState } from './states';

/**
 * Bảng clip của thư viện chung `anim_human_base` (K-3). Nguồn: clip mocap thư viện animation Tripo web, retarget và xử lý bằng
 * `tools/blender/anim_human_k3.py`, clip thủ tục bằng `tools/blender/anim_biped_extra.py`; số đo từng clip ở `docs/k3-anim/clips.json`
 * (lệch hướng, độ khép vòng, tốc độ nền, độ trượt chân). Máy trạng thái game (K-4) dùng bảng này; test `humanClips.test.ts` giữ bảng
 * khớp GLB. K-3 chưa nối các clip này vào game, trừ bộ cũ (idle, run, attack, hit_light, death).
 */
type HumanLib = 'base' | 'k3' | 'ual';

interface HumanClipInfo {
  /** Thư viện chứa clip: `base` = anim_human_base (nạp cùng nhân vật), `k3` = anim_human_k3, `ual` = anim_human_ual (nạp lười). */
  lib: HumanLib;
  /** Clip UAL còn được đặt thêm dưới các tên này, đè clip cùng tên của thư viện cũ (death, hit_light, knockdown...). */
  as?: readonly string[];
  /** Clip lặp khít (khung cuối ≡ khung đầu). */
  loop: boolean;
  /** Việc của clip. */
  role: string;
  /** Tốc độ nền (m/s ở 1×, đo trên Thanh Phong cao 1,75 m; nhân vật khác nhân theo tỉ lệ hông) của clip đi lại: chân trụ đứng yên so với đất. */
  refSpeed?: number;
  /** Hướng thân dịch chuyển của clip đi lại, theo mặt nhân vật. */
  move?: 'forward' | 'back' | 'left' | 'right';
  /** Trạng thái nền của máy trạng thái mà clip dự kiến phục vụ (K-4). */
  state?: CharState;
}

export const HUMAN_CLIPS: Record<string, HumanClipInfo> = {
  // Bộ cũ (M2-3), đang chạy trong game.
  idle: { lib: 'base', loop: true, role: 'đứng nghỉ', state: 'idle' },
  run: { lib: 'base', loop: true, role: 'chạy', refSpeed: 3.09, move: 'forward', state: 'run' },
  heavy_chop: {
    lib: 'base',
    loop: false,
    role: 'chém bổ cúi người như chặt củi (Tripo slash, trước tên attack): chỉ làm đòn dự phòng, đòn kiếm làm bằng IK ở K-5',
  },
  hit_light: { lib: 'base', loop: false, role: 'giật nhẹ khi trúng đòn (thủ tục, 0,33 s)' },
  death: { lib: 'base', loop: false, role: 'chết (Tripo fall)', state: 'death' },
  // K-3: di chuyển.
  walk: { lib: 'k3', loop: true, role: 'đi bộ', refSpeed: 0.978, move: 'forward', state: 'walk' },
  back: { lib: 'k3', loop: true, role: 'đi lùi (walk đảo thời gian)', refSpeed: 0.971, move: 'back' },
  strafe_l: { lib: 'k3', loop: true, role: 'đi ngang sang trái (hông xoay 90°, thân trên vặn ngược)', refSpeed: 0.971, move: 'left' },
  strafe_r: { lib: 'k3', loop: true, role: 'đi ngang sang phải', refSpeed: 0.977, move: 'right' },
  cast_walk: { lib: 'k3', loop: true, role: 'niệm chú khi đi: thân trên cast_stand, thân dưới walk', refSpeed: 0.978, move: 'forward' },
  jump: { lib: 'k3', loop: false, role: 'khởi nhảy, lơ lửng' },
  land: { lib: 'k3', loop: false, role: 'rơi và tiếp đất (cắt từ jump_down)' },
  // K-3: thủ thế và đỡ.
  combat_idle: { lib: 'k3', loop: true, role: 'thủ thế cầm kiếm (thủ tục IK)', state: 'combatIdle' },
  guard: { lib: 'k3', loop: true, role: 'đỡ đòn: hai tay vắt chéo trước ngực, hạ trọng tâm (thủ tục IK)' },
  // K-3: né.
  dodge_f: { lib: 'k3', loop: false, role: 'né lăn về trước (Tripo dive)' },
  dodge_l: { lib: 'k3', loop: false, role: 'lăn sang trái (dodge_f xoay hình sin² 90°, trả mặt về trước)' },
  dodge_r: { lib: 'k3', loop: false, role: 'lăn sang phải' },
  dodge_back: { lib: 'k3', loop: false, role: 'né lộn ra sau (Tripo flip, phát nhanh 2,7×, ~1,1 s)' },
  // K-3: trúng đòn, ngã, đứng dậy.
  hit_front_1: { lib: 'k3', loop: false, role: 'trúng nhẹ từ trước' },
  hit_front_2: { lib: 'k3', loop: false, role: 'trúng vừa từ trước (xen kẽ)' },
  hit_l: { lib: 'k3', loop: false, role: 'trúng từ bên trái' },
  hit_r: { lib: 'k3', loop: false, role: 'trúng từ bên phải (hit_l đối xứng)' },
  hit_back: { lib: 'k3', loop: false, role: 'trúng từ sau: ưỡn lưng, chân vọt tới (thủ tục IK)' },
  hit_heavy: { lib: 'k3', loop: false, role: 'trúng nặng, gập người (boss, chí mạng)' },
  hit_head: { lib: 'k3', loop: false, role: 'giật đầu (choáng nhẹ, bị ngắt niệm chú)' },
  knockdown: { lib: 'k3', loop: false, role: 'bị hất ngã, nằm sấp ở khung cuối' },
  getup: { lib: 'k3', loop: false, role: 'đứng dậy từ tư thế nằm của knockdown về thủ thế: đầu dẫn, chân đẩy, thân trên theo sau' },
  // K-3: chiêu và biểu cảm.
  cast_stand: { lib: 'k3', loop: false, role: 'niệm chú đứng', state: 'cast' },
  kick_1: { lib: 'k3', loop: false, role: 'đá thẳng đẩy lùi' },
  kick_2: { lib: 'k3', loop: false, role: 'đá biến thể' },
  roar: { lib: 'k3', loop: false, role: 'khiêu khích: kéo tay vào hông, ưỡn ngực dang tay (thủ tục IK)' },
  // UAL (Quaternius CC0, anim_human_ual): clip chọn lọc, tại chỗ (hông ghim ngang). `as` = tên clip cũ bị thay.
  ual_death: { lib: 'ual', loop: false, role: 'chết ngã ngửa (Death01)', as: ['death'] },
  ual_hit_chest: { lib: 'ual', loop: false, role: 'trúng ngực (Hit_Chest)', as: ['hit_light', 'hit_front_1'] },
  ual_hit_head: { lib: 'ual', loop: false, role: 'trúng đầu (Hit_Head)', as: ['hit_front_2'] },
  ual_knockback: { lib: 'ual', loop: false, role: 'bị hất ngã (Hit_Knockback)', as: ['knockdown'] },
  ual_getup: { lib: 'ual', loop: false, role: 'đứng dậy từ nằm (LayToIdle)', as: ['getup'] },
  ual_dash: { lib: 'ual', loop: false, role: 'lướt kiếm (Sword_Dash): lướt Q', state: 'dash' },
  ual_roll: { lib: 'ual', loop: false, role: 'lộn né (Roll)' },
  ual_block: { lib: 'ual', loop: false, role: 'đỡ kiếm (Sword_Block)' },
  ual_jump_start: { lib: 'ual', loop: false, role: 'nhảy: lấy đà (NinjaJump_Start)' },
  ual_jump_loop: { lib: 'ual', loop: true, role: 'nhảy: lơ lửng (NinjaJump_Idle_Loop)', state: 'jump' },
  ual_jump_land: { lib: 'ual', loop: false, role: 'nhảy: tiếp đất (NinjaJump_Land)' },
  ual_combat_idle: { lib: 'ual', loop: true, role: 'thủ thế cầm kiếm (Sword_Idle)', as: ['combat_idle'] },
  ual_idle_fold: { lib: 'ual', loop: true, role: 'NPC khoanh tay (Idle_FoldArms_Loop)' },
  ual_idle_talk: { lib: 'ual', loop: true, role: 'NPC nói chuyện (Idle_Talking_Loop)' },
  ual_interact: { lib: 'ual', loop: false, role: 'NPC tương tác (Interact)' },
  ual_yes: { lib: 'ual', loop: false, role: 'gật đầu (Yes)' },
  ual_no: { lib: 'ual', loop: true, role: 'lắc đầu (Idle_No_Loop)' },
};

/** Trạng thái nền của người chơi → clip UAL (thêm vào `ClipMap` khi thư viện UAL đã nạp). */
export const UAL_STATES: Partial<Record<CharState, string>> = { jump: 'ual_jump_loop', dash: 'ual_dash' };
/** Clip UAL NPC dùng xen vào idle cho đa dạng. */
export const UAL_NPC_IDLES: readonly string[] = ['ual_idle_fold', 'ual_idle_talk', 'ual_interact', 'ual_yes', 'ual_no'];

/** Tên clip của thư viện, theo bảng. */
const HUMAN_CLIP_NAMES = Object.keys(HUMAN_CLIPS);
/** Tên clip của một thư viện. */
export const clipNamesOf = (lib: HumanLib): string[] => HUMAN_CLIP_NAMES.filter((n) => HUMAN_CLIPS[n].lib === lib);
