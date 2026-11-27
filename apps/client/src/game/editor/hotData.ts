// Nạp lại dữ liệu tức thì phía client (Diễn Võ Trường V3): nhận sự kiện `dtl:data` của plugin Vite (`apps/client/dtlHotData.ts`) khi một
// file dữ liệu nóng đổi trên đĩa và vá dữ liệu đang chạy tại chỗ, không tải lại trang. Chỉ có ở `vite dev` (`import.meta.hot`); bản build
// không nạp module này (xem `boot.ts`).
import { applyHotData, type HotResult } from '@dtl/content/hot';

export interface HotEntry extends HotResult {
  /** Giờ máy lúc vá (ms). */
  at: number;
}

const MAX = 12;
const entries: HotEntry[] = [];
const subs = new Set<(e: HotEntry) => void>();
let installed = false;

/** Các lần nạp lại gần nhất, mới nhất ở đầu (cho bảng chỉnh phòng). Mảng được thay mới mỗi lần có mục, dùng được làm snapshot của React. */
let snapshot: readonly HotEntry[] = entries.slice();
export function hotEntries(): readonly HotEntry[] {
  return snapshot;
}

/** Nghe mỗi lần một file nóng được vá (hoặc bị từ chối). Trả hàm gỡ. */
export function onHotData(cb: (e: HotEntry) => void): () => void {
  subs.add(cb);
  return () => void subs.delete(cb);
}

function push(r: HotResult): void {
  const e: HotEntry = { ...r, at: Date.now() };
  entries.unshift(e);
  entries.length = Math.min(entries.length, MAX);
  snapshot = entries.slice();
  for (const cb of subs) cb(e);
}

/** Bật nhận dữ liệu nóng (gọi một lần lúc khởi động trang ở bản dev). */
export function installHotData(): void {
  if (installed || !import.meta.hot) return;
  installed = true;
  import.meta.hot.on('dtl:data', (d: { path: string; json?: unknown; error?: string }) => {
    push(d.error !== undefined ? { ok: false, kind: null, path: d.path, note: d.error } : applyHotData(d.path, d.json));
  });
}
