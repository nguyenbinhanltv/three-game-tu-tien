import { FX_TIMELINE } from '@dtl/content';
import type { FxTimeline } from '@dtl/shared';

// Timeline cảnh cất/hạ cánh ngự kiếm (V-P10). Module nhẹ (không kéo engine/âm thanh) để phòng thử và test dùng chung với `flyFx`.
const dimmed = new Map<string, FxTimeline>();

/** Cất cánh (`flying`) hoặc hạ cánh. Người khác mờ còn ~50% để đông người cất/hạ cánh không rối; bản của mình giữ nguyên. */
export function flyTimeline(flying: boolean, mine: boolean): FxTimeline | undefined {
  const id = flying ? 'fx_fly_on' : 'fx_fly_off';
  const tl = FX_TIMELINE.get(id);
  if (!tl || mine) return tl;
  let out = dimmed.get(id);
  if (!out) {
    out = { ...tl, events: tl.events.map((e) => (e.type === 'mesh' ? { ...e, alpha: (e.alpha ?? 0.95) * 0.5 } : e)) };
    dimmed.set(id, out);
  }
  return out;
}
