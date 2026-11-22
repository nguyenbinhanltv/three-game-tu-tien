// Hình trận của Cấm chế sư (TN-8), kích bằng S.FX: `tran_<kiểu>` lúc đặt (x, z, r, d = thời gian sống) và `tran_tick_<kiểu>` mỗi nhịp.
// Chỉ là lớp hình; server mới quyết định trận ở đâu, bán kính, hiệu lực. Phát qua `FxRunner.startAt` với `area` = {x, z, r}, nên
// vòng vẽ đúng bán kính thật. Đoạn đứng phát nối tiếp (mesh timeline sống tối đa 4 giây). Hình ở `data/fx/tran_*.json` (tools/vfx/recipes_tran.py).
import type { FxMsg, FxTimeline } from '@dtl/shared';
import { TRAN_FX } from '@dtl/content';
import type { FxCaster } from './fxTimeline';

export const TRAN_MODES = ['sat', 'khon', 'ho', 'sinhtu'] as const;
export const TRAN_PALETTE = 'cam_che_kinh';
/** Xa hơn chừng này (mét) thì bỏ hình trận của người khác. */
export const TRAN_FX_DIST = 50;
/** Số lưới VFX đang sống từ mức này thì bỏ nhịp trận của người khác (sân đông). */
export const TRAN_FX_LIVE_MAX = 90;
export const TRAN_STAND_SEG = 3.3;
export const TRAN_STAND_MAX = 20;

/** Phân loại S.FX: trả { mode, tick } nếu là tin trận, không thì null. */
export function tranKind(t: string): { mode: string; tick: boolean } | null {
  const m = /^tran_(tick_)?(sat|khon|ho|sinhtu)$/.exec(t);
  return m ? { mode: m[2]!, tick: !!m[1] } : null;
}

export interface TranEnv {
  startAt(
    tl: FxTimeline,
    o: { actor: FxCaster; palette: string; area: { x: number; z: number; r: number }; mul?: number; mine?: boolean },
  ): void;
  groundAt(x: number, z: number): number;
  mySid(): string;
  viewer(): { x: number; z: number };
  live(): number;
  /** Hẹn giờ theo đồng hồ hiệu ứng của game: gọi `done` sau `sec` giây. */
  after(sec: number, done: () => void): void;
}

/** Số lần đặt mới nhất theo vị trí chủ + kiểu: đoạn cũ thấy số khác thì tự dừng (trận bị thay thì hình cũ vẫn hết đoạn đang chạy). */
const gen = new Map<string, number>();

/** Xử lý một tin S.FX trận. Trả true nếu tin thuộc nhóm trận (kể cả khi bị bỏ vì ngân sách). */
export function playTranFx(env: TranEnv, m: FxMsg): boolean {
  const k = tranKind(m.t);
  if (!k) return false;
  const x = m.x ?? NaN;
  const z = m.z ?? NaN;
  const r = m.r ?? NaN;
  if (!Number.isFinite(x) || !Number.isFinite(z) || !(r > 0)) return true;
  const mine = m.src === env.mySid();
  if (!mine) {
    const v = env.viewer();
    if (Math.hypot(x - v.x, z - v.z) > TRAN_FX_DIST + r) return true;
    if (k.tick && env.live() >= TRAN_FX_LIVE_MAX) return true;
  }
  const tl = TRAN_FX.get(`tran_${k.mode}_${k.tick ? 'tick' : 'stand'}`);
  if (!tl) return true;
  const actor: FxCaster = { x, y: env.groundAt(x, z), z, yaw: 0, model: {} };
  const area = { x, z, r };
  if (k.tick) {
    env.startAt(tl, { actor, palette: TRAN_PALETTE, area, mul: r, mine });
    return true;
  }
  const key = `${m.src ?? ''}:${x.toFixed(2)}:${z.toFixed(2)}`;
  const g = (gen.get(key) ?? 0) + 1;
  gen.set(key, g);
  let left = Math.min(TRAN_STAND_MAX, m.d ?? 10);
  const step = (): void => {
    if (gen.get(key) !== g || left <= 0.3) {
      if (gen.get(key) === g) gen.delete(key);
      return;
    }
    env.startAt(tl, { actor, palette: TRAN_PALETTE, area, mul: r, mine });
    left -= TRAN_STAND_SEG;
    env.after(TRAN_STAND_SEG, step);
  };
  step();
  return true;
}
