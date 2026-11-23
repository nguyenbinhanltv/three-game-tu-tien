// V-P9: đoán chiêu nào của quái sinh ra một vạch báo (HazardMsg không mang tên chiêu) bằng cách khớp hình + bán kính + thời gian báo với `ai` của quái
// (và `phases[].ai`), để chọn timeline riêng `mon_<loại>__<quái>__<chiêu>`. Hàm thuần, có test; khớp không ra thì trả undefined (dùng timeline chung).
import type { HazardMsg } from '@dtl/shared';
import type { MONSTER } from '@dtl/content';

type MonDef = NonNullable<ReturnType<(typeof MONSTER)['get']>>;
/** Chỉ các trường `ai` mà hàm đọc (cả `MonsterDef.ai` lẫn `phases[].ai` khớp cấu trúc này). */
interface MonAi {
  slam?: { r: number; delay: number } | null;
  chant?: { r: number; delay: number } | null;
  sweep?: { shape: string; r: number; delay: number } | null;
  line?: { r: number; delay: number } | null;
  charge?: { r: number; delay: number } | null;
  leap?: { r: number; delay: number } | null;
  burrow?: { r: number; hide: number; cone: { r: number; delay: number } } | null;
}

type Shape = 'circle' | 'rect' | 'cone';
interface Cand {
  move: string;
  shape: Shape;
  r: number;
  delay: number;
}

/** Mọi chiêu có vạch của quái (mọi pha), mỗi chiêu một ứng viên. */
export function movesOf(def: Pick<MonDef, 'ai' | 'phases'>): Cand[] {
  const out: Cand[] = [];
  const add = (ai: MonAi | null | undefined) => {
    if (!ai) return;
    if (ai.slam) out.push({ move: 'slam', shape: 'circle', r: ai.slam.r, delay: ai.slam.delay });
    if (ai.chant) out.push({ move: 'chant', shape: 'circle', r: ai.chant.r, delay: ai.chant.delay });
    if (ai.sweep) out.push({ move: 'sweep', shape: ai.sweep.shape === 'rect' ? 'rect' : 'cone', r: ai.sweep.r, delay: ai.sweep.delay });
    if (ai.line) out.push({ move: 'line', shape: 'rect', r: ai.line.r, delay: ai.line.delay });
    if (ai.charge) out.push({ move: 'charge', shape: 'rect', r: ai.charge.r, delay: ai.charge.delay });
    if (ai.leap) out.push({ move: 'leap', shape: 'circle', r: ai.leap.r, delay: ai.leap.delay });
    if (ai.burrow) {
      out.push({ move: 'burrow', shape: 'circle', r: ai.burrow.r, delay: ai.burrow.hide });
      out.push({ move: 'emerge', shape: 'cone', r: ai.burrow.cone.r, delay: ai.burrow.cone.delay });
    }
  };
  add(def.ai);
  for (const p of def.phases ?? []) add(p.ai);
  return out;
}

/** Chiêu khớp nhất với vạch `h` (cùng hình; gần nhất theo |r| rồi |delay|); undefined nếu không có chiêu cùng hình hoặc lệch quá xa. */
export function moveOfHazard(def: Pick<MonDef, 'ai' | 'phases'> | undefined, h: Pick<HazardMsg, 'r' | 'delay' | 'sh'>): string | undefined {
  if (!def) return undefined;
  const shape: Shape = h.sh === 'rect' ? 'rect' : h.sh === 'cone' ? 'cone' : 'circle';
  let best: Cand | undefined;
  let bestD = Infinity;
  for (const c of movesOf(def)) {
    if (c.shape !== shape) continue;
    const d = Math.abs(c.r - h.r) / Math.max(1, c.r) + Math.abs(c.delay - h.delay) * 0.5;
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best && bestD <= 0.6 ? best.move : undefined;
}
