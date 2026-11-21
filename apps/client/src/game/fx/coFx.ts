// Hiệu ứng tại điểm của Cổ tu, kích bằng S.FX không gắn với động tác chiêu: nhịp bầy cổ / Cổ Vương cắn (`<fx>_hit`, server gửi mỗi
// nhịp sát thương của vật gọi) và bầy cổ / Cổ Vương đứng quanh người gọi (tin `cotrieu`/`covuong` lúc ra chiêu, `d` = thời gian chiêu).
// Chỉ là lớp hình; phát qua `FxRunner.startAt` nên không đè timeline chiêu đang chạy. Hình ở `packages/content/data/fx/co_*.json`
// (sinh bằng tools/vfx/recipes_co.py). Cùng cơ chế với `honFx.ts`.
import type { FxMsg, FxTimeline } from '@dtl/shared';
import { CO_FX } from '@dtl/content';
import type { FxCaster, FxTarget } from './fxTimeline';

/** S.FX nhịp cắn → timeline; hình bắt đầu ở con quái bị cắn (`dst`). */
export const CO_FX_KINDS: Readonly<Record<string, { tl: string }>> = {
  cotrieu_hit: { tl: 'co_bay_hit' },
  covuong_hit: { tl: 'co_vuong_hit' },
};

/** S.FX lúc ra chiêu → timeline đứng quanh người gọi. */
export const CO_STAND_KINDS: Readonly<Record<string, string>> = {
  cotrieu: 'co_bay_stand',
  covuong: 'co_vuong_stand',
};

/** Bảng màu của mọi hiệu ứng Cổ tu (id công pháp, `paletteOf` tra qua hướng tu). */
export const CO_PALETTE = 'duong_co_kinh';
/** Xa hơn chừng này (mét) thì bỏ hiệu ứng tại điểm của người khác. */
export const CO_FX_DIST = 45;
/** Số lưới VFX đang sống từ mức này trở lên thì bỏ hiệu ứng tại điểm của người khác (sân đông). */
export const CO_FX_LIVE_MAX = 90;
/** Độ dài một đoạn hình bầy cổ đứng (giây): mesh timeline sống tối đa 4 giây nên phát nối tiếp. */
export const CO_STAND_SEG = 3.3;
/** Thời gian bầy cổ tối đa (giây), chặn tin lạ. */
export const CO_STAND_MAX = 20;

interface Pos {
  x: number;
  y: number;
  z: number;
}

export interface CoFxEnv {
  startAt(tl: FxTimeline, o: { actor: FxCaster; palette: string; tgt?: FxTarget | null; mine?: boolean }): void;
  /** Vị trí chân của thực thể (quái hoặc người) theo id; null nếu không còn trong tầm nhìn. */
  posOf(id: string): Pos | null;
  mySid(): string;
  viewer(): { x: number; z: number };
  live(): number;
}

/** Xử lý một tin S.FX nhịp cắn của Cổ tu. Trả true nếu tin thuộc nhóm này (kể cả khi bị bỏ vì ngân sách). */
export function playCoFx(env: CoFxEnv, m: FxMsg): boolean {
  const k = CO_FX_KINDS[m.t];
  if (!k) return false;
  const tl = CO_FX.get(k.tl);
  const from = env.posOf(m.dst ?? '');
  if (!tl || !from) return true;
  const mine = m.src === env.mySid();
  if (!mine) {
    const v = env.viewer();
    if (Math.hypot(from.x - v.x, from.z - v.z) > CO_FX_DIST || env.live() >= CO_FX_LIVE_MAX) return true;
  }
  env.startAt(tl, { actor: { x: from.x, y: from.y, z: from.z, yaw: 0, model: {} }, palette: CO_PALETTE, tgt: null, mine });
  return true;
}

export interface CoStandEnv {
  startAt(tl: FxTimeline, o: { actor: FxCaster; palette: string; mine?: boolean }): void;
  /** Người gọi còn trong tầm nhìn và còn sống thì trả thực thể sống (vị trí cập nhật mỗi khung) để hình bám theo; không thì null. */
  caster(sid: string): FxCaster | null;
  mySid(): string;
  /** Hẹn giờ theo đồng hồ hiệu ứng của game (dừng khi game dừng): gọi `done` sau `sec` giây. */
  after(sec: number, done: () => void): void;
}

/** Lượt gọi mới nhất của từng người (mỗi loại một bộ): lượt cũ thấy số khác thì tự dừng (gọi lại thay bộ cũ, như luật server). */
const standGen = new Map<string, number>();

/**
 * Giữ bầy cổ / Cổ Vương quanh người gọi `sid` trong `sec` giây: phát `co_bay_stand` / `co_vuong_stand` nối tiếp. Người gọi rời tầm
 * nhìn hoặc ngã thì thôi phát đoạn kế (đoạn đang chạy tự tan trong ≤ 3,6 giây). Gọi chiêu khác loại không cắt bộ kia.
 */
export function playCoStand(env: CoStandEnv, sid: string, sec: number, kind: string): void {
  const name = CO_STAND_KINDS[kind];
  const tl = name ? CO_FX.get(name) : undefined;
  if (!tl || !(sec > 0)) return;
  const key = `${sid}:${kind}`;
  const gen = (standGen.get(key) ?? 0) + 1;
  standGen.set(key, gen);
  let left = Math.min(CO_STAND_MAX, sec);
  const step = (): void => {
    if (standGen.get(key) !== gen || left <= 0.3) return;
    const actor = env.caster(sid);
    if (!actor) return;
    env.startAt(tl, { actor, palette: CO_PALETTE, mine: sid === env.mySid() });
    left -= CO_STAND_SEG;
    env.after(CO_STAND_SEG, step);
  };
  step();
}
