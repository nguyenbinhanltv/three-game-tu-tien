// Hiệu ứng tại điểm của Hồn tu (TN-2), kích bằng S.FX không gắn với động tác chiêu: nhịp hồn binh đánh, tia hồn thu về
// (thu hồn khi quái chết, Nhiếp Hồn của hồn phiên). Chỉ là lớp hình; phát qua `FxRunner.startAt` nên không đè timeline
// chiêu đang chạy của người chơi. Hình ở `packages/content/data/fx/hon_*.json` (sinh bằng tools/vfx/gen-fx-hon.py).
import type { FxMsg, FxTimeline } from '@dtl/shared';
import { HON_FX } from '@dtl/content';
import type { FxCaster, FxTarget } from './fxTimeline';

/** S.FX → timeline; `rev`: tin đi từ quái (`src`) về người (`dst`), hình bắt đầu ở quái. */
export const HON_FX_KINDS: Readonly<Record<string, { tl: string; from: 'src' | 'dst' }>> = {
  honbinh_hit: { tl: 'hon_binh_hit', from: 'dst' },
  soul_reap: { tl: 'hon_reap', from: 'src' },
  artreap: { tl: 'hon_reap', from: 'src' },
};

/** Bảng màu của mọi hiệu ứng Hồn tu (id công pháp, `paletteOf` tra qua hướng tu). */
export const HON_PALETTE = 'dan_hon_kinh';
/** Xa hơn chừng này (mét) thì bỏ hiệu ứng tại điểm của người khác. */
export const HON_FX_DIST = 45;
/** Số lưới VFX đang sống từ mức này trở lên thì bỏ hiệu ứng tại điểm của người khác (sân đông). */
export const HON_FX_LIVE_MAX = 90;

interface Pos {
  x: number;
  y: number;
  z: number;
}

export interface HonFxEnv {
  startAt(tl: FxTimeline, o: { actor: FxCaster; palette: string; tgt?: FxTarget | null; mine?: boolean }): void;
  /** Vị trí chân của thực thể (quái hoặc người) theo id; null nếu không còn trong tầm nhìn. */
  posOf(id: string): Pos | null;
  mySid(): string;
  viewer(): { x: number; z: number };
  live(): number;
}

/** Xử lý một tin S.FX của Hồn tu. Trả true nếu tin thuộc nhóm này (kể cả khi bị bỏ vì ngân sách). */
export function playHonFx(env: HonFxEnv, m: FxMsg): boolean {
  const k = HON_FX_KINDS[m.t];
  if (!k) return false;
  const tl = HON_FX.get(k.tl);
  const from = env.posOf((k.from === 'src' ? m.src : m.dst) ?? '');
  if (!tl || !from) return true;
  // Người hưởng/ra đòn là người chơi: với tin từ quái về người thì đó là `dst`, ngược lại là `src`.
  const owner = k.from === 'src' ? m.dst : m.src;
  const mine = owner === env.mySid();
  if (!mine) {
    const v = env.viewer();
    if (Math.hypot(from.x - v.x, from.z - v.z) > HON_FX_DIST || env.live() >= HON_FX_LIVE_MAX) return true;
  }
  const to = k.from === 'src' ? env.posOf(m.dst ?? '') : null;
  env.startAt(tl, {
    actor: { x: from.x, y: from.y, z: from.z, yaw: 0, model: {} },
    palette: HON_PALETTE,
    tgt: to ? { x: to.x, y: to.y, z: to.z, chest: 1.0 } : null,
    mine,
  });
  return true;
}

/** Độ dài một đoạn hình hồn binh (giây): mesh timeline sống tối đa 4 giây nên phát nối tiếp, đoạn sau chồng lên lúc đoạn trước đang tan. */
export const HON_BINH_SEG = 3.3;
/** Thời gian hồn binh tối đa (giây), chặn tin lạ. */
export const HON_BINH_MAX = 20;

export interface HonBinhEnv {
  startAt(tl: FxTimeline, o: { actor: FxCaster; palette: string; mine?: boolean }): void;
  /** Người gọi còn trong tầm nhìn và còn sống thì trả thực thể sống (vị trí cập nhật mỗi khung) để hình bám theo; không thì null. */
  caster(sid: string): FxCaster | null;
  mySid(): string;
  /** Hẹn giờ theo đồng hồ hiệu ứng của game (dừng khi game dừng): gọi `done` sau `sec` giây. */
  after(sec: number, done: () => void): void;
}

/** Lượt gọi hồn binh mới nhất của từng người: lượt cũ thấy số khác thì tự dừng (gọi lại thay bộ cũ, như luật server). */
const honBinhGen = new Map<string, number>();

/**
 * Giữ ba hồn binh quanh người gọi `sid` trong `sec` giây (tin S.FX `honbinh`, `d` = thời gian chiêu): phát `hon_binh_stand` nối tiếp.
 * Người gọi rời tầm nhìn hoặc ngã thì thôi phát đoạn kế (đoạn đang chạy tự tan trong ≤ 3,6 giây).
 */
export function playHonBinh(env: HonBinhEnv, sid: string, sec: number): void {
  const tl = HON_FX.get('hon_binh_stand');
  if (!tl || !(sec > 0)) return;
  const gen = (honBinhGen.get(sid) ?? 0) + 1;
  honBinhGen.set(sid, gen);
  let left = Math.min(HON_BINH_MAX, sec);
  const step = (): void => {
    if (honBinhGen.get(sid) !== gen || left <= 0.3) return;
    const actor = env.caster(sid);
    if (!actor) return;
    env.startAt(tl, { actor, palette: HON_PALETTE, mine: sid === env.mySid() });
    left -= HON_BINH_SEG;
    env.after(HON_BINH_SEG, step);
  };
  step();
}
