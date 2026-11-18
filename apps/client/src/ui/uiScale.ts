/**
 * Hệ số phóng UI theo màn hình (U2-2). Bố cục HUD tính theo "vùng thiết kế" = px màn hình / hệ số (ui/u2/hud/layout.ts):
 * 1920×1080 → 1, 1280×720 → 0,85 (vùng 1506×847), 2560×1440 → 1,35, 4K → 2 (trần, vùng vẫn 1920×1080).
 * Người chơi chỉnh bù ở Cài đặt (0,8–1,4×, lưu `dtl.uiScale`); hệ số cuối bị kẹp để vùng thiết kế đủ cao cho HUD không chồng lấn (≈ 878 đơn vị: 1,4× ở 1080p thực tế còn 1,23×). Hệ số cuối ghi vào biến CSS `--ui-scale` trên `<html>`;
 * các khối HUD dùng `zoom: var(--ui-scale)` (xem `ui/panels.css`, `ui/u2/hud/hud.css`). Bản đồ nhỏ và các lớp cảnh điện ảnh
 * tự co giãn riêng, không dùng biến này.
 */
import { minDesignHeight, modeOf } from './u2/hud/layout';
import { isTouchMode } from '../input/touchMode';

const UI_BASE = { w: 1920, h: 1080 };
const UI_SCALE_MIN = 0.85;
const UI_SCALE_MAX = 2;
export const UI_USER_MIN = 0.8;
export const UI_USER_MAX = 1.4;
const KEY = 'dtl.uiScale';

/** Mode HUD ứng với hệ số (compact khi < 0,95) và chiều cao vùng thiết kế tối thiểu của nó (layout.ts): hệ số bị kẹp để HUD không chồng lấn. */
const minH = (s: number): number => minDesignHeight(modeOf(s) === 'compact' ? 'compact' : 'standard');

/** Hệ số tự động cho khung nhìn `w`×`h` (px CSS): theo cạnh hẹp hơn, làm tròn 0,05, kẹp [0,85; 2]; nhân hệ số người dùng `user`. */
export function uiScaleFor(w: number, h: number, user = 1): number {
  if (!(w > 0) || !(h > 0)) return 1;
  const s = Math.min(w / UI_BASE.w, h / UI_BASE.h);
  const auto = Math.max(UI_SCALE_MIN, Math.min(UI_SCALE_MAX, Math.round(s * 20) / 20));
  const u = Math.max(UI_USER_MIN, Math.min(UI_USER_MAX, user));
  let r = Math.round(auto * u * 100) / 100;
  // Hệ số người dùng lớn làm vùng thiết kế thấp tới mức cụm kỹ năng đè khối nhiệm vụ/minimap: kẹp lại (làm tròn xuống).
  for (let i = 0; i < 3; i++) {
    const cap = Math.floor((h / minH(r)) * 100) / 100;
    if (r <= cap) break;
    r = cap;
  }
  return r;
}

let current = 1;
let userMul = 1;

function readUser(): number {
  try {
    const n = Number(localStorage.getItem(KEY));
    return n >= UI_USER_MIN && n <= UI_USER_MAX ? n : 1;
  } catch {
    return 1; // localStorage bị chặn (chế độ riêng tư): dùng hệ số mặc định
  }
}

/** Hệ số đang áp (1 khi chưa cài hoặc ngoài trình duyệt). */
export function uiScale(): number {
  return current;
}

/** Hệ số người dùng đang áp (1 = mặc định). */
export function uiScaleUser(): number {
  return userMul;
}

function apply(): void {
  // Cảm ứng (U2-6): bố cục theo px thật (nút ≥ 44 px), không phóng theo màn hình; chỉ còn hệ số người dùng.
  current = isTouchMode() ? userMul : uiScaleFor(window.innerWidth, window.innerHeight, userMul);
  document.documentElement.style.setProperty('--ui-scale', String(current));
  window.dispatchEvent(new CustomEvent('dtl:uiscale', { detail: current }));
}

/** Đổi hệ số người dùng (Cài đặt), lưu và áp ngay. */
export function setUiScaleUser(m: number): void {
  userMul = Math.max(UI_USER_MIN, Math.min(UI_USER_MAX, m));
  try {
    localStorage.setItem(KEY, String(userMul));
  } catch {
    // không lưu được thì chỉ áp cho phiên này
  }
  apply();
}

/** Cài một lần lúc khởi động: tính lại khi đổi cỡ cửa sổ. Trả hàm gỡ. */
export function installUiScale(): () => void {
  userMul = readUser();
  apply();
  window.addEventListener('resize', apply);
  window.addEventListener('dtl:touchmode', apply);
  return () => {
    window.removeEventListener('resize', apply);
    window.removeEventListener('dtl:touchmode', apply);
  };
}
