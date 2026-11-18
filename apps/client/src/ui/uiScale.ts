/**
 * Hệ số phóng UI theo màn hình (U2-2). Bố cục HUD tính theo "vùng thiết kế" = px màn hình / hệ số (ui/u2/hud/layout.ts):
 * 1920×1080 → 1, 1280×720 → 0,85 (vùng 1506×847), 2560×1440 → 1,35, 4K → 2 (trần, vùng vẫn 1920×1080).
 * Người chơi chỉnh bù ở Cài đặt (0,8–1,4×, lưu `dtl.uiScale`). Hệ số cuối ghi vào biến CSS `--ui-scale` trên `<html>`;
 * các khối HUD dùng `zoom: var(--ui-scale)` (xem `ui/panels.css`, `ui/u2/hud/hud.css`). Bản đồ nhỏ và các lớp cảnh điện ảnh
 * tự co giãn riêng, không dùng biến này.
 */
const UI_BASE = { w: 1920, h: 1080 };
const UI_SCALE_MIN = 0.85;
const UI_SCALE_MAX = 2;
export const UI_USER_MIN = 0.8;
export const UI_USER_MAX = 1.4;
const KEY = 'dtl.uiScale';

/** Hệ số tự động cho khung nhìn `w`×`h` (px CSS): theo cạnh hẹp hơn, làm tròn 0,05, kẹp [0,85; 2]; nhân hệ số người dùng `user`. */
export function uiScaleFor(w: number, h: number, user = 1): number {
  if (!(w > 0) || !(h > 0)) return 1;
  const s = Math.min(w / UI_BASE.w, h / UI_BASE.h);
  const auto = Math.max(UI_SCALE_MIN, Math.min(UI_SCALE_MAX, Math.round(s * 20) / 20));
  const u = Math.max(UI_USER_MIN, Math.min(UI_USER_MAX, user));
  return Math.round(auto * u * 100) / 100;
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
  current = uiScaleFor(window.innerWidth, window.innerHeight, userMul);
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
  return () => window.removeEventListener('resize', apply);
}
