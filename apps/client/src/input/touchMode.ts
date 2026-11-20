/**
 * Chế độ cảm ứng (U2-6). `pref` là lựa chọn của người chơi trong Cài đặt (tự động | bật | tắt, lưu `dtl.touch`);
 * `?touch=1|0` trên URL ghi đè (kiểm thử). Tự động = thiết bị có con trỏ thô (`pointer: coarse`) và không có chuột (`hover: none`)
 * hoặc `any-pointer: coarse` mà không có `any-hover`. Máy 2-trong-1 có cả chuột thì giữ chế độ PC trừ khi người chơi bật tay.
 * Hàm thuần ở cuối file (joystick, vuốt, chụm) không đụng DOM nên test được.
 */
import { create } from 'zustand';
import { FLAGS } from '../base/flags';

export type TouchPref = 'auto' | 'on' | 'off';

const KEY = 'dtl.touch';

function readPref(): TouchPref {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'on' || v === 'off' ? v : 'auto';
  } catch {
    return 'auto';
  }
}

/** Thiết bị chạm là chính? (không có chuột/trackpad kèm theo). */
function detectTouchDevice(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  const mm = (q: string) => window.matchMedia(q).matches;
  if (mm('(pointer: coarse)') && mm('(hover: none)')) return true;
  return mm('(any-pointer: coarse)') && !mm('(any-hover: hover)');
}

interface TouchState {
  pref: TouchPref;
  detected: boolean;
}

export const useTouchState = create<TouchState>(() => ({ pref: readPref(), detected: detectTouchDevice() }));

/** Chế độ cảm ứng có đang bật không (ưu tiên: URL > Cài đặt > tự phát hiện). */
export function resolveTouch(s: TouchState, flag: boolean | null = FLAGS.touch): boolean {
  if (flag !== null) return flag;
  if (s.pref === 'on') return true;
  if (s.pref === 'off') return false;
  return s.detected;
}

export function isTouchMode(): boolean {
  return resolveTouch(useTouchState.getState());
}

/** Hook: true khi đang ở chế độ cảm ứng. */
export function useTouchMode(): boolean {
  return useTouchState((s) => resolveTouch(s));
}

export function setTouchPref(p: TouchPref): void {
  try {
    localStorage.setItem(KEY, p);
  } catch {
    // không lưu được thì chỉ áp cho phiên này
  }
  useTouchState.setState({ pref: p });
  window.dispatchEvent(new CustomEvent('dtl:touchmode'));
}

/** Theo dõi đổi thiết bị (cắm/rút chuột, xoay máy tính bảng 2-trong-1) và bắn `dtl:touchmode`. Trả hàm gỡ. */
export function installTouchMode(): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {};
  // `html[data-touch]` bật CSS chống cuộn/zoom trang (xem `ui/u2/touch/touch.css`); iOS bỏ qua user-scalable nên chặn thêm cử chỉ chụm của Safari.
  const sync = () => {
    if (isTouchMode()) document.documentElement.dataset.touch = '1';
    else delete document.documentElement.dataset.touch;
  };
  const unsub = useTouchState.subscribe(sync);
  const noGesture = (e: Event) => {
    if (isTouchMode()) e.preventDefault();
  };
  document.addEventListener('gesturestart', noGesture);
  sync();
  const qs = ['(pointer: coarse)', '(hover: none)', '(any-pointer: coarse)', '(any-hover: hover)'].map((q) => window.matchMedia(q));
  const on = () => {
    useTouchState.setState({ detected: detectTouchDevice() });
    window.dispatchEvent(new CustomEvent('dtl:touchmode'));
  };
  for (const m of qs) m.addEventListener('change', on);
  return () => {
    unsub();
    document.removeEventListener('gesturestart', noGesture);
    for (const m of qs) m.removeEventListener('change', on);
  };
}

/* ───────── hàm thuần ───────── */

export const JOY_RADIUS = 56; // px, bán kính cần (đầu cần chạm tới mép vòng đế)
export const JOY_DEAD = 0.18; // vùng chết (phần của bán kính)
const JOY_RUN = 0.92; // vượt ngưỡng này thì chạy hết tốc

interface JoyOut {
  /** Giống W/A/S/D: mx phải = +1, mz tiến = +1 (đã chuẩn hóa nên chéo không nhanh hơn). */
  mx: number;
  mz: number;
  /** Độ lệch 0..1 (sau vùng chết), để vẽ cần. */
  mag: number;
  /** Vị trí đầu cần so với tâm, đã kẹp trong bán kính (px màn hình, y xuống dưới). */
  kx: number;
  ky: number;
}

/**
 * Độ lệch ngón (dx, dy px màn hình; y xuống) → ý định di chuyển. Vùng chết rồi co giãn tuyến tính 0..1, vượt `JOY_RUN` là hết tốc.
 * Server chuẩn hóa vector nên chỉ hướng mới quan trọng; độ lệch nhỏ vẫn là "đi" như nhấn phím (server không có tốc độ tương tự).
 */
export function joystick(dx: number, dy: number, radius = JOY_RADIUS, dead = JOY_DEAD): JoyOut {
  const len = Math.hypot(dx, dy);
  const r = Math.min(len, radius);
  const k = len > 0 ? r / len : 0;
  const kx = dx * k;
  const ky = dy * k;
  const frac = r / radius;
  if (frac <= dead) return { mx: 0, mz: 0, mag: 0, kx, ky };
  const mag = Math.min(1, (frac - dead) / (JOY_RUN - dead));
  return { mx: dx / len, mz: -dy / len, mag, kx, ky };
}

/** Khoảng cách camera sau khi chụm hai ngón: `ratio` = khoảng cách ngón mới / cũ (tách hai ngón ra = phóng to = camera lại gần). */
export function pinchDist(cur: number, ratio: number, min = 3, max = 70): number {
  if (!(ratio > 0)) return cur;
  return Math.max(min, Math.min(max, cur / ratio));
}

/** Vuốt có đủ nhỏ và đủ nhanh để tính là chạm (chọn mục tiêu)? */
export function isTap(moved: number, ms: number): boolean {
  return moved <= 10 && ms <= 500;
}

/** Hộp đủ lớn để chạm? (≥ 44 px, chuẩn Apple/WCAG 2.5.5). */
export const MIN_TOUCH = 44;
