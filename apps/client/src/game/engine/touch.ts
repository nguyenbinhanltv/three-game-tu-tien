// U2-6: điều khiển cảm ứng trên canvas (vuốt xoay camera, chụm hai ngón zoom, chạm chọn mục tiêu). Cần ảo (joystick, nút) ở
// `ui/u2/touch/`. Chỉ gửi ý định như bàn phím: `eng.touchMove` thay cho WASD trong `buildInput`; server vẫn quyết định.
import { isTap, pinchDist } from '../../input/touchMode';
import { onClick } from './input';
import type { Game } from '../engine';

const SWIPE_YAW = 0.0058;
const SWIPE_PITCH = 0.0046;

interface Pt {
  x: number;
  y: number;
}

/** Gắn xử lý chạm lên canvas. Con trỏ chuột/bút do `bindInput` lo (PC không đổi); ở đây chỉ `pointerType === 'touch'`. */
export function bindTouch(eng: Game): void {
  const c = eng.canvas;
  const pts = new Map<number, Pt>();
  let moved = 0;
  let t0 = 0;
  let pinch = 0;
  const dist = (): number => {
    const [a, b] = [...pts.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  };
  eng.on(c, 'pointerdown', (e: PointerEvent) => {
    if (e.pointerType !== 'touch') return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try {
      c.setPointerCapture(e.pointerId);
    } catch {
      /* con trỏ đã nhả */
    }
    if (pts.size === 1) {
      moved = 0;
      t0 = performance.now();
    } else if (pts.size === 2) pinch = dist();
  });
  eng.on(c, 'pointermove', (e: PointerEvent) => {
    if (e.pointerType !== 'touch') return;
    const p = pts.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    p.x = e.clientX;
    p.y = e.clientY;
    if (pts.size >= 2) {
      const d = dist();
      if (pinch > 0 && d > 0) {
        eng.camFrame.cancel();
        eng.camDist = pinchDist(eng.camDist, d / pinch);
      }
      pinch = d;
      moved = 99;
      return;
    }
    moved += Math.abs(dx) + Math.abs(dy);
    if (moved > 6) {
      eng.camFrame.cancel();
      eng.camYaw -= dx * SWIPE_YAW;
      eng.camPitch = Math.max(-0.45, Math.min(1.45, eng.camPitch + dy * SWIPE_PITCH));
    }
  });
  const up = (e: PointerEvent): void => {
    if (e.pointerType !== 'touch' || !pts.has(e.pointerId)) return;
    const last = pts.get(e.pointerId)!;
    const wasOne = pts.size === 1;
    pts.delete(e.pointerId);
    pinch = 0;
    if (e.type === 'pointerup' && wasOne && isTap(moved, performance.now() - t0)) onClick(eng, last.x, last.y);
  };
  eng.on(c, 'pointerup', up);
  eng.on(c, 'pointercancel', up);
}

/** Chạm (không kéo) ở nơi canvas bị lớp cần ảo che: vẫn chọn mục tiêu. */
export function touchTap(eng: Game, x: number, y: number): void {
  onClick(eng, x, y);
}
