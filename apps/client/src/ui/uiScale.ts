/**
 * Hệ số phóng UI theo màn hình. Bố cục HUD và bảng thiết kế ở 1920×1080 và phải vừa 1280×720 ở hệ số 1; màn lớn hơn
 * (2560×1440, 4K) thì phóng đều để chữ không bé tí. Hệ số ghi vào biến CSS `--ui-scale` trên `<html>`; các khối HUD dùng
 * `zoom: var(--ui-scale)` (xem `ui/panels.css`). Bản đồ nhỏ và các lớp cảnh điện ảnh tự co giãn riêng, không dùng biến này.
 */
const UI_BASE = { w: 1920, h: 1080 };
const UI_SCALE_MAX = 2;

/** Hệ số cho khung nhìn `w`×`h` (px CSS): 1 tới 1920×1080, tăng theo cạnh hẹp hơn, làm tròn 0,05, trần `UI_SCALE_MAX`. */
export function uiScaleFor(w: number, h: number): number {
  if (!(w > 0) || !(h > 0)) return 1;
  const s = Math.min(w / UI_BASE.w, h / UI_BASE.h);
  return Math.max(1, Math.min(UI_SCALE_MAX, Math.round(s * 20) / 20));
}

let current = 1;

/** Hệ số đang áp (1 khi chưa cài hoặc ngoài trình duyệt). */
export function uiScale(): number {
  return current;
}

/** Cài một lần lúc khởi động: tính lại khi đổi cỡ cửa sổ. Trả hàm gỡ. */
export function installUiScale(): () => void {
  const apply = (): void => {
    current = uiScaleFor(window.innerWidth, window.innerHeight);
    document.documentElement.style.setProperty('--ui-scale', String(current));
  };
  apply();
  window.addEventListener('resize', apply);
  return () => window.removeEventListener('resize', apply);
}
