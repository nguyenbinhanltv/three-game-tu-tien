/**
 * Kéo-thả vật phẩm bằng ngón (U2-6). HTML5 drag-and-drop không ổn định trên cảm ứng (iOS/Android khác nhau, và giữ ngón còn bật
 * menu ngữ cảnh = dùng/mặc món), nên chế độ cảm ứng tự làm: GIỮ ngón `HOLD_MS` trên ô có đồ để bốc, kéo, thả lên ô túi / số trang / ô
 * trang bị. Chạm nhanh = chọn (click như cũ), vuốt ngay = cuộn danh sách. Thả gọi đúng `dropFromDrag` của chuột nên luật và lệnh gửi
 * server không đổi.
 */
import type { PointerEvent as RPointerEvent } from 'react';
import { endBagDrag, startBagDrag } from './dnd';
import type { planDrop } from './model';

type Target = Parameters<typeof planDrop>[2];

const HOLD_MS = 350;
let lastLiveEnd = 0;
/** Vừa thả xong một lần kéo bằng ngón (click giả theo sau không được chọn món). */
export const justTouchDragged = (): boolean => Date.now() - lastLiveEnd < 400;
const SLOP = 10; // px: vuốt xa hơn thế trước khi bốc thì là cuộn, không phải kéo

/** Đích thả tại điểm (x, y): ô túi, số trang hay ô trang bị; không có thì null. */
function targetAt(x: number, y: number): Target | null {
  const el = document.elementFromPoint(x, y);
  if (!el) return null;
  const cell = el.closest<HTMLElement>('.bag-cell[data-slot]');
  if (cell) return { kind: 'cell', slot: Number(cell.dataset.slot) };
  const page = el.closest<HTMLElement>('.bag-page[data-page]');
  if (page) return { kind: 'page', page: Number(page.dataset.page) };
  const eq = el.closest<HTMLElement>('.equip-cell[data-slot]');
  if (eq) return { kind: 'equip', slot: eq.dataset.slot as never };
  return null;
}

export interface GhostState {
  x: number;
  y: number;
}

export interface TouchDragOpts {
  slot: number;
  id: string;
  /** Cập nhật bóng ma đi theo ngón (null = ẩn). */
  onGhost: (g: GhostState | null) => void;
  /** Thả lên một đích hợp lệ. */
  onDrop: (t: Target) => void;
}

/** Trình xử lý con trỏ cho một ô (tạo MỘT lần bằng `useRef`: giữ trạng thái giữa các lần vẽ lại; `get` trả tham số mới nhất); dùng cho `pointerType === 'touch'` (chuột vẫn dùng HTML5 DnD). */
export function touchDragHandlers(get: () => TouchDragOpts | null) {
  let timer = 0;
  let sx = 0;
  let sy = 0;
  let live = false;
  let pid = -1;
  const block = (e: TouchEvent) => {
    if (e.cancelable) e.preventDefault(); // đã bốc: không để trang cuộn theo ngón
  };
  const end = () => {
    window.clearTimeout(timer);
    document.removeEventListener('touchmove', block);
    if (live) {
      endBagDrag();
      lastLiveEnd = Date.now();
    }
    live = false;
    pid = -1;
    get()?.onGhost(null);
  };
  return {
    onPointerDown(e: RPointerEvent<HTMLElement>) {
      const o = get();
      if (!o || e.pointerType !== 'touch' || pid !== -1) return;
      pid = e.pointerId;
      sx = e.clientX;
      sy = e.clientY;
      const el = e.currentTarget;
      timer = window.setTimeout(() => {
        live = true;
        try {
          el.setPointerCapture(pid);
        } catch {
          /* con trỏ đã nhả */
        }
        document.addEventListener('touchmove', block, { passive: false });
        startBagDrag({ slot: o.slot, split: false, id: o.id });
        o.onGhost({ x: sx, y: sy });
      }, HOLD_MS);
    },
    onPointerMove(e: RPointerEvent<HTMLElement>) {
      if (e.pointerId !== pid) return;
      if (!live) {
        if (Math.hypot(e.clientX - sx, e.clientY - sy) > SLOP) end(); // vuốt sớm = cuộn
        return;
      }
      get()?.onGhost({ x: e.clientX, y: e.clientY });
    },
    onPointerUp(e: RPointerEvent<HTMLElement>) {
      if (e.pointerId !== pid) return;
      const was = live;
      const t = was ? targetAt(e.clientX, e.clientY) : null;
      // `dropFromDrag` đọc và xóa trạng thái kéo, nên gọi trước `end` (end chỉ xóa nếu còn).
      if (was && t) get()?.onDrop(t);
      end();
    },
    onPointerCancel(e: RPointerEvent<HTMLElement>) {
      if (e.pointerId === pid) end();
    },
  };
}
