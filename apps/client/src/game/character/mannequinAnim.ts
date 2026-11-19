// Hàm thuần của hệ animation nhân vật v3 (nâng cấp animation Mannequin): crossfade riêng từng cặp trạng thái, trộn đi/chạy/chạy nhanh
// theo tốc độ thật (khóa pha để không trượt chân), nghiêng khi rẽ, thở, nhìn mục tiêu giới hạn góc, giật nhẹ khi trúng đòn,
// anticipation của đòn UAL dự phòng. Không đụng three: để test được trong Node.

/**
 * Tốc độ gốc (m/s) và độ dài sải (m mỗi chu kỳ) của ba clip đi/chạy/chạy nhanh. Sải đo từ quãng đường bàn chân trụ của
 * chính clip (`tools/blender/ual_loco.py`, `measure`; docs/chr-v3-anim/README.md), khớp với bản dựng đi lùi/ngang cùng họ.
 */
export const LOCO = {
  walk: { clip: 'Walk_Loop', speed: 0.97, stride: 1.24 },
  jog: { clip: 'Jog_Fwd_Loop', speed: 5.36, stride: 5.5 },
  sprint: { clip: 'Sprint_Loop', speed: 8.25, stride: 5.94 },
} as const;

export type LocoBand = keyof typeof LOCO;
export type LocoDirKey = 'f' | 'b' | 'l' | 'r';

/** Tên clip theo dải tốc độ và hướng (đi lùi/ngang dựng thủ tục, tools/blender/ual_loco.py). */
export function locoClipName(band: LocoBand, dir: LocoDirKey): string {
  if (dir === 'f') return LOCO[band].clip;
  const b = band === 'walk' ? 'Walk' : band === 'jog' ? 'Jog' : 'Sprint';
  return `${b}_${dir === 'b' ? 'Bwd' : dir === 'l' ? 'StrafeL' : 'StrafeR'}_Loop`;
}

export interface DirMix {
  f: number;
  b: number;
  l: number;
  r: number;
}

/**
 * Trọng số bốn hướng (tới, lùi, trái, phải) theo góc đi `angle` so với hướng nhìn (0 = tới, +π/2 = trái): chiếu lên bốn trục
 * rồi chuẩn hóa, nên chéo 45° là trộn 50/50 hai clip kề nhau (cả bốn clip chung một pha chân). Tổng = 1.
 */
export function dirMix(angle: number): DirMix {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const f = Math.max(0, c);
  const b = Math.max(0, -c);
  const l = Math.max(0, s);
  const r = Math.max(0, -s);
  const sum = f + b + l + r || 1;
  return { f: f / sum, b: b / sum, l: l / sum, r: r / sum };
}

const smooth = (x: number): number => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
};

export interface LocoMix {
  walk: number;
  jog: number;
  sprint: number;
  /** Số chu kỳ chân mỗi giây (pha dùng chung cho cả ba clip: chân trụ khớp mặt đất). */
  cycles: number;
}

/** Trọng số đi/chạy/chạy nhanh theo tốc độ thật. Tổng trọng số = 1. */
export function locoMix(speed: number): LocoMix {
  const wJog = smooth((speed - 1.4) / 1.0);
  const wSpr = smooth((speed - LOCO.jog.speed) / (LOCO.sprint.speed - LOCO.jog.speed));
  const sprint = wJog * wSpr;
  const jog = wJog * (1 - wSpr);
  const walk = 1 - wJog;
  const stride = walk * LOCO.walk.stride + jog * LOCO.jog.stride + sprint * LOCO.sprint.stride;
  // Tốc độ gốc của hỗn hợp: chu kỳ/giây = tốc độ / độ dài chu kỳ, kẹp để không quá chậm khi trộn.
  return { walk, jog, sprint, cycles: Math.max(0.35, speed / Math.max(0.5, stride)) };
}

/** Thời gian crossfade (giây) từng cặp clip nền; `''` = bất kỳ. */
export function xfade(from: string, to: string): number {
  if (to === 'Death01') return 0.08;
  if (from === 'Death01') return 0.2;
  const loco = (n: string) => n === 'Jog_Fwd_Loop';
  if (to === 'Sitting_Idle_Loop' || from === 'Sitting_Idle_Loop') return 0.35;
  if (to.startsWith('pose_') || from.startsWith('pose_')) return 0.22;
  if (loco(from) && (to === 'Idle_Loop' || to === 'Sword_Idle')) return 0.24;
  if ((from === 'Idle_Loop' || from === 'Sword_Idle') && loco(to)) return 0.14;
  if ((from === 'Idle_Loop' && to === 'Sword_Idle') || (from === 'Sword_Idle' && to === 'Idle_Loop')) return 0.3;
  if (to === 'Jump_Loop' || to === 'NinjaJump_Idle_Loop' || from === 'Jump_Loop' || from === 'NinjaJump_Idle_Loop') return 0.12;
  return 0.16;
}

/** Góc nghiêng thân khi rẽ (rad, dương = nghiêng sang trái người chạy): tỉ lệ tốc độ × tốc độ xoay, kẹp ±`max`. */
export function leanOf(yawRate: number, speed: number, max = 0.13): number {
  if (speed < 1) return 0;
  return Math.max(-max, Math.min(max, yawRate * speed * 0.012));
}

/** Góc xoắn thân của xoay tại chỗ (thân trên chậm hơn chân): trễ theo tốc độ xoay, kẹp ±0,6 rad. */
export function turnLagOf(yawRate: number): number {
  return Math.max(-0.6, Math.min(0.6, yawRate * 0.12));
}

/** Biên độ thở theo thời gian (rad ngực, cộng thêm): chậm 0,28 Hz, nhỏ; đứng yên mới thở rõ. */
export function breathOf(t: number, still: boolean): number {
  return Math.sin(t * Math.PI * 2 * 0.28) * (still ? 0.012 : 0.004);
}

/** Góc quay đầu/cúi đầu (rad) tới điểm nhìn, đã giới hạn: yaw ±`maxYaw` quanh hướng thân, pitch ±`maxPitch`. */
export function lookAngles(
  dx: number,
  dy: number,
  dz: number,
  facing: number,
  maxYaw = 1.0,
  maxPitch = 0.4,
): { yaw: number; pitch: number } {
  const d = Math.hypot(dx, dz);
  if (d < 0.5) return { yaw: 0, pitch: 0 };
  let yaw = Math.atan2(dx, dz) - facing;
  while (yaw > Math.PI) yaw -= 2 * Math.PI;
  while (yaw < -Math.PI) yaw += 2 * Math.PI;
  // Ngoài tầm quay đầu (sau lưng) thì không nhìn, để khỏi vặn cổ.
  if (Math.abs(yaw) > 2.2) return { yaw: 0, pitch: 0 };
  const pitch = -Math.atan2(dy, d);
  return { yaw: Math.max(-maxYaw, Math.min(maxYaw, yaw)), pitch: Math.max(-maxPitch, Math.min(maxPitch, pitch)) };
}

/**
 * Tốc độ phát đòn UAL dự phòng theo tiến độ clip `u` ∈ [0,1]: kéo lại chậm (anticipation) rồi bung nhanh qua điểm trúng,
 * thu về vừa phải. Trung bình quanh `base` để tổng thời lượng gần như không đổi.
 */
export function swingRate(u: number, base: number): number {
  if (u < 0.2) return base * 0.55;
  if (u < 0.5) return base * 1.7;
  return base * 1.05;
}

/** Biên độ giật thân khi trúng đòn (rad), tắt theo hàm mũ. */
export function flinchOf(amp: number, age: number): number {
  return amp * Math.exp(-age * 9) * Math.min(1, age / 0.03);
}
