import type { CharState } from './states';

/**
 * Bảng clip của thư viện chung `anim_human_base` (K-3). Nguồn: clip mocap thư viện animation Tripo web, retarget và xử lý bằng
 * `tools/blender/anim_human_k3.py`, clip thủ tục bằng `tools/blender/anim_biped_extra.py`; số đo từng clip ở `docs/k3-anim/clips.json`
 * (lệch hướng, độ khép vòng, tốc độ nền, độ trượt chân). Máy trạng thái game (K-4) dùng bảng này; test `humanClips.test.ts` giữ bảng
 * khớp GLB. K-3 chưa nối các clip này vào game, trừ bộ cũ (idle, run, attack, hit_light, death).
 */
export interface HumanClipInfo {
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
  idle: { loop: true, role: 'đứng nghỉ', state: 'idle' },
  run: { loop: true, role: 'chạy', refSpeed: 3.09, move: 'forward', state: 'run' },
  heavy_chop: { loop: false, role: 'chém bổ cúi người như chặt củi (Tripo slash, trước tên attack): chỉ làm đòn dự phòng, đòn kiếm làm bằng IK ở K-5' },
  hit_light: { loop: false, role: 'giật nhẹ khi trúng đòn (thủ tục, 0,33 s)' },
  death: { loop: false, role: 'chết (Tripo fall)', state: 'death' },
  // K-3: di chuyển.
  walk: { loop: true, role: 'đi bộ', refSpeed: 0.978, move: 'forward', state: 'walk' },
  back: { loop: true, role: 'đi lùi (walk đảo thời gian)', refSpeed: 0.971, move: 'back' },
  strafe_l: { loop: true, role: 'đi ngang sang trái (hông xoay 90°, thân trên vặn ngược)', refSpeed: 0.971, move: 'left' },
  strafe_r: { loop: true, role: 'đi ngang sang phải', refSpeed: 0.977, move: 'right' },
  cast_walk: { loop: true, role: 'niệm chú khi đi: thân trên cast_stand, thân dưới walk', refSpeed: 0.978, move: 'forward' },
  jump: { loop: false, role: 'khởi nhảy, lơ lửng' },
  land: { loop: false, role: 'rơi và tiếp đất (cắt từ jump_down)' },
  // K-3: thủ thế và đỡ.
  combat_idle: { loop: true, role: 'thủ thế cầm kiếm (thủ tục IK)', state: 'combatIdle' },
  guard: { loop: true, role: 'đỡ đòn: hai tay vắt chéo trước ngực, hạ trọng tâm (thủ tục IK)' },
  // K-3: né.
  dodge_f: { loop: false, role: 'né lăn về trước (Tripo dive)' },
  dodge_l: { loop: false, role: 'lăn sang trái (dodge_f xoay hình sin² 90°, trả mặt về trước)' },
  dodge_r: { loop: false, role: 'lăn sang phải' },
  dodge_back: { loop: false, role: 'né lộn ra sau (Tripo flip, phát nhanh 2,7×, ~1,1 s)' },
  // K-3: trúng đòn, ngã, đứng dậy.
  hit_front_1: { loop: false, role: 'trúng nhẹ từ trước' },
  hit_front_2: { loop: false, role: 'trúng vừa từ trước (xen kẽ)' },
  hit_l: { loop: false, role: 'trúng từ bên trái' },
  hit_r: { loop: false, role: 'trúng từ bên phải (hit_l đối xứng)' },
  hit_back: { loop: false, role: 'trúng từ sau: ưỡn lưng, chân vọt tới (thủ tục IK)' },
  hit_heavy: { loop: false, role: 'trúng nặng, gập người (boss, chí mạng)' },
  hit_head: { loop: false, role: 'giật đầu (choáng nhẹ, bị ngắt niệm chú)' },
  knockdown: { loop: false, role: 'bị hất ngã, nằm sấp ở khung cuối' },
  getup: { loop: false, role: 'đứng dậy từ tư thế nằm của knockdown về thủ thế: đầu dẫn, chân đẩy, thân trên theo sau' },
  // K-3: chiêu và biểu cảm.
  cast_stand: { loop: false, role: 'niệm chú đứng', state: 'cast' },
  kick_1: { loop: false, role: 'đá thẳng đẩy lùi' },
  kick_2: { loop: false, role: 'đá biến thể' },
  roar: { loop: false, role: 'khiêu khích: kéo tay vào hông, ưỡn ngực dang tay (thủ tục IK)' },
};

/** Tên clip của thư viện, theo bảng. */
export const HUMAN_CLIP_NAMES = Object.keys(HUMAN_CLIPS);
