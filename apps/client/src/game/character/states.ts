import type { AnimState } from './view';

/**
 * Trạng thái animation. `idle`…`death` là trạng thái nền (lặp hoặc kẹp cuối) chọn từ `AnimState`;
 * `attack`, `hit` là đòn một lần chồng lên nền rồi trả về.
 */
export type CharState =
  | 'idle'
  | 'combatIdle'
  | 'walk'
  | 'run'
  | 'back'
  | 'strafeL'
  | 'strafeR'
  | 'jump'
  | 'fly'
  | 'sky'
  | 'meditate'
  | 'cast'
  | 'stun'
  | 'death'
  | 'attack'
  | 'hit'
  | 'dash';

/** Trạng thái → tên clip trong GLB. Thiếu clip thì lùi theo `FALLBACK`. */
export type ClipMap = Partial<Record<CharState, string>>;

/** Trạng thái lùi khi asset không có clip riêng (null = bỏ qua, giữ clip đang chạy). */
export const FALLBACK: Record<CharState, CharState | null> = {
  idle: null,
  combatIdle: 'idle',
  walk: 'run',
  run: 'walk',
  // Đi lùi/ngang thiếu clip K-3 (chưa nạp xong hoặc asset không phải người) thì chạy bình thường.
  back: 'run',
  strafeL: 'run',
  strafeR: 'run',
  dash: 'run',
  jump: 'idle',
  fly: 'idle',
  sky: 'fly',
  meditate: 'idle',
  cast: 'combatIdle',
  stun: 'combatIdle',
  death: null,
  attack: null,
  hit: null,
};

/** Dưới tốc độ này coi là đứng yên (m/s, trước scale). */
export const MOVE_MIN = 0.3;
/** Từ tốc độ này (× tốc độ tham chiếu của clip chạy) chuyển đi → chạy. */
export const RUN_FROM = 0.6;

/** Trạng thái nền theo thứ tự ưu tiên: chết > choáng > thiền > bay > trên không > niệm chú > di chuyển > đứng. */
export function baseState(a: AnimState, refSpeed: number, combatBias = false): CharState {
  if (a.dead) return 'death';
  if (a.stunned) return 'stun';
  if (a.meditating) return 'meditate';
  if (a.flying) return a.sky ? 'sky' : 'fly';
  if (a.airborne) return 'jump';
  if (a.casting) return 'cast';
  if (a.speed > MOVE_MIN) {
    if (a.moveDir === 'back') return 'back';
    if (a.moveDir === 'left') return 'strafeL';
    if (a.moveDir === 'right') return 'strafeR';
    return a.speed >= refSpeed * RUN_FROM ? 'run' : 'walk';
  }
  return a.combat || combatBias ? 'combatIdle' : 'idle';
}

/** Tên clip cho trạng thái, đi theo chuỗi lùi; null nếu không có clip nào phù hợp. */
export function clipFor(state: CharState, map: ClipMap, has: (clip: string) => boolean): string | null {
  const seen = new Set<CharState>();
  let s: CharState | null = state;
  while (s && !seen.has(s)) {
    seen.add(s);
    const c = map[s];
    if (c && has(c)) return c;
    s = FALLBACK[s];
  }
  return null;
}

/** Hệ số tốc độ phát clip di chuyển để chân không trượt: tốc độ thật / tốc độ của clip ở 1×. */
export function locomotionScale(speed: number, refSpeed: number): number {
  return Math.min(2.6, Math.max(0.45, speed / Math.max(0.01, refSpeed)));
}

/** Trạng thái nền là di chuyển (clip lặp theo tốc độ, chân bám đất). */
export const LOCO_STATES: ReadonlySet<CharState> = new Set<CharState>(['walk', 'run', 'back', 'strafeL', 'strafeR']);
