// Checkpoint của `pnpm perf:iso`: ghi kết quả sau MỖI mục tiêu (bản đồ/phó bản/phòng cầu…) để dừng giữa chừng (Ctrl+C, hết giờ,
// máy bận) không mất hết, và `--resume <file>` làm tiếp các mục tiêu chưa xong. Phần thuần, có test.
import type { IsoPoint, IsoRun } from './isoreport';

export interface Checkpoint {
  version: 1;
  /** Cách đo (`settled-v1`…): chỉ ghép khi trùng, để không trộn số đo non với số đo chuẩn. */
  method?: string;
  backend?: string;
  viewport: string;
  /** Các mục tiêu đã xong, dạng `<preset>|<mục tiêu>`. */
  done: string[];
  points: IsoPoint[];
  errors: string[];
  meta: Pick<Partial<IsoRun>, 'adapter' | 'backend' | 'devBytesMB'>;
}

export const doneKey = (preset: string, target: string): string => `${preset}|${target}`;

export function emptyCheckpoint(viewport: string, method?: string): Checkpoint {
  return { version: 1, ...(method ? { method } : {}), viewport, done: [], points: [], errors: [], meta: {} };
}

/** Lý do không ghép được checkpoint vào lần chạy này (null = ghép được). */
export function incompatibility(cp: Checkpoint, ctx: { viewport: string; method?: string; backend?: string }): string | null {
  if (cp.version !== 1) return `phiên bản checkpoint ${String(cp.version)} lạ`;
  if (cp.viewport !== ctx.viewport) return `viewport khác (checkpoint ${cp.viewport}, lần chạy ${ctx.viewport})`;
  if ((cp.method ?? '') !== (ctx.method ?? ''))
    return `cách đo khác (checkpoint ${cp.method ?? 'không có'}, lần chạy ${ctx.method ?? 'không có'})`;
  if (cp.backend && ctx.backend && cp.backend !== ctx.backend) return `backend khác (checkpoint ${cp.backend}, lần chạy ${ctx.backend})`;
  return null;
}

/** Ghi nhận một mục tiêu đã xong (thay mọi điểm cũ của mục tiêu đó nếu chạy lại). */
export function markDone(cp: Checkpoint, preset: string, target: string, pts: IsoPoint[]): void {
  cp.points = cp.points.filter((p) => !(p.preset === preset && p.target === target));
  cp.points.push(...pts);
  const k = doneKey(preset, target);
  if (!cp.done.includes(k)) cp.done.push(k);
}

export const isDone = (cp: Checkpoint, preset: string, target: string): boolean => cp.done.includes(doneKey(preset, target));
